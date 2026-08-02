// Integration tests for the remaining simple-CRUD resources - Client, Staff, Artist, Shop. Unlike
// Appointment/Project, none of these have inline ownership logic; every mutation is a flat
// withAuth(resolverFn, minRole) gate, so each resource gets one success path plus one
// below-the-gate rejection rather than the exhaustive coverage appointments.test.js/projects.test.js
// have.
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createUser, createShopAdminUser, createArtistUser } = require('../helpers/factories');
const { Constants } = require('../../utils/constants');

function unique(prefix) {
	return `${prefix}${Date.now()}${Math.floor(Math.random() * 100000)}`;
}

describe('Client CRUD', () => {
	const CREATE_CLIENT = `
		mutation CreateClient($firstName: String!, $lastName: String!, $email: String!, $phone: String!, $address: String!, $city: String!, $state: String!, $zip: String!, $instagram: String!, $facebook: String!, $avatar: String!, $userId: ID!) {
			createClient(firstName: $firstName, lastName: $lastName, email: $email, phone: $phone, address: $address, city: $city, state: $state, zip: $zip, instagram: $instagram, facebook: $facebook, avatar: $avatar, userId: $userId) {
				id
				firstName
			}
		}
	`;
	const DELETE_CLIENT = `mutation DeleteClient($clientId: ID!) { deleteClient(clientId: $clientId) }`;

	function clientVars(userId, overrides = {}) {
		return {
			firstName: 'Jon', lastName: 'Snow', email: `${unique('client')}@example.com`,
			phone: '555-1234', address: '1 Wall St', city: 'Winterfell', state: 'North', zip: '00001',
			instagram: '', facebook: '', avatar: '', userId,
			...overrides,
		};
	}

	it('createClient: Constants.ROLES.CLIENT is the loosest gate - any authenticated user succeeds', async () => {
		const clientUser = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const token = signTestToken(clientUser);
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_CLIENT, variables: clientVars(clientUser.id) },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createClient.firstName).toBe('Jon');
	});

	it('deleteClient: rejects everyone below ADMIN, including SHOP_ADMIN', async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const targetUser = await createUser();
		const server = createTestServer();
		const createRes = await server.executeOperation(
			{ query: CREATE_CLIENT, variables: clientVars(targetUser.id) },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);
		const clientId = createRes.body.singleResult.data.createClient.id;

		const response = await server.executeOperation(
			{ query: DELETE_CLIENT, variables: { clientId } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		// deleteClient(...): String! is non-null in the schema, so a thrown resolver error nulls
		// out `data` itself, not just `data.deleteClient` - same rule noted in auth.test.js.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('deleteClient: allows ADMIN', async () => {
		const targetUser = await createUser();
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const server = createTestServer();
		const createRes = await server.executeOperation(
			{ query: CREATE_CLIENT, variables: clientVars(targetUser.id) },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);
		const clientId = createRes.body.singleResult.data.createClient.id;

		const response = await server.executeOperation(
			{ query: DELETE_CLIENT, variables: { clientId } },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.deleteClient).toMatch(/deleted successfully/);
	});
});

