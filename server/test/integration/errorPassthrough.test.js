// Deliberate errors survive the resolver that threw them.
//
// Nearly every resolver in this codebase is shaped
// `try { ... } catch (err) { throw new Error(err) }`. That catch used to destroy every error
// raised inside its own try: an AuthenticationError carrying "Action not allowed", or a
// UserInputError carrying `extensions.errors.status`, was caught by the resolver that threw it
// and re-thrown as a bare Error - message stringified into "Error: AuthenticationError: Action
// not allowed", extensions gone entirely.
//
// The visible cost was a client that couldn't tell "you're not allowed to do that" from "the
// server fell over", and forms reading `extensions.errors` to highlight a field getting nothing
// to read. It was found three times before it was understood as one thing - getShop, then
// getClient, then the three update mutations - because each instance looks local and harmless.
// Five files had independently grown their own `if (err instanceof GraphQLError) throw err`
// guard, which is `rethrow` (utils/errors.js) written out longhand.
//
// These tests are pinned to the SHAPE rather than to any one resolver: a code, a clean message,
// and structured extensions. If someone reintroduces `throw new Error(err)` anywhere on these
// paths, the assertions on `extensions.code` and the un-prefixed message are what fail.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createArtistUser,
	createShopAdminUser,
	createClientUser,
	connectArtistToShop,
	createProject,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const { rethrow, AuthenticationError, UserInputError } = require('../../utils/errors');

const asUser = (user) => ({ contextValue: contextWithToken(signTestToken(user)) });

describe('rethrow', () => {
	it('passes a GraphQLError through untouched, with its extensions', () => {
		const original = new UserInputError('Errors', { errors: { email: 'taken' } });
		let caught;
		try {
			rethrow(original);
		} catch (err) {
			caught = err;
		}
		// The same object, not a copy - nothing to lose in translation.
		expect(caught).toBe(original);
		expect(caught.extensions.code).toBe('BAD_USER_INPUT');
		expect(caught.extensions.errors.email).toBe('taken');
	});

	it('keeps the old behaviour for anything else', () => {
		// A Mongoose cast error or a network blip should be reported exactly as it was before -
		// this change is about not swallowing DELIBERATE errors, not about reworking how
		// unexpected ones surface.
		let caught;
		try {
			rethrow(new Error('boom'));
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(Error);
		expect(caught.extensions).toBeUndefined();
	});
});

describe('authorization failures reach the client as authorization failures', () => {
	// Every one of these resolvers raises its AuthenticationError inside a try whose catch
	// rewrapped it. The message survived in mangled form; the code did not.
	it('getClient: a clean message and an UNAUTHENTICATED code', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		const { client } = await createClientUser({ client: { shopIds: [shopA._id] } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: `query A($clientId: ID!) { getClient(clientId: $clientId) { id } }`,
				variables: { clientId: client.id },
			},
			asUser(adminB),
		);

		const error = res.body.singleResult.errors[0];
		expect(error.message).toBe('Action not allowed');
		// Was "Error: AuthenticationError: Action not allowed" before the catch stopped
		// re-wrapping - a message no client should have to parse.
		expect(error.message).not.toMatch(/^Error:/);
		expect(error.extensions.code).toBe('UNAUTHENTICATED');
	});

	it('getProject: same shape', async () => {
		const { user: artistUser } = await createArtistUser();
		const { user: outsider } = await createArtistUser();
		const { client } = await createClientUser();
		const project = await createProject(artistUser.id, client.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: `query A($projectId: ID!) { getProject(projectId: $projectId) { id } }`,
				variables: { projectId: project.id },
			},
			asUser(outsider),
		);

		const error = res.body.singleResult.errors[0];
		expect(error.message).toBe('Action not allowed');
		expect(error.extensions.code).toBe('UNAUTHENTICATED');
	});

	it('getOneStaff: same shape', async () => {
		const { shop: shopA } = await createShopAdminUser();
		const { user: adminB } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shopA.id);
		const { staff } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: `query A($staffId: ID!) { getOneStaff(staffId: $staffId) { id } }`,
				variables: { staffId: staff.id },
			},
			asUser(adminB),
		);

		const error = res.body.singleResult.errors[0];
		expect(error.message).toBe('Action not allowed');
		expect(error.extensions.code).toBe('UNAUTHENTICATED');
	});
});

describe('validation failures keep their field-level detail', () => {
	// The half that was completely lost rather than merely mangled. A form highlights the field
	// that's wrong by reading extensions.errors[fieldName]; a flattened error carries none, so
	// every such form silently degraded to a generic failure message.
	it('updateClient: the archive guard reaches the client with its field', async () => {
		const { user: shopAdmin, shop } = await createShopAdminUser();
		const { user: artistUser } = await createArtistUser();
		await connectArtistToShop(artistUser.id, shop.id);
		const { client } = await createClientUser({ client: { shopIds: [shop._id] } });
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: `mutation A($client: ClientInput) { updateClient(client: $client) { id } }`,
				variables: {
					client: { id: client.id, status: Constants.CLIENT_STATUS.ARCHIVED },
				},
			},
			asUser(shopAdmin),
		);

		const error = res.body.singleResult.errors[0];
		expect(error.extensions.code).toBe('BAD_USER_INPUT');
		expect(error.extensions.errors.status).toMatch(/archiveClient/);
	});

	it('createArtistAccount: a duplicate email keeps its field-level error', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: existing } = await createClientUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: `
					mutation A($input: CreateArtistAccountInput!) {
						createArtistAccount(input: $input) { inviteLink }
					}
				`,
				variables: {
					input: {
						firstName: 'Maya',
						lastName: 'Chen',
						email: existing.email,
						shopId: String(shop.id),
					},
				},
			},
			asUser(admin),
		);

		const error = res.body.singleResult.errors[0];
		expect(error.extensions.code).toBe('BAD_USER_INPUT');
		expect(error.extensions.errors).toBeDefined();
	});
});
