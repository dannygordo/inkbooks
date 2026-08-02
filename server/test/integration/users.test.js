// Regression tests for ownership checks added to users.js - getUsers/getUser/getUserTagColors
// previously had no restriction beyond bare authentication (any logged-in user, including a
// Client, could list every user account on the platform, or read anyone's single user record).
// See resolvers/users.js for the fix itself.
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');

const GET_USERS = `{ getUsers { id } }`;
const GET_USER = `query GetUser($userId: ID!) { getUser(userId: $userId) { id } }`;
const GET_USER_TAG_COLORS = `
	query GetUserTagColors($shopId: ID!) {
		getUserTagColors(shopId: $shopId) { id }
	}
`;

describe('getUsers: ADMIN-only', () => {
	it('rejects a non-Admin caller, including a Shop Admin', async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USERS },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUsers).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows an Admin', async () => {
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USERS },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(Array.isArray(data.getUsers)).toBe(true);
	});
});

describe('getUser: self-or-shop-admin-or-better', () => {
	it('allows a user to read their own record', async () => {
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USER, variables: { userId: clientUser.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getUser.id).toBe(clientUser.id);
	});

	it('rejects reading someone else\'s record', async () => {
		const { user: clientUser } = await createClientUser();
		const { user: otherClient } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USER, variables: { userId: otherClient.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUser).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('allows a Shop Admin to read any user\'s record', async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USER, variables: { userId: clientUser.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getUser.id).toBe(clientUser.id);
	});
});

describe('getUserTagColors: shop-affiliation scoping', () => {
	it('allows a Staff member to read their own shop\'s tag colors', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staffUser } = await createStaffUser(shop.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USER_TAG_COLORS, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(staffUser)) },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeUndefined();
	});

	it('rejects a Staff member reading a different shop\'s tag colors', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { user: staffAtA } = await createStaffUser(shopA.id);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USER_TAG_COLORS, variables: { shopId: shopB.id } },
			{ contextValue: contextWithToken(signTestToken(staffAtA)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUserTagColors).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects a Client with no shop affiliation', async () => {
		const { shop } = await createShopAdminUser();
		const { user: clientUser } = await createClientUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: GET_USER_TAG_COLORS, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUserTagColors).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});
