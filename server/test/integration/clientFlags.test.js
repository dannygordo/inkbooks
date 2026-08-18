// Integration tests for the GraphQL surface over utils/client-flags.js: Client.flags,
// getClientFlagTypes, and raiseClientFlag. The business logic (idempotency, counter recompute,
// systemGenerated enforcement) is already covered by whatever exercises utils/client-flags.js
// directly - what's specific to this layer is authorization and shape, so that's what these test.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createClientUser,
	createShopAdminUser,
	connectArtistToShop,
	createProject,
} = require('../helpers/factories');
const ClientFlagType = require('../../models/ClientFlagType');
const ClientFlag = require('../../models/ClientFlag');

const RAISE_CLIENT_FLAG = `
	mutation RaiseClientFlag($input: RaiseClientFlagInput!) {
		raiseClientFlag(input: $input) {
			id
			clientId
			typeKey
			note
			systemGenerated
			resolvedAt
		}
	}
`;

const GET_CLIENT_FLAGS = `
	query GetClient($clientId: ID!) {
		getClient(clientId: $clientId) {
			id
			flags {
				id
				typeKey
				note
			}
		}
	}
`;

const GET_CLIENT_FLAG_TYPES = `
	query GetClientFlagTypes($shopId: ID) {
		getClientFlagTypes(shopId: $shopId) {
			key
			label
			shopId
			systemGenerated
		}
	}
`;

async function seedManualType(overrides = {}) {
	return new ClientFlagType({
		key: 'MOVED_APPOINTMENT',
		label: 'Moved appointment',
		description: 'Rescheduled a booked session.',
		systemGenerated: false,
		...overrides,
	}).save();
}

describe('raiseClientFlag', () => {
	it('lets an artist who shares a project with the client raise a manual flag', async () => {
		await seedManualType();
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artist.id, client.id);

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RAISE_CLIENT_FLAG,
				variables: { input: { clientId: client.id, typeKey: 'MOVED_APPOINTMENT', note: 'Third reschedule' } },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.raiseClientFlag.typeKey).toBe('MOVED_APPOINTMENT');
		expect(data.raiseClientFlag.note).toBe('Third reschedule');
		expect(data.raiseClientFlag.systemGenerated).toBe(false);
		expect(data.raiseClientFlag.resolvedAt).toBeNull();
	});

	it('refuses a client raising a flag about themselves', async () => {
		await seedManualType();
		const { user: artist } = await createArtistUser();
		const { user: clientUser, client } = await createClientUser();
		await createProject(artist.id, client.id);

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RAISE_CLIENT_FLAG,
				variables: { input: { clientId: client.id, typeKey: 'MOVED_APPOINTMENT' } },
			},
			{ contextValue: contextWithToken(signTestToken(clientUser)) },
		);

		// raiseClientFlag is non-null in the schema (ClientFlag!) - an error thrown resolving it
		// nulls `data` itself, not just this one field (see adjustments.test.js's own comment on the
		// same GraphQL null-bubbling behavior).
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses an artist with no shared project with this client', async () => {
		await seedManualType();
		const { user: unrelatedArtist } = await createArtistUser();
		const { client } = await createClientUser();

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RAISE_CLIENT_FLAG,
				variables: { input: { clientId: client.id, typeKey: 'MOVED_APPOINTMENT' } },
			},
			{ contextValue: contextWithToken(signTestToken(unrelatedArtist)) },
		);

		// raiseClientFlag is non-null in the schema (ClientFlag!) - an error thrown resolving it
		// nulls `data` itself, not just this one field (see adjustments.test.js's own comment on the
		// same GraphQL null-bubbling behavior).
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});

	it('refuses a systemGenerated type key - NO_SHOWED is machine-raised only', async () => {
		await new ClientFlagType({
			key: 'NO_SHOWED',
			label: 'No-showed',
			systemGenerated: true,
		}).save();
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artist.id, client.id);

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RAISE_CLIENT_FLAG,
				variables: { input: { clientId: client.id, typeKey: 'NO_SHOWED' } },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// raiseClientFlag is non-null in the schema (ClientFlag!) - an error thrown resolving it
		// nulls `data` itself, not just this one field (see adjustments.test.js's own comment on the
		// same GraphQL null-bubbling behavior).
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.typeKey).toBeTruthy();
	});

	it('refuses an unknown type key', async () => {
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artist.id, client.id);

		const server = createTestServer();
		const res = await server.executeOperation(
			{
				query: RAISE_CLIENT_FLAG,
				variables: { input: { clientId: client.id, typeKey: 'NOT_A_REAL_TYPE' } },
			},
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		// raiseClientFlag is non-null in the schema (ClientFlag!) - an error thrown resolving it
		// nulls `data` itself, not just this one field (see adjustments.test.js's own comment on the
		// same GraphQL null-bubbling behavior).
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].extensions.errors.typeKey).toBeTruthy();
	});
});

