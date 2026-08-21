// Coverage for Message.imageUrls end to end through createMessage - the upload route itself
// (routes/messageUploads.js, multer + Firebase) needs real file I/O and isn't exercised here; this
// only covers what createMessage/createMessageInputSchema do once a client already has real
// uploaded URLs in hand. Before this file, grepping the test suite for "imageUrls" turned up
// nothing at all.
//
// See utils/validation.js's createMessageInputSchema for the rules under test:
//   - imageUrls: z.array(z.string().url()).max(5).optional().default([])
//   - .refine: at least one of message/imageUrls must be non-empty ("A message needs text, an
//     image, or both.", the fix for the image-only-messages-silently-never-sent bug HANDOFF.md
//     describes)
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createArtistUser, createClientUser } = require('../helpers/factories');
const Message = require('../../models/Message');

const CREATE_CONVERSATION = `
	mutation CreateConversation($members: [ID!]) {
		createConversation(members: $members) { id }
	}
`;
const CREATE_MESSAGE = `
	mutation CreateMessage($conversationId: ID!, $senderId: ID!, $message: String, $imageUrls: [String!]) {
		createMessage(
			conversationId: $conversationId
			senderId: $senderId
			message: $message
			imageUrls: $imageUrls
		) {
			id
			message
			imageUrls
		}
	}
`;

// Real-looking already-uploaded URLs, matching what POST /message-uploads would have returned -
// no real file I/O, just valid URL strings, which is all createMessageInputSchema ever checks.
function fakeUploadedUrl(n) {
	return `https://storage.googleapis.com/inkbooks-uploads/message-images/photo-${n}.jpg`;
}

// Shared by every test below: two real users plus a conversation they're both members of, so
// createMessage's membership check (see mutations/messages.js) passes and each test can focus on
// imageUrls handling rather than re-proving membership works.
async function setupConversation() {
	const { user: artistUser } = await createArtistUser();
	const { user: clientUser } = await createClientUser();
	const server = createTestServer();
	const token = signTestToken(artistUser);
	const createConvoRes = await server.executeOperation(
		{ query: CREATE_CONVERSATION, variables: { members: [artistUser.id, clientUser.id] } },
		{ contextValue: contextWithToken(token) },
	);
	const conversationId = createConvoRes.body.singleResult.data.createConversation.id;
	return { artistUser, clientUser, server, token, conversationId };
}

describe('createMessage: imageUrls happy paths', () => {
	it('accepts a valid imageUrls array alongside text and stores/returns those exact URLs', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();
		const urls = [fakeUploadedUrl(1), fakeUploadedUrl(2)];

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					message: 'here are some references',
					imageUrls: urls,
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createMessage.message).toBe('here are some references');
		expect(data.createMessage.imageUrls).toEqual(urls);

		// Confirm it's really persisted, not just echoed back by the resolver.
		const stored = await Message.findById(data.createMessage.id);
		expect(stored.imageUrls).toEqual(urls);
	});

	it('defaults imageUrls to an empty array (not undefined/null) for a text-only message', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					message: 'just text, no attachments',
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createMessage.imageUrls).toEqual([]);

		// Same check directly against the stored document - models/Message.js declares
		// `imageUrls: {type: [String], default: []}`, so this must be a real empty array, matching
		// the schema's own default rather than something the resolver happens to paper over.
		const stored = await Message.findById(data.createMessage.id);
		expect(stored.imageUrls).toEqual([]);
		expect(stored.imageUrls).not.toBeNull();
		expect(stored.imageUrls).not.toBeUndefined();
	});

	it('accepts an image-only message with no text', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();
		const urls = [fakeUploadedUrl(1)];

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					imageUrls: urls,
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		// data.message defaults to '' (not null/undefined) per createMessageInputSchema's
		// `.optional().default('')` - mutations/messages.js writes data.message, not the raw arg.
		expect(data.createMessage.message).toBe('');
		expect(data.createMessage.imageUrls).toEqual(urls);
	});
});

describe('createMessage: imageUrls validation', () => {
	it('rejects an imageUrls array exceeding the 5-image cap', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();
		const tooMany = [1, 2, 3, 4, 5, 6].map(fakeUploadedUrl);

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					message: 'six images should not fit',
					imageUrls: tooMany,
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		// createMessage(...): Message! is non-null in the schema, so a thrown resolver error nulls
		// out `data` itself, not just `data.createMessage` - see the equivalent note in
		// test/integration/conversations.test.js.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
		expect(errors[0].extensions.errors.imageUrls).toBe('At most 5 images per message');

		// And nothing was persisted - a rejected mutation must not have a partial side effect.
		const count = await Message.countDocuments({ conversationId });
		expect(count).toBe(0);
	});

	it('accepts exactly 5 images (the boundary, not just under it)', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();
		const exactlyFive = [1, 2, 3, 4, 5].map(fakeUploadedUrl);

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					imageUrls: exactlyFive,
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createMessage.imageUrls).toEqual(exactlyFive);
	});

	it('rejects a message with neither text nor images', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					message: '',
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
		expect(errors[0].extensions.errors.message).toBe('A message needs text, an image, or both.');

		const count = await Message.countDocuments({ conversationId });
		expect(count).toBe(0);
	});

	it('rejects a message whose text is only whitespace and has no images', async () => {
		// message: z.string().trim().optional().default('') - trimmed before the refine sees it, so
		// whitespace-only text must be treated the same as no text at all, not as "has text".
		const { artistUser, server, token, conversationId } = await setupConversation();

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					message: '   ',
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.errors.message).toBe('A message needs text, an image, or both.');
	});

	it('rejects a malformed (non-URL) imageUrls entry', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					message: 'this one has a bad entry',
					imageUrls: ['not-a-url'],
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
		// z.string().url() fails the whole array element; the issue path is imageUrls.<index>, and
		// validate() in utils/validation.js keys errors by issue.path[0], so it lands under
		// 'imageUrls' either way.
		expect(errors[0].extensions.errors.imageUrls).toBeDefined();

		const count = await Message.countDocuments({ conversationId });
		expect(count).toBe(0);
	});

	it('rejects an empty string as an imageUrls entry', async () => {
		const { artistUser, server, token, conversationId } = await setupConversation();

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: artistUser.id,
					imageUrls: [''],
				},
			},
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].extensions.code).toBe('BAD_USER_INPUT');
		expect(errors[0].extensions.errors.imageUrls).toBeDefined();
	});
});
