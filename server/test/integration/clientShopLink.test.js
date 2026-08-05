// Client.shopIds - what makes a client "ours" before any work exists.
//
// The bug this fixes was self-inflicted and worth recording. When the global admin role was
// removed, every "may this shop admin touch this client?" check needed a real answer, and Client
// had no shop field at all. The only existing link from a shop to a client was through Projects,
// so that join got reused for updateClient/deleteClient as well as updateClientNotes. Correct for
// notes; wrong for contact details, and wrong at exactly the moment a record is created - a
// receptionist adding a walk-in couldn't correct a typo in the email they'd just typed, because
// no project existed yet.
//
// Why plural, and why not a single `shopId`: Client.email is unique across the whole collection,
// so there is one Client row per person for the entire platform. A person tattooed at two shops
// shares one record and literally cannot have a second. A singular shopId on a globally-unique
// record would be wrong the moment a second shop worked with them.
//
// The shared-Project path stays alongside it, and isn't a fallback: an INDEPENDENT artist has no
// shop at all, so their clients have no shopIds and the work is the only link there is. Both
// paths are load-bearing, which is what the last describe block here is about.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
	createClientUser,
	connectArtistToShop,
	createProject,
} = require('../helpers/factories');
const Client = require('../../models/Client');

const CREATE_CLIENT_ACCOUNT = `
	mutation CreateClientAccount($input: CreateClientAccountInput!) {
		createClientAccount(input: $input) { isNewAccount client { id email } }
	}
`;

const UPDATE_CLIENT = `
	mutation UpdateClient($client: ClientInput) {
		updateClient(client: $client) { id email phone }
	}
`;

const GET_CLIENT = `query GetClient($clientId: ID!) { getClient(clientId: $clientId) { id } }`;
const GET_CLIENTS = `{ getClients { items { id } } }`;

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

describe('creating a client links them to the creating shop', () => {
	it('sets shopIds on a client added through the wizard', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_CLIENT_ACCOUNT,
				variables: {
					input: { firstName: 'Arya', lastName: 'Stark', email: 'arya@example.com' },
				},
			},
			asUser(staff),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const stored = await Client.findOne({ email: 'arya@example.com' });
		expect(stored.shopIds.map(String)).toEqual([String(shop.id)]);
	});

	it('lets the shop immediately correct a typo, with no project in between', async () => {
		// The whole point of the field. This exact call failed before it existed.
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const created = await server.executeOperation(
			{
				query: CREATE_CLIENT_ACCOUNT,
				variables: {
					input: { firstName: 'Arya', lastName: 'Stark', email: 'arya@example.com' },
				},
			},
			asUser(shopAdmin),
		);
		const clientId = created.body.singleResult.data.createClientAccount.client.id;

		const res = await server.executeOperation(
			{ query: UPDATE_CLIENT, variables: { client: { id: clientId, phone: '555-0100' } } },
			asUser(shopAdmin),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.updateClient.phone).toBe('555-0100');
	});

	it('adds the shop when an existing client is re-added by a second shop', async () => {
		// One person, one row, two shops. The append is what makes this work rather than the
		// second shop overwriting the first, or the unique-email constraint refusing the record.
		const { user: adminA, shop: shopA } = await createShopAdminUser();
		const { user: adminB, shop: shopB } = await createShopAdminUser();
		const server = createTestServer();

		const input = { firstName: 'Arya', lastName: 'Stark', email: 'arya@example.com' };
		await server.executeOperation({ query: CREATE_CLIENT_ACCOUNT, variables: { input } }, asUser(adminA));
		const second = await server.executeOperation(
			{ query: CREATE_CLIENT_ACCOUNT, variables: { input } },
			asUser(adminB),
		);

		// Not a new account - the same person walked into a second shop.
		expect(second.body.singleResult.data.createClientAccount.isNewAccount).toBe(false);
		expect(await Client.countDocuments({ email: 'arya@example.com' })).toBe(1);

		const stored = await Client.findOne({ email: 'arya@example.com' });
		const ids = stored.shopIds.map(String);
		expect(ids).toContain(String(shopA.id));
		expect(ids).toContain(String(shopB.id));
		expect(ids).toHaveLength(2);
	});

	it('links the client when a project is created for them', async () => {
		// The catch-all: however a client arrived, creating work for them ties them to the shop
		// doing it.
		const { shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const { client } = await createClientUser();
		expect(client.shopIds).toHaveLength(0);

		const server = createTestServer();
		await server.executeOperation(
			{
				query: `
					mutation CreateProject($title: String!, $description: String!, $artistId: ID!, $clientId: ID!, $status: String!) {
						createProject(title: $title, description: $description, artistId: $artistId, clientId: $clientId, status: $status) { id }
					}
				`,
				variables: {
					title: 'Sleeve',
					description: 'A sleeve.',
					artistId: artistUser.id,
					clientId: client.id,
					status: 'in_progress',
				},
			},
			asUser(artistUser),
		);

		const stored = await Client.findById(client.id);
		expect(stored.shopIds.map(String)).toEqual([String(shop.id)]);
	});
});

