// Integration tests for account creation (mutations/accounts.js) - the three wizards.
//
// The property worth guarding hardest: an account created this way must NOT be loggable-into
// until its owner redeems the invite. The requested design was "a default password that gets
// set", and a shared default would mean every unclaimed account in the system is open to anyone
// who has ever seen that string. What's built instead is a random hash nobody - including the
// admin who created the account - ever knows. The first test below is what stops that quietly
// becoming a fixed string again.
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const bcrypt = require('bcryptjs');
const { createTestServer, contextWithToken } = require('../helpers/testServer');
const { signTestToken } = require('../helpers/auth');
const {
	createShopAdminUser,
	createStaffUser,
	createArtistUser,
	createClientUser,
	createUser,
} = require('../helpers/factories');
const { Constants } = require('../../utils/constants');
const User = require('../../models/User');
const Artist = require('../../models/Artist');
const Staff = require('../../models/Staff');
const Client = require('../../models/Client');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const PasswordToken = require('../../models/PasswordToken');

const CREATE_ARTIST = `
	mutation CreateArtistAccount($input: CreateArtistAccountInput!) {
		createArtistAccount(input: $input) {
			inviteLink
			artist { id email firstName userId }
		}
	}
`;

const CREATE_STAFF = `
	mutation CreateStaffAccount($input: CreateStaffAccountInput!) {
		createStaffAccount(input: $input) {
			inviteLink
			staff { id email userId }
		}
	}
`;

const CREATE_CLIENT = `
	mutation CreateClientAccount($input: CreateClientAccountInput!) {
		createClientAccount(input: $input) {
			isNewAccount
			client { id email firstName city }
		}
	}
`;

const asUser = (caller) => ({ contextValue: contextWithToken(signTestToken(caller)) });

