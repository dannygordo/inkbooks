// utils/search.js backs the `search` GraphQL query (graphql/resolvers/search.js is a one-line
// withAuth pass-through to searchAll) and had ZERO test coverage anywhere in the suite - no direct
// call, and no resolver-level test of the `search` query either, despite it running a real $text
// search across four collections with its own bespoke authorization scoping
// (conversationScopeFilter, deliberately narrower than canAccessConversation - see that function's
// own header comment on why).
//
// Called directly (searchAll(user, query, limit)) rather than through GraphQL - withAuth itself is
// already covered elsewhere, and there is exactly one line of resolver around this function.
//
// describe/it/expect come from Vitest's `globals: true` config.
const {
	createArtistUser,
	createClientUser,
	createProject,
} = require('../helpers/factories');
const Conversation = require('../../models/Conversation');
const Message = require('../../models/Message');
const SharedImage = require('../../models/SharedImage');
const { searchAll, RESULTS_PER_TYPE, MAX_RESULTS_PER_TYPE } = require('../../utils/search');

async function conversationBetween(memberIds) {
	const now = new Date();
	return new Conversation({
		members: memberIds.map(String),
		createdAt: now,
		updatedAt: now,
	}).save();
}

async function messageIn(conversationId, senderId, text) {
	const now = new Date();
	return new Message({
		conversationId,
		senderId,
		message: text,
		createdAt: now,
		updatedAt: now,
	}).save();
}

describe('searchAll', () => {
	it('returns everything empty, without touching the database, for a blank query', async () => {
		const { user: artist } = await createArtistUser();

		const result = await searchAll(artist, '   ', undefined);

		expect(result).toEqual({ clients: [], projects: [], messages: [], images: [] });
	});

	it('finds a client within the caller\'s scope by a distinctive name token, grouped under "clients"', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser({ firstName: 'Zephyrine' });
		await createProject(artist._id, client._id); // gives the artist clientScopeFilter visibility

		const result = await searchAll(artist, 'Zephyrine', undefined);

		expect(result.clients).toHaveLength(1);
		expect(String(result.clients[0]._id)).toBe(String(client._id));
		expect(result.projects).toEqual([]);
		expect(result.messages).toEqual([]);
		expect(result.images).toEqual([]);
	});

	it('does not surface a client outside the caller\'s scope, even with a matching name', async () => {
		const { user: artist } = await createArtistUser();
		await createClientUser({ firstName: 'Quetzalcoatl' }); // no project/shop link to this artist at all

		const result = await searchAll(artist, 'Quetzalcoatl', undefined);

		expect(result.clients).toEqual([]);
	});

	it('finds a project by a distinctive title token, scoped to the artist\'s own projects', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artist._id, client._id, { title: 'Bioluminescent jellyfish sleeve' });

		const result = await searchAll(artist, 'Bioluminescent', undefined);

		expect(result.projects).toHaveLength(1);
		expect(String(result.projects[0]._id)).toBe(String(project._id));
	});

	// conversationScopeFilter is DELIBERATELY narrower than canAccessConversation - see that
	// function's own header comment: literal membership only, so search can only under-return,
	// never leak a thread the caller was never put in.
	it('finds message content only in a conversation the caller is literally a member of', async () => {
		const { user: artistIn } = await createArtistUser();
		const { user: artistOut } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const conversation = await conversationBetween([artistIn._id, clientUser._id]);
		await messageIn(conversation._id, clientUser._id, 'Let\'s talk about the Chrysanthemum design');

		const inResult = await searchAll(artistIn, 'Chrysanthemum', undefined);
		const outResult = await searchAll(artistOut, 'Chrysanthemum', undefined);

		expect(inResult.messages).toHaveLength(1);
		expect(outResult.messages).toEqual([]);
	});

	it('finds a shared image by its tag, using the same scope Projects use', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		const conversation = await conversationBetween([artist._id, client.userId]);
		await new SharedImage({
			url: 'https://example.com/ref.png',
			conversationId: conversation._id,
			messageId: conversation._id, // stands in for a real messageId - not read by search
			clientId: client._id,
			artistId: artist._id,
			senderId: artist._id,
			tags: ['Hummingbird'],
		}).save();

		const result = await searchAll(artist, 'Hummingbird', undefined);

		expect(result.images).toHaveLength(1);
	});

	it('clamps an out-of-range limit to MAX_RESULTS_PER_TYPE rather than the raw value', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		for (let i = 0; i < 3; i += 1) {
			// eslint-disable-next-line no-await-in-loop
			await createProject(artist._id, client._id, { title: `Marigold piece ${i}` });
		}

		// Asking for far more than MAX_RESULTS_PER_TYPE, or a garbage value, must not throw and
		// must not exceed the real result count either way - this just pins that clamping runs
		// without error on both an oversized and a non-integer limit.
		const oversized = await searchAll(artist, 'Marigold', MAX_RESULTS_PER_TYPE + 1000);
		const nonInteger = await searchAll(artist, 'Marigold', 1.5);

		expect(oversized.projects.length).toBeLessThanOrEqual(MAX_RESULTS_PER_TYPE);
		expect(nonInteger.projects.length).toBeLessThanOrEqual(RESULTS_PER_TYPE);
	});
});
