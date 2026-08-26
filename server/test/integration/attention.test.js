// utils/attention.js - the query layer behind the artist inbox's "needs your attention" list (see
// that file's own header comment on why it computes rather than stores). Two of its conditions are
// new (unansweredMessages/Feature 3, overdueBoothRent/Feature 5) and the surrounding machinery each
// sits on top of already has its own test file (responseTimeSettings.test.js, boothRent.test.js) -
// but nothing anywhere had ever called attention.js's own functions directly. This file closes that
// gap: every condition attention.js exports, tested against a real database, calling the functions
// directly rather than through GraphQL - there is no resolver in front of any of these, they are
// consumed straight by the inbox and by utils/notification-jobs.js.
//
// describe/it/expect/beforeEach come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
	connectArtistToShop,
	createBookingRequest,
} = require('../helpers/factories');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const BoothRentCharge = require('../../models/BoothRentCharge');
const BookingRequest = require('../../models/BookingRequest');
const ResponseTimeSettings = require('../../models/ResponseTimeSettings');
const { resolveThresholdsForArtists, DEFAULT_INITIAL_THRESHOLD_MINUTES } = require('../../utils/response-time');
const {
	attentionForUser,
	unansweredBookingRequests,
	findUnansweredMessages,
	unansweredMessages,
	findOverdueBoothRentCharges,
	overdueBoothRent,
} = require('../../utils/attention');

function minutesAgo(minutes) {
	return new Date(Date.now() - minutes * 60 * 1000);
}

