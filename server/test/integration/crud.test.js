// Integration tests for the remaining simple-CRUD resources - Client, Staff, Artist, Shop. Each
// gets one success path plus one below-the-gate rejection rather than the exhaustive coverage
// appointments.test.js/projects.test.js have.
//
// The delete cases that used to live here are gone with the mutations themselves - see the note on
// the Mutation type in typeDefs.js. Cross-shop coverage for the create/update paths lives in
// shopIsolation.test.js rather than being duplicated here.
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

	// Regression test for a real bug found via manual testing against seeded local data: Artist.
	// shopId/userId were typed `ID!` (non-null) in typeDefs.js, but createArtistUser() here (and
	// any genuinely independent artist - the headline scenario of the artist-centric tenancy
	// redesign, see PRODUCTION_ROADMAP.md) has no shopId set at all. No existing test caught this
	// because none of them selected `shopId` in a getArtists response alongside a shopId-less
	// artist - CREATE_ARTIST above only ever selects `id`/`firstName`. The instant a real query
	// selected `shopId` on a shopId-less artist, GraphQL threw "Cannot return null for non-nullable
	// field Artist.shopId", which nulls the entire response under Apollo Client's default error
	// policy - not just that one artist - breaking the whole Artists page. Fixed by making
	// Artist.shopId nullable in the schema (userId stays non-null - every artist has a real user
	// account regardless of shop affiliation, that part of the model is a real invariant).
	it('getArtists: does not error on an independent artist with no shopId', async () => {
		// The caller is the global ADMIN, not a shop admin: this is a test about schema
		// nullability, and a shop admin's result set is now scoped to their own shop, which a
		// shopId-less artist by definition isn't in.
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		await createArtistUser(); // shopId-less by default - see factories.js's createArtistUser
		const server = createTestServer();

		const response = await server.executeOperation(
			{ query: '{ getArtists { id shopId userId } }' },
			{ contextValue: contextWithToken(signTestToken(admin)) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(Array.isArray(data.getArtists)).toBe(true);
		const independentArtist = data.getArtists.find((a) => a.shopId === null);
		expect(independentArtist).toBeDefined();
		expect(independentArtist.userId).not.toBeNull();
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

});
