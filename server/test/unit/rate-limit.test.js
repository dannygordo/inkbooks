// describe/it/expect/vi/beforeEach/afterEach come from Vitest's `globals: true` config - see the
// comment in test/unit/square.test.js for why there's no `require('vitest')` here.
const { checkRateLimit, getClientIp } = require('../../utils/rate-limit');

describe('checkRateLimit', () => {
	it('allows requests up to the limit', () => {
		const key = `test-key-${Date.now()}-a`;
		for (let i = 0; i < 5; i++) {
			expect(checkRateLimit(key, { windowMs: 60000, max: 5 }).allowed).toBe(true);
		}
	});

	it('blocks the request that exceeds the limit, with a retryAfterSeconds', () => {
		const key = `test-key-${Date.now()}-b`;
		for (let i = 0; i < 5; i++) {
			checkRateLimit(key, { windowMs: 60000, max: 5 });
		}
		const result = checkRateLimit(key, { windowMs: 60000, max: 5 });
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
		expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
	});

	it('tracks separate keys independently', () => {
		const keyA = `test-key-${Date.now()}-c`;
		const keyB = `test-key-${Date.now()}-d`;
		for (let i = 0; i < 5; i++) {
			checkRateLimit(keyA, { windowMs: 60000, max: 5 });
		}
		// keyA is now exhausted, but keyB has never been touched - it must not be affected.
		expect(checkRateLimit(keyB, { windowMs: 60000, max: 5 }).allowed).toBe(true);
	});

	it('resets the count once the window has elapsed', () => {
		vi.useFakeTimers();
		try {
			const key = `test-key-${Date.now()}-e`;
			for (let i = 0; i < 5; i++) {
				checkRateLimit(key, { windowMs: 1000, max: 5 });
			}
			expect(checkRateLimit(key, { windowMs: 1000, max: 5 }).allowed).toBe(false);

			vi.advanceTimersByTime(1001);

			expect(checkRateLimit(key, { windowMs: 1000, max: 5 }).allowed).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('getClientIp', () => {
	it('prefers req.ip when present (requires app.set("trust proxy", 1) upstream)', () => {
		expect(getClientIp({ ip: '203.0.113.5' })).toBe('203.0.113.5');
	});

	it('falls back to req.connection.remoteAddress if req.ip is missing', () => {
		expect(getClientIp({ connection: { remoteAddress: '198.51.100.7' } })).toBe('198.51.100.7');
	});

	it('returns "unknown" rather than throwing when neither is available', () => {
		expect(getClientIp({})).toBe('unknown');
		expect(getClientIp(undefined)).toBe('unknown');
	});
});
