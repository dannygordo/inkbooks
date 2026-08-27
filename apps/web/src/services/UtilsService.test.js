// Regression tests for formatPhone - found to crash via manual testing against seeded local data.
// Every IBCard*Details component (Artist/Client/Staff/Shop) calls this unconditionally, and phone
// is optional everywhere it comes from (Mongoose defaults it to "" - nothing requires a caller to
// have one on file). See the fix itself in UtilsService.js for the full explanation.
import { describe, it, expect } from "vitest";
import UtilsService from "./UtilsService";

describe("UtilsService.formatPhone", () => {
	it("returns an empty string for an empty phone number, rather than throwing", () => {
		expect(() => UtilsService.formatPhone("")).not.toThrow();
		expect(UtilsService.formatPhone("")).toBe("");
	});

	it("returns an empty string for a null/undefined phone number, rather than throwing", () => {
		expect(UtilsService.formatPhone(null)).toBe("");
		expect(UtilsService.formatPhone(undefined)).toBe("");
	});

	it("formats a real 10-digit US number", () => {
		expect(UtilsService.formatPhone("5551234567")).toBe("(555) 123-4567");
	});

	it("falls back to the raw value instead of throwing on an unparseable number", () => {
		expect(() => UtilsService.formatPhone("not-a-number")).not.toThrow();
		expect(UtilsService.formatPhone("not-a-number")).toBe("not-a-number");
	});
});

/**
 * showAvailableColorTags returned the SAME COLOUR TWICE whenever a tag was both the caller's own
 * and unclaimed by anyone else - two separate `if`s rather than a branch, so it was unshifted onto
 * the front and then pushed onto the back. React reported it as "Encountered two children with the
 * same key, #c69818" on the settings page, and whether it happened at all depended on whether the
 * caller's own colour came back in usedTags, which made it look intermittent.
 *
 * These pin the shape rather than just the absence of the duplicate: their own colour first, every
 * unclaimed one after, nothing claimed by somebody else.
 */
describe("UtilsService.showAvailableColorTags", () => {
	const PALETTE = [
		{ value: "#aaa", label: "A" },
		{ value: "#bbb", label: "B" },
		{ value: "#ccc", label: "C" },
	];

	it("never returns the same colour twice", () => {
		const result = UtilsService.showAvailableColorTags(PALETTE, [], "#aaa");
		const values = result.map((t) => t.value);

		expect(new Set(values).size).toBe(values.length);
	});

	it("puts the caller's own colour first", () => {
		const result = UtilsService.showAvailableColorTags(PALETTE, [], "#ccc");

		expect(result[0].value).toBe("#ccc");
	});

	// The caller's own colour has to survive even though it IS taken - by them. Without it the
	// picker cannot show which swatch is currently selected.
	it("keeps their own colour even when it is in the taken list", () => {
		const result = UtilsService.showAvailableColorTags(
			PALETTE,
			[{ tagColor: "#aaa" }],
			"#aaa",
		);

		expect(result.map((t) => t.value)).toContain("#aaa");
		expect(result[0].value).toBe("#aaa");
	});

	it("drops colours claimed by somebody else", () => {
		const result = UtilsService.showAvailableColorTags(
			PALETTE,
			[{ tagColor: "#bbb" }],
			"#aaa",
		);

		expect(result.map((t) => t.value)).toEqual(["#aaa", "#ccc"]);
	});

	// An artist with no shop skips the query entirely, so usedTags arrives empty or undefined.
	it("handles an absent taken list rather than throwing", () => {
		expect(() => UtilsService.showAvailableColorTags(PALETTE, undefined, "#aaa")).not.toThrow();
		expect(UtilsService.showAvailableColorTags(PALETTE, undefined, "#aaa")).toHaveLength(3);
	});

	// Nobody has chosen one yet - every colour is on offer and none is marked current.
	it("returns everything unclaimed when the caller has no colour", () => {
		const result = UtilsService.showAvailableColorTags(PALETTE, [{ tagColor: "#bbb" }], null);

		expect(result.map((t) => t.value)).toEqual(["#aaa", "#ccc"]);
	});
});
