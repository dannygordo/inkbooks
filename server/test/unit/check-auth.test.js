// check-auth.js tests. guardTokenPayload already has its own dedicated file (tokenGuard.test.js)
// and checkAuth's own throwing branches (no header, malformed token, expired token, wrong secret,
// missing "Bearer " prefix) are already exercised thoroughly at the integration level - see
// test/integration/auth.test.js's "withAuth: unauthenticated / malformed / expired tokens" describe
// block, which runs every one of those through a real GraphQL call.
//
// What had NO coverage anywhere in the suite, at either level, is tryCheckAuth - the non-throwing
// sibling checkAuth.js exports for resolvers that are deliberately public but still want to know
// "is there happens to be a logged-in caller" (see its own comment: createBookingRequest's per-IP
// rate limit is sized for anonymous scripted abuse and would otherwise also throttle a shop's own
// front desk submitting walk-ins all day from one IP). A single dropped `return null` here would
// make every one of those resolvers throw for anonymous callers instead of degrading gracefully,
// and nothing would have said so.
const jwt = require('jsonwebtoken');

if (!process.env.SECRET_KEY) {
	// Same fallback square-oauth-state.test.js uses - lets this file run standalone (outside the
	// full suite's globalSetup.js) without crashing on an unset SECRET_KEY.
	process.env.SECRET_KEY = 'test-secret-key-do-not-use-in-production';
}

const checkAuth = require('../../utils/check-auth');
const { tryCheckAuth } = checkAuth;

function contextWithHeader(authorization) {
	return { req: { headers: authorization !== undefined ? { authorization } : {} } };
}

function signToken(payload, opts = {}) {
	return jwt.sign(payload, process.env.SECRET_KEY, { algorithm: 'HS256', ...opts });
}

describe('tryCheckAuth', () => {
	it('returns the decoded user for a valid token, same as checkAuth', () => {
		const token = signToken({ id: 'u1', email: 'a@b.com', role: 20 });

		const user = tryCheckAuth(contextWithHeader(`Bearer ${token}`));

		expect(user.id).toBe('u1');
		expect(user.role).toBe(20);
	});

	// THE case this function exists for: no caller at all, and that must be a quiet null, not an
	// exception a public resolver would have to wrap in its own try/catch.
	it('returns null (does not throw) when there is no authorization header', () => {
		expect(() => {
			const result = tryCheckAuth(contextWithHeader(undefined));
			expect(result).toBeNull();
		}).not.toThrow();
	});

	it('returns null for a garbage/malformed token instead of throwing', () => {
		expect(tryCheckAuth(contextWithHeader('Bearer not-a-real-jwt'))).toBeNull();
	});

	it('returns null for an expired token instead of throwing', () => {
		const expired = signToken({ id: 'u1', email: 'a@b.com', role: 20 }, { expiresIn: '-1s' });

		expect(tryCheckAuth(contextWithHeader(`Bearer ${expired}`))).toBeNull();
	});

	it('returns null for a token signed with the wrong secret instead of throwing', () => {
		const wrongSecret = jwt.sign({ id: 'u1' }, 'not-the-real-secret', { algorithm: 'HS256' });

		expect(tryCheckAuth(contextWithHeader(`Bearer ${wrongSecret}`))).toBeNull();
	});

	it('returns null when the header is missing the Bearer prefix, instead of throwing', () => {
		const token = signToken({ id: 'u1' });

		expect(tryCheckAuth(contextWithHeader(token))).toBeNull();
	});

	// tryCheckAuth's whole value is swallowing checkAuth's own throw - if checkAuth ever stopped
	// throwing and started returning something falsy-but-not-null instead, this would still catch
	// a regression that made tryCheckAuth throw again.
	it('never throws for any input checkAuth itself would reject', () => {
		const badInputs = [undefined, '', 'Bearer ', 'Bearer bad.token.here'];
		for (const authorization of badInputs) {
			expect(() => tryCheckAuth(contextWithHeader(authorization))).not.toThrow();
		}
	});
});
