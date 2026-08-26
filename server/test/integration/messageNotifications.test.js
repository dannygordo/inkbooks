// Emails about new messages - which email, to whom, and when we deliberately stay quiet.
//
// This file exists because it didn't. utils/message-notifications.js shipped with no test that so
// much as named notifyNewMessage, and the first report that artist-to-client email wasn't arriving
// came from a person using the app, not from the runner. Reading the code afterwards did not find
// the cause, which is the tell: the function has five distinct outcomes and there was no way to
// observe which one had happened.
//
// The seam that makes this testable is `sendToGuest`/`sendToArtist`. sendEmail() no-ops and returns
// null when RESEND_API_KEY isn't set (see utils/email.js), so an assertion about a real send would
// pass or fail based on the machine's environment rather than the code - the same reason
// scheduler.test.js injects its sender. vi.mock() is not an option here: this suite is CommonJS and
// vi.mock targets Vitest's ESM graph, so it would replace a different module instance than the one
// under test (see the note in shopCutLedger.test.js).
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createClientUser } = require('../helpers/factories');
const Conversation = require('../../models/Conversation');
const BookingRequest = require('../../models/BookingRequest');
const mongoose = require('mongoose');
const {
	notifyNewMessage,
	NOTIFY_THROTTLE_MS,
} = require('../../utils/message-notifications');
const {
	readRowFor,
	markConversationRead,
	markConversationNotified,
} = require('../../utils/conversation-reads');
// logNotifyOutcomes logs through this pino singleton, not console.* (see utils/logger.js) - a
// console.warn spy never sees it. vi.mock() is still off the table for the reason above this
// import block explains, but spying directly on the already-required singleton's method works
// fine over CommonJS require(), since every caller shares the same cached instance.
const logger = require('../../utils/logger');

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const CREATE_MESSAGE = `
	mutation CreateMessage($conversationId: ID!, $senderId: ID!, $message: String!) {
		createMessage(conversationId: $conversationId, senderId: $senderId, message: $message) {
			id
		}
	}
`;

// Records every call instead of just counting them, because the interesting failures are about
// WHICH email went out and what was in it - a guest emailed an app link they cannot log in to
// looks exactly like success from a call count.
function recorder() {
	const calls = [];
	const fn = async (args) => {
		calls.push(args);
		return { id: 'fake-message-id' };
	};
	fn.calls = calls;
	return fn;
}

function senders() {
	return { sendToGuest: recorder(), sendToArtist: recorder() };
}

/**
 * An artist and a client who has never set a password - the booking-request shape.
 *
 * Members are STRINGS, matching what mutations/bookingRequests.js actually writes
 * (`[artist.id, clientUser.id]`). Storing ObjectIds here would make the fixture disagree with
 * production in exactly the place these tests are checking.
 */
async function guestThread() {
	const { user: artist } = await createArtistUser();
	const { user: guest, client } = await createClientUser({ hasSetPassword: false });
	const now = new Date();
	const conversation = await new Conversation({
		members: [String(artist.id), String(guest.id)],
		createdAt: now,
		updatedAt: now,
	}).save();
	const bookingRequest = await new BookingRequest({
		artistId: artist._id,
		clientId: client._id,
		conversationId: conversation._id,
		guestToken: 'guest-token-for-this-thread',
		description: 'Half sleeve',
		source: 'public_form',
	}).save();
	return { artist, guest, client, conversation, bookingRequest };
}

/** An artist and a client with a real account - the same conversation, a different door back in. */
async function accountThread() {
	const { user: artist } = await createArtistUser();
	const { user: client } = await createClientUser({ hasSetPassword: true });
	const now = new Date();
	const conversation = await new Conversation({
		members: [String(artist.id), String(client.id)],
		createdAt: now,
		updatedAt: now,
	}).save();
	return { artist, client, conversation };
}