function daysAgo(days) {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days) {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Conversation.members is a bare, uncast Array (see models/Conversation.js) - unlike an
// ObjectId-typed field, Mongo will only match an $in lookup when the stored element's BSON type
// is identical to the looked-up one. attention.js's own findUnansweredMessages normalizes
// everything to String before comparing in JS, and it queries Mongo with the artistUserIds it was
// handed - so members has to be stored as strings and every artistUserIds array passed into these
// functions has to be strings too, or the initial Conversation.find(...) simply won't find the
// fixture at all.
async function createConversation(memberIds) {
	const now = new Date();
	return new Conversation({
		members: memberIds.map(String),
		createdAt: now,
		updatedAt: now,
	}).save();
}

async function createMessage(conversationId, senderId, overrides = {}) {
	const now = new Date();
	return new Message({
		conversationId,
		senderId,
		message: 'Hey, are you still taking clients this month?',
		createdAt: now,
		updatedAt: now,
		...overrides,
	}).save();
}

async function createBoothRentCharge(artistId, shopId, overrides = {}) {
	return new BoothRentCharge({
		artistId,
		shopId,
		amountCents: 50000,
		periodMonth: daysAgo(35),
		dueDate: daysAgo(5),
		status: 'due',
		...overrides,
	}).save();
}

describe('unansweredMessages / findUnansweredMessages', () => {
	// One artist, one client, one conversation, one client-sent message at a given age - the shape
	// almost every test below starts from.
	async function cleanThread({ messageAgeMinutes, senderIsArtist = false } = {}) {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const conversation = await createConversation([artist._id, client._id]);
		const senderId = senderIsArtist ? artist._id : client._id;
		const message = await createMessage(conversation._id, senderId, {
			createdAt: minutesAgo(messageAgeMinutes),
			updatedAt: minutesAgo(messageAgeMinutes),
		});
		return { artist, client, conversation, message };
	}

	it('surfaces a conversation whose latest CLIENT message is older than the default threshold', async () => {
		// Default is 480 minutes (8h) - see ResponseTimeSettings.DEFAULT_INITIAL_THRESHOLD_MINUTES.
		// Nobody in this test has a ResponseTimeSettings row at all, so the default applies.
		const { artist, conversation, message } = await cleanThread({ messageAgeMinutes: 500 });

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			key: `unanswered-message:${conversation._id}`,
			type: 'message_unanswered',
			category: 'message',
			subjectType: 'conversation',
			subjectId: String(conversation._id),
			isCondition: true,
		});
		expect(result[0].createdAt).toEqual(message.createdAt);
		expect(result[0].body).toBe(message.message);
	});

	it('does NOT surface a conversation whose latest client message is newer than the threshold', async () => {
		const { artist } = await cleanThread({ messageAgeMinutes: 10 });

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toEqual([]);
	});

	it('does NOT surface a conversation whose latest message was sent by the ARTIST, regardless of age', async () => {
		// The artist already answered - a stale artist-sent message is the healthy resting state,
		// not something to nag about. 1000 minutes comfortably clears any threshold this file uses.
		const { artist } = await cleanThread({ messageAgeMinutes: 1000, senderIsArtist: true });

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toEqual([]);
	});

	it('is not fooled by an OLDER client message sitting behind a newer artist reply', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const conversation = await createConversation([artist._id, client._id]);
		await createMessage(conversation._id, client._id, { createdAt: minutesAgo(600), updatedAt: minutesAgo(600) });
		// The artist's reply is the actual latest message - answered.
		await createMessage(conversation._id, artist._id, { createdAt: minutesAgo(5), updatedAt: minutesAgo(5) });

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toEqual([]);
	});

	it('does NOT surface a conversation with no messages at all yet', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		await createConversation([artist._id, client._id]);

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toEqual([]);
	});

	// The core per-artist claim: thresholdsByArtist is keyed by artist, and each artist's OWN
	// resolved value governs their own conversations - built here from the real
	// resolveThresholdsForArtists (utils/response-time.js), not a hand-rolled map, so this also
	// exercises the real shop-ceiling clamp end to end rather than assuming it works.
	it('evaluates each artist against their OWN resolved threshold - a shop-clamped artist and an unclamped one can disagree about the same-aged message', async () => {
		const { user: cappedArtist } = await createArtistUser();
		const { user: uncappedArtist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await connectArtistToShop(cappedArtist._id, shop._id);
		// The shop sets a strict 120-minute ceiling. cappedArtist has no row of their own, so the
		// ceiling itself is the resolved value (see clamp() in utils/response-time.js).
		await new ResponseTimeSettings({
			shopId: shop._id,
			initialThresholdMinutes: 120,
			repeatIntervalMinutes: 60,
		}).save();
		// uncappedArtist is connected to nothing, so they fall back to the plain default (480).

		const { user: client1 } = await createClientUser();
		const { user: client2 } = await createClientUser();
		const cappedConvo = await createConversation([cappedArtist._id, client1._id]);
		const uncappedConvo = await createConversation([uncappedArtist._id, client2._id]);
		// The SAME age for both - 150 minutes clears the capped artist's 120-minute threshold but
		// falls well short of the uncapped artist's 480-minute default.
		await createMessage(cappedConvo._id, client1._id, { createdAt: minutesAgo(150), updatedAt: minutesAgo(150) });
		await createMessage(uncappedConvo._id, client2._id, { createdAt: minutesAgo(150), updatedAt: minutesAgo(150) });

		const artistUserIds = [String(cappedArtist._id), String(uncappedArtist._id)];
		const thresholdsByArtist = await resolveThresholdsForArtists(artistUserIds);
		expect(thresholdsByArtist.get(String(cappedArtist._id)).initialThresholdMinutes).toBe(120);
		expect(thresholdsByArtist.get(String(uncappedArtist._id)).initialThresholdMinutes).toBe(
			DEFAULT_INITIAL_THRESHOLD_MINUTES,
		);

		const result = await unansweredMessages(artistUserIds, thresholdsByArtist);

		expect(result).toHaveLength(1);
		expect(result[0].subjectId).toBe(String(cappedConvo._id));
	});

	it('falls back to the built-in default for an artist missing from thresholdsByArtist entirely', async () => {
		// Mirrors sendMessageNudges' own contract in utils/notification-jobs.js: every artist is
		// checked whether or not resolveThresholdsForArtists was ever asked about them.
		const { artist } = await cleanThread({ messageAgeMinutes: 500 });

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toHaveLength(1);
	});

	it('does not surface a group thread with more than one client member', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client1 } = await createClientUser();
		const { user: client2 } = await createClientUser();
		const conversation = await createConversation([artist._id, client1._id, client2._id]);
		await createMessage(conversation._id, client1._id, { createdAt: minutesAgo(600), updatedAt: minutesAgo(600) });

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toEqual([]);
	});

	it('truncates a long message body to 140 characters', async () => {
		const longText = 'x'.repeat(200);
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const conversation = await createConversation([artist._id, client._id]);
		await createMessage(conversation._id, client._id, {
			message: longText,
			createdAt: minutesAgo(500),
			updatedAt: minutesAgo(500),
		});

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toHaveLength(1);
		expect(result[0].body).toBe(longText.slice(0, 140));
	});

	it('describes an image-only message rather than showing an empty body', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const conversation = await createConversation([artist._id, client._id]);
		await createMessage(conversation._id, client._id, {
			message: '',
			imageUrls: ['https://example.com/photo.jpg'],
			createdAt: minutesAgo(500),
			updatedAt: minutesAgo(500),
		});

		const result = await unansweredMessages([String(artist._id)], new Map());

		expect(result).toHaveLength(1);
		expect(result[0].body).toBe('They sent an image.');
	});

	it('returns [] immediately for an empty artistUserIds list, with no query at all', async () => {
		const result = await unansweredMessages([], new Map());
		expect(result).toEqual([]);
	});

	// findUnansweredMessages is the shared query notification-jobs.js's sendMessageNudges consumes
	// directly - it needs the raw {artistUserId, clientUserId, latestMessage} shape, not the
	// display-only condition() shape. A regression here would break the active nudge sweep even if
	// unansweredMessages (the passive condition built on top of it) still looked fine.
	it('findUnansweredMessages returns the raw {artistUserId, clientUserId, latestMessage} rows the nudge job needs', async () => {
		const { artist, client, message } = await cleanThread({ messageAgeMinutes: 500 });

		const due = await findUnansweredMessages([String(artist._id)], new Map());

		expect(due).toHaveLength(1);
		expect(String(due[0].artistUserId)).toBe(String(artist._id));
		expect(String(due[0].clientUserId)).toBe(String(client._id));
		expect(String(due[0].latestMessage._id)).toBe(String(message._id));
	});

	it('findUnansweredMessages honors an injected `now` rather than always using the real clock', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const conversation = await createConversation([artist._id, client._id]);
		const messageTime = new Date('2026-01-01T00:00:00Z');
		await createMessage(conversation._id, client._id, { createdAt: messageTime, updatedAt: messageTime });

		// Ten minutes after the message - nowhere near the 480-minute default threshold.
		const dueSoonAfter = await findUnansweredMessages([String(artist._id)], new Map(), {
			now: new Date('2026-01-01T00:10:00Z'),
		});
		// Nine hours after the message - past the 480-minute (8h) default threshold.
		const dueMuchLater = await findUnansweredMessages([String(artist._id)], new Map(), {
			now: new Date('2026-01-01T09:00:00Z'),
		});

		expect(dueSoonAfter).toEqual([]);
		expect(dueMuchLater).toHaveLength(1);
	});
});

