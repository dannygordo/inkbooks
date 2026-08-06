// Which section owns a conversation, and whether the two badges agree with the two lists.
//
// The failure this file guards against is not a crash. It is a badge reading "2 unread" over a
// screen with nothing on it - which happens the moment the list and the count answer "does this
// conversation belong here" separately. A counter you cannot act on is worse than no counter,
// because it costs the credibility of every other number on the page.
//
// The second failure it guards against is quieter and worse: hiding a thread from someone who has
// nowhere else to see it. The artist has a Booking Requests page; the client has Messages and a
// magic link. A rule that hides a pending request's thread from BOTH of them loses the
// conversation entirely, and nothing would report it.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createClientUser } = require('../helpers/factories');
const Conversation = require('../../models/Conversation');
const BookingRequest = require('../../models/BookingRequest');
const { bookingInboxConversationIds } = require('../../utils/conversation-routing');

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

const MY_CONVERSATIONS = `
	query GetConversationsByMemberId($memberId: ID!) {
		getConversationsByMemberId(memberId: $memberId) { id unreadCount }
	}
`;

const UNREAD_MESSAGES = `
	query GetUnreadMessageCount { getUnreadMessageCount }
`;

// Requests awaiting a DECISION - not unread messages in their threads, which is what this badge
// used to count. See utils/booking-inbox.js for why that was the wrong question.
const PENDING_REQUESTS = `
	query GetPendingBookingRequestCount { getPendingBookingRequestCount }
`;

const CREATE_MESSAGE = `
	mutation CreateMessage($conversationId: ID!, $senderId: ID!, $message: String!) {
		createMessage(conversationId: $conversationId, senderId: $senderId, message: $message) { id }
	}
`;

let tokenCounter = 0;

/** A booking request at a given status, with a real conversation behind it. */
async function requestAtStatus(artist, client, status, overrides = {}) {
	const now = new Date();
	const conversation = await new Conversation({
		members: [String(artist.id), String(client.id)],
		createdAt: now,
		updatedAt: now,
	}).save();
	tokenCounter += 1;
	const bookingRequest = await new BookingRequest({
		artistId: artist._id,
		clientId: client._id,
		conversationId: conversation._id,
		guestToken: `token-${tokenCounter}`,
		description: 'Forearm piece',
		status,
		source: 'public_form',
		...overrides,
	}).save();
	return { conversation, bookingRequest };
}

async function say(server, sender, conversationId, message) {
	const res = await server.executeOperation(
		{
			query: CREATE_MESSAGE,
			variables: {
				conversationId: String(conversationId),
				senderId: String(sender.id),
				message,
			},
		},
		asUser(sender),
	);
	expect(res.body.singleResult.errors).toBeUndefined();
}

async function conversationIdsFor(server, user) {
	const res = await server.executeOperation(
		{ query: MY_CONVERSATIONS, variables: { memberId: String(user.id) } },
		asUser(user),
	);
	expect(res.body.singleResult.errors).toBeUndefined();
	return res.body.singleResult.data.getConversationsByMemberId.map((c) => c.id);
}

/**
 * The two numbers in the sidebar.
 *
 * THEY MEASURE DIFFERENT THINGS, and that is the point rather than an inconsistency. `messages` is
 * unread messages; `pending` is requests awaiting a decision. Adding them together would be
 * meaningless - an earlier version of this file asserted `messages + booking === 3` back when both
 * counted messages, and that invariant is gone along with the count it described.
 */
async function counts(server, user) {
	const messages = await server.executeOperation({ query: UNREAD_MESSAGES }, asUser(user));
	const pending = await server.executeOperation({ query: PENDING_REQUESTS }, asUser(user));
	return {
		messages: messages.body.singleResult.data.getUnreadMessageCount,
		pending: pending.body.singleResult.data.getPendingBookingRequestCount,
	};
}

describe('which section owns a thread', () => {
	it('keeps a pending request out of the artist Messages list', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation } = await requestAtStatus(artist, client, 'pending');
		const server = createTestServer();

		expect(await conversationIdsFor(server, artist)).toEqual([]);
	});

	it('hands it over once the work is booked', async () => {
		// A booked request has stopped being a lead to triage and become a client relationship.
		// Both booked statuses graduate; consult_booked is not held back just because a session is
		// still owed, since the conversation from here on is about real scheduled work.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation: consult } = await requestAtStatus(artist, client, 'consult_booked');
		const { conversation: session } = await requestAtStatus(artist, client, 'session_booked');
		const server = createTestServer();

		const ids = await conversationIdsFor(server, artist);
		expect(ids.sort()).toEqual([String(consult._id), String(session._id)].sort());
	});

	it('keeps declined and not-booked threads in the booking section', async () => {
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		await requestAtStatus(artist, client, 'declined');
		await requestAtStatus(artist, client, 'not_booked');
		const server = createTestServer();

		expect(await conversationIdsFor(server, artist)).toEqual([]);
	});

	it('still shows the CLIENT their own pending thread', async () => {
		// THE test in this file. The client has no Booking Requests page. Hiding this from them
		// too would leave the conversation reachable only by the emailed magic link - a thread
		// that exists, receives messages, and cannot be found in the app.
		//
		// The rule keys off the request's artistId rather than off conversation membership, which
		// is what makes the two viewers differ here.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation } = await requestAtStatus(artist, client, 'pending');
		const server = createTestServer();

		expect(await conversationIdsFor(server, artist)).toEqual([]);
		expect(await conversationIdsFor(server, client)).toEqual([String(conversation._id)]);
	});

	it('leaves conversations with no booking request alone', async () => {
		// Project threads and staff DMs have never been anywhere but Messages, and a routing rule
		// that quietly captured them would empty the messenger.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const now = new Date();
		const plain = await new Conversation({
			members: [String(artist.id), String(client.id)],
			createdAt: now,
			updatedAt: now,
		}).save();
		const server = createTestServer();

		expect(await conversationIdsFor(server, artist)).toEqual([String(plain._id)]);
	});

	it('does not withhold a thread the artist created for their own calendar', async () => {
		// artist_created requests are filtered out of the booking inbox entirely
		// (getBookingRequests), so treating their threads as "living there" would hide them from
		// both places at once - the one outcome no filter should ever produce.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation } = await requestAtStatus(artist, client, 'pending', {
			source: 'artist_created',
		});
		const server = createTestServer();

		expect(await conversationIdsFor(server, artist)).toEqual([String(conversation._id)]);
	});
});

