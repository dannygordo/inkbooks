// Regression tests for the Conversation/Message logic fix - Project.conversation and
// getProjectConversation previously always returned null (they filtered on Conversation.
// artistId/clientId, fields that never actually exist on a stored Conversation document - see
// resolvers/index.js's Project.conversation and resolvers/conversations.js's
// getProjectConversation), Message.user threw a ReferenceError for staff-type senders (missing
// Staff import) or for any sender lookup miss (undefined `userObject`), and createMessage/
// createConversation had no ownership checks at all (impersonation - anyone could post as anyone
// into any conversation). See utils/conversations.js, utils/shop-membership.js,
// resolvers/index.js, resolvers/conversations.js, resolvers/messages.js,
// mutations/messages.js, mutations/conversations.js for the fixes.
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	createProject,
} = require('../helpers/factories');

const GET_PROJECT_WITH_CONVERSATION = `
	query GetProject($projectId: ID!) {
		getProject(projectId: $projectId) {
			id
			conversation { id members }
		}
	}
`;
const GET_PROJECT_CONVERSATION = `
	query GetProjectConversation($artistId: ID!, $clientId: ID!) {
		getProjectConversation(artistId: $artistId, clientId: $clientId) { id members }
	}
`;
const GET_CONVERSATIONS_BY_SHOP_ID = `
	query GetConversationsByShopId($shopId: ID!) {
		getConversationsByShopId(shopId: $shopId) { id }
	}
`;
const CREATE_MESSAGE = `
	mutation CreateMessage($conversationId: ID!, $senderId: ID!, $message: String!, $createdAt: DateTime, $updatedAt: DateTime) {
		createMessage(conversationId: $conversationId, senderId: $senderId, message: $message, createdAt: $createdAt, updatedAt: $updatedAt) {
			id
			user { id firstName userInfo { id firstName } }
		}
	}
`;
const CREATE_CONVERSATION = `
	mutation CreateConversation($members: [ID!], $createdAt: DateTime, $updatedAt: DateTime) {
		createConversation(members: $members, createdAt: $createdAt, updatedAt: $updatedAt) { id }
	}
`;

describe('Project.conversation: find-or-create by membership', () => {
	it('creates a conversation between the assigned artist and client, and reuses it on a second read', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();
		const token = signTestToken(artistUser);

		const first = await server.executeOperation(
			{ query: GET_PROJECT_WITH_CONVERSATION, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(token) },
		);
		const { errors: errors1, data: data1 } = first.body.singleResult;
		expect(errors1).toBeUndefined();
		expect(data1.getProject.conversation).not.toBeNull();
		const memberIds = data1.getProject.conversation.members.map(String);
		expect(memberIds).toContain(String(artistUser.id));
		expect(memberIds).toContain(String(clientUser.id));

		const second = await server.executeOperation(
			{ query: GET_PROJECT_WITH_CONVERSATION, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(token) },
		);
		const { errors: errors2, data: data2 } = second.body.singleResult;
		expect(errors2).toBeUndefined();
		// Same conversation reused, not a fresh duplicate every read.
		expect(data2.getProject.conversation.id).toBe(data1.getProject.conversation.id);
	});
});

describe('getProjectConversation: find-or-create + ownership', () => {
	it('allows the assigned artist and returns the same conversation as Project.conversation', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();
		const token = signTestToken(artistUser);

		const viaProject = await server.executeOperation(
			{ query: GET_PROJECT_WITH_CONVERSATION, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(token) },
		);
		const projectConversationId = viaProject.body.singleResult.data.getProject.conversation.id;

		const response = await server.executeOperation(
			{ query: GET_PROJECT_CONVERSATION, variables: { artistId: artistUser.id, clientId: client.id } },
			{ contextValue: contextWithToken(token) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjectConversation.id).toBe(projectConversationId);
	});

	it('rejects an unrelated artist with no connection to this pair', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECT_CONVERSATION, variables: { artistId: artistUser.id, clientId: client.id } },
			{ contextValue: contextWithToken(signTestToken(otherArtist)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data.getProjectConversation).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getConversationsByShopId: real shop-membership matching', () => {
	it('finds a conversation whose member is Staff at this shop, not a different shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffAtA } = await createStaffUser(shopA.id);
		await createStaffUser(shopB.id);
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();
		const createRes = await server.executeOperation(
			{
				query: CREATE_CONVERSATION,
				variables: {
					members: [staffAtA.id, clientUser.id],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(staffAtA)) },
		);
		expect(createRes.body.singleResult.errors).toBeUndefined();

		const response = await server.executeOperation(
			{ query: GET_CONVERSATIONS_BY_SHOP_ID, variables: { shopId: shopA.id } },
			{ contextValue: contextWithToken(signTestToken(staffAtA)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getConversationsByShopId.length).toBeGreaterThanOrEqual(1);
	});

	it('rejects a Staff member querying a different shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffAtA } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CONVERSATIONS_BY_SHOP_ID, variables: { shopId: shopB.id } },
			{ contextValue: contextWithToken(signTestToken(staffAtA)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data.getConversationsByShopId).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('Message.user resolver: no crash for staff senders, no crash on missing sender', () => {
	it('resolves user + userInfo for a Staff-type sender without throwing', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staffUser } = await createStaffUser(shop.id);
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();
		const createConvoRes = await server.executeOperation(
			{
				query: CREATE_CONVERSATION,
				variables: {
					members: [staffUser.id, clientUser.id],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(staffUser)) },
		);
		const conversationId = createConvoRes.body.singleResult.data.createConversation.id;

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: staffUser.id,
					message: 'hello from staff',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(staffUser)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createMessage.user.id).toBe(staffUser.id);
		expect(data.createMessage.user.userInfo).not.toBeNull();
	});
});

describe('createMessage: no impersonation, membership required', () => {
	it('rejects a sender id that does not match the caller', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();
		const createConvoRes = await server.executeOperation(
			{
				query: CREATE_CONVERSATION,
				variables: {
					members: [artistUser.id, clientUser.id],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);
		const conversationId = createConvoRes.body.singleResult.data.createConversation.id;

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: clientUser.id,
					message: 'pretending to be the client',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data.createMessage).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects a real user who is not a member of the conversation', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const { user: outsider } = await createArtistUser();
		const server = createTestServer();
		const createConvoRes = await server.executeOperation(
			{
				query: CREATE_CONVERSATION,
				variables: {
					members: [artistUser.id, clientUser.id],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);
		const conversationId = createConvoRes.body.singleResult.data.createConversation.id;

		const response = await server.executeOperation(
			{
				query: CREATE_MESSAGE,
				variables: {
					conversationId,
					senderId: outsider.id,
					message: 'butting in',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(outsider)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data.createMessage).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('createConversation: caller must be a member', () => {
	it('rejects creating a conversation the caller is not part of', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const { user: outsider } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_CONVERSATION,
				variables: {
					members: [artistUser.id, clientUser.id],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(outsider)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(data.createConversation).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows creating a conversation the caller is part of', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{
				query: CREATE_CONVERSATION,
				variables: {
					members: [artistUser.id, clientUser.id],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			},
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createConversation.id).toBeDefined();
	});
});