describe('which email goes out', () => {
	it('sends the guest their magic link when they have no password', async () => {
		// A guest has no way into the app. An email telling them to log in is a dead end, and it is
		// a dead end that LOOKS like a working notification from every angle except the recipient's.
		const { artist, guest, conversation, bookingRequest } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();

		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest,
			sendToArtist,
		});

		expect(results).toEqual([
			{ userId: String(guest.id), outcome: 'sent', via: 'guest-link' },
		]);
		expect(sendToArtist.calls).toHaveLength(0);
		expect(sendToGuest.calls).toHaveLength(1);
		expect(sendToGuest.calls[0].to).toBe(guest.email);
		expect(sendToGuest.calls[0].guestToken).toBe(bookingRequest.guestToken);
	});

	it('sends an app link to someone who can actually log in', async () => {
		// Reachability, not role, picks the email. This client is a CLIENT by role and still gets
		// the in-app link, because the question is "can they get in" and they can.
		const { artist, client, conversation } = await accountThread();
		const { sendToGuest, sendToArtist } = senders();

		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest,
			sendToArtist,
		});

		expect(results[0].via).toBe('app-link');
		expect(sendToGuest.calls).toHaveLength(0);
		expect(sendToArtist.calls[0].to).toBe(client.email);
		expect(sendToArtist.calls[0].conversationId).toBe(String(conversation._id));
	});

	it('notifies the artist when the guest is the one writing', async () => {
		// The other direction, which had its own hand-rolled copy of this until both were merged.
		const { artist, guest, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();

		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: guest.id,
			sendToGuest,
			sendToArtist,
		});

		expect(results[0].userId).toBe(String(artist.id));
		expect(sendToArtist.calls[0].to).toBe(artist.email);
		expect(sendToGuest.calls).toHaveLength(0);
	});

	it('never emails the person who sent the message', async () => {
		// The same rule as notify()'s actor filter and conversation-reads' senderId clause. Getting
		// mail about your own message is the fastest way to make someone mute the whole channel.
		const { artist, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();

		await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest,
			sendToArtist,
		});

		expect(sendToGuest.calls.every((c) => c.to !== artist.email)).toBe(true);
		expect(sendToArtist.calls.every((c) => c.to !== artist.email)).toBe(true);
	});
});