describe('createArtistAccount', () => {
	it('creates a User that cannot be logged into until the invite is redeemed', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Maya',
						lastName: 'Chen',
						email: 'maya@example.com',
						shopId: String(shop.id),
					},
				},
			},
			asUser(admin),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const created = await User.findOne({ email: 'maya@example.com' });
		expect(created).toBeTruthy();
		expect(created.hasSetPassword).toBe(false);

		// The whole point. None of the obvious shared defaults work, and neither does anything
		// derived from the person's own details - which is the other tempting shortcut.
		for (const guess of ['inkbooks123', 'password', 'changeme', 'maya@example.com', 'Maya']) {
			expect(await bcrypt.compare(guess, created.password)).toBe(false);
		}
	});

	it('issues an invite token and returns a link containing it', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Maya',
						lastName: 'Chen',
						email: 'maya@example.com',
						shopId: String(shop.id),
					},
				},
			},
			asUser(admin),
		);

		const { inviteLink } = res.body.singleResult.data.createArtistAccount;
		const created = await User.findOne({ email: 'maya@example.com' });
		const token = await PasswordToken.findOne({ userId: created._id, purpose: 'invite' });

		expect(token).toBeTruthy();
		// The link is returned so the wizard can show it - email silently no-ops when the
		// provider isn't configured, and an admin needs a way to hand it over directly.
		expect(inviteLink).toContain('/set-password/');
		// And the raw token in that link is not what's stored.
		const rawFromLink = inviteLink.split('/set-password/')[1];
		expect(token.tokenHash).not.toBe(rawFromLink);
	});

	it('connects the artist to the shop so they are actually visible', async () => {
		// An artist with no ArtistShopConnection is invisible to the shop calendar, the artist
		// directory, shop analytics and the shop-cut ledger - all of which resolve membership
		// through it. Creating one that then appears nowhere would read as the wizard failing.
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();

		await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Maya',
						lastName: 'Chen',
						email: 'maya@example.com',
						shopId: String(shop.id),
					},
				},
			},
			asUser(admin),
		);

		const created = await User.findOne({ email: 'maya@example.com' });
		const connection = await ArtistShopConnection.findOne({ artistId: created._id });
		expect(connection).toBeTruthy();
		expect(connection.status).toBe('active');
		expect(String(connection.shopId)).toBe(String(shop.id));
	});

	it('connects the artist to the creating admin\'s shop when no shopId is sent', async () => {
		// THE regression this guards. Both wizards read shopId out of the login payload cached in
		// the browser (user.userInfo?.shop?.id). When that was empty - a stale session, a login
		// query that didn't select it, a shop admin whose Staff row was incomplete - the mutation
		// took `input.shopId || null`, skipped the connection block, and RETURNED SUCCESS. The
		// artist existed and appeared in no directory, no calendar, no ledger.
		//
		// The creator is a shop admin by definition here, so the server can answer this itself.
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Nolan',
						lastName: 'Reyes',
						email: 'nolan@example.com',
						// No shopId, deliberately.
					},
				},
			},
			asUser(admin),
		);
		expect(res.body.singleResult.errors).toBeUndefined();

		const created = await User.findOne({ email: 'nolan@example.com' });
		const connection = await ArtistShopConnection.findOne({ artistId: created._id });
		expect(connection).toBeTruthy();
		expect(String(connection.shopId)).toBe(String(shop.id));
		expect(connection.status).toBe('active');
	});

	it('refuses rather than creating an artist belonging to no shop', async () => {
		// A creator with no shop of their own - the seeded platform admin is exactly this: a User
		// with userType STAFF and deliberately no Staff record. Previously this produced an
		// unconnected artist and no error. Failing loudly is the only useful outcome; an artist
		// nobody can see is not a thing worth creating quietly.
		const platformAdmin = await createUser({
			role: Constants.ROLES.SHOP_ADMIN,
			userType: Constants.USER_TYPE.STAFF,
		});
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Orphan',
						lastName: 'Artist',
						email: 'orphan@example.com',
					},
				},
			},
			asUser(platformAdmin),
		);

		expect(res.body.singleResult.errors).toBeDefined();
		expect(await User.findOne({ email: 'orphan@example.com' })).toBeNull();
	});

	it('gives the new artist a real tag colour, unique within the shop', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: existing } = await createArtistUser({ tagColor: '#2ea2dc' });
		await new ArtistShopConnection({
			artistId: existing._id,
			shopId: shop._id,
			status: 'active',
		}).save();
		const server = createTestServer();

		await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Maya',
						lastName: 'Chen',
						email: 'maya@example.com',
						shopId: String(shop.id),
					},
				},
			},
			asUser(admin),
		);

		const created = await User.findOne({ email: 'maya@example.com' });
		expect(created.tagColor).toBeTruthy();
		// Not white - that's the default that rendered calendar labels invisibly and took a whole
		// fix to get rid of.
		expect(['#fff', '#ffffff']).not.toContain(created.tagColor);
		expect(created.tagColor).not.toBe('#2ea2dc');
	});

	it('refuses an email that already has an account', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const { user: existing } = await createClientUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_ARTIST,
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

		// `data` itself is null here, not just the field. createArtistAccount returns
		// ArtistAccountResult! - a NON-NULL type - and GraphQL propagates a null from a non-null
		// field up to its parent, which for a root field means the whole `data`. Asserting
		// `data.createArtistAccount` is null only works for nullable fields (getShopAnalytics,
		// getArtist and friends), which is where that habit came from.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors).toBeDefined();
		expect(await Artist.countDocuments({})).toBe(0);
	});

	it('refuses a caller below shop admin', async () => {
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: {
						firstName: 'Maya',
						lastName: 'Chen',
						email: 'maya@example.com',
						shopId: String(shop.id),
					},
				},
			},
			asUser(staff),
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
		expect(await User.countDocuments({ email: 'maya@example.com' })).toBe(0);
	});
});

