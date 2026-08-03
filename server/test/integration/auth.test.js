// Integration tests for the auth surface: register, login, and the withAuth wrapper (both the
// "any authenticated user" and the minRole-gated cases). These run real GraphQL operations
// against a real ApolloServer instance and a real (in-memory) MongoDB - see test/setup.js and
// test/helpers/testServer.js. No mocks of Mongoose, bcrypt, or jsonwebtoken.
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const { createUser, createArtistUser, createShopAdminUser } = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const { DEFAULT_NO_SHOP_TAG_COLOR } = require('../../utils/tag-color');
const User = require('../../models/User');

const REGISTER_MUTATION = `
	mutation Register($registerInput: RegisterInput!) {
		register(registerInput: $registerInput) {
			id
			email
			username
			role
			userType
			accessToken
			tagColor
		}
	}
`;

const LOGIN_MUTATION = `
	mutation Login($username: String!, $password: String!) {
		login(username: $username, password: $password) {
			id
			email
			username
			role
			accessToken
			tagColor
		}
	}
`;

const GET_USERS_QUERY = `
	query GetUsers {
		getUsers {
			id
		}
	}
`;

const UPDATE_SHOP_MUTATION = `
	mutation UpdateShop($shop: ShopInput) {
		updateShop(shop: $shop) {
			id
			name
		}
	}
`;

function baseRegisterInput(overrides = {}) {
	return {
		username: `newclient${Date.now()}`,
		email: `newclient${Date.now()}@example.com`,
		firstName: 'Jon',
		lastName: 'Snow',
		password: 'longenoughpassword',
		confirmPassword: 'longenoughpassword',
		// RegisterInput requires these at the GraphQL schema level (role: Int!, userType: String!)
		// even though resolvers/users.js's register() deliberately never reads them (see the
		// "ignores a caller-supplied role/userType" test below) - without these, every request
		// here would fail GraphQL variable coercion before the resolver ever runs. The values
		// themselves are arbitrary noise from the resolver's point of view.
		role: 999,
		userType: 'whatever-the-caller-wants',
		...overrides,
	};
}

describe('register mutation', () => {
	it('registers a new user with the default Client role/userType', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput: baseRegisterInput() } },
			{ contextValue: contextWithToken() },
		);

		expect(response.body.kind).toBe('single');
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.register.role).toBe(Constants.ROLES.CLIENT);
		expect(data.register.userType).toBe(Constants.USER_TYPE.CLIENT);
		expect(data.register.accessToken).toEqual(expect.any(String));
	});

	// Locks in the Phase 1 fix for the register() role-escalation bug (PRODUCTION_ROADMAP.md
	// Phase 1, item 3): resolvers/users.js deliberately never destructures role/userType from
	// registerInput. A caller passing them through the GraphQL variables must have no effect at
	// all - the created account is always a Client, regardless of what's sent on the wire.
	it('ignores a caller-supplied role/userType and always creates a Client', async () => {
		const server = createTestServer();
		const registerInput = baseRegisterInput({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.ARTIST });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.register.role).toBe(Constants.ROLES.CLIENT);
		expect(data.register.userType).toBe(Constants.USER_TYPE.CLIENT);

		// Also confirm it stuck in the actual DB record, not just the mutation's return value.
		const stored = await User.findOne({ username: registerInput.username });
		expect(stored.role).toBe(Constants.ROLES.CLIENT);
		expect(stored.userType).toBe(Constants.USER_TYPE.CLIENT);
	});

	// Regression test: Register.jsx used to hardcode tagColor: '#fff' on the client, and the
	// resolver just echoed back whatever it was sent - so every self-registered account's calendar
	// label rendered invisibly (white on white). register() now always assigns a real default
	// itself (see utils/tag-color.js), ignoring any tagColor the caller sends - a self-registered
	// account is always a Client with no shop, so there's nothing to be "unique among shop-mates"
	// against, always the fixed purple default.
	it('assigns the fixed purple "no shop" default tagColor, ignoring anything the caller sends', async () => {
		const server = createTestServer();
		const registerInput = baseRegisterInput({ tagColor: '#123456' });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.register.tagColor).toBe(DEFAULT_NO_SHOP_TAG_COLOR);

		// Also confirm it stuck in the actual DB record, not just the mutation's return value.
		const stored = await User.findOne({ username: registerInput.username });
		expect(stored.tagColor).toBe(DEFAULT_NO_SHOP_TAG_COLOR);
	});

	it('rejects a password under 8 characters', async () => {
		const server = createTestServer();
		const registerInput = baseRegisterInput({ password: 'short1', confirmPassword: 'short1' });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput } },
			{ contextValue: contextWithToken() },
		);

		// register(...): User! is non-null in the schema - when its resolver throws, GraphQL's
		// null-propagation rule bubbles the null past the field and up to `data` itself (the
		// nearest nullable ancestor), not just `data.register`. See the same pattern below on
		// login (also User!) and on several mutations in crud.test.js/projects.test.js.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});

	it('rejects a mismatched confirmPassword', async () => {
		const server = createTestServer();
		const registerInput = baseRegisterInput({ confirmPassword: 'somethingElseEntirely' });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput } },
			{ contextValue: contextWithToken() },
		);

		// register(...): User! is non-null in the schema - when its resolver throws, GraphQL's
		// null-propagation rule bubbles the null past the field and up to `data` itself (the
		// nearest nullable ancestor), not just `data.register`. See the same pattern below on
		// login (also User!) and on several mutations in crud.test.js/projects.test.js.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});

	it('rejects a duplicate email', async () => {
		const server = createTestServer();
		const first = baseRegisterInput();
		await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput: first } },
			{ contextValue: contextWithToken() },
		);

		const dupe = baseRegisterInput({ email: first.email });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput: dupe } },
			{ contextValue: contextWithToken() },
		);

		// register(...): User! is non-null in the schema - when its resolver throws, GraphQL's
		// null-propagation rule bubbles the null past the field and up to `data` itself (the
		// nearest nullable ancestor), not just `data.register`. See the same pattern below on
		// login (also User!) and on several mutations in crud.test.js/projects.test.js.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});

	it('rejects a duplicate username', async () => {
		const server = createTestServer();
		const first = baseRegisterInput();
		await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput: first } },
			{ contextValue: contextWithToken() },
		);

		const dupe = baseRegisterInput({ username: first.username });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput: dupe } },
			{ contextValue: contextWithToken() },
		);

		// register(...): User! is non-null in the schema - when its resolver throws, GraphQL's
		// null-propagation rule bubbles the null past the field and up to `data` itself (the
		// nearest nullable ancestor), not just `data.register`. See the same pattern below on
		// login (also User!) and on several mutations in crud.test.js/projects.test.js.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});
});

