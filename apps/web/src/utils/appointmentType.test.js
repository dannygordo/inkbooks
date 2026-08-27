// Unit tests for utils/appointmentType.js - the shared consult/session chip styling and labels.
import { describe, it, expect } from "vitest";
import {
	APPOINTMENT_TYPE_STYLES,
	appointmentTypeStyle,
	appointmentTypeLabel,
} from "./appointmentType";

describe("appointmentTypeStyle", () => {
	it("returns the consult styling", () => {
		expect(appointmentTypeStyle("consult")).toBe(APPOINTMENT_TYPE_STYLES.consult);
	});

	it("returns the session styling", () => {
		expect(appointmentTypeStyle("session")).toBe(APPOINTMENT_TYPE_STYLES.session);
	});

	// The whole reason FALLBACK exists: an unrecognised type should render as a neutral grey chip,
	// not crash and not silently borrow a known type's colour.
	it("falls back to a neutral grey for an unrecognised type", () => {
		expect(appointmentTypeStyle("other")).toEqual({
			background: "#eeeeee",
			text: "#555555",
			border: "#dddddd",
		});
	});

	it.each([undefined, null, "", "SESSION", "Consult"])(
		"falls back to the neutral grey for %s (case-sensitive, exact-match lookup)",
		(value) => {
			expect(appointmentTypeStyle(value)).toEqual({
				background: "#eeeeee",
				text: "#555555",
				border: "#dddddd",
			});
		},
	);
});

describe("appointmentTypeLabel", () => {
	it("labels a known type", () => {
		expect(appointmentTypeLabel("consult")).toBe("Consult");
		expect(appointmentTypeLabel("session")).toBe("Session");
	});

	it("title-cases an unrecognised type rather than showing an empty chip", () => {
		expect(appointmentTypeLabel("other")).toBe("Other");
		expect(appointmentTypeLabel("weird_type")).toBe("Weird_type");
	});

	it("returns an empty string for a falsy type instead of throwing", () => {
		expect(appointmentTypeLabel(null)).toBe("");
		expect(appointmentTypeLabel(undefined)).toBe("");
		expect(appointmentTypeLabel("")).toBe("");
	});

	// charAt(0).toUpperCase() + slice(1) on a value that's already upper-cased is a no-op past the
	// first character, so an all-caps unknown type round-trips unchanged rather than being
	// re-cased. Worth pinning down since it looks, at a glance, like it should lower-case the rest.
	it("does not touch the rest of an already-uppercase unknown value", () => {
		expect(appointmentTypeLabel("OTHER")).toBe("OTHER");
	});
});
