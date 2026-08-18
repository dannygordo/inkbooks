// describe/it/expect come from Vitest's `globals: true` config - see the comment in
// test/unit/square.test.js for why there's no `require('vitest')` here.
//
// WRITTEN BUT NOT YET RUN. This sandbox's globalSetup (test/globalSetup.js) spins up
// mongodb-memory-server for EVERY test file in this directory before a single test runs, unit or
// integration - there's one shared vitest.config.js, not a separate config for DB-free files. That
// download fails here (fastdl.mongodb.org returns 403 for this platform - the same caveat already
// on test/integration/expenses.test.js/clientFlags.test.js/appointments.test.js's new isPersonal
// tests), so `npx vitest run test/unit/money.test.js` fails at globalSetup before this file's own
// code ever executes, even though money.js itself has zero DB dependency and needs none of that
// setup. Written to the same structure and conventions as every other file in test/unit/; someone
// with real network access to fastdl.mongodb.org (or a local `mongod`) needs to be the first to
// actually run it. See HANDOFF.md's Known Gaps.
const { dollarsToCents, centsToDollars, percentOfCents, formatCents } = require('../../utils/money');

describe('dollarsToCents', () => {
	it('converts a plain number of dollars to cents', () => {
		expect(dollarsToCents(19.5)).toBe(1950);
	});

	it('parses a string input (the shape a form <input type="number"> actually gives back)', () => {
		expect(dollarsToCents('19.50')).toBe(1950);
	});

	it('rounds rather than truncates, so 19.999 becomes 2000, not 1999', () => {
		expect(dollarsToCents(19.999)).toBe(2000);
	});

	it('returns 0 for null, undefined, and NaN rather than throwing', () => {
		expect(dollarsToCents(null)).toBe(0);
		expect(dollarsToCents(undefined)).toBe(0);
		expect(dollarsToCents('not-a-number')).toBe(0);
	});

	it('handles a negative amount (a correction/refund) without special-casing', () => {
		expect(dollarsToCents(-5.25)).toBe(-525);
	});

	it('handles exactly zero', () => {
		expect(dollarsToCents(0)).toBe(0);
		expect(dollarsToCents('0')).toBe(0);
	});
});

describe('centsToDollars', () => {
	it('converts cents back to a Number of dollars, for display only', () => {
		expect(centsToDollars(1950)).toBe(19.5);
	});

	it('returns 0 for null/undefined/0 rather than NaN', () => {
		expect(centsToDollars(null)).toBe(0);
		expect(centsToDollars(undefined)).toBe(0);
		expect(centsToDollars(0)).toBe(0);
	});

	it('round-trips with dollarsToCents for a value that has an exact cent representation', () => {
		expect(centsToDollars(dollarsToCents(42.37))).toBe(42.37);
	});
});

describe('percentOfCents', () => {
	it('applies a percentage and rounds to the nearest cent', () => {
		// 333 * 15% = 49.95 -> rounds up to 50.
		expect(percentOfCents(333, 15)).toBe(50);
	});

	it('returns 0 when cents is falsy, even with a real percent', () => {
		expect(percentOfCents(0, 20)).toBe(0);
		expect(percentOfCents(null, 20)).toBe(0);
	});

	it('returns 0 when percent is falsy (including a genuine 0%), even with real cents', () => {
		expect(percentOfCents(10000, 0)).toBe(0);
		expect(percentOfCents(10000, null)).toBe(0);
	});

	it('rounds .5 up, matching Math.round, not banker\'s rounding', () => {
		// 100 * 12.5% = 12.5 -> Math.round(12.5) === 13.
		expect(percentOfCents(100, 12.5)).toBe(13);
	});

	it('handles a percentage over 100 (e.g. a markup, not just a cut) without clamping', () => {
		expect(percentOfCents(1000, 150)).toBe(1500);
	});
});

describe('formatCents', () => {
	it('formats a whole-dollar amount with two decimal places and a leading $', () => {
		expect(formatCents(2000)).toBe('$20.00');
	});

	it('formats an amount with cents correctly', () => {
		expect(formatCents(1999)).toBe('$19.99');
	});

	it('treats null/undefined as zero rather than throwing or printing "NaN"', () => {
		expect(formatCents(null)).toBe('$0.00');
		expect(formatCents(undefined)).toBe('$0.00');
	});

	// Documents the actual (slightly odd) output rather than assuming it - the $ sign lands
	// before the minus, since the template literal is `$${...}` and toFixed(2) on a negative
	// number already includes its own leading "-". A caller displaying a refund/correction should
	// know this reads as "$-5.00", not "-$5.00", if it ever matters cosmetically.
	it('puts the $ before the minus sign for a negative amount', () => {
		expect(formatCents(-500)).toBe('$-5.00');
	});
});