describe('createStaffAccount', () => {
	it("lands staff in the creating admin's shop when no shopId is sent", async () => {
		// The staff half of the same problem, with a different symptom. CreateStaffAccountInput.shopId
		// was ID!, so an empty cached shop id in the browser failed GraphQL VALIDATION before the
		// resolver ran - an unactionable error rather than a silent orphan, but equally a dead end,
		// and it made the answer the server already had unreachable.
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_STAFF,
				variables: {
					input: {
						firstName: 'Dani',
						lastName: 'Okafor',
						email: 'dani@example.com',
						// No shopId, deliberately.
					},
				},
			},
			asUser(admin),
		);
		expect(res.body.singleResult.errors).toBeUndefined();

		const staff = await Staff.findOne({ email: 'dani@example.com' });
		expect(staff).toBeTruthy();
		expect(String(staff.shopId)).toBe(String(shop.id));
	});

	it('creates staff at SHOP_STAFF, never shop admin', async () => {
		// Promoting someone to admin has real consequences - shop-wide financials, the ability to
		// create more accounts - and shouldn't be reachable from a create form a shop admin fills
		// in while onboarding a receptionist.
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_STAFF,
				variables: {
					input: {
						firstName: 'Sam',
						lastName: 'Rivera',
						email: 'sam@example.com',
						shopId: String(shop.id),
					},
				},
			},
			asUser(admin),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		const created = await User.findOne({ email: 'sam@example.com' });
		expect(created.role).toBe(15);
		expect(created.hasSetPassword).toBe(false);

		const staff = await Staff.findOne({ userId: created._id });
		expect(String(staff.shopId)).toBe(String(shop.id));
	});
});

describe('createClientAccount', () => {
	it('creates a client with no invite token', async () => {
		// A client added by a shop is usually someone who walked in. They get the same silent
		// account the booking flow creates and can claim it later through the normal reset flow -
		// emailing a login to someone who just booked a tattoo is noise.
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop.id);
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_CLIENT,
				variables: {
					input: {
						firstName: 'Arya',
						lastName: 'Stark',
						email: 'arya@example.com',
						city: 'Portland',
					},
				},
			},
			asUser(staff),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.createClientAccount.isNewAccount).toBe(true);
		expect(res.body.singleResult.data.createClientAccount.client.city).toBe('Portland');

		const created = await User.findOne({ email: 'arya@example.com' });
		expect(created.hasSetPassword).toBe(false);
		expect(await PasswordToken.countDocuments({ userId: created._id })).toBe(0);
	});

	it('reuses an existing account rather than failing on a duplicate email', async () => {
		// The common case in a shop: someone books online, then walks in, and a receptionist adds
		// them by hand not knowing they're already on file. Failing on the unique-email
		// constraint would be technically correct and useless.
		const { shop } = await createShopAdminUser();
		const { user: staff } = await createStaffUser(shop.id);
		const { user: existingUser, client: existingClient } = await createClientUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_CLIENT,
				variables: {
					input: {
						firstName: existingClient.firstName,
						lastName: existingClient.lastName,
						email: existingUser.email,
						city: 'Seattle',
					},
				},
			},
			asUser(staff),
		);

		const result = res.body.singleResult.data.createClientAccount;
		expect(result.isNewAccount).toBe(false);
		expect(String(result.client.id)).toBe(String(existingClient.id));
		// The extra details still land on the existing record.
		expect(result.client.city).toBe('Seattle');
		// And no second account was made.
		expect(await User.countDocuments({ email: existingUser.email })).toBe(1);
		expect(await Client.countDocuments({ userId: existingUser._id })).toBe(1);
	});

	it('refuses an artist adding a client', async () => {
		const { user: artist } = await createArtistUser();
		const server = createTestServer();

		const res = await server.executeOperation(
			{
				query: CREATE_CLIENT,
				variables: {
					input: { firstName: 'Arya', lastName: 'Stark', email: 'arya@example.com' },
				},
			},
			asUser(artist),
		);

		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors[0].message).toMatch(/Action not allowed/);
	});
});