describe('Staff CRUD', () => {
	// Regression test for a real bug found while writing this file: createStaff's GraphQL schema
	// was missing `shopId`/`title` entirely even though the resolver already destructured both and
	// models/Staff.js's shopId is `required: true` - so this mutation could never actually
	// succeed end-to-end before the typeDefs.js fix made alongside this test. See the comment on
	// createStaff in graphql/typeDefs.js.
	const CREATE_STAFF = `
		mutation CreateStaff($firstName: String!, $lastName: String!, $email: String!, $phone: String!, $address: String!, $city: String!, $state: String!, $zip: String!, $instagram: String!, $facebook: String!, $avatar: String!, $userId: ID!, $status: Int!, $title: String, $shopId: ID!) {
			createStaff(firstName: $firstName, lastName: $lastName, email: $email, phone: $phone, address: $address, city: $city, state: $state, zip: $zip, instagram: $instagram, facebook: $facebook, avatar: $avatar, userId: $userId, status: $status, title: $title, shopId: $shopId) {
				id
				firstName
				shopId
			}
		}
	`;
	const DELETE_STAFF = `mutation DeleteStaff($staffId: ID!) { deleteStaff(staffId: $staffId) }`;

	function staffVars(userId, shopId, overrides = {}) {
		return {
			firstName: 'Sam', lastName: 'Tarly', email: `${unique('staff')}@example.com`,
			phone: '555-2345', address: '2 Wall St', city: 'Oldtown', state: 'Reach', zip: '00002',
			instagram: '', facebook: '', avatar: '', userId, status: 1, title: 'Piercer', shopId,
			...overrides,
		};
	}

	it('createStaff: now actually succeeds end-to-end with a real shopId (the bug fix)', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const targetUser = await createUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_STAFF, variables: staffVars(targetUser.id, shop.id) },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createStaff.shopId).toBe(shop.id);
	});

	it('createStaff: rejects an ARTIST-role caller (below SHOP_ADMIN)', async () => {
		const { user: artistUser } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const targetUser = await createUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_STAFF, variables: staffVars(targetUser.id, shop.id) },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		// createStaff(...): Staff! is non-null in the schema, so a thrown resolver error nulls out
		// `data` itself, not just `data.createStaff`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('deleteStaff: rejects SHOP_ADMIN (requires full ADMIN)', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const targetUser = await createUser();
		const server = createTestServer();
		const createRes = await server.executeOperation(
			{ query: CREATE_STAFF, variables: staffVars(targetUser.id, shop.id) },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);
		const staffId = createRes.body.singleResult.data.createStaff.id;

		const response = await server.executeOperation(
			{ query: DELETE_STAFF, variables: { staffId } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		// deleteStaff(...): String! is non-null in the schema, so a thrown resolver error nulls out
		// `data` itself, not just `data.deleteStaff`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});
});

describe('Artist CRUD', () => {
	const CREATE_ARTIST = `
		mutation CreateArtist($firstName: String!, $lastName: String!, $email: String!, $title: String!, $phone: String!, $address: String!, $city: String!, $state: String!, $zip: String!, $instagram: String!, $facebook: String!, $avatar: String!, $startDate: String!, $shopId: ID!, $userId: ID!) {
			createArtist(firstName: $firstName, lastName: $lastName, email: $email, title: $title, phone: $phone, address: $address, city: $city, state: $state, zip: $zip, instagram: $instagram, facebook: $facebook, avatar: $avatar, startDate: $startDate, shopId: $shopId, userId: $userId) {
				id
				firstName
			}
		}
	`;
	const DELETE_ARTIST = `mutation DeleteArtist($artistId: ID!) { deleteArtist(artistId: $artistId) }`;

	function artistVars(userId, shopId, overrides = {}) {
		return {
			firstName: 'Gendry', lastName: 'Baratheon', email: `${unique('artist')}@example.com`,
			title: 'Artist', phone: '555-3456', address: '3 Wall St', city: 'Flea Bottom', state: 'Crownlands',
			zip: '00003', instagram: '', facebook: '', avatar: '', startDate: new Date().toISOString(),
			shopId, userId,
			...overrides,
		};
	}

	it('createArtist: allows SHOP_ADMIN', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const targetUser = await createUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_ARTIST, variables: artistVars(targetUser.id, shop.id) },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createArtist.firstName).toBe('Gendry');
	});

	it('createArtist: rejects a CLIENT-role caller', async () => {
		const clientUser = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const { shop } = await createShopAdminUser();
		const targetUser = await createUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_ARTIST, variables: artistVars(targetUser.id, shop.id) },
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		// createArtist(...): Artist! is non-null in the schema, so a thrown resolver error nulls
		// out `data` itself, not just `data.createArtist`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('deleteArtist: allows ADMIN', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const targetUser = await createUser();
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const server = createTestServer();
		const createRes = await server.executeOperation(
			{ query: CREATE_ARTIST, variables: artistVars(targetUser.id, shop.id) },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);
		const artistId = createRes.body.singleResult.data.createArtist.id;

		const response = await server.executeOperation(
			{ query: DELETE_ARTIST, variables: { artistId } },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.deleteArtist).toMatch(/deleted successfully/);
	});
});

describe('Shop CRUD', () => {
	const CREATE_SHOP = `
		mutation CreateShop($name: String!, $email: String!) {
			createShop(name: $name, email: $email) {
				id
				name
			}
		}
	`;
	const DELETE_SHOP = `mutation DeleteShop($shopId: ID!) { deleteShop(shopId: $shopId) }`;

	it('createShop: allows SHOP_ADMIN', async () => {
		const { user: shopAdmin } = await createShopAdminUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP, variables: { name: unique('Shop'), email: `${unique('shop')}@example.com` } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.createShop.id).toEqual(expect.any(String));
	});

	it('createShop: rejects an ARTIST-role caller', async () => {
		const { user: artistUser } = await createArtistUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: CREATE_SHOP, variables: { name: unique('Shop'), email: `${unique('shop')}@example.com` } },
			{ contextValue: contextWithToken(signTestToken(artistUser)) },
		);

		// createShop(...): Shop! is non-null in the schema, so a thrown resolver error nulls out
		// `data` itself, not just `data.createShop`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('deleteShop: rejects SHOP_ADMIN (requires full ADMIN)', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);

		// deleteShop(...): String! is non-null in the schema, so a thrown resolver error nulls out
		// `data` itself, not just `data.deleteShop`.
		const { errors, data } = response.body.singleResult;
		expect(data).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('deleteShop: allows ADMIN', async () => {
		const { shop } = await createShopAdminUser();
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: DELETE_SHOP, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.deleteShop).toMatch(/deleted successfully/);
	});
});