describe('when we stay quiet', () => {
	it('emails a guest EVERY time, with no throttle at all', async () => {
		// THE test in this file.
		//
		// A guest has no app: no bell, no badge, no inbox. The emailed magic link is their only
		// route into the conversation, so a suppressed email is not a suppressed notification
		// about a message - it is a suppressed message. They may never learn it exists.
		//
		// This used to throttle everyone identically, which meant an artist sending three quick
		// follow-ups delivered one of them and silently dropped two.
		const { artist, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();
		const args = { conversationId: conversation._id, senderId: artist.id, sendToGuest, sendToArtist };

		const first = await notifyNewMessage(args);
		const second = await notifyNewMessage(args);
		const third = await notifyNewMessage(args);

		expect([first[0].outcome, second[0].outcome, third[0].outcome]).toEqual([
			'sent',
			'sent',
			'sent',
		]);
		expect(sendToGuest.calls).toHaveLength(3);
		// Every one of them carries the way back in. An email about a conversation a guest cannot
		// reach is worse than no email.
		expect(sendToGuest.calls.every((c) => !!c.guestToken)).toBe(true);
	});

	it('emails a client every time even when they have a real password', async () => {
		// The reported bug, and the reason the rule is now "is this a client" rather than "does
		// this person have a magic link".
		//
		// findOrCreateGuestClient REUSES an existing User when the intake email matches one, so a
		// client whose address already has an account arrives with hasSetPassword: true. That
		// dropped them into the app-link branch AND into the throttle - so the first message
		// emailed and everything after it went silent, which is exactly what was observed.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser({ hasSetPassword: true });
		const now = new Date();
		const conversation = await new Conversation({
			members: [String(artist.id), String(client.id)],
			createdAt: now,
			updatedAt: now,
		}).save();
		const { sendToGuest, sendToArtist } = senders();
		const args = { conversationId: conversation._id, senderId: artist.id, sendToGuest, sendToArtist };

		const first = await notifyNewMessage(args);
		const second = await notifyNewMessage(args);
		const third = await notifyNewMessage(args);

		expect([first[0].outcome, second[0].outcome, third[0].outcome]).toEqual([
			'sent',
			'sent',
			'sent',
		]);
		expect(sendToArtist.calls).toHaveLength(3);
	});

	it('does throttle a burst at someone who has the app', async () => {
		// The other half of the asymmetry. An artist who misses an email still has a bell, a nav
		// badge and a per-thread count, so suppressing the fourth email in ten minutes costs them
		// nothing - which is exactly what makes it safe here and unsafe above.
		const { artist, client, conversation } = await accountThread();
		const { sendToGuest, sendToArtist } = senders();
		const args = { conversationId: conversation._id, senderId: client.id, sendToGuest, sendToArtist };

		const first = await notifyNewMessage(args);
		const second = await notifyNewMessage(args);

		expect(first[0].userId).toBe(String(artist.id));
		expect(first[0].outcome).toBe('sent');
		expect(second[0].outcome).toBe('throttled');
		expect(sendToArtist.calls).toHaveLength(1);
	});

	it('speaks up again once the throttle window has passed', async () => {
		const { artist, client, conversation } = await accountThread();
		const { sendToGuest, sendToArtist } = senders();

		await markConversationNotified(
			conversation._id,
			artist.id,
			new Date(Date.now() - NOTIFY_THROTTLE_MS - 1000),
		);
		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: client.id,
			sendToGuest,
			sendToArtist,
		});

		expect(results[0].outcome).toBe('sent');
	});

	it('resets the throttle when the recipient reads the thread', async () => {
		// Someone who has caught up and then receives a new message is in the same position as
		// someone being told for the first time. Staying quiet because we happened to email them
		// ten minutes ago would drop a genuinely new notification.
		const { artist, client, conversation } = await accountThread();
		const { sendToGuest, sendToArtist } = senders();
		const args = { conversationId: conversation._id, senderId: client.id, sendToGuest, sendToArtist };

		await notifyNewMessage(args);
		await markConversationRead(conversation._id, artist.id);
		const afterReading = await notifyNewMessage(args);

		expect(afterReading[0].outcome).toBe('sent');
		expect(sendToArtist.calls).toHaveLength(2);
	});

	it('reports a recipient with no email rather than silently doing nothing', async () => {
		// 'no-email' and 'sent' were indistinguishable from outside this function, which is half
		// the reason a missing notification took a person to notice instead of a log line.
		const { artist, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();
		const ghost = new mongoose.Types.ObjectId();
		await Conversation.updateOne(
			{ _id: conversation._id },
			{ $set: { members: [String(artist.id), String(ghost)] } },
		);

		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest,
			sendToArtist,
		});

		expect(results).toEqual([{ userId: String(ghost), outcome: 'no-email' }]);
	});

	it('distinguishes a missing conversation from having nobody to tell', async () => {
		const results = await notifyNewMessage({
			conversationId: new mongoose.Types.ObjectId(),
			senderId: new mongoose.Types.ObjectId(),
		});
		expect(results).toEqual([{ userId: null, outcome: 'no-conversation' }]);
	});
});

describe('when sending fails', () => {
	it('does not report a provider rejection as sent', async () => {
		// THE diagnostic bug. sendEmail() returns null rather than throwing when Resend rejects a
		// message, so nothing threw, so the outcome said 'sent' - and the server log claimed a
		// notification had gone out for an email that never left the building. An hour was spent
		// reading code that was doing exactly what it said, because what it said was wrong.
		const { artist, conversation } = await guestThread();
		const rejects = async () => null;

		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest: rejects,
			sendToArtist: rejects,
		});

		expect(results[0].outcome).toBe('provider-rejected');
		expect(results[0].via).toBe('guest-link');
	});

	it('does not start the throttle on a rejected send', async () => {
		// Same reasoning as the throwing case below. A rejection that marked the recipient notified
		// would buy fifteen minutes of deliberate silence on the strength of a message nobody got.
		const { artist, client, conversation } = await accountThread();
		const rejects = async () => null;
		const { sendToGuest, sendToArtist } = senders();

		await notifyNewMessage({
			conversationId: conversation._id,
			senderId: client.id,
			sendToGuest: rejects,
			sendToArtist: rejects,
		});
		const retry = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: client.id,
			sendToGuest,
			sendToArtist,
		});

		expect(retry[0].outcome).toBe('sent');
	});

	it('reports the failure instead of claiming success', async () => {
		const { artist, conversation } = await guestThread();
		const boom = async () => {
			throw new Error('provider exploded');
		};

		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest: boom,
			sendToArtist: boom,
		});

		expect(results[0].outcome).toBe('failed');
		expect(results[0].error).toBe('provider exploded');
	});

	it('does not start the throttle on a send that never happened', async () => {
		// markConversationNotified runs only after a successful send, so a failure leaves the
		// recipient un-notified and the next message tries again. The alternative - marking first -
		// would turn one provider hiccup into fifteen minutes of deliberate silence.
		const { artist, guest, conversation } = await guestThread();
		const boom = async () => {
			throw new Error('provider exploded');
		};
		const { sendToGuest, sendToArtist } = senders();

		await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest: boom,
			sendToArtist: boom,
		});

		const stored = await Conversation.findById(conversation._id);
		const row = readRowFor(stored, guest.id);
		expect(row === null || !row.lastNotifiedAt).toBe(true);

		const retry = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest,
			sendToArtist,
		});
		expect(retry[0].outcome).toBe('sent');
	});
});

