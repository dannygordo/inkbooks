// Regression tests for the shop-scoping fix applied to getShops/getStaff/getArtists/getClients/
// getProjects/getConversationsByMemberId - these previously had no restriction beyond bare
// authentication (any logged-in user, including an unrelated Client, could list every shop's
// staff/clients/artists/projects on the platform). See resolvers/shops.js, resolvers/staff.js,
// resolvers/artists.js, resolvers/clients.js, resolvers/projects.js, resolvers/conversations.js,
// and utils/shop-membership.js for the fix itself.
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createUser,
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	connectArtistToShop,
	createProject,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');

const GET_SHOPS = `{ getShops { id } }`;
const GET_STAFF = `{ getStaff { id shopId } }`;
const GET_ARTISTS = `{ getArtists { id shopId } }`;
const GET_CLIENTS = `{ getClients { id } }`;
const GET_PROJECTS = `{ getProjects { id clientId artistId } }`;
const GET_CONVERSATIONS_BY_MEMBER_ID = `
	query GetConversationsByMemberId($memberId: ID!) {
		getConversationsByMemberId(memberId: $memberId) { id }
	}
`;
const GET_SHOP = `query GetShop($shopId: ID!) { getShop(shopId: $shopId) { id } }`;
const GET_ONE_STAFF = `query GetOneStaff($staffId: ID!) { getOneStaff(staffId: $staffId) { id } }`;
const GET_ARTIST = `query GetArtist($artistId: ID!) { getArtist(artistId: $artistId) { id } }`;
const GET_ARTISTS_BY_SHOP = `query GetArtistsByShop($shopId: ID!) { getArtistsByShop(shopId: $shopId) { id } }`;
const GET_CLIENT = `query GetClient($clientId: ID!) { getClient(clientId: $clientId) { id } }`;
const GET_PROJECT = `query GetProject($projectId: ID!) { getProject(projectId: $projectId) { id } }`;
const GET_CONVERSATION = `query GetConversation($conversationId: ID!) { getConversation(conversationId: $conversationId) { id } }`;
const CREATE_CONVERSATION = `
	mutation CreateConversation($members: [ID!], $createdAt: DateTime, $updatedAt: DateTime) {
		createConversation(members: $members, createdAt: $createdAt, updatedAt: $updatedAt) { id }
	}
`;

describe('getShops: shop-affiliation scoping', () => {
	it('allows a SHOP_ADMIN to see every shop (matches the existing, documented no-per-shop-scoping-for-admins convention)', async () => {
		const { user: shopAdminA } = await createShopAdminUser();
		await createShopAdminUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_SHOPS },
			{ contextValue: contextWithToken(signTestToken(shopAdminA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getShops.length).toBeGreaterThanOrEqual(2);
	});

	it('only shows a Staff member their own shop, not other shops', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_SHOPS },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const ids = data.getShops.map((s) => s.id);
		expect(ids).toContain(shopA.id);
		expect(ids).not.toContain(shopB.id);
	});

	it('returns an empty list for a Client with no shop affiliation', async () => {
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_SHOPS },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getShops).toEqual([]);
	});
});

describe('getStaff: shop-affiliation scoping', () => {
	it('only shows an Artist connected to shop A that shop\'s staff, not shop B\'s', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		await createStaffUser(shopA.id);
		await createStaffUser(shopB.id);
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_STAFF },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const shopIds = data.getStaff.map((s) => s.shopId);
		expect(shopIds).toContain(shopA.id);
		expect(shopIds).not.toContain(shopB.id);
	});
});

describe('getArtists: shop-affiliation scoping', () => {
	it('only shows a Staff member their own shop\'s artists, not another shop\'s', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const { artist: artistA } = await createArtistUser({ artist: { shopId: shopA.id } });
		const { artist: artistB } = await createArtistUser({ artist: { shopId: shopB.id } });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_ARTISTS },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const ids = data.getArtists.map((a) => a.id);
		expect(ids).toContain(artistA.id);
		expect(ids).not.toContain(artistB.id);
	});
});