describe('overdueBoothRent / findOverdueBoothRentCharges', () => {
	it('surfaces a charge past its due date with status "due"', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(artist._id, shop._id, {
			amountCents: 75000,
			dueDate: daysAgo(3),
		});

		const result = await overdueBoothRent([String(artist._id)]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			key: `overdue-booth-rent:${charge._id}`,
			type: 'booth_rent_overdue',
			category: 'money',
			subjectType: 'boothRentCharge',
			subjectId: String(charge._id),
			amountCents: 75000,
			isCondition: true,
		});
		expect(result[0].createdAt).toEqual(charge.dueDate);
		expect(result[0].body).toContain(charge.dueDate.toDateString());
	});

	it('does NOT surface a charge marked_paid, even though it is past due', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await createBoothRentCharge(artist._id, shop._id, {
			dueDate: daysAgo(10),
			status: 'marked_paid',
			markedPaidAt: daysAgo(1),
			markedPaidByUserId: artist._id,
		});

		const result = await overdueBoothRent([String(artist._id)]);

		expect(result).toEqual([]);
	});

	it('does NOT surface a charge already confirmed, even though it is past due', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await createBoothRentCharge(artist._id, shop._id, {
			dueDate: daysAgo(10),
			status: 'confirmed',
			markedPaidAt: daysAgo(5),
			markedPaidByUserId: artist._id,
			confirmedAt: daysAgo(1),
			confirmedByUserId: artist._id,
		});

		const result = await overdueBoothRent([String(artist._id)]);

		expect(result).toEqual([]);
	});

	it('does NOT surface a charge whose due date is still in the future, regardless of status', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		// 'due' is the only status a not-yet-due charge would realistically carry, but the
		// condition's own guard is on the date, not the status - assert that directly.
		await createBoothRentCharge(artist._id, shop._id, { dueDate: daysFromNow(2), status: 'due' });

		const result = await overdueBoothRent([String(artist._id)]);

		expect(result).toEqual([]);
	});

	it('only reports charges for the requested artists, not every overdue charge in the system', async () => {
		const { user: watchedArtist } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await createBoothRentCharge(otherArtist._id, shop._id, { dueDate: daysAgo(3) });

		const result = await overdueBoothRent([String(watchedArtist._id)]);

		expect(result).toEqual([]);
	});

	it('reports one row per overdue charge when an artist has more than one', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await createBoothRentCharge(artist._id, shop._id, {
			periodMonth: daysAgo(65),
			dueDate: daysAgo(35),
		});
		await createBoothRentCharge(artist._id, shop._id, {
			periodMonth: daysAgo(35),
			dueDate: daysAgo(5),
		});

		const result = await overdueBoothRent([String(artist._id)]);

		expect(result).toHaveLength(2);
	});

	it('returns [] immediately for an empty artistUserIds list', async () => {
		const result = await overdueBoothRent([]);
		expect(result).toEqual([]);
	});

	// findOverdueBoothRentCharges is the shared query sendBoothRentNudges consumes directly for the
	// active escalation sweep - it needs the raw charge document (artistId, shopId, amountCents,
	// dueDate), not the display-only condition() shape.
	it('findOverdueBoothRentCharges returns the raw charge document with artistId/shopId intact', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const charge = await createBoothRentCharge(artist._id, shop._id, { dueDate: daysAgo(3) });

		const due = await findOverdueBoothRentCharges([String(artist._id)]);

		expect(due).toHaveLength(1);
		expect(String(due[0]._id)).toBe(String(charge._id));
		expect(String(due[0].shopId)).toBe(String(shop._id));
	});

	it('findOverdueBoothRentCharges honors an injected `now`', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		await createBoothRentCharge(artist._id, shop._id, { dueDate: new Date('2026-04-05T00:00:00Z') });

		const beforeDue = await findOverdueBoothRentCharges([String(artist._id)], {
			now: new Date('2026-04-01T00:00:00Z'),
		});
		const afterDue = await findOverdueBoothRentCharges([String(artist._id)], {
			now: new Date('2026-04-10T00:00:00Z'),
		});

		expect(beforeDue).toEqual([]);
		expect(afterDue).toHaveLength(1);
	});
});

