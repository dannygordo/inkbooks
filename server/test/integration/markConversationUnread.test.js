// Integration tests for markConversationUnread (mutations/conversations.js) - shipped with zero
// test coverage. No schema change was needed: Conversation.reads[].lastReadAt already treats a
// missing/cleared value as "everything is unread" (see utils/conversation-reads.js's unreadFilter
// and the header comment on markConversationUnreadForUser), so this mutation is just an $unset of
// that one field, gated by the same membership check as its sibling markConversationRead.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createClientUser } = require('../helpers/factories');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');

const MARK_CONVERSATION_READ = `
	mutation MarkConversationRead($conversationId: ID!) {
		markConversationRead(conversationId: $conversationId) { id unreadCount }
	}
`;
const MARK_CONVERSATION_UNREAD = `
	mutation MarkConversationUnread($conversationId: ID!) {
		markConversationUnread(conversationId: $conversationId) { id unreadCount }
	}
`;

// Builds a Conversation the same way createConversation's resolver does (server-stamped
// createdAt/updatedAt, members stored as whatever ids are handed in) rather than going through the
// mutation, so each test can seed an exact reads[] shape - lastReadAt/lastNotifiedAt combinations
// the createConversation mutation has no way to produce on its own.
async function createConversationBetween(memberIds, overrides = {}) {
	const now = new Date();
	return new Conversation({
		members: memberIds.map(String),
		reads: [],
		createdAt: now,
		updatedAt: now,
		...overrides,
	}).save();
}

async function createMessageAt(conversationId, senderId, at, overrides = {}) {
	return new Message({
		conversationId,
		senderId,
		message: 'hi',
		createdAt: at,
		updatedAt: at,
		...overrides,
	}).save();
}

describe('markConversationUnread: clears lastReadAt, nothing else', () => {
	it('makes a previously-read conversation show as unread again', async () => {
		const { user: reader } = await createArtistUser();
		const { user: sender } = await createClientUser();
		const conversation = await createConversationBetween([reader.id, sender.id]);
		// In the past relative to "now", so marking read (which stamps lastReadAt = now) actually
		// covers it.
		await createMessageAt(conversation.id, sender.id, new Date(Date.now() - 60 * 1000));
		const server = createTestServer();
		const token = signTestToken(reader);

		const readRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_READ, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(token) },
		);
		expect(readRes.body.singleResult.errors).toBeUndefined();
		expect(readRes.body.singleResult.data.markConversationRead.unreadCount).toBe(0);

		const unreadRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = unreadRes.body.singleResult;
		expect(errors).toBeUndefined();
		// The message that was read a moment ago now counts again - lastReadAt was cleared, and
		// unreadFilter treats "no lastReadAt" as "everything from the other side is unread".
		expect(data.markConversationUnread.unreadCount).toBe(1);
	});

	it('unsets lastReadAt but leaves lastNotifiedAt and the read row itself in place', async () => {
		const { user: reader } = await createArtistUser();
		const { user: sender } = await createClientUser();
		const notifiedAt = new Date(Date.now() - 30 * 60 * 1000);
		const conversation = await createConversationBetween([reader.id, sender.id], {
			reads: [
				{
					userId: reader.id,
					lastReadAt: new Date(Date.now() - 60 * 1000),
					lastNotifiedAt: notifiedAt,
				},
			],
		});
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(signTestToken(reader)) },
		);
		expect(response.body.singleResult.errors).toBeUndefined();

		// `reads` isn't exposed on the GraphQL Conversation type (only the derived unreadCount is),
		// so checking the exact field-level shape means reading the stored document directly - this
		// is the one place the real implementation's `$unset: {'reads.$.lastReadAt': ''}` (as
		// opposed to, say, `$pull`-ing the whole row) is actually observable.
		const stored = await Conversation.findById(conversation.id);
		expect(stored.reads).toHaveLength(1);
		const row = stored.reads[0];
		expect(String(row.userId)).toBe(String(reader.id));
		expect(row.lastReadAt).toBeUndefined();
		// The throttle in utils/message-notifications.js reads off lastNotifiedAt independently of
		// lastReadAt - "remind me later" must not also reset when this member was last emailed, or
		// un-reading a thread would silently re-arm an immediate notification.
		expect(row.lastNotifiedAt).toBeInstanceOf(Date);
		expect(row.lastNotifiedAt.getTime()).toBe(notifiedAt.getTime());
	});

	it('is a true no-op (no new row created) when the caller has never read the conversation', async () => {
		const { user: reader } = await createArtistUser();
		const { user: sender } = await createClientUser();
		const conversation = await createConversationBetween([reader.id, sender.id]);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(signTestToken(reader)) },
		);
		expect(response.body.singleResult.errors).toBeUndefined();

		// markConversationUnreadForUser's $unset only matches an existing 'reads.userId': userId
		// row. With none there, per the header comment on that function, it should match zero
		// documents rather than fabricate a row - "no row" already means "fully unread", so there is
		// nothing to write.
		const stored = await Conversation.findById(conversation.id);
		expect(stored.reads).toHaveLength(0);
	});
});