describe('login mutation', () => {
	// login goes through bcrypt.compare against a real hash, so this exercises register() first
	// rather than using factories.createUser()'s placeholder password field.
	async function registerRealUser(server, overrides = {}) {
		const registerInput = baseRegisterInput(overrides);
		await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { registerInput } },
			{ contextValue: contextWithToken() },
		);
		return registerInput;
	}

	it('logs in with correct credentials and returns a valid, decodable JWT', async () => {
		const server = createTestServer();
		const { username, password } = await registerRealUser(server);

		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { username, password } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.login.username).toBe(username);
		const decoded = jwt.verify(data.login.accessToken, process.env.SECRET_KEY, { algorithms: ['HS256'] });
		expect(decoded.username).toBe(username);
		expect(decoded.role).toBe(Constants.ROLES.CLIENT);
	});

	it('rejects an unknown username', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { username: 'nobody-registered-this', password: 'whatever123' } },
			{ contextValue: contextWithToken() },
		);

		// login(...): User! is non-null, and this is a real thrown UserInputError (not a graceful
		// "no such user" null) - see resolvers/users.js's login(). Both mean errors is defined and
		// the null propagates all the way to `data`, not just `data.login`.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].message).toMatch(/User not found/);
		expect(data).toBeNull();
	});

	it('rejects the wrong password for a real username', async () => {
		const server = createTestServer();
		const { username } = await registerRealUser(server);

		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { username, password: 'definitely-not-it' } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].message).toMatch(/Invalid username\/password/);
		expect(data).toBeNull();
	});
});

// Regression tests for login()'s tagColor self-heal (see resolvers/users.js) - fixes every
// account already stuck at a missing/placeholder tagColor the moment they next log in, rather
// than needing a one-off DB migration script this sandbox has no way to run against a live DB
// anyway. Uses factories.createUser/createArtistUser directly (not the register mutation, which
// only ever creates Clients) with a real bcrypt hash so login()'s bcrypt.compare check actually
// passes - factories' own placeholder password field isn't a valid hash.
describe('login mutation: tagColor self-heal', () => {
	const REAL_PASSWORD = 'reallongpassword123';

	async function login(username) {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { username, password: REAL_PASSWORD } },
			{ contextValue: contextWithToken() },
		);
		return response.body.singleResult;
	}

	it('heals a never-set tagColor to the purple default for a user with no shop affiliation', async () => {
		const user = await createUser({
			password: await bcrypt.hash(REAL_PASSWORD, 12),
			tagColor: undefined,
		});

		const { errors, data } = await login(user.username);
		expect(errors).toBeUndefined();
		expect(data.login.tagColor).toBe(DEFAULT_NO_SHOP_TAG_COLOR);

		// Also confirm it's actually persisted, not just returned once.
		const stored = await User.findById(user.id);
		expect(stored.tagColor).toBe(DEFAULT_NO_SHOP_TAG_COLOR);
	});

	it('heals the old literal white default the same way', async () => {
		const user = await createUser({
			password: await bcrypt.hash(REAL_PASSWORD, 12),
			tagColor: '#fff',
		});

		const { data } = await login(user.username);
		expect(data.login.tagColor).toBe(DEFAULT_NO_SHOP_TAG_COLOR);
	});

	it('assigns a shop-unique color for a shop-affiliated artist, never colliding with a shop-mate', async () => {
		const { shop } = await createShopAdminUser();
		// A shop-mate already sitting on a real color - the healing artist below must not land on
		// this one.
		await createArtistUser({ tagColor: '#c69818', artist: { shopId: shop.id } });

		const { user: healingArtist } = await createArtistUser({
			password: await bcrypt.hash(REAL_PASSWORD, 12),
			tagColor: undefined,
			artist: { shopId: shop.id },
		});

		const { errors, data } = await login(healingArtist.username);
		expect(errors).toBeUndefined();
		expect(data.login.tagColor).toBeTruthy();
		expect(data.login.tagColor).not.toBe('#c69818');
	});

	it('leaves an already-set real tagColor untouched', async () => {
		const user = await createUser({
			password: await bcrypt.hash(REAL_PASSWORD, 12),
			tagColor: '#2ea2dc',
		});

		const { data } = await login(user.username);
		expect(data.login.tagColor).toBe('#2ea2dc');
	});
});

