// Integration tests for the password-token flow (utils/password-tokens.js,
// mutations/passwords.js, resolvers/passwords.js).
//
// This replaces a mutation that reset any account given only a username - no email, no token, no
// proof of ownership - which was a zero-credential takeover of every user in the system. It was
// deleted rather than patched, and this is the rebuild. Given that history, the properties below
// are the point of the feature rather than incidental details of it:
//
//   - the raw token is never stored, so a dump of the collection is worth nothing
//   - a token works exactly once, and stops working when it expires
//   - the request endpoint says the same thing whether or not an account exists, so it can't be
//     used to check who a shop's clients are
//
// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/integration/appointments.test.js for why there's no `require('vitest')` here.
const bcrypt = require('bcryptjs');
const { createTestServer } = require('../helpers/testServer');
const { createUser } = require('../helpers/factories');
const User = require('../../models/User');
const PasswordToken = require('../../models/PasswordToken');
const {
	issuePasswordToken,
	consumePasswordToken,
	hashToken,
} = require('../../utils/password-tokens');

const REQUEST_RESET = `
	mutation RequestPasswordReset($email: String!) {
		requestPasswordReset(email: $email)
	}
`;

const SET_PASSWORD = `
	mutation SetPasswordWithToken($token: String!, $newPassword: String!) {
		setPasswordWithToken(token: $token, newPassword: $newPassword)
	}
`;

const INSPECT = `
	query InspectPasswordToken($token: String!) {
		inspectPasswordToken(token: $token) {
			valid
			purpose
			firstName
		}
	}
`;

// These mutations are public, so there's no token to sign. Each call gets a UNIQUE ip, which
// matters more than it looks: requestPasswordReset is rate-limited to five per IP per fifteen
// minutes, the limiter's state is a module-level map that persists for the whole test process,
// and getClientIp returns the literal string 'unknown' when req.ip is absent. Sharing that one
// bucket would put every test in this file - and any other file exercising these mutations -
// into the same five-request allowance, so the suite would start failing on request count rather
// than on behaviour, in an order-dependent way that looks like a flake.
let ipCounter = 0;
const publicContext = () => ({
	contextValue: { req: { headers: {}, ip: `10.0.0.${(ipCounter += 1)}` } },
});

describe('password tokens: storage', () => {
	it('never stores the raw token, only its hash', async () => {
		const user = await createUser();
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'invite' });

		// The property that makes a leaked backup worthless. If the raw value were stored,
		// anyone with read access to this collection could set any user's password.
		const stored = await PasswordToken.findOne({ userId: user.id });
		expect(stored.tokenHash).toBe(hashToken(rawToken));
		expect(stored.tokenHash).not.toBe(rawToken);
		expect(JSON.stringify(stored.toObject())).not.toContain(rawToken);
	});

	it('invalidates a previous unused token for the same purpose', async () => {
		// Otherwise every "resend invite" leaves another live credential in circulation, and a
		// user who clicked reset five times has five working links they've forgotten about.
		const user = await createUser();
		const first = await issuePasswordToken({ userId: user.id, purpose: 'reset' });
		const second = await issuePasswordToken({ userId: user.id, purpose: 'reset' });

		const remaining = await PasswordToken.find({ userId: user.id, purpose: 'reset' });
		expect(remaining).toHaveLength(1);
		expect(remaining[0].tokenHash).toBe(hashToken(second.rawToken));

		const firstResult = await consumePasswordToken({
			rawToken: first.rawToken,
			newPassword: 'brandnewpassword',
		});
		expect(firstResult.ok).toBe(false);
	});
});

describe('password tokens: redemption', () => {
	it('sets the password and marks the account as claimed', async () => {
		const user = await createUser({ hasSetPassword: false });
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'invite' });

		const result = await consumePasswordToken({
			rawToken,
			newPassword: 'a-real-password',
		});
		expect(result.ok).toBe(true);

		const stored = await User.findById(user.id);
		expect(await bcrypt.compare('a-real-password', stored.password)).toBe(true);
		// hasSetPassword is also what kills any guest magic-link on the account (see
		// utils/guest-auth.js) - a link that bypasses password auth is only acceptable while
		// there's no password to bypass.
		expect(stored.hasSetPassword).toBe(true);
	});

	it('works exactly once', async () => {
		const user = await createUser();
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'reset' });

		expect((await consumePasswordToken({ rawToken, newPassword: 'first-password' })).ok).toBe(true);
		expect((await consumePasswordToken({ rawToken, newPassword: 'second-password' })).ok).toBe(false);

		// And the first password is still the one that stands.
		const stored = await User.findById(user.id);
		expect(await bcrypt.compare('first-password', stored.password)).toBe(true);
		expect(await bcrypt.compare('second-password', stored.password)).toBe(false);
	});

	it('lets only one of two concurrent redemptions win', async () => {
		// The reason the claim is an atomic findOneAndUpdate rather than a read-check-write.
		const user = await createUser();
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'reset' });

		const results = await Promise.all([
			consumePasswordToken({ rawToken, newPassword: 'password-one' }),
			consumePasswordToken({ rawToken, newPassword: 'password-two' }),
		]);

		expect(results.filter((r) => r.ok)).toHaveLength(1);
	});

	it('refuses an expired token', async () => {
		const user = await createUser();
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'reset' });
		// Backdated rather than waiting an hour. Expiry is checked explicitly in the query rather
		// than left to Mongo's TTL sweep, which only runs about once a minute - an
		// expired-but-not-yet-swept token must not be redeemable in that window.
		await PasswordToken.updateOne(
			{ userId: user.id },
			{ $set: { expiresAt: new Date(Date.now() - 1000) } },
		);

		expect((await consumePasswordToken({ rawToken, newPassword: 'too-late' })).ok).toBe(false);
	});

	it('refuses a fabricated token', async () => {
		expect(
			(await consumePasswordToken({ rawToken: 'not-a-real-token', newPassword: 'whatever12' })).ok,
		).toBe(false);
	});
});

