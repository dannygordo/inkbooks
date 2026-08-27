// Unit tests for the tag-colour helpers (utils/tagColor.js).
//
// These are worth testing directly rather than through a component because the failure they guard
// against is silent. A malformed hex produces "rgba(NaN, NaN, NaN, 0.14)", which browsers drop
// without complaint - the row simply renders untinted and nothing anywhere says why. There's no
// error, no console warning, and no visual cue distinguishing it from an artist who legitimately
// has no colour.
import { describe, it, expect } from "vitest";
import { resolveTagColor, tagColorRowStyle, FALLBACK_TAG_COLOR } from "./tagColor";

describe("resolveTagColor", () => {
	it("passes a real colour through untouched", () => {
		expect(resolveTagColor("#c69818")).toBe("#c69818");
	});

	// The case that caused the original bug: every calendar label is white text on the tag colour,
	// so a tagColor of white rendered as nothing at all. An `|| fallback` catches a missing value
	// but not this one.
	it.each(["#fff", "#ffffff", "#FFF", "#FFFFFF", "", null, undefined])(
		"treats %s as unset and falls back",
		(value) => {
			expect(resolveTagColor(value)).toBe(FALLBACK_TAG_COLOR);
		},
	);
});

describe("tagColorRowStyle", () => {
	it("builds a low-alpha tint and a full-strength left bar from the same colour", () => {
		expect(tagColorRowStyle("#c69818")).toEqual({
			backgroundColor: "rgba(198, 152, 24, 0.14)",
			borderLeft: "4px solid rgb(198, 152, 24)",
		});
	});

	it("deepens only the tint on hover, never the bar", () => {
		const rest = tagColorRowStyle("#c69818");
		const hovered = tagColorRowStyle("#c69818", true);
		expect(hovered.backgroundColor).toBe("rgba(198, 152, 24, 0.24)");
		expect(hovered.borderLeft).toBe(rest.borderLeft);
	});

	it("expands three-digit hex", () => {
		expect(tagColorRowStyle("#abc").borderLeft).toBe("4px solid rgb(170, 187, 204)");
	});

	it("routes an unset colour through the grey fallback rather than producing nothing", () => {
		// A row for an artist with no colour still gets a tint - just a neutral one - so it lines
		// up with its neighbours instead of being the one undecorated row in the list.
		expect(tagColorRowStyle("#ffffff").borderLeft).toBe("4px solid rgb(95, 99, 104)");
	});

	it("returns an empty style for an unparseable value instead of NaN channels", () => {
		// The whole point: no rgba(NaN, ...) reaching the DOM, where it would be silently dropped.
		expect(tagColorRowStyle("not-a-color")).toEqual({});
		expect(tagColorRowStyle(42)).toEqual({});
	});
});