describe('markConversationUnread: a new message after clearing does not double-count or corrupt state', () => {
	it('treats every message since the clear as unread, and stays consistent across repeated calls', async () => {
		const { user: reader } = await createArtistUser();
		const { user: sender } = await createClientUser();
		const conversation = await createConversationBetween([reader.id, sender.id]);
		const t1 = new Date(Date.now() - 3 * 60 * 1000);
		const t2 = new Date(Date.now() - 2 * 60 * 1000);
		await createMessageAt(conversation.id, sender.id, t1);
		await createMessageAt(conversation.id, sender.id, t2);
		const server = createTestServer();
		const token = signTestToken(reader);

		const readRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_READ, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(token) },
		);
		expect(readRes.body.singleResult.data.markConversationRead.unreadCount).toBe(0);

		const firstUnreadRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(token) },
		);
		expect(firstUnreadRes.body.singleResult.errors).toBeUndefined();
		// Both of the earlier messages count again - not just "one unread event" for the un-read
		// action itself, and not zero because they were "already accounted for" once.
		expect(firstUnreadRes.body.singleResult.data.markConversationUnread.unreadCount).toBe(2);

		// A genuinely new message arrives after the thread was marked unread.
		await createMessageAt(conversation.id, sender.id, new Date());

		// Calling markConversationUnread again (e.g. a second click, or the client retrying) must
		// stay idempotent: no thrown error, no second read row appended for this member, and the
		// count simply reflects all three messages - never fewer (state lost) and never more than
		// three (double-counted).
		const secondUnreadRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(token) },
		);
		expect(secondUnreadRes.body.singleResult.errors).toBeUndefined();
		expect(secondUnreadRes.body.singleResult.data.markConversationUnread.unreadCount).toBe(3);

		const stored = await Conversation.findById(conversation.id);
		const readerRows = stored.reads.filter((r) => String(r.userId) === String(reader.id));
		expect(readerRows).toHaveLength(1);
		expect(readerRows[0].lastReadAt).toBeUndefined();
	});
});

describe('markConversationUnread: membership auth, same shape as markConversationRead', () => {
	it('allows a real member to mark it unread, even one who did not create the conversation', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		// clientUser is the second member, not the one who "owns" the thread - membership, not
		// authorship, is what should matter.
		const conversation = await createConversationBetween([artistUser.id, clientUser.id]);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.markConversationUnread.id).toBe(conversation.id);
	});

	it('rejects a user who was never a member of the conversation at all, same error as markConversationRead', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const { user: outsider } = await createArtistUser();
		const conversation = await createConversationBetween([artistUser.id, clientUser.id]);
		const server = createTestServer();
		const outsiderToken = signTestToken(outsider);

		const unreadRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(outsiderToken) },
		);
		// markConversationUnread(...): Conversation! is non-null in the schema, so a thrown resolver
		// error nulls out `data` itself, not just `data.markConversationUnread` - same rule noted in
		// test/integration/conversations.test.js and auth.test.js.
		expect(unreadRes.body.singleResult.data).toBeNull();
		expect(unreadRes.body.singleResult.errors[0].message).toMatch(/Action not allowed/);

		// Parity check: this mutation is documented as mirroring markConversationRead's auth shape
		// exactly. If it were accidentally more permissive (e.g. checking canAccessConversation's
		// broader shop-role rules instead of literal array membership), this outsider - who has no
		// role-based relationship to the conversation either - would still be rejected here, so this
		// alone wouldn't catch that regression. What it does catch: the two mutations disagreeing on
		// the SAME caller and SAME conversation, which would mean markConversationUnread stopped
		// using the plain membership check it's supposed to share with markConversationRead.
		const readRes = await server.executeOperation(
			{ query: MARK_CONVERSATION_READ, variables: { conversationId: conversation.id } },
			{ contextValue: contextWithToken(outsiderToken) },
		);
		expect(readRes.body.singleResult.data).toBeNull();
		expect(readRes.body.singleResult.errors[0].message).toBe(
			unreadRes.body.singleResult.errors[0].message,
		);
	});

	it('reports a missing conversation distinctly from an authorization failure', async () => {
		const { user: someUser } = await createArtistUser();
		const server = createTestServer();
		const missingId = '507f1f77bcf86cd799439011';

		const response = await server.executeOperation(
			{ query: MARK_CONVERSATION_UNREAD, variables: { conversationId: missingId } },
			{ contextValue: contextWithToken(signTestToken(someUser)) },
		);
		// Thrown via UserInputError('Errors', { errors: { conversationId: 'Conversation not
		// found.' } }) - the detail is in extensions.errors.conversationId, not message (which is
		// literally "Errors"), and it must not collapse into the same "Action not allowed" message
		// an unauthorized-but-existing conversation would produce.
		expect(response.body.singleResult.data).toBeNull();
		expect(response.body.singleResult.errors[0].extensions.errors.conversationId).toMatch(
			/not found/,
		);
	});
});