describe('unansweredBookingRequests (pre-existing condition - regression guard)', () => {
	// createBookingRequest defaults to source: 'artist_created', status: 'consult_booked' (see
	// test/helpers/factories.js) - neither matches this condition's own filter, so every fixture
	// below is nudged into shape with a direct update afterwards, the same pattern
	// bookingRequests.test.js itself uses to backdate/re-status a request post-creation.
	async function agedPendingPublicRequest(artistId, ageHours) {
		const { user: client } = await createClientUser();
		const request = await createBookingRequest(artistId, client._id);
		await BookingRequest.findByIdAndUpdate(
			request._id,
			{
				status: 'pending',
				source: 'public_form',
				createdAt: new Date(Date.now() - ageHours * 60 * 60 * 1000),
			},
			// Mongoose marks a timestamps:true createdAt immutable by default - without this,
			// findByIdAndUpdate silently drops createdAt from the update and the fixture never
			// actually ages, which is exactly the kind of self-defeating test this regression
			// guard exists to avoid.
			{ overwriteImmutable: true },
		);
		return BookingRequest.findById(request._id);
	}

	it('surfaces a still-pending public request older than 48 hours, in the standard condition shape', async () => {
		const { user: artist } = await createArtistUser();
		const request = await agedPendingPublicRequest(artist._id, 72);

		const result = await unansweredBookingRequests([String(artist._id)]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			key: `unanswered-request:${request._id}`,
			type: 'booking_request_unanswered',
			category: 'schedule',
			subjectType: 'bookingRequest',
			subjectId: String(request._id),
			isCondition: true,
		});
		expect(result[0].createdAt).toEqual(request.createdAt);
	});

	it('does not surface a pending public request younger than 48 hours', async () => {
		const { user: artist } = await createArtistUser();
		await agedPendingPublicRequest(artist._id, 2);

		const result = await unansweredBookingRequests([String(artist._id)]);

		expect(result).toEqual([]);
	});

	it('does not surface a request that has already been answered', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const request = await createBookingRequest(artist._id, client._id, {
			source: 'public_form',
		});
		await BookingRequest.findByIdAndUpdate(
			request._id,
			{
				status: 'declined',
				createdAt: daysAgo(5),
			},
			{ overwriteImmutable: true },
		);

		const result = await unansweredBookingRequests([String(artist._id)]);

		expect(result).toEqual([]);
	});

	it('does not surface an artist-created request even if it sits pending past the cutoff', async () => {
		// Mirrors getBookingRequests' own "only source: public_form" exclusion covered in
		// bookingRequests.test.js - AppointmentWizard's internally-created requests were never a
		// real inbound ask from anyone and shouldn't nag the artist either.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const request = await createBookingRequest(artist._id, client._id); // default source: artist_created
		await BookingRequest.findByIdAndUpdate(request._id, { status: 'pending', createdAt: daysAgo(5) }, { overwriteImmutable: true });

		const result = await unansweredBookingRequests([String(artist._id)]);

		expect(result).toEqual([]);
	});

	it('returns [] immediately for an empty artistUserIds list', async () => {
		const result = await unansweredBookingRequests([]);
		expect(result).toEqual([]);
	});
});

