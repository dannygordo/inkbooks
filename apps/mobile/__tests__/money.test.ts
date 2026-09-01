import { centsToDollars, dollarsToCents, formatCents } from '@/utils/money';

describe('formatCents', () => {
	it('formats a whole-dollar amount with two decimal places', () => {
		expect(formatCents(10000)).toBe('$100.00');
	});

	it('formats cents that are not a whole dollar', () => {
		expect(formatCents(8950)).toBe('$89.50');
	});

	it('treats null/undefined as zero', () => {
		expect(formatCents(null)).toBe('$0.00');
		expect(formatCents(undefined)).toBe('$0.00');
	});
});

describe('centsToDollars', () => {
	it('converts cents to a dollar float', () => {
		expect(centsToDollars(8950)).toBe(89.5);
	});

	it('treats null/undefined as zero', () => {
		expect(centsToDollars(null)).toBe(0);
	});
});

describe('dollarsToCents', () => {
	it('converts a dollar string to integer cents', () => {
		expect(dollarsToCents('89.50')).toBe(8950);
	});

	it('converts a dollar number to integer cents', () => {
		expect(dollarsToCents(89.5)).toBe(8950);
	});

	it('rounds to the nearest cent', () => {
		expect(dollarsToCents('89.505')).toBe(8951);
	});

	it('treats an emptied input as zero rather than NaN - never sails a NaN into a mutation', () => {
		expect(dollarsToCents('')).toBe(0);
	});

	it('treats an unparseable string as zero', () => {
		expect(dollarsToCents('abc')).toBe(0);
	});

	it('treats null/undefined as zero', () => {
		expect(dollarsToCents(null)).toBe(0);
		expect(dollarsToCents(undefined)).toBe(0);
	});
});
