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
const {
	createUser,
	createArtistUser,
	createShopAdminUser,
	createStaffUser,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const { DEFAULT_NO_SHOP_TAG_COLOR } = require('../../utils/tag-color');
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Staff = require('../../models/Staff');
const Shop = require('../../models/Shop');
const ArtistShopConnection = require('../../models/ArtistShopConnection');

const REGISTER_MUTATION = `
	mutation RegisterAccount($input: RegisterAccountInput!) {
		registerAccount(input: $input) {
			id
			email
			role
			userType
			accessToken
			tagColor
		}
	}
`;

const LOGIN_MUTATION = `
	mutation Login($email: String!, $password: String!) {
		login(email: $email, password: $password) {
			id
			email
			role
			accessToken
			tagColor
		}
	}
`;

// This suite's stand-in for "any withAuth-wrapped resolver": it needs a query that is gated by
// authentication and nothing else, so a rejection can only mean the token was rejected. getShops
// fits exactly - withAuth with no minRole, returning the caller's own shops (an empty list for a
// caller with none, which is fine here since these tests assert on errors, not contents).
//
// This was getUsers until getUsers was deleted. That query returned every user account on the
// platform and existed only for a global admin role that no longer exists - see
// utils/shop-membership.js.
const AUTHED_QUERY = `
	query GetShops {
		getShops {
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

let registerCounter = 0;

function baseRegisterInput(overrides = {}) {
	return {
		// Date.now() alone repeats within a single fast-running test file - two registrations in the
		// same millisecond would collide on the unique email index and fail as a "duplicate" that
		// the test never intended. Email is now the ONLY unique identifier on User, so there is no
		// second field left to accidentally carry the uniqueness.
		email: `newclient${Date.now()}-${(registerCounter += 1)}@example.com`,
		firstName: 'Jon',
		lastName: 'Snow',
		password: 'longenoughpassword',
		confirmPassword: 'longenoughpassword',
		// Defaults to the artist path - the simpler of the two, and the one most of these tests are
		// not actually about. RegisterAccountInput no longer carries role or userType at all: they
		// were required Int!/String! fields the resolver pointedly ignored, which meant every test
		// had to send noise to get past variable coercion. A public input type that asks for a
		// permission level is a trap even when nothing reads it.
		accountType: 'artist',
		...overrides,
	};
}

describe('registerAccount mutation', () => {
	it('creates an independent artist', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: baseRegisterInput() } },
			{ contextValue: contextWithToken() },
		);

		expect(response.body.kind).toBe('single');
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.registerAccount.role).toBe(Constants.ROLES.ARTIST);
		expect(data.registerAccount.userType).toBe(Constants.USER_TYPE.ARTIST);
		expect(data.registerAccount.accessToken).toEqual(expect.any(String));

		// The profile record, not just the User. Without it login() resolves userInfo to null and
		// the app renders as though this person has no identity - the exact bug the old register()
		// had before it started creating a Client row.
		// The resolver returns the normalised address, so this is the stored one.
		const created = await User.findOne({ email: data.registerAccount.email });
		expect(await Artist.findOne({ userId: created._id })).toBeTruthy();
		// Independent: no shop, and therefore no connection.
		expect(await ArtistShopConnection.findOne({ artistId: created._id })).toBeNull();
		expect(data.registerAccount.tagColor).toBe(DEFAULT_NO_SHOP_TAG_COLOR);
	});

	it('creates a shop, its admin, and an artist profile for the owner', async () => {
		// The founding case: one person who owns a studio and tattoos in it. All four records, or
		// they sign up and find they have no calendar and cannot be booked.
		const server = createTestServer();
		const input = baseRegisterInput({ accountType: 'shop', shopName: 'Copper Wolf Tattoo' });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		// SHOP_ADMIN for what they may do; ARTIST for which profile userInfo resolves to. Those are
		// different questions and this account legitimately answers them differently.
		expect(data.registerAccount.role).toBe(Constants.ROLES.SHOP_ADMIN);
		expect(data.registerAccount.userType).toBe(Constants.USER_TYPE.ARTIST);

		const created = await User.findOne({ email: input.email.toLowerCase() });
		const shop = await Shop.findOne({ name: 'Copper Wolf Tattoo' });
		expect(shop).toBeTruthy();

		// The connection makes them visible on the shop's own calendar and in its analytics.
		const connection = await ArtistShopConnection.findOne({ artistId: created._id });
		expect(connection).toBeTruthy();
		expect(String(connection.shopId)).toBe(String(shop._id));

		// The Staff row is what makes them findable as an ADMIN of it - utils/notification-audience
		// looks for admins through Staff, so without this they'd never receive a money notification
		// about their own shop.
		const staff = await Staff.findOne({ userId: created._id });
		expect(staff).toBeTruthy();
		expect(String(staff.shopId)).toBe(String(shop._id));

		expect(await Artist.findOne({ userId: created._id })).toBeTruthy();
	});

	it('will not let a caller name their own role', async () => {
		// This used to be "ignores a caller-supplied role", because RegisterInput REQUIRED role and
		// userType and the resolver had to deliberately not read them. They are gone from the input
		// type entirely now, so the guarantee is structural rather than behavioural: the request
		// fails GraphQL validation before any resolver runs.
		//
		// Stronger than the old test, and worth keeping as a test rather than trusting the schema,
		// because re-adding a convenient-looking `role` field is exactly the change that would
		// silently reopen it.
		const server = createTestServer();
		const response = await server.executeOperation(
			{
				query: `
					mutation Escalate($input: RegisterAccountInput!) {
						registerAccount(input: $input) { id role }
					}
				`,
				variables: { input: { ...baseRegisterInput(), role: Constants.ROLES.ADMIN } },
			},
			{ contextValue: contextWithToken() },
		);

		const { errors } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].message).toMatch(/role/i);
	});

	it('sets the booking link chosen at signup, on both paths', async () => {
		// A shop owner needs one as much as an independent artist does - one account, one login, and
		// they take bookings themselves. Offering it only on the artist path would mean the 99% case
		// (a studio owner who tattoos) finishes signup without the link they came for.
		const server = createTestServer();

		const artistInput = baseRegisterInput({ bookingSlug: 'ink-by-jon' });
		const artistRes = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: artistInput } },
			{ contextValue: contextWithToken() },
		);
		expect(artistRes.body.singleResult.errors).toBeUndefined();
		const soloUser = await User.findOne({ email: artistInput.email.toLowerCase() });
		expect((await Artist.findOne({ userId: soloUser._id })).bookingSlug).toBe('ink-by-jon');

		const shopInput = baseRegisterInput({
			accountType: 'shop',
			shopName: 'Copper Wolf',
			bookingSlug: 'copper-wolf-dee',
		});
		const shopRes = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: shopInput } },
			{ contextValue: contextWithToken() },
		);
		expect(shopRes.body.singleResult.errors).toBeUndefined();
		const ownerUser = await User.findOne({ email: shopInput.email.toLowerCase() });
		expect((await Artist.findOne({ userId: ownerUser._id })).bookingSlug).toBe('copper-wolf-dee');
	});

	it('leaves the booking link unset when none is chosen', async () => {
		// Optional on purpose. /book/<id> still resolves, and a slug can be picked later from
		// Settings - nobody should be stuck at the end of a signup form inventing a handle.
		//
		// UNSET, not empty string: Artist.bookingSlug is uniquely indexed, so writing '' would put
		// every slug-less artist on the same value and the second signup would collide.
		const server = createTestServer();
		const input = baseRegisterInput();
		await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input } },
			{ contextValue: contextWithToken() },
		);

		const created = await User.findOne({ email: input.email.toLowerCase() });
		const artist = await Artist.findOne({ userId: created._id });
		expect(artist.bookingSlug === undefined || artist.bookingSlug === null).toBe(true);
	});

	it('refuses a taken booking link without leaving a half-built shop behind', async () => {
		// THE ordering test. The shop branch creates a Shop BEFORE the User, so a slug collision
		// discovered at the Artist save would leave an orphaned Shop row - a name nobody owns and
		// nobody else can now use. The slug is verified before anything is written.
		const server = createTestServer();
		const first = baseRegisterInput({ bookingSlug: 'taken-handle' });
		await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: first } },
			{ contextValue: contextWithToken() },
		);

		const second = baseRegisterInput({
			accountType: 'shop',
			shopName: 'Should Not Exist',
			bookingSlug: 'taken-handle',
		});
		const res = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: second } },
			{ contextValue: contextWithToken() },
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(await Shop.findOne({ name: 'Should Not Exist' })).toBeNull();
		expect(await User.findOne({ email: second.email.toLowerCase() })).toBeNull();
	});

	it('refuses a reserved word as a booking link', async () => {
		// /book/support with a studio's branding on it is a phishing surface, which is why the
		// reserved list exists (see utils/booking-slug.js). Asserted here because signup is the
		// first place anyone gets to choose one.
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: baseRegisterInput({ bookingSlug: 'support' }) } },
			{ contextValue: contextWithToken() },
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(res.body.singleResult.data).toBeNull();
	});

	it('refuses a shop with no name', async () => {
		// A Shop row requires a name, so this would otherwise fail at save time as a Mongoose
		// validation error rather than as a message pointing at the field somebody left blank.
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: baseRegisterInput({ accountType: 'shop' }) } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});

	it('refuses an account type that is not shop or artist', async () => {
		// 'staff' is the tempting one: a receptionist is added BY a shop, and self-registering as
		// one would mean anyone could create a staff account pointing at a shop they have nothing
		// to do with.
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: baseRegisterInput({ accountType: 'staff' }) } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});

	it('rejects a password under 8 characters', async () => {
		const server = createTestServer();
		const registerInput = baseRegisterInput({ password: 'short1', confirmPassword: 'short1' });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: registerInput } },
			{ contextValue: contextWithToken() },
		);

		// registerAccount(...): User! is non-null in the schema - when its resolver throws, GraphQL's
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
			{ query: REGISTER_MUTATION, variables: { input: registerInput } },
			{ contextValue: contextWithToken() },
		);

		// registerAccount(...): User! is non-null in the schema - when its resolver throws, GraphQL's
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
			{ query: REGISTER_MUTATION, variables: { input: first } },
			{ contextValue: contextWithToken() },
		);

		const dupe = baseRegisterInput({ email: first.email });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: dupe } },
			{ contextValue: contextWithToken() },
		);

		// registerAccount(...): User! is non-null in the schema - when its resolver throws, GraphQL's
		// null-propagation rule bubbles the null past the field and up to `data` itself (the
		// nearest nullable ancestor), not just `data.register`. See the same pattern below on
		// login (also User!) and on several mutations in crud.test.js/projects.test.js.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(data).toBeNull();
	});

	it('treats a differently-cased address as the same account', async () => {
		// Email is the login credential now, so "Jon@Example.com" and "jon@example.com" have to be one
		// account, not two. Normalisation lives on the schema field (lowercase: true in models/User.js)
		// rather than at each call site, precisely so a caller that forgets can't create the second one.
		const server = createTestServer();
		const first = baseRegisterInput();
		await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: first } },
			{ contextValue: contextWithToken() },
		);

		const dupe = baseRegisterInput({ email: first.email.toUpperCase() });
		const response = await server.executeOperation(
			{ query: REGISTER_MUTATION, variables: { input: dupe } },
			{ contextValue: contextWithToken() },
		);

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
			{ query: REGISTER_MUTATION, variables: { input: registerInput } },
			{ contextValue: contextWithToken() },
		);
		return registerInput;
	}

	it('logs in with correct credentials and returns a valid, decodable JWT', async () => {
		const server = createTestServer();
		const { email, password } = await registerRealUser(server);

		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email, password } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.login.email).toBe(email);
		const decoded = jwt.verify(data.login.accessToken, process.env.SECRET_KEY, { algorithms: ['HS256'] });
		expect(decoded.email).toBe(email);
		expect(decoded.role).toBe(Constants.ROLES.ARTIST);
	});

	it('logs in with a differently-cased address', async () => {
		// Somebody typing their address with a capital first letter, or a phone keyboard doing it for
		// them, is the single most likely way a real login fails. login() lowercases before looking up.
		const server = createTestServer();
		const { email, password } = await registerRealUser(server);

		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email: email.toUpperCase(), password } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(data.login.email).toBe(email);
	});

	it('logs in with surrounding whitespace', async () => {
		const server = createTestServer();
		const { email, password } = await registerRealUser(server);

		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email: `  ${email} `, password } },
			{ contextValue: contextWithToken() },
		);

		expect(response.body.singleResult.errors).toBeUndefined();
	});

	// Both of the next two assert the SAME message, and that is the assertion. An unknown address
	// and a wrong password have to be indistinguishable from outside, or the login form becomes a
	// free oracle for "does this person have an account at this shop" - which, for a tattoo studio's
	// client list, is information worth protecting on its own. The old code answered "User not
	// found" for one and "Invalid username/password" for the other.
	it('rejects an unknown address without revealing that it is unknown', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email: 'nobody-registered-this@example.com', password: 'whatever123' } },
			{ contextValue: contextWithToken() },
		);

		// login(...): User! is non-null, and this is a real thrown UserInputError (not a graceful
		// "no such user" null) - see resolvers/users.js's login(). Both mean errors is defined and
		// the null propagates all the way to `data`, not just `data.login`.
		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].message).toBe('Invalid email or password');
		expect(data).toBeNull();
	});

	it('rejects the wrong password with the identical message', async () => {
		const server = createTestServer();
		const { email } = await registerRealUser(server);

		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email, password: 'definitely-not-it' } },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeDefined();
		expect(errors[0].message).toBe('Invalid email or password');
		expect(data).toBeNull();
	});

	it('still runs a bcrypt comparison for an address that does not exist', async () => {
		// Timing. Returning early on "no such user" skips bcrypt entirely, and a ~100ms difference
		// between "unknown address" and "known address, wrong password" is measurable over the network
		// - it hands back exactly the enumeration signal the identical error messages above are there
		// to withhold. login() compares against DUMMY_PASSWORD_HASH instead. This asserts the two paths
		// are within an order of magnitude of each other rather than a fixed threshold, since CI timing
		// is noisy and a tight bound here would be a flake generator.
		const server = createTestServer();
		const { email } = await registerRealUser(server);

		const t0 = Date.now();
		await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email, password: 'definitely-not-it' } },
			{ contextValue: contextWithToken() },
		);
		const knownMs = Date.now() - t0;

		const t1 = Date.now();
		await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email: 'no-such-person@example.com', password: 'definitely-not-it' } },
			{ contextValue: contextWithToken() },
		);
		const unknownMs = Date.now() - t1;

		expect(unknownMs).toBeGreaterThan(knownMs / 10);
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

	async function login(email) {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: LOGIN_MUTATION, variables: { email, password: REAL_PASSWORD } },
			{ contextValue: contextWithToken() },
		);
		return response.body.singleResult;
	}

	it('heals a never-set tagColor to the purple default for a user with no shop affiliation', async () => {
		const user = await createUser({
			password: await bcrypt.hash(REAL_PASSWORD, 12),
			tagColor: undefined,
		});

		const { errors, data } = await login(user.email);
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

		const { data } = await login(user.email);
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

		const { errors, data } = await login(healingArtist.email);
		expect(errors).toBeUndefined();
		expect(data.login.tagColor).toBeTruthy();
		expect(data.login.tagColor).not.toBe('#c69818');
	});

	it('leaves an already-set real tagColor untouched', async () => {
		const user = await createUser({
			password: await bcrypt.hash(REAL_PASSWORD, 12),
			tagColor: '#2ea2dc',
		});

		const { data } = await login(user.email);
		expect(data.login.tagColor).toBe('#2ea2dc');
	});
});

describe('withAuth: unauthenticated / malformed / expired tokens', () => {
	it('rejects a call with no authorization header at all', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: AUTHED_QUERY },
			{ contextValue: contextWithToken() },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getShops).toBeNull();
		expect(errors[0].message).toMatch(/Authentication header must be provided/);
	});

	it('rejects a garbage/malformed token', async () => {
		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: AUTHED_QUERY },
			{ contextValue: contextWithToken('not-a-real-jwt') },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getShops).toBeNull();
		expect(errors[0].message).toMatch(/Invalid\/expired token/);
	});

	it('rejects an expired token', async () => {
		const { user } = await createArtistUser();
		const expiredToken = jwt.sign(
			{ id: user.id, email: user.email, role: user.role },
			process.env.SECRET_KEY,
			{ expiresIn: '-1s', algorithm: 'HS256' },
		);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: AUTHED_QUERY },
			{ contextValue: contextWithToken(expiredToken) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getShops).toBeNull();
		expect(errors[0].message).toMatch(/Invalid\/expired token/);
	});

	it('rejects a token signed with the wrong secret', async () => {
		const { user } = await createArtistUser();
		const wrongSecretToken = jwt.sign(
			{ id: user.id, email: user.email, role: user.role },
			'not-the-real-secret-key',
			{ expiresIn: '5d', algorithm: 'HS256' },
		);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: AUTHED_QUERY },
			{ contextValue: contextWithToken(wrongSecretToken) },
		);

		const { errors, data } = response.body.singleResult;
		expect(data.getShops).toBeNull();
		expect(errors[0].message).toMatch(/Invalid\/expired token/);
	});

	it('accepts a valid token for an authenticated resolver whose role check it satisfies', async () => {
		// A plain shop staff member: AUTHED_QUERY has no minRole, so any authenticated caller
		// should get through. The point is that the token is accepted, not what comes back.
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop.id);
		const token = signTestToken(staff);

		const server = createTestServer();
		const response = await server.executeOperation(
			{ query: AUTHED_QUERY },
			{ contextValue: contextWithToken(token) },
		);

		const { errors, data } = response.body.singleResult;
		expect(errors).toBeUndefined();
		expect(Array.isArray(data.getShops)).toBe(true);
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

	// The point here is purely the numeric comparison in withAuth: role 1 <= the required 10, so
	// the gate lets it through. The Staff row is what gets it past updateShop's separate shop
	// check - ADMIN grants no shop access of its own any more (see utils/shop-membership.js), so
	// without a real assignment this caller would be refused after passing the role gate, and the
	// test would pass or fail for the wrong reason.
	it('accepts an ADMIN-role caller (numerically more privileged than the required minRole)', async () => {
		const { shop } = await createShopAdminUser();
		const { user } = await createStaffUser(shop.id, {
			role: Constants.ROLES.ADMIN,
			userType: Constants.USER_TYPE.STAFF,
		});
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