describe('the shop link does not leak across shops', () => {
	it("refuses a shop admin editing a client linked only to another shop", async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		const { client } = await createClientUser({ client: { shopIds: [shopA._id] } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: UPDATE_CLIENT, variables: { client: { id: client.id, phone: '555-0199' } } },
			asUser(adminB),
		);

		const { errors, data } = res.body.singleResult;
		expect(data.updateClient).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
		const stored = await Client.findById(client.id);
		expect(stored.phone).not.toBe('555-0199');
	});

	it("refuses reading a client linked only to another shop", async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		const { client } = await createClientUser({ client: { shopIds: [shopA._id] } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			asUser(adminB),
		);

		const { errors, data } = res.body.singleResult;
		expect(data.getClient).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('lists a shop only its own clients', async () => {
		const { user: adminA, shop: shopA } = await createShopAdminUser();
		const { shop: shopB } = await createShopAdminUser();
		const { client: mine } = await createClientUser({ client: { shopIds: [shopA._id] } });
		const { client: theirs } = await createClientUser({ client: { shopIds: [shopB._id] } });
		const server = createTestServer();

		const res = await server.executeOperation({ query: GET_CLIENTS }, asUser(adminA));

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		const ids = data.getClients.items.map((c) => c.id);
		expect(ids).toContain(mine.id);
		expect(ids).not.toContain(theirs.id);
	});

	it('shows a client shared by two shops to both of them', async () => {
		const { user: adminA, shop: shopA } = await createShopAdminUser();
		const { user: adminB, shop: shopB } = await createShopAdminUser();
		const { client: shared } = await createClientUser({
			client: { shopIds: [shopA._id, shopB._id] },
		});
		const server = createTestServer();

		for (const admin of [adminA, adminB]) {
			const res = await server.executeOperation({ query: GET_CLIENTS }, asUser(admin));
			expect(res.body.singleResult.data.getClients.items.map((c) => c.id)).toContain(shared.id);
		}
	});
});

describe('an independent artist reaches their clients through the work', () => {
	// Not an edge case - artists with no shop are a stated design goal, and they'd be locked out
	// of their own client list if shopIds were the only path. This is why canAccessClient keeps
	// both.
	it('lets an artist with no shop read a client they have a project with', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			asUser(artistUser),
		);

		const { errors, data } = res.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.getClient.id).toBe(client.id);
		// And genuinely via the project, not a stray shop link.
		const stored = await Client.findById(client.id);
		expect(stored.shopIds).toHaveLength(0);
	});

	it('still refuses an artist with no shop and no shared project', async () => {
		const { user: artistUser } = await createArtistUser();
		const { client } = await createClientUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			asUser(artistUser),
		);

		const { errors, data } = res.body.singleResult;
		expect(data.getClient).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('still lets a client read their own record with no shop link at all', async () => {
		const { user: clientUser, client } = await createClientUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: GET_CLIENT, variables: { clientId: client.id } },
			asUser(clientUser),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.getClient.id).toBe(client.id);
	});
});