// The whole loop, in one test, because every piece of it passed on its own while the loop itself
// was broken.
//
// createArtistAccount worked. setPasswordWithToken worked. login worked. And an invited artist
// still could not get in - because User carried a separate required `username`, auto-derived from
// the email's local part plus random hex, never shown in any UI, and login() keyed on it. The
// person held a valid password for an identifier nobody could tell them. Three green tests, one
// account nobody could reach.
//
// This asserts the seam, not the pieces: invite -> set password -> log in with the address the
// admin typed. If email ever stops being the login credential, this is what fails.
describe('invite to first login, end to end', () => {
	const SET_PASSWORD = `
		mutation SetPasswordWithToken($token: String!, $newPassword: String!) {
			setPasswordWithToken(token: $token, newPassword: $newPassword)
		}
	`;

	const LOGIN = `
		mutation Login($email: String!, $password: String!) {
			login(email: $email, password: $password) {
				id
				email
				role
				accessToken
			}
		}
	`;

	// setPasswordWithToken and login are public - no token to sign. A unique ip per call because
	// requestPasswordReset's limiter state is module-level and shared across the whole test
	// process; see the same note in passwordTokens.test.js.
	let ipCounter = 0;
	const publicContext = () => ({
		contextValue: { req: { headers: {}, ip: `10.1.0.${(ipCounter += 1)}` } },
	});

	it('lets an invited artist log in with the address their admin typed', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();
		const email = 'invited.artist@example.com';
		const newPassword = 'a-real-password-they-chose';

		const created = await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: { firstName: 'Maya', lastName: 'Chen', email, shopId: String(shop.id) },
				},
			},
			asUser(admin),
		);
		expect(created.body.singleResult.errors).toBeUndefined();
		const { inviteLink } = created.body.singleResult.data.createArtistAccount;

		// Exactly what the person does: opens the link, reads the token out of the URL.
		const rawToken = inviteLink.split('/set-password/')[1];

		const set = await server.executeOperation(
			{ query: SET_PASSWORD, variables: { token: rawToken, newPassword } },
			publicContext(),
		);
		expect(set.body.singleResult.errors).toBeUndefined();
		expect(set.body.singleResult.data.setPasswordWithToken).toBe(true);

		const loggedIn = await server.executeOperation(
			{ query: LOGIN, variables: { email, password: newPassword } },
			publicContext(),
		);

		expect(loggedIn.body.singleResult.errors).toBeUndefined();
		expect(loggedIn.body.singleResult.data.login.email).toBe(email);
		expect(loggedIn.body.singleResult.data.login.accessToken).toEqual(expect.any(String));
	});

	it('lets an invited staff member log in the same way', async () => {
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();
		const email = 'invited.frontdesk@example.com';
		const newPassword = 'another-real-password';

		const created = await server.executeOperation(
			{
				query: CREATE_STAFF,
				variables: {
					input: { firstName: 'Sam', lastName: 'Reyes', email, shopId: String(shop.id) },
				},
			},
			asUser(admin),
		);
		const { inviteLink } = created.body.singleResult.data.createStaffAccount;

		await server.executeOperation(
			{
				query: SET_PASSWORD,
				variables: { token: inviteLink.split('/set-password/')[1], newPassword },
			},
			publicContext(),
		);

		const loggedIn = await server.executeOperation(
			{ query: LOGIN, variables: { email, password: newPassword } },
			publicContext(),
		);

		expect(loggedIn.body.singleResult.errors).toBeUndefined();
		expect(loggedIn.body.singleResult.data.login.email).toBe(email);
	});

	it('still refuses the account before the invite is redeemed', async () => {
		// The other half of the seam: the account exists and has SOME password from the moment it
		// is created (a random one nobody knows), so "can log in" must remain false until the
		// token is actually used. Guessing the address is not enough.
		const { user: admin, shop } = await createShopAdminUser();
		const server = createTestServer();
		const email = 'not.yet.redeemed@example.com';

		await server.executeOperation(
			{
				query: CREATE_ARTIST,
				variables: {
					input: { firstName: 'Jonas', lastName: 'Ek', email, shopId: String(shop.id) },
				},
			},
			asUser(admin),
		);

		for (const guess of ['inkbooks123', 'password', 'changeme', email]) {
			const attempt = await server.executeOperation(
				{ query: LOGIN, variables: { email, password: guess } },
				publicContext(),
			);
			expect(attempt.body.singleResult.errors).toBeDefined();
			expect(attempt.body.singleResult.data).toBeNull();
		}
	});
});
