// The notification shape: stored events, derived conditions, and the inbox that merges them.
//
// Two rules carry most of the weight here, and both are easy to break without anything erroring:
//
//   1. The actor is never a recipient. An artist who takes a deposit is not told a deposit was
//      taken. Break this and the system still works - it just emits noise, which is how
//      notification systems die.
//   2. Conditions self-resolve. They are queries, not rows, so fixing the underlying situation is
//      the only way to clear one. Break this by storing them and you get an inbox that insists a
//      booking request is unanswered after it was answered.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
	connectArtistToShop,
} = require('../helpers/factories');
const Notification = require('../../models/Notification');
const Appointment = require('../../models/Appointment');
const BookingRequest = require('../../models/BookingRequest');
const Conversation = require('../../models/Conversation');
const { notify, markRead, markDone, unreadCount } = require('../../utils/notifications');
const {
	unappliedDeposits,
	completedWithoutPayment,
	unansweredBookingRequests,
} = require('../../utils/attention');

const GET_INBOX = `
	query GetInbox($includeRead: Boolean) {
		getInbox(includeRead: $includeRead) {
			unreadCount
			items {
				key
				type
				category
				title
				amountCents
				readAt
				doneAt
				isCondition
			}
		}
	}
`;

const MARK_READ = `
	mutation MarkNotificationsRead($notificationIds: [ID!]) {
		markNotificationsRead(notificationIds: $notificationIds)
	}
`;

const MARK_DONE = `
	mutation MarkNotificationsDone($notificationIds: [ID!]!) {
		markNotificationsDone(notificationIds: $notificationIds)
	}
`;

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const baseEvent = {
	type: 'deposit_collected',
	category: 'money',
	subjectType: 'appointment',
	title: '$200 deposit collected',
};

describe('the actor rule', () => {
	it('never notifies the person who caused the event', async () => {
		// The single most important behaviour in the system. An artist taking a deposit does not
		// need telling that a deposit was taken - that was the founding example for this whole
		// design.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();

		const created = await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [artist.id, admin.id],
			subjectId: artist.id,
			amountCents: 20000,
		});

		expect(created).toHaveLength(1);
		expect(String(created[0].userId)).toBe(String(admin.id));
	});

	it('refuses an event with no actor rather than notifying everybody', async () => {
		// The tempting default for a webhook or a scheduled job is null, and null means the actor
		// filter matches nobody - so everyone including the person who caused it gets told. Failing
		// loudly is the only thing that forces the decision to be made at the emit site.
		const { user: admin } = await createShopAdminUser();

		await expect(
			notify({ ...baseEvent, actorId: null, recipientIds: [admin.id], subjectId: admin.id }),
		).rejects.toThrow(/actorId/i);
	});

	it('produces one notification for a recipient listed twice', async () => {
		// A shop admin who is also the artist on a job can legitimately appear in a recipient list
		// twice. Two identical rows in an inbox reads as a bug even when the count is right.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();

		const created = await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [admin.id, admin.id, String(admin.id)],
			subjectId: artist.id,
		});

		expect(created).toHaveLength(1);
	});

	it('creates nothing when the actor is the only recipient', async () => {
		const { user: artist } = await createArtistUser();
		const created = await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [artist.id],
			subjectId: artist.id,
		});

		expect(created).toEqual([]);
		expect(await unreadCount(artist.id)).toBe(0);
	});
});