describe('the resolver actually calls it', () => {
	it('notifies the other side when a message goes through createMessage', async () => {
		// The unit tests above all call notifyNewMessage directly, which proves the function works
		// and proves nothing about whether anything invokes it. A resolver that quietly stopped
		// calling notify would pass every other test in this file.
		//
		// This asserted lastNotifiedAt, which WAS the right observable until the provider-rejection
		// fix. The real sendEmail returns null when RESEND_API_KEY isn't set - which is every test
		// run - and a rejected send deliberately does NOT mark the recipient notified, because
		// starting the throttle on a message nobody received buys fifteen minutes of silence for
		// nothing. So the old assertion was testing "did an email go out", which in this
		// environment is always no.
		//
		// The log line is the observable that survives, and it is a better one anyway: it is what
		// a person debugging this actually reads, so a test on it fails when the diagnostic breaks
		// rather than only when the behaviour does.
		const { artist, guest, conversation } = await guestThread();
		const server = createTestServer();
		// warn, not log: logNotifyOutcomes uses warn when nobody was successfully notified, which
		// is the case here precisely because mail isn't configured. Spying on the logger itself,
		// not console.warn - logNotifyOutcomes calls the pino logger, which never touches console.
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

		try {
			const res = await server.executeOperation(
				{
					query: CREATE_MESSAGE,
					variables: {
						conversationId: String(conversation._id),
						senderId: String(artist.id),
						message: 'Got your request - when are you free?',
					},
				},
				asUser(artist),
			);
			expect(res.body.singleResult.errors).toBeUndefined();

			const line = warn.mock.calls
				.map((args) => args.join(' '))
				.find((text) => text.includes('[messages]'));

			expect(line).toBeDefined();
			// The GUEST, by id - the wiring reached the right recipient, not merely something.
			expect(line).toContain(String(guest.id));
			// And it went down the magic-link branch, which is the one a guest can actually open.
			expect(line).toContain('guest-link');
			// Never the sender.
			expect(line).not.toContain(String(artist.id));
		} finally {
			// Restored in a finally so a failed assertion doesn't leave console.warn stubbed for
			// every test after this one in the file.
			warn.mockRestore();
		}
	});

	it('does not mark a recipient notified when the mail provider refused', async () => {
		// The other half of the same change, stated directly rather than left implicit in the test
		// above. A failed send must not start the throttle - otherwise one provider hiccup buys
		// fifteen minutes of deliberate silence on top of a message that never arrived.
		const { artist, guest, conversation } = await guestThread();
		const server = createTestServer();
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

		try {
			await server.executeOperation(
				{
					query: CREATE_MESSAGE,
					variables: {
						conversationId: String(conversation._id),
						senderId: String(artist.id),
						message: 'anyone there?',
					},
				},
				asUser(artist),
			);
		} finally {
			warn.mockRestore();
		}

		const stored = await Conversation.findById(conversation._id);
		const row = readRowFor(stored, guest.id);
		expect(row === null || !row.lastNotifiedAt).toBe(true);
	});
});
