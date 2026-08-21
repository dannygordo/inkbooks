// Unit tests for utils/bookingSlug.js.
//
// This module is deliberately a display convenience, not a validator (see its own header
// comment) - the server has the real regex, length bounds and reserved-word list. What's worth
// pinning down here is exactly what it claims to mirror: the accent-stripping behaviour and the
// length floor from suggestSlugOrBlank, both called out by name in the source comments as having
// been found by testing the server helper rather than by reading it.
import { describe, it, expect } from "vitest";
import { suggestSlug, suggestSlugOrBlank, bookingUrl, formUrl } from "./bookingSlug";

describe("suggestSlug", () => {
	it("lower-cases and hyphenates a normal name", () => {
		expect(suggestSlug("John", "Doe")).toBe("john-doe");
	});

	it("strips combining accents rather than dropping the letter", () => {
		// The case named directly in the source comment: "Renée" should suggest "renee", not "rene"
		// or "rene" with the letter silently gone.
		expect(suggestSlug("Renée", "")).toBe("renee");
	});

	// Named in the suggestSlugOrBlank comment as the case that reduces "X Æ" to "x" - the ligature
	// doesn't decompose under NFD the way an accented letter does, so it's discarded entirely by
	// the [^a-z0-9]+ collapse rather than transliterated to "ae".
	it("discards a non-decomposing character like Æ rather than transliterating it", () => {
		expect(suggestSlug("X", "Æ")).toBe("x");
	});

	it("strips punctuation such as apostrophes and hyphens in the source name", () => {
		expect(suggestSlug("O'Brien", "Jean-Paul")).toBe("o-brien-jean-paul");
	});

	it("returns an empty string for two empty names", () => {
		expect(suggestSlug("", "")).toBe("");
	});

	it("defaults both names to empty when called with no arguments", () => {
		expect(suggestSlug()).toBe("");
	});

	it("truncates to 40 characters", () => {
		const result = suggestSlug("A".repeat(50), "");
		expect(result).toHaveLength(40);
		expect(result).toBe("a".repeat(40));
	});

	// The final .replace(/-+$/, "") only matters when the 40-char cut lands exactly on a hyphen -
	// without it the slug would end in a dangling dash. 39 a's + " Zz" hyphenates to 39 a's + "-zz",
	// and slicing to 40 chars stops right after that hyphen.
	it("does not leave a dangling hyphen when the 40-char cut lands on one", () => {
		const result = suggestSlug("A".repeat(39), "Zz");
		expect(result).toBe("a".repeat(39));
		expect(result.endsWith("-")).toBe(false);
	});

	it("collapses internal whitespace/punctuation runs to a single hyphen", () => {
		expect(suggestSlug("Mary   Jane", "O'Neil-Smith")).toBe("mary-jane-o-neil-smith");
	});
});

describe("suggestSlugOrBlank", () => {
	it("returns the suggestion when it meets the 3-character floor", () => {
		expect(suggestSlugOrBlank("Bob", "")).toBe("bob");
	});

	it("returns an empty string when the suggestion is too short to be useful", () => {
		expect(suggestSlugOrBlank("Al", "")).toBe("");
	});

	// The exact case named in the source comment.
	it("returns an empty string for the X-Æ case (reduces to a 1-character 'x')", () => {
		expect(suggestSlugOrBlank("X", "Æ")).toBe("");
	});

	it("returns an empty string for two empty names", () => {
		expect(suggestSlugOrBlank("", "")).toBe("");
	});

	it("accepts a suggestion exactly at the floor", () => {
		// suggestSlug("Amy","") -> "amy", exactly 3 characters.
		expect(suggestSlugOrBlank("Amy", "")).toBe("amy");
	});
});

describe("bookingUrl", () => {
	it("joins the current origin, /book/, and the slug", () => {
		expect(bookingUrl("jane-doe")).toBe(`${window.location.origin}/book/jane-doe`);
	});

	it("still produces a URL for a missing slug rather than throwing", () => {
		expect(bookingUrl("")).toBe(`${window.location.origin}/book/`);
		expect(bookingUrl(undefined)).toBe(`${window.location.origin}/book/`);
	});
});

describe("formUrl", () => {
	it("joins the current origin, the form slug and the owner handle", () => {
		expect(formUrl("intake-form", "jane-doe")).toBe(
			`${window.location.origin}/intake-form/jane-doe`,
		);
	});

	// Both pieces default to "" rather than the call throwing, but the result is a URL with two
	// bare slashes in it (".../<origin>//") - not an error, just a URL nobody would actually hand
	// out. Worth pinning down as the actual (slightly odd) behaviour rather than assuming it's
	// been guarded against.
	it("produces a double-slash URL for missing formSlug/ownerHandle instead of throwing", () => {
		expect(() => formUrl(undefined, undefined)).not.toThrow();
		expect(formUrl(undefined, undefined)).toBe(`${window.location.origin}//`);
	});
});
