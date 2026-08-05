// Unread counts and message notifications.
//
// The rule these all circle is small and easy to get subtly wrong: a message is unread for you if
// it's newer than your lastReadAt AND you didn't send it. Drop the second half and every message
// you send increments your own badge - which is the fastest way to make a notification count
// stop being believed, and is invisible unless someone specifically looks at their own sidebar
// after sending something.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createClientUser } = require('../helpers/factories');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const {
	unreadCountForConversation,
	markConversationRead,
	markConversationNotified,
	readRowFor,
} = require('../../utils/conversation-reads');
const { shouldNotify, NOTIFY_THROTTLE_MS } = require('../../utils/message-notifications');

const CREATE_MESSAGE = `
	mutation CreateMessage($conversationId: ID!, $senderId: ID!, $message: String!) {
		createMessage(conversationId: $conversationId, senderId: $senderId, message: $message) {
			id
			createdAt
		}
	}
`;

const UNREAD_TOTAL = `
	query GetUnreadMessageCount {
		getUnreadMessageCount
	}
`;

const MY_CONVERSATIONS = `
	query GetConversationsByMemberId($memberId: ID!) {
		getConversationsByMemberId(memberId: $memberId) {
			id
			unreadCount
		}
	}
`;

const MARK_READ = `
	mutation MarkConversationRead($conversationId: ID!) {
		markConversationRead(conversationId: $conversationId) {
			id
			unreadCount
		}
	}
`;

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

// A conversation between an artist and a client, the shape every real thread in this app has.
async function twoPersonConversation() {
	const { user: artist } = await createArtistUser();
	const { user: client } = await createClientUser();
	const now = new Date();
	const conversation = await new Conversation({
		// Strings, matching what mutations/bookingRequests.js writes (`[artist.id, clientUser.id]`)
		// and what getConversationsByMemberId queries against.
		members: [String(artist.id), String(client.id)],
		createdAt: now,
		updatedAt: now,
	}).save();
	return { artist, client, conversation };
}

async function say(server, sender, conversationId, message) {
	const res = await server.executeOperation(
		{ query: CREATE_MESSAGE, variables: { conversationId: String(conversationId), senderId: String(sender.id), message } },
		asUser(sender),
	);
	expect(res.body.singleResult.errors).toBeUndefined();
	return res.body.singleResult.data.createMessage;
}

describe('unread counting', () => {
	it('counts messages from the other person as unread', async () => {
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();

		await say(server, client, conversation.id, 'Hello');
		await say(server, client, conversation.id, 'Are you free?');

		const res = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));
		expect(res.body.singleResult.data.getUnreadMessageCount).toBe(2);
	});

	it('never counts your own messages against you', async () => {
		// THE test in this file. Without the senderId clause, sending a message makes your own
		// badge go up - and you only ever notice by sending something and then looking at your own
		// sidebar, which is not a thing anyone does on purpose.
		const { artist, conversation } = await twoPersonConversation();
		const server = createTestServer();

		await say(server, artist, conversation.id, 'Just checking in');
		await say(server, artist, conversation.id, 'Also this');

		const res = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));
		expect(res.body.singleResult.data.getUnreadMessageCount).toBe(0);
	});

	it('treats a thread that has never been opened as entirely unread', async () => {
		// What "never opened" means is an ABSENT lastReadAt, not an absent row.
		//
		// A read row can exist without a read having happened: notifying somebody writes one, to
		// record lastNotifiedAt for the throttle. That is deliberate - see markConversationNotified,
		// which pointedly does NOT fill in lastReadAt, because telling somebody they have mail is
		// not the same as them reading it. Setting an epoch date there to satisfy the schema would
		// have been the easy thing and would have claimed a read that never happened.
		//
		// This test originally asserted the row itself was absent, which was true only until the
		// message-notification path started running.
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();
		await say(server, client, conversation.id, 'First contact');

		const stored = await Conversation.findById(conversation.id);
		const row = readRowFor(stored, artist.id);
		expect(row === null || !row.lastReadAt).toBe(true);
		expect(await unreadCountForConversation(stored, artist.id)).toBe(1);
	});

	it('counts each side separately', async () => {
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();

		await say(server, client, conversation.id, 'one');
		await say(server, client, conversation.id, 'two');
		await say(server, artist, conversation.id, 'reply');

		const artistView = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));
		const clientView = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(client));

		expect(artistView.body.singleResult.data.getUnreadMessageCount).toBe(2);
		expect(clientView.body.singleResult.data.getUnreadMessageCount).toBe(1);
	});

	it('reports per-conversation counts that add up to the total', async () => {
		// The sidebar total and the per-thread badges come from different code paths - one
		// aggregation, one field resolver - and a user seeing "3" on the nav and "1" on the only
		// thread they have would trust neither.
		const { artist, client, conversation } = await twoPersonConversation();
		const second = await new Conversation({
			members: [String(artist.id), String(client.id)],
			createdAt: new Date(),
			updatedAt: new Date(),
		}).save();
		const server = createTestServer();

		await say(server, client, conversation.id, 'a');
		await say(server, client, second.id, 'b');
		await say(server, client, second.id, 'c');
		// One from the artist too. Without this, every message in the fixture comes from one side
		// and the "not your own" clause is never exercised - which is exactly how a real bug
		// survived here: the aggregation path failed to exclude your own messages, and no fixture
		// ever had any of your own to exclude.
		await say(server, artist, second.id, 'artist reply');

		const list = await server.executeOperation(
			{ query: MY_CONVERSATIONS, variables: { memberId: String(artist.id) } },
			asUser(artist),
		);
		const total = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));

		const counts = list.body.singleResult.data.getConversationsByMemberId.map((c) => c.unreadCount);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(
			total.body.singleResult.data.getUnreadMessageCount,
		);
		expect(counts.sort()).toEqual([1, 2]);
	});
});