describe('read and done', () => {
	async function oneNotification(recipient, actor) {
		const [n] = await notify({
			...baseEvent,
			actorId: actor.id,
			recipientIds: [recipient.id],
			subjectId: actor.id,
		});
		return n;
	}

	it('are separate states', async () => {
		// Reading "shop cut invoice issued" is not paying it. An inbox with only read state gets
		// used as if read means handled, and then means nothing.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const n = await oneNotification(admin, artist);

		await markRead(admin.id, [n._id]);
		const afterRead = await Notification.findById(n._id);
		expect(afterRead.readAt).toBeTruthy();
		expect(afterRead.doneAt).toBeNull();

		await markDone(admin.id, [n._id]);
		const afterDone = await Notification.findById(n._id);
		expect(afterDone.doneAt).toBeTruthy();
	});

	it('does not rewrite an earlier read time when marking done later', async () => {
		// The single-statement version of markDone is `$max: { readAt: now }`, which overwrites an
		// earlier read with the later one - so marking something done next week would claim you
		// first saw it next week. For a money notification that is a corrupted audit trail.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const n = await oneNotification(admin, artist);

		const readAt = new Date(Date.now() - 60 * 60 * 1000);
		await markRead(admin.id, [n._id], readAt);
		await markDone(admin.id, [n._id]);

		const stored = await Notification.findById(n._id);
		expect(stored.readAt.getTime()).toBe(readAt.getTime());
		expect(stored.doneAt.getTime()).toBeGreaterThan(readAt.getTime());
	});

	it('fills in readAt when something is marked done without being read', async () => {
		// Handling a thing from elsewhere in the app is normal; "done but never seen" is a state no
		// interface can render.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const n = await oneNotification(admin, artist);

		await markDone(admin.id, [n._id]);
		const stored = await Notification.findById(n._id);
		expect(stored.readAt).toBeTruthy();
	});

	it('cancels a queued email when the notification is read first', async () => {
		// The whole reason the email waits. Somebody who has already seen and dealt with a thing
		// should not be emailed about it three minutes later.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const n = await oneNotification(admin, artist);

		expect((await Notification.findById(n._id)).emailStatus).toBe('pending');
		await markRead(admin.id, [n._id]);
		expect((await Notification.findById(n._id)).emailStatus).toBe('cancelled');
	});

	it('leaves an already-sent email alone', async () => {
		// Rewriting 'sent' to 'cancelled' would record something that didn't happen - the email has
		// already left.
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const n = await oneNotification(admin, artist);
		await Notification.updateOne({ _id: n._id }, { $set: { emailStatus: 'sent' } });

		await markRead(admin.id, [n._id]);
		expect((await Notification.findById(n._id)).emailStatus).toBe('sent');
	});

	it('cannot mark somebody else\'s notifications read', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const { user: stranger } = await createArtistUser();
		const n = await oneNotification(admin, artist);

		const changed = await markRead(stranger.id, [n._id]);
		expect(changed).toBe(0);
		expect((await Notification.findById(n._id)).readAt).toBeNull();
	});
});

describe('derived conditions', () => {
	it('finds a deposit that was never applied, and stops when it is', async () => {
		// Self-resolution is the property that makes these worth deriving rather than storing. A
		// stored version would still be claiming the deposit was unapplied after it was applied.
		const { user: artist } = await createArtistUser();
		const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		const consult = await new Appointment({
			userId: artist.id,
			title: 'Chen consult',
			appointmentType: 'consult',
			appointmentStatus: 'completed',
			appointmentDate: longAgo,
			depositCents: 20000,
			depositStatus: 'available',
			depositCollectedAt: longAgo,
			createdAt: longAgo,
			updatedAt: longAgo,
		}).save();

		let found = await unappliedDeposits([String(artist.id)]);
		expect(found).toHaveLength(1);
		expect(found[0].amountCents).toBe(20000);
		// Dated to when the deposit was taken, not when the query ran - otherwise the oldest
		// problems keep jumping to the top of an inbox as though they just happened.
		expect(found[0].createdAt.getTime()).toBe(longAgo.getTime());

		await Appointment.updateOne({ _id: consult._id }, { $set: { depositStatus: 'applied' } });
		found = await unappliedDeposits([String(artist.id)]);
		expect(found).toHaveLength(0);
	});

	it('finds a completed session with nothing charged', async () => {
		const { user: artist } = await createArtistUser();
		const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		await new Appointment({
			userId: artist.id,
			title: 'Sleeve session',
			appointmentType: 'session',
			appointmentStatus: 'completed',
			appointmentDate: past,
			totalCents: 0,
			createdAt: past,
			updatedAt: past,
		}).save();

		const found = await completedWithoutPayment([String(artist.id)]);
		expect(found).toHaveLength(1);
		expect(found[0].type).toBe('session_without_payment');
	});

	it('does not flag a session fully covered by a deposit', async () => {
		// A deposit-covered session legitimately has a zero total: the money arrived at the consult.
		// Flagging it would train people to ignore this condition, which is the one that catches
		// real unbilled work.
		const { user: artist } = await createArtistUser();
		const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		await new Appointment({
			userId: artist.id,
			title: 'Covered by deposit',
			appointmentType: 'session',
			appointmentStatus: 'completed',
			appointmentDate: past,
			totalCents: 0,
			depositCreditCents: 20000,
			createdAt: past,
			updatedAt: past,
		}).save();

		expect(await completedWithoutPayment([String(artist.id)])).toHaveLength(0);
	});

	it('finds an unanswered booking request, and stops once it is converted', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
		const conversation = await new Conversation({
			members: [String(artist.id), 'x'],
			createdAt: old,
			updatedAt: old,
		}).save();
		const request = await new BookingRequest({
			artistId: artist.id,
			clientId: client._id,
			conversationId: conversation._id,
			guestToken: 'tok-attention-test',
			description: 'Half sleeve, botanical',
			status: 'pending',
			source: 'public_form',
			createdAt: old,
			updatedAt: old,
		}).save();

		expect(await unansweredBookingRequests([String(artist.id)])).toHaveLength(1);

		await BookingRequest.updateOne({ _id: request._id }, { $set: { status: 'consult_booked' } });
		expect(await unansweredBookingRequests([String(artist.id)])).toHaveLength(0);
	});

	it('ignores a request that has only just arrived', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		const now = new Date();
		const conversation = await new Conversation({
			members: [String(artist.id), 'x'],
			createdAt: now,
			updatedAt: now,
		}).save();
		await new BookingRequest({
			artistId: artist.id,
			clientId: client._id,
			conversationId: conversation._id,
			guestToken: 'tok-fresh-request',
			description: 'Just submitted',
			status: 'pending',
			source: 'public_form',
			createdAt: now,
			updatedAt: now,
		}).save();

		expect(await unansweredBookingRequests([String(artist.id)])).toHaveLength(0);
	});
});