describe('attentionForUser: the merged inbox', () => {
	it('returns entries from multiple conditions at once for the same artist, correctly typed', async () => {
		const { user: artist } = await createArtistUser();
		const { shop } = await createShopAdminUser();

		// (1) An overdue booth rent charge.
		const charge = await createBoothRentCharge(artist._id, shop._id, { dueDate: daysAgo(2) });

		// (2) An unanswered client message, well past the default 8h threshold.
		const { user: client } = await createClientUser();
		const conversation = await createConversation([artist._id, client._id]);
		const message = await createMessage(conversation._id, client._id, {
			createdAt: minutesAgo(540), // 9 hours
			updatedAt: minutesAgo(540),
		});

		// (3) An unanswered public booking request, well past the 48h cutoff.
		const { user: guestClient } = await createClientUser();
		const request = await createBookingRequest(artist._id, guestClient._id, { source: 'public_form' });
		await BookingRequest.findByIdAndUpdate(request._id, { status: 'pending', createdAt: daysAgo(3) }, { overwriteImmutable: true });

		const result = await attentionForUser(artist);

		const types = result.map((r) => r.type).sort();
		expect(types).toEqual(['booking_request_unanswered', 'booth_rent_overdue', 'message_unanswered']);
		expect(result.every((r) => r.isCondition === true)).toBe(true);

		// Every result is genuinely traceable back to its own source record, not just labeled right.
		const bySubject = Object.fromEntries(result.map((r) => [r.subjectType, r.subjectId]));
		expect(bySubject.boothRentCharge).toBe(String(charge._id));
		expect(bySubject.conversation).toBe(String(conversation._id));
		expect(bySubject.bookingRequest).toBe(String(request._id));

		// Sorted newest-situation-first: the message (9h old) is younger than the booth rent (2
		// days overdue), which is younger than the booking request (3 days old).
		expect(result.map((r) => r.type)).toEqual([
			'message_unanswered',
			'booth_rent_overdue',
			'booking_request_unanswered',
		]);
		expect(result[0].createdAt.getTime()).toBe(message.createdAt.getTime());
	});

	it('returns [] for an artist with nothing currently wrong', async () => {
		const { user: artist } = await createArtistUser();

		const result = await attentionForUser(artist);

		expect(result).toEqual([]);
	});

	it('a shop admin with a real shop but no roster/history sees an empty list, not an error', async () => {
		// Exercises the isShopAdminOrBetter branch (unredeemedInvites/squareHealth included in the
		// Promise.all) with a genuinely non-empty shopIds - the two conditions this file doesn't
		// give dedicated coverage to (their own PasswordToken/SquareAccount fixture shapes belong
		// with THEIR features) still have to resolve cleanly to an empty result against a shop with
		// no stranded invites and no Square connection at all, rather than throwing.
		const { user: shopAdmin } = await createShopAdminUser();

		const result = await attentionForUser(shopAdmin);

		expect(result).toEqual([]);
	});

	it('a connected artist only sees their OWN unanswered message, not a shopmate\'s', async () => {
		const { shop } = await createShopAdminUser();
		const { user: artistA } = await createArtistUser();
		const { user: artistB } = await createArtistUser();
		await connectArtistToShop(artistA._id, shop._id);
		await connectArtistToShop(artistB._id, shop._id);

		const { user: client } = await createClientUser();
		const conversation = await createConversation([artistB._id, client._id]);
		await createMessage(conversation._id, client._id, { createdAt: minutesAgo(600), updatedAt: minutesAgo(600) });

		const result = await attentionForUser(artistA);

		expect(result).toEqual([]);
	});
});