describe('the two badges', () => {
	it('counts unread only on threads Messages will actually show', async () => {
		// The Messages badge still has to exclude exactly what the Messages list excludes. Two
		// unread messages on a pending request and one on a booked request, and only the booked one
		// is counted - because only the booked one's thread appears in that list.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation: pending } = await requestAtStatus(artist, client, 'pending');
		const { conversation: booked } = await requestAtStatus(artist, client, 'session_booked');
		const server = createTestServer();

		await say(server, client, pending._id, 'still keen?');
		await say(server, client, pending._id, 'any update?');
		await say(server, client, booked._id, 'see you tuesday');

		const { messages, pending: pendingCount } = await counts(server, artist);
		expect(messages).toBe(1);
		// Three messages arrived and the pending count didn't move. It counts REQUESTS - one of the
		// two here is still awaiting a decision - so no amount of talking changes it.
		expect(pendingCount).toBe(1);
	});

	it('badges a brand new request that nobody has said anything on', async () => {
		// THE REPORTED BUG, and the reason the old badge was replaced rather than repaired.
		// createBookingRequest writes a Conversation and a BookingRequest but NO Message - the
		// intake text lives on the request itself - so a count of unread MESSAGES was structurally
		// zero for exactly the event the badge exists to announce. Note there is no say() call
		// here: that absence is the test.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		await requestAtStatus(artist, client, 'pending');
		const server = createTestServer();

		expect(await counts(server, artist)).toEqual({ messages: 0, pending: 1 });
	});

	it('does not count a request the artist raised for their own calendar', async () => {
		// source: 'artist_created' is the appointment wizard booking a walk-in. It is a record of
		// something already done, not a lead to triage, and getBookingRequests excludes it - so
		// badging it would point at a page that will not list it.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		await requestAtStatus(artist, client, 'pending', { source: 'artist_created' });
		const server = createTestServer();

		expect((await counts(server, artist)).pending).toBe(0);
	});

	it('does not badge one artist for another artist requests', async () => {
		const { user: artist } = await createArtistUser();
		const { user: other } = await createArtistUser();
		const { user: client } = await createClientUser();
		await requestAtStatus(other, client, 'pending');
		const server = createTestServer();

		expect((await counts(server, artist)).pending).toBe(0);
	});

	it('stops counting a request that was declined or marked not booked', async () => {
		// Closed requests leave the count even though their threads stay in the Booking Requests
		// section behind a filter. The badge is "what do I owe an answer on", and a declined
		// request has had its answer.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		await requestAtStatus(artist, client, 'declined');
		await requestAtStatus(artist, client, 'not_booked');
		const server = createTestServer();

		expect((await counts(server, artist)).pending).toBe(0);
	});

	it('never counts what its own list will not show', async () => {
		// The specific bug: a badge over an empty screen. Asserted as an invariant rather than as
		// a number, because it has to hold whatever the fixture happens to contain.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation: pending } = await requestAtStatus(artist, client, 'pending');
		const server = createTestServer();

		await say(server, client, pending._id, 'hello?');

		const ids = await conversationIdsFor(server, artist);
		const { messages } = await counts(server, artist);
		expect(ids).toEqual([]);
		expect(messages).toBe(0);
	});

	it('hands the thread over to Messages when the request gets booked', async () => {
		// Both badges move on the same event, in opposite directions: the request stops awaiting a
		// decision, and its thread stops being hidden from Messages. That handover is the whole
		// reason a thread has exactly one home - see utils/conversation-routing.js.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation, bookingRequest } = await requestAtStatus(artist, client, 'pending');
		const server = createTestServer();

		await say(server, client, conversation._id, 'can we book something?');
		expect(await counts(server, artist)).toEqual({ messages: 0, pending: 1 });

		await BookingRequest.findByIdAndUpdate(bookingRequest._id, { status: 'consult_booked' });

		// Safe to reuse the server: the unread loader memoises per REQUEST, and asUser() builds a
		// fresh context - and therefore fresh loaders - on every call, exactly as index.js does.
		// Checked rather than assumed; a per-server cache here would have made this test pass on
		// stale data and hidden the very thing it is asserting.
		expect(await counts(server, artist)).toEqual({ messages: 1, pending: 0 });
	});
});

describe('the routing helper itself', () => {
	it('returns nothing for an artist with no requests', async () => {
		const { user: artist } = await createArtistUser();
		expect(await bookingInboxConversationIds(artist.id)).toEqual([]);
	});

	it('accepts a string id', async () => {
		// It aggregates nowhere, but it queries on artistId, and passing a string where the caller
		// happened to have an ObjectId (or the reverse) is the standing trap in this codebase.
		const { user: artist } = await createArtistUser();
		const { user: client } = await createClientUser();
		const { conversation } = await requestAtStatus(artist, client, 'pending');

		expect(await bookingInboxConversationIds(String(artist.id))).toEqual([
			String(conversation._id),
		]);
		expect(await bookingInboxConversationIds(artist._id)).toEqual([String(conversation._id)]);
	});
});