describe('Client.flags', () => {
	it('lists live flags and drops one that has been resolved', async () => {
		await seedManualType();
		const { user: artist } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artist.id, client.id);

		const server = createTestServer();
		const token = signTestToken(artist);
		const raiseRes = await server.executeOperation(
			{
				query: RAISE_CLIENT_FLAG,
				variables: { input: { clientId: client.id, typeKey: 'MOVED_APPOINTMENT' } },
			},
			{ contextValue: contextWithToken(token) },
		);
		const flagId = raiseRes.body.singleResult.data.raiseClientFlag.id;

		const before = await server.executeOperation(
			{ query: GET_CLIENT_FLAGS, variables: { clientId: client.id } },
			{ contextValue: contextWithToken(token) },
		);
		expect(before.body.singleResult.data.getClient.flags).toHaveLength(1);

		await ClientFlag.findByIdAndUpdate(flagId, { resolvedAt: new Date() });

		const after = await server.executeOperation(
			{ query: GET_CLIENT_FLAGS, variables: { clientId: client.id } },
			{ contextValue: contextWithToken(token) },
		);
		expect(after.body.singleResult.data.getClient.flags).toHaveLength(0);
	});
});

describe('getClientFlagTypes', () => {
	it('returns platform-wide types when no shopId is passed', async () => {
		await seedManualType();
		const { user: artist } = await createArtistUser();

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_CLIENT_FLAG_TYPES, variables: {} },
			{ contextValue: contextWithToken(signTestToken(artist)) },
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClientFlagTypes.map((t) => t.key)).toContain('MOVED_APPOINTMENT');
	});

	it("includes a shop's own type when that shop's id is passed, but refuses a non-member", async () => {
		await seedManualType();
		const { user: shopAdmin, shop } = await createShopAdminUser();
		await new ClientFlagType({
			key: 'BRINGS_OWN_STENCIL',
			label: 'Brings own stencil',
			shopId: shop.id,
			systemGenerated: false,
		}).save();

		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: GET_CLIENT_FLAG_TYPES, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(shopAdmin)) },
		);
		expect(res.body.singleResult.errors).toBeUndefined();
		const keys = res.body.singleResult.data.getClientFlagTypes.map((t) => t.key);
		expect(keys).toContain('MOVED_APPOINTMENT');
		expect(keys).toContain('BRINGS_OWN_STENCIL');

		const { user: outsider } = await createArtistUser();
		const deniedRes = await server.executeOperation(
			{ query: GET_CLIENT_FLAG_TYPES, variables: { shopId: shop.id } },
			{ contextValue: contextWithToken(signTestToken(outsider)) },
		);
		// getClientFlagTypes is non-null in the schema ([ClientFlagType!]!) - same GraphQL
		// null-bubbling reasoning as raiseClientFlag above.
		expect(deniedRes.body.singleResult.data).toBeNull();
		expect(deniedRes.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});