describe('getClients: shop-affiliation scoping (via shared Projects)', () => {
	it('shows an Artist only clients they have a Project with', async () => {
		const { user: artistA } = await createArtistUser();
		const { user: artistB } = await createArtistUser();
		const { client: clientOfA } = await createClientUser();
		const { client: clientOfB } = await createClientUser();
		await createProject(artistA.id, clientOfA.id);
		await createProject(artistB.id, clientOfB.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CLIENTS },
			{ contextValue: contextWithToken(signTestToken(artistA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const ids = data.getClients.map((c) => c.id);
		expect(ids).toContain(clientOfA.id);
		expect(ids).not.toContain(clientOfB.id);
	});

	it('shows a Staff member the clients of their own shop\'s artists, not another shop\'s', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const { user: artistA } = await createArtistUser();
		const { user: artistB } = await createArtistUser();
		await connectArtistToShop(artistA.id, shopA.id);
		await connectArtistToShop(artistB.id, shopB.id);
		const { client: clientOfA } = await createClientUser();
		const { client: clientOfB } = await createClientUser();
		await createProject(artistA.id, clientOfA.id);
		await createProject(artistB.id, clientOfB.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CLIENTS },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		const ids = data.getClients.map((c) => c.id);
		expect(ids).toContain(clientOfA.id);
		expect(ids).not.toContain(clientOfB.id);
	});
});

describe('getProjects: role-scoped visibility', () => {
	it('shows a Client only their own projects', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUserA, client: clientA } = await createClientUser();
		const { client: clientB } = await createClientUser();
		await createProject(artistUser.id, clientA.id);
		await createProject(artistUser.id, clientB.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS },
			{ contextValue: contextWithToken(signTestToken(clientUserA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjects).toHaveLength(1);
		expect(data.getProjects[0].clientId).toBe(clientA.id);
	});

	it('shows an Artist only their own projects', async () => {
		const { user: artistA } = await createArtistUser();
		const { user: artistB } = await createArtistUser();
		const { client: clientA } = await createClientUser();
		await createProject(artistA.id, clientA.id);
		await createProject(artistB.id, clientA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS },
			{ contextValue: contextWithToken(signTestToken(artistA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjects).toHaveLength(1);
		expect(data.getProjects[0].artistId).toBe(artistA.id);
	});

	it('allows a SHOP_ADMIN-or-better user to see every project', async () => {
		const { user: artistA } = await createArtistUser();
		const { user: artistB } = await createArtistUser();
		const { client: clientA } = await createClientUser();
		await createProject(artistA.id, clientA.id);
		await createProject(artistB.id, clientA.id);
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECTS },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProjects.length).toBeGreaterThanOrEqual(2);
	});
});

describe('getConversationsByMemberId: self-only', () => {
	it('allows a user to read their own conversations', async () => {
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CONVERSATIONS_BY_MEMBER_ID, variables: { memberId: clientUser.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeUndefined();
	});

	it('rejects a user reading someone else\'s conversations, even a Shop Admin', async () => {
		const { user: clientUser } = await createClientUser();
		const { user: shopAdmin } = await createShopAdminUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CONVERSATIONS_BY_MEMBER_ID, variables: { memberId: clientUser.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getConversationsByMemberId).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getShop: single-resource ownership', () => {
	it('allows a Staff member to view their own shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_SHOP, variables: { shopId: shopA.id } },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getShop.id).toBe(shopA.id);
	});

	it('rejects a Staff member viewing a different shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_SHOP, variables: { shopId: shopB.id } },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getShop).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getOneStaff: single-resource ownership', () => {
	it('allows a Staff member to view a coworker at the same shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const { staff: coworker } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_ONE_STAFF, variables: { staffId: coworker.id } },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getOneStaff.id).toBe(coworker.id);
	});

	it('rejects a Staff member at a different shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { staff: staffAtA } = await createStaffUser(shopA.id);
		const { user: staffAtB } = await createStaffUser(shopB.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_ONE_STAFF, variables: { staffId: staffAtA.id } },
			{ contextValue: contextWithToken(signTestToken(staffAtB)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getOneStaff).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getArtist / getArtistsByShop: single-resource ownership', () => {
	it('allows a Staff member to view an artist at their own shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const { artist: artistA } = await createArtistUser({ artist: { shopId: shopA.id } });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artistA.id } },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getArtist.id).toBe(artistA.id);
	});

	it('rejects an unrelated user viewing an artist at a different shop', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffB } = await createStaffUser(shopB.id);
		const { artist: artistA } = await createArtistUser({ artist: { shopId: shopA.id } });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_ARTIST, variables: { artistId: artistA.id } },
			{ contextValue: contextWithToken(signTestToken(staffB)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getArtist).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('getArtistsByShop: rejects a Staff member listing a different shop\'s artists', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffA } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_ARTISTS_BY_SHOP, variables: { shopId: shopB.id } },
			{ contextValue: contextWithToken(signTestToken(staffA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getArtistsByShop).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getClient: single-resource ownership', () => {
	it('allows a Client to view their own record', async () => {
		const { user: clientUser, client } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClient.id).toBe(client.id);
	});

	it('allows an Artist who shares a Project with this client', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClient.id).toBe(client.id);
	});

	it('rejects an unrelated Artist with no shared Project', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getClient).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getProject: single-resource ownership', () => {
	it('allows the assigned artist', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECT, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProject.id).toBe(project.id);
	});

	it('allows the project\'s own client', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECT, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getProject.id).toBe(project.id);
	});

	it('rejects an unrelated artist with no connection to this project\'s shop', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: otherArtist } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_PROJECT, variables: { projectId: project.id } },
			{ contextValue: contextWithToken(signTestToken(otherArtist)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getProject).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('getConversation: member-only', () => {
	it('allows a real member of the conversation', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();
		const createRes = await server.executeOperation(
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
		const conversationId = createRes.body.singleResult.data.createConversation.id;

		const response = await server.executeOperation(
			{ query: GET_CONVERSATION, variables: { conversationId } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getConversation.id).toBe(conversationId);
	});

	it('rejects a non-member', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: clientUser } = await createClientUser();
		const { user: outsider } = await createClientUser();
		const server = createTestServer();
		const createRes = await server.executeOperation(
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
		const conversationId = createRes.body.singleResult.data.createConversation.id;

		const response = await server.executeOperation(
			{ query: GET_CONVERSATION, variables: { conversationId } },
			{ contextValue: contextWithToken(signTestToken(outsider)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getConversation).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});