describe('withAuth: unauthenticated / malformed / expired tokens', () => {
	it('rejects a call with no authorization header at all', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_USERS_QUERY },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUsers).toBeNull();
		expect(errors[0].message).toMatch(/Authentication header must be provided/);
	});

	it('rejects a garbage/malformed token', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_USERS_QUERY },
			{ contextValue: contextWithToken('not-a-real-jwt') },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUsers).toBeNull();
		expect(errors[0].message).toMatch(/Invalid\/expired token/);
	});

	it('rejects an expired token', async () => {
		const { user } = await createArtistUser();
		const expiredToken = jwt.sign(
			{ id: user.id, email: user.email, username: user.username, role: user.role },
			process.env.SECRET_KEY,
			{ expiresIn: '-1s', algorithm: 'HS256' },
		);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_USERS_QUERY },
			{ contextValue: contextWithToken(expiredToken) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUsers).toBeNull();
		expect(errors[0].message).toMatch(/Invalid\/expired token/);
	});

	it('rejects a token signed with the wrong secret', async () => {
		const { user } = await createArtistUser();
		const wrongSecretToken = jwt.sign(
			{ id: user.id, email: user.email, username: user.username, role: user.role },
			'not-the-real-secret-key',
			{ expiresIn: '5d', algorithm: 'HS256' },
		);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_USERS_QUERY },
			{ contextValue: contextWithToken(wrongSecretToken) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getUsers).toBeNull();
		expect(errors[0].message).toMatch(/Invalid\/expired token/);
	});

	it('accepts a valid token for an authenticated resolver whose role check it satisfies', async () => {
		// GET_USERS_QUERY (getUsers) is also this suite's stand-in for "any withAuth-wrapped
		// resolver" in the token-rejection tests above - that's still valid there, since a missing/
		// malformed/expired/wrong-secret token is rejected by withAuth before any role check runs.
		// But getUsers itself is ADMIN-only (see resolvers/users.js - tightened after this test was
		// first written, since it returned every user account on the platform to any authenticated
		// caller), so proving "a valid token is accepted" specifically through getUsers now needs
		// an Admin-role token, not just any authenticated user.
		const admin = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const token = signTestToken(admin);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: GET_USERS_QUERY },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(Array.isArray(data.getUsers)).toBe(true);
	});
});

describe('withAuth: minRole gate (updateShop requires Constants.ROLES.SHOP_ADMIN or better)', () => {
	it('rejects a CLIENT-role caller (numerically less privileged than SHOP_ADMIN)', async () => {
		const user = await createUser({ role: Constants.ROLES.CLIENT, userType: Constants.USER_TYPE.CLIENT });
		const { shop } = await createShopAdminUser();
		const token = signTestToken(user);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: UPDATE_SHOP_MUTATION, variables: { shop: { id: shop.id, name: 'Hacked Name' } } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateShop).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('rejects an ARTIST-role caller (numerically less privileged than SHOP_ADMIN)', async () => {
		const { user } = await createArtistUser();
		const { shop } = await createShopAdminUser();
		const token = signTestToken(user);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: UPDATE_SHOP_MUTATION, variables: { shop: { id: shop.id, name: 'Hacked Name' } } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.updateShop).toBeNull();
		expect(errors[0].message).toMatch(/Action not allowed/);
	});

	it('accepts a SHOP_ADMIN-role caller', async () => {
		const { user, shop } = await createShopAdminUser();
		const token = signTestToken(user);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: UPDATE_SHOP_MUTATION, variables: { shop: { id: shop.id, name: 'Renamed Shop' } } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateShop.name).toBe('Renamed Shop');
	});

	it('accepts an ADMIN-role caller (numerically more privileged than the required minRole)', async () => {
		const user = await createUser({ role: Constants.ROLES.ADMIN, userType: Constants.USER_TYPE.STAFF });
		const { shop } = await createShopAdminUser();
		const token = signTestToken(user);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: UPDATE_SHOP_MUTATION, variables: { shop: { id: shop.id, name: 'Renamed By Admin' } } },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.updateShop.name).toBe('Renamed By Admin');
	});
});
