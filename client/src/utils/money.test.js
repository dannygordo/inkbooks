// Unit tests for utils/money.js - the client-side counterpart to server/utils/money.js. The rule
// this module exists to enforce (see its own header comment): cents are for storage/arithmetic,
// dollars are for display and for a dollar-denominated <input> only.
import { describe, it, expect } from "vitest";
import { formatCents, centsToDollars, dollarsToCents } from "./money";

describe("formatCents", () => {
	it("shows exact cents rather than rounding to whole dollars", () => {
		// The specific case the module's header comment calls out: $89.50 must not round to $90.
		expect(formatCents(8950)).toBe("$89.50");
	});

	it("formats a round dollar amount with .00", () => {
		expect(formatCents(123450)).toBe("$1,234.50");
		expect(formatCents(1000)).toBe("$10.00");
	});

	it("adds thousands separators", () => {
		expect(formatCents(100000000)).toBe("$1,000,000.00");
	});

	it("treats null/undefined/0 cents as $0.00 rather than throwing", () => {
		expect(formatCents(0)).toBe("$0.00");
		expect(formatCents(null)).toBe("$0.00");
		expect(formatCents(undefined)).toBe("$0.00");
	});

	it("formats a sub-dollar amount", () => {
		expect(formatCents(5)).toBe("$0.05");
	});

	// SURPRISING: the dollar sign is prepended to the whole formatted string, including the sign,
	// so a negative amount reads "$-5.00" rather than the conventional "-$5.00". Nothing in this
	// codebase currently formats a negative cents value on screen, but this is exactly the shape a
	// refund or a chargeback would take if one reached this formatter, so it's worth pinning down
	// now rather than discovering it on a real payout screen.
	it("puts the dollar sign before the minus sign for a negative amount", () => {
		expect(formatCents(-500)).toBe("$-5.00");
	});
});

describe("centsToDollars", () => {
	it("converts cents to a plain dollar number", () => {
		expect(centsToDollars(1050)).toBe(10.5);
		expect(centsToDollars(8950)).toBe(89.5);
	});

	it("treats null/undefined/0 as 0", () => {
		expect(centsToDollars(0)).toBe(0);
		expect(centsToDollars(null)).toBe(0);
		expect(centsToDollars(undefined)).toBe(0);
	});

	it("handles negative cents", () => {
		expect(centsToDollars(-250)).toBe(-2.5);
	});
});

describe("dollarsToCents", () => {
	it("rounds rather than truncates - the exact case named in the source comment", () => {
		expect(dollarsToCents(19.999)).toBe(2000);
	});

	it("parses a string straight off a number input", () => {
		expect(dollarsToCents("19.99")).toBe(1999);
		expect(dollarsToCents("10")).toBe(1000);
	});

	it("treats 0 as a real value, not as 'missing'", () => {
		// value === null/undefined is checked explicitly rather than a falsy check, so a genuine
		// zero dollar amount isn't swallowed the way `!value` would swallow it.
		expect(dollarsToCents(0)).toBe(0);
		expect(dollarsToCents("0")).toBe(0);
	});

	it("returns 0 for null, undefined, an empty string, or unparseable text - never NaN or a throw", () => {
		expect(dollarsToCents(null)).toBe(0);
		expect(dollarsToCents(undefined)).toBe(0);
		expect(dollarsToCents("")).toBe(0);
		expect(dollarsToCents("not-a-number")).toBe(0);
	});

	// SURPRISING (found while writing these tests): parseFloat can't parse a leading currency
	// symbol, so a value that already looks like formatted money - the exact shape formatCents()
	// above produces - silently becomes 0 instead of extracting the numeric part or throwing
	// somewhere loud. This function is documented as expecting "a string straight off an
	// <input type=number>", so a $-prefixed string is out of contract, but the failure mode is
	// worth knowing: it looks like "the user typed $19.99 and the amount got wiped to zero",
	// not like an error.
	it("silently returns 0 for a currency-formatted string rather than extracting the number", () => {
		expect(dollarsToCents("$19.99")).toBe(0);
	});

	// SURPRISING (floating point): 0.145 * 100 is 14.499999999999998 in IEEE 754 double
	// arithmetic, not 14.5 - so Math.round takes it DOWN to 14 cents, not up to 15, for an amount
	// that looks like it should round up under ordinary "round half up" rules. This isn't a bug
	// specific to this function so much as a property of any cents-from-dollars rounding done in
	// plain JS floating point, but it means a $0.145 entry (unlikely from a real <input step="0.01">,
	// but reachable from arbitrary string input) doesn't round the way a human would expect.
	it("can round a half-cent value down instead of up, due to float imprecision", () => {
		expect(dollarsToCents(0.145)).toBe(14);
	});

	it("handles a negative dollar amount", () => {
		expect(dollarsToCents(-5)).toBe(-500);
	});
});