describe('requestPasswordReset: no account enumeration', () => {
	it('returns the same response for a known and an unknown address', async () => {
		const user = await createUser();
		const server = createTestServer();

		const known = await server.executeOperation(
			{ query: REQUEST_RESET, variables: { email: user.email } },
			publicContext(),
		);
		const unknown = await server.executeOperation(
			{ query: REQUEST_RESET, variables: { email: 'nobody@example.com' } },
			publicContext(),
		);

		// Identical in both cases. Anything else makes this an oracle for "does this person have
		// an account here", which for a shop's client list is a real question about real people.
		expect(known.body.singleResult.errors).toBeUndefined();
		expect(unknown.body.singleResult.errors).toBeUndefined();
		expect(known.body.singleResult.data.requestPasswordReset).toBe(true);
		expect(unknown.body.singleResult.data.requestPasswordReset).toBe(true);
	});

	it('issues a token only for the address that actually exists', async () => {
		// The responses match; the side effects must not.
		const user = await createUser();
		const server = createTestServer();

		await server.executeOperation(
			{ query: REQUEST_RESET, variables: { email: 'nobody@example.com' } },
			publicContext(),
		);
		expect(await PasswordToken.countDocuments({})).toBe(0);

		await server.executeOperation(
			{ query: REQUEST_RESET, variables: { email: user.email } },
			publicContext(),
		);
		expect(await PasswordToken.countDocuments({ userId: user._id })).toBe(1);
	});

	it('matches the address case-insensitively', async () => {
		// People type their email with whatever capitalisation their phone chose, and a silent
		// no-op because of a capital letter is indistinguishable from a real failure.
		const user = await createUser({ email: 'Artist.Person@Example.com' });
		const server = createTestServer();

		await server.executeOperation(
			{ query: REQUEST_RESET, variables: { email: '  artist.person@example.com  ' } },
			publicContext(),
		);

		expect(await PasswordToken.countDocuments({ userId: user._id })).toBe(1);
	});
});

describe('setPasswordWithToken / inspectPasswordToken', () => {
	it('sets a password through the mutation', async () => {
		const user = await createUser({ hasSetPassword: false });
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'invite' });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: SET_PASSWORD, variables: { token: rawToken, newPassword: 'chosen-password' } },
			publicContext(),
		);

		expect(res.body.singleResult.errors).toBeUndefined();
		expect(res.body.singleResult.data.setPasswordWithToken).toBe(true);
		const stored = await User.findById(user.id);
		expect(await bcrypt.compare('chosen-password', stored.password)).toBe(true);
	});

	it('rejects a password under eight characters', async () => {
		const user = await createUser();
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'reset' });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: SET_PASSWORD, variables: { token: rawToken, newPassword: 'short' } },
			publicContext(),
		);

		// setPasswordWithToken returns Boolean! - non-null - so a thrown error nulls the whole
		// `data`, not just the field. See the note in accounts.test.js.
		expect(res.body.singleResult.data).toBeNull();
		expect(res.body.singleResult.errors).toBeDefined();
		// And the token is still unspent, so the person can try again with a longer one rather
		// than having burned their only link on a typo.
		const stored = await PasswordToken.findOne({ userId: user._id });
		expect(stored.usedAt).toBeFalsy();
	});

	it('reports a usable token without revealing anything identifying', async () => {
		const user = await createUser({ firstName: 'Maya' });
		const { rawToken } = await issuePasswordToken({ userId: user.id, purpose: 'invite' });
		const server = createTestServer();

		const res = await server.executeOperation(
			{ query: INSPECT, variables: { token: rawToken } },
			publicContext(),
		);
		const status = res.body.singleResult.data.inspectPasswordToken;

		expect(status.valid).toBe(true);
		expect(status.purpose).toBe('invite');
		// A first name to confirm "yes, this is your link" - and nothing else. A guessed token
		// must not become a way to read an email address off an account.
		expect(status.firstName).toBe('Maya');
		expect(JSON.stringify(status)).not.toContain(user.email);
	});

	it('reports an invalid token as invalid and says nothing else', async () => {
		const server = createTestServer();
		const res = await server.executeOperation(
			{ query: INSPECT, variables: { token: 'made-up' } },
			publicContext(),
		);
		const status = res.body.singleResult.data.inspectPasswordToken;

		expect(status.valid).toBe(false);
		expect(status.purpose).toBeNull();
		expect(status.firstName).toBeNull();
	});
});
