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
	it('sends once for a burst, not once per message', async () => {
		// An artist typing four short messages in a row is one notification. Past the first, the
		// recipient already knows there is a conversation waiting.
		const { artist, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();
		const args = { conversationId: conversation._id, senderId: artist.id, sendToGuest, sendToArtist };

		const first = await notifyNewMessage(args);
		const second = await notifyNewMessage(args);
		const third = await notifyNewMessage(args);

		expect(first[0].outcome).toBe('sent');
		expect(second[0].outcome).toBe('throttled');
		expect(third[0].outcome).toBe('throttled');
		expect(sendToGuest.calls).toHaveLength(1);
	});

	it('speaks up again once the throttle window has passed', async () => {
		const { artist, guest, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();

		await markConversationNotified(
			conversation._id,
			guest.id,
			new Date(Date.now() - NOTIFY_THROTTLE_MS - 1000),
		);
		const results = await notifyNewMessage({
			conversationId: conversation._id,
			senderId: artist.id,
			sendToGuest,
			sendToArtist,
		});

		expect(results[0].outcome).toBe('sent');
	});

	it('resets the throttle when the recipient reads the thread', async () => {
		// Someone who has caught up and then receives a new message is in the same position as
		// someone being told for the first time. Staying quiet because we happened to email them
		// ten minutes ago would drop a genuinely new notification.
		const { artist, guest, conversation } = await guestThread();
		const { sendToGuest, sendToArtist } = senders();
		const args = { conversationId: conversation._id, senderId: artist.id, sendToGuest, sendToArtist };

		await notifyNewMessage(args);
		await markConversationRead(conversation._id, guest.id);
		const afterReading = await notifyNewMessage(args);

		expect(afterReading[0].outcome).toBe('sent');
		expect(sendToGuest.calls).toHaveLength(2);
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
		// and proves nothing about whether anything invokes it. This asserts the wiring, via the
		// lastNotifiedAt it leaves behind - the one observable effect that doesn't need the mail
		// layer. A resolver that stopped calling notify would pass every other test in this file.
		const { artist, guest, conversation } = await guestThread();
		const server = createTestServer();

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

		const stored = await Conversation.findById(conversation._id);
		expect(readRowFor(stored, guest.id).lastNotifiedAt).toBeTruthy();
		// And not for the sender, who needs no telling.
		const senderRow = readRowFor(stored, artist.id);
		expect(senderRow === null || !senderRow.lastNotifiedAt).toBe(true);
	});
});
