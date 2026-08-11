// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
//
// Only the pure predicate lives here. resolveSquareAccountFor / findAccountForOwner /
// getOrCreateAccountForOwner all hit Mongo and are covered in
// test/integration/squareAccounts.test.js instead.
const SquareAccount = require('../../models/SquareAccount');

/**
 * `connected` is not the same fact as "we hold credentials we can use", and every caller that
 * treats the boolean as sufficient throws somewhere less obvious - inside getValidAccessToken,
 * with a message the shop admin cannot act on. A row with connected: true and no token is exactly
 * what a half-failed OAuth callback leaves behind.
 */
describe('SquareAccount.isUsable', () => {
	const usable = {
		connected: true,
		accessTokenEncrypted: 'encrypted:something',
	};

	it('accepts a connected account holding a token', () => {
		expect(SquareAccount.isUsable(usable)).toBe(true);
	});

	it('rejects the half-failed callback state: connected, no token', () => {
		expect(SquareAccount.isUsable({ connected: true })).toBe(false);
		expect(SquareAccount.isUsable({ connected: true, accessTokenEncrypted: '' })).toBe(false);
	});

	// What disconnectShopSquare leaves behind. The row survives so a reconnect has somewhere to
	// write; it must not read as usable in the meantime.
	it('rejects a disconnected account even if a token somehow remains', () => {
		expect(
			SquareAccount.isUsable({ connected: false, accessTokenEncrypted: 'encrypted:stale' }),
		).toBe(false);
	});

	// An owner who never connected has no row at all, and findAccountForOwner returns null for
	// them rather than throwing - so null reaching here is the normal path, not an error.
	it('rejects null and undefined rather than throwing on them', () => {
		expect(SquareAccount.isUsable(null)).toBe(false);
		expect(SquareAccount.isUsable(undefined)).toBe(false);
	});

	it('returns a boolean, never a truthy string', () => {
		expect(SquareAccount.isUsable(usable)).toBe(true);
		expect(typeof SquareAccount.isUsable({ connected: true, accessTokenEncrypted: 'x' })).toBe(
			'boolean',
		);
	});
});