describe('the merged inbox', () => {
	it('returns stored events and conditions in one list', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const server = createTestServer();

		await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [admin.id],
			subjectId: artist.id,
			amountCents: 20000,
		});

		const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		await new Appointment({
			userId: artist.id,
			title: 'Old consult',
			appointmentType: 'consult',
			appointmentStatus: 'completed',
			appointmentDate: longAgo,
			depositCents: 15000,
			depositStatus: 'available',
			depositCollectedAt: longAgo,
			createdAt: longAgo,
			updatedAt: longAgo,
		}).save();

		const res = await server.executeOperation({ query: GET_INBOX }, asUser(admin));
		expect(res.body.singleResult.errors).toBeUndefined();

		const { items } = res.body.singleResult.data.getInbox;
		expect(items.some((i) => i.isCondition === false)).toBe(true);
		expect(items.some((i) => i.isCondition === true)).toBe(true);
		// Newest first, across both kinds - a merged list sorted by only one of its sources would
		// interleave wrongly and nobody would be able to say why.
		const dates = items.map((i) => new Date(i.createdAt).getTime());
		expect([...dates].sort((a, b) => b - a)).toEqual(dates);
	});

	it('counts every live condition as unread, whether or not it has been seen', async () => {
		// Conditions have no read state on purpose. If one could be dismissed while still true, the
		// silent-failure catchers - the most valuable notifications here - would become the ones
		// you can make disappear without fixing anything.
		const { user: artist } = await createArtistUser();
		const { user: admin, shop } = await createShopAdminUser();
		await connectArtistToShop(artist._id, shop._id);
		const server = createTestServer();

		const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		await new Appointment({
			userId: artist.id,
			appointmentType: 'consult',
			appointmentStatus: 'completed',
			appointmentDate: longAgo,
			depositCents: 15000,
			depositStatus: 'available',
			depositCollectedAt: longAgo,
			createdAt: longAgo,
			updatedAt: longAgo,
		}).save();

		const before = await server.executeOperation({ query: GET_INBOX }, asUser(admin));
		expect(before.body.singleResult.data.getInbox.unreadCount).toBe(1);

		// Marking everything read cannot touch it.
		await server.executeOperation({ query: MARK_READ, variables: {} }, asUser(admin));
		const after = await server.executeOperation({ query: GET_INBOX }, asUser(admin));
		expect(after.body.singleResult.data.getInbox.unreadCount).toBe(1);
	});

	it('drops stored events from the count once read', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [admin.id],
			subjectId: artist.id,
		});

		const before = await server.executeOperation({ query: GET_INBOX }, asUser(admin));
		expect(before.body.singleResult.data.getInbox.unreadCount).toBe(1);

		await server.executeOperation({ query: MARK_READ, variables: {} }, asUser(admin));
		const after = await server.executeOperation({ query: GET_INBOX }, asUser(admin));
		expect(after.body.singleResult.data.getInbox.unreadCount).toBe(0);
	});

	it('shows nobody another person\'s inbox', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const { user: stranger } = await createArtistUser();
		const server = createTestServer();

		await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [admin.id],
			subjectId: artist.id,
		});

		const res = await server.executeOperation({ query: GET_INBOX }, asUser(stranger));
		const stored = res.body.singleResult.data.getInbox.items.filter((i) => !i.isCondition);
		expect(stored).toHaveLength(0);
	});

	it('can exclude read events', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		const [n] = await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [admin.id],
			subjectId: artist.id,
		});
		await markRead(admin.id, [n._id]);

		const res = await server.executeOperation(
			{ query: GET_INBOX, variables: { includeRead: false } },
			asUser(admin),
		);
		const stored = res.body.singleResult.data.getInbox.items.filter((i) => !i.isCondition);
		expect(stored).toHaveLength(0);
	});

	it('marks a specific notification done through the API', async () => {
		const { user: artist } = await createArtistUser();
		const { user: admin } = await createShopAdminUser();
		const server = createTestServer();

		const [n] = await notify({
			...baseEvent,
			actorId: artist.id,
			recipientIds: [admin.id],
			subjectId: artist.id,
		});

		const res = await server.executeOperation(
			{ query: MARK_DONE, variables: { notificationIds: [String(n._id)] } },
			asUser(admin),
		);
		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.markNotificationsDone).toBe(1);
	});
});
