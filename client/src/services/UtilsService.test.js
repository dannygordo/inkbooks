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