describe('marking read', () => {
	it('clears the count', async () => {
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();
		await say(server, client, conversation.id, 'hello');

		const res = await server.executeOperation(
			{ query: MARK_READ, variables: { conversationId: String(conversation.id) } },
			asUser(artist),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.markConversationRead.unreadCount).toBe(0);
	});

	it('is idempotent and never creates a second read row', async () => {
		// The client calls this on every thread open and every refocus, so it has to be free to
		// call repeatedly. Two rows for one member would make readRowFor's answer depend on array
		// order.
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();
		await say(server, client, conversation.id, 'hello');

		for (let i = 0; i < 3; i += 1) {
			await server.executeOperation(
				{ query: MARK_READ, variables: { conversationId: String(conversation.id) } },
				asUser(artist),
			);
		}

		const stored = await Conversation.findById(conversation.id);
		const mine = (stored.reads || []).filter((r) => String(r.userId) === String(artist.id));
		expect(mine).toHaveLength(1);
	});

	it('counts only what arrived after the read', async () => {
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();
		await say(server, client, conversation.id, 'before');
		await markConversationRead(conversation.id, artist.id);
		await say(server, client, conversation.id, 'after');

		const res = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));
		expect(res.body.singleResult.data.getUnreadMessageCount).toBe(1);
	});

	it('refuses a non-member', async () => {
		// Marking someone else's thread read would clear their badge while leaving the messages
		// unread in every sense that matters - removing the only signal that they exist.
		const { conversation } = await twoPersonConversation();
		const { user: stranger } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: MARK_READ, variables: { conversationId: String(conversation.id) } },
			asUser(stranger),
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(res.body.singleResult.errors[0].message).toMatch(/not allowed/i);
	});
});

describe('server-stamped timestamps', () => {
	// There is deliberately no test that sending a createdAt is REJECTED. The argument is gone from
	// the schema, so refusing it is GraphQL's job, not this codebase's - and a test carrying a
	// knowingly-invalid document would also make scripts/verify.sh's "every document validates"
	// check unable to tell a deliberate one from an accident. What is worth asserting is that the
	// stamp is real, which is below.

	it('stamps a message with the time it actually arrived', async () => {
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();
		await markConversationRead(conversation.id, artist.id);

		const before = Date.now();
		const sent = await say(server, client, conversation.id, 'now');
		const after = Date.now();

		const stored = await Message.findById(sent.id);
		expect(stored.createdAt.getTime()).toBeGreaterThanOrEqual(before);
		expect(stored.createdAt.getTime()).toBeLessThanOrEqual(after);

		// And therefore it counts as unread, which is the point.
		const unread = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));
		expect(unread.body.singleResult.data.getUnreadMessageCount).toBe(1);
	});
});

describe('notification throttling', () => {
	it('notifies the first time', async () => {
		const { artist, conversation } = await twoPersonConversation();
		const stored = await Conversation.findById(conversation.id);
		expect(shouldNotify(stored, artist.id)).toBe(true);
	});

	it('stays quiet for a second message shortly after', async () => {
		// An artist sending four messages in a row is one notification. Otherwise a normal burst of
		// thinking-out-loud becomes four emails and, eventually, a spam complaint against the
		// sending domain - which would take down invites and password resets too.
		const { artist, conversation } = await twoPersonConversation();
		await markConversationNotified(conversation.id, artist.id);

		const stored = await Conversation.findById(conversation.id);
		expect(shouldNotify(stored, artist.id)).toBe(false);
	});

	it('notifies again once the window has passed', async () => {
		const { artist, conversation } = await twoPersonConversation();
		const wellPast = new Date(Date.now() - NOTIFY_THROTTLE_MS - 1000);
		await markConversationNotified(conversation.id, artist.id, wellPast);

		const stored = await Conversation.findById(conversation.id);
		expect(shouldNotify(stored, artist.id)).toBe(true);
	});

	it('notifies again immediately once they have caught up', async () => {
		// Someone who has read the thread and then receives a new message is in the same position
		// as someone being told for the first time. Staying quiet because we emailed them ten
		// minutes ago would drop a genuinely new notification.
		const { artist, conversation } = await twoPersonConversation();
		await markConversationNotified(conversation.id, artist.id, new Date(Date.now() - 60 * 1000));
		await markConversationRead(conversation.id, artist.id);

		const stored = await Conversation.findById(conversation.id);
		expect(shouldNotify(stored, artist.id)).toBe(true);
	});

	it('does not treat being emailed as having read the thread', async () => {
		// markConversationNotified writes a read row. If it filled in lastReadAt to satisfy the
		// schema, telling someone they had mail would mark that mail read.
		const { artist, client, conversation } = await twoPersonConversation();
		const server = createTestServer();
		await say(server, client, conversation.id, 'hello');
		await markConversationNotified(conversation.id, artist.id);

		const res = await server.executeOperation({ query: UNREAD_TOTAL }, asUser(artist));
		expect(res.body.singleResult.data.getUnreadMessageCount).toBe(1);

		const stored = await Conversation.findById(conversation.id);
		expect(readRowFor(stored, artist.id).lastReadAt).toBeUndefined();
	});
});
