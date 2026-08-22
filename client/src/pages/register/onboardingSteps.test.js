// Unit tests for onboardingSteps.js - the signup wizard's copy and step-definitions, kept
// deliberately separate from Register.jsx (see this file's own header comment). There is no
// component here at all: every export is either a plain data structure or a small pure function,
// so this file stays plain-logic tests with no rendering, no React import, and no MockedProvider -
// the same shape as utils/businessScope.test.js and permissions.test.js.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
	ACCOUNT_TYPES,
	NOTIFICATION_CATEGORIES,
	BILLING_TYPES,
	FIELD_HELP,
	COMMON_TIMEZONES,
	timezoneOptions,
	digestHourOptions,
} from "./onboardingSteps";

describe("ACCOUNT_TYPES", () => {
	it("offers exactly the shop and independent-artist choices", () => {
		expect(ACCOUNT_TYPES).toHaveLength(2);
		expect(ACCOUNT_TYPES.map((t) => t.value)).toEqual(["shop", "artist"]);
	});

	it("gives every choice a title and a non-empty blurb", () => {
		for (const type of ACCOUNT_TYPES) {
			expect(typeof type.title).toBe("string");
			expect(type.title.length).toBeGreaterThan(0);
			expect(typeof type.blurb).toBe("string");
			expect(type.blurb.length).toBeGreaterThan(0);
		}
	});
});

describe("NOTIFICATION_CATEGORIES", () => {
	it("covers money, schedule, roster and messages, in that order", () => {
		expect(NOTIFICATION_CATEGORIES.map((c) => c.key)).toEqual([
			"moneyEmail",
			"scheduleEmail",
			"rosterEmail",
			"messageEmail",
		]);
	});

	it("gives every category a label, a `what` explanation, and both role defaults", () => {
		for (const category of NOTIFICATION_CATEGORIES) {
			expect(typeof category.label).toBe("string");
			expect(category.label.length).toBeGreaterThan(0);
			expect(typeof category.what).toBe("string");
			expect(category.what.length).toBeGreaterThan(0);
			expect(typeof category.shopDefault).toBe("string");
			expect(typeof category.artistDefault).toBe("string");
		}
	});

	// Per the header comment on this module, the shop and artist defaults genuinely differ by
	// role for some categories - roster notifications matter to a shop (who's on the roster) and
	// not to a lone artist, who has no roster at all.
	it("gives roster a straight-away default for shops but turns it off for independent artists", () => {
		const roster = NOTIFICATION_CATEGORIES.find((c) => c.key === "rosterEmail");
		expect(roster.shopDefault).toBe("Straight away");
		expect(roster.artistDefault).toBe("Off");
	});
});

describe("BILLING_TYPES", () => {
	it("offers hourly and flat billing, each with a value, label and explanation", () => {
		expect(BILLING_TYPES.map((b) => b.value)).toEqual(["hourly", "flat"]);
		for (const billingType of BILLING_TYPES) {
			expect(typeof billingType.label).toBe("string");
			expect(typeof billingType.what).toBe("string");
			expect(billingType.what.length).toBeGreaterThan(0);
		}
	});
});

describe("FIELD_HELP", () => {
	it("has help text for every field the wizard asks about", () => {
		const expectedKeys = [
			"shopName",
			"bookingSlug",
			"timezone",
			"digestHour",
			"hourlyRate",
			"flatRate",
			"shopCutPercent",
			"shopMinimum",
		];
		expect(Object.keys(FIELD_HELP).sort()).toEqual(expectedKeys.sort());
		for (const key of expectedKeys) {
			expect(typeof FIELD_HELP[key]).toBe("string");
			expect(FIELD_HELP[key].length).toBeGreaterThan(0);
		}
	});
});

describe("COMMON_TIMEZONES", () => {
	it("is a non-empty list of IANA zone names, not fixed offsets", () => {
		expect(COMMON_TIMEZONES.length).toBeGreaterThan(0);
		for (const zone of COMMON_TIMEZONES) {
			// An IANA name always has an Area/Location shape - a fixed offset like "UTC-7" would not.
			expect(zone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
		}
	});

	it("has no duplicate zones", () => {
		expect(new Set(COMMON_TIMEZONES).size).toBe(COMMON_TIMEZONES.length);
	});
});

describe("timezoneOptions", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("puts the browser's own guessed zone first when it isn't already in the common list", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
			resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }),
		}));

		const options = timezoneOptions();

		expect(options[0]).toBe("Asia/Tokyo");
		expect(options).toHaveLength(COMMON_TIMEZONES.length + 1);
		expect(options.slice(1)).toEqual(COMMON_TIMEZONES);
	});

	it("deduplicates when the guessed zone is already in the common list", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
			resolvedOptions: () => ({ timeZone: "Europe/London" }),
		}));

		const options = timezoneOptions();

		expect(options[0]).toBe("Europe/London");
		// Same length as the common list - moved to the front, not duplicated.
		expect(options).toHaveLength(COMMON_TIMEZONES.length);
		expect(options.filter((z) => z === "Europe/London")).toHaveLength(1);
	});

	it("falls back to the plain common list when the browser reports no zone", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
			resolvedOptions: () => ({ timeZone: "" }),
		}));

		expect(timezoneOptions()).toEqual(COMMON_TIMEZONES);
	});

	it("falls back to the plain common list when Intl throws", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
			throw new Error("Intl unavailable");
		});

		expect(timezoneOptions()).toEqual(COMMON_TIMEZONES);
	});
});

describe("digestHourOptions", () => {
	it("returns 24 hours, 0 through 23, as the value", () => {
		const options = digestHourOptions();
		expect(options).toHaveLength(24);
		expect(options.map((o) => o.value)).toEqual(Array.from({ length: 24 }, (_, i) => i));
	});

	it("labels midnight and noon as 12, not 0", () => {
		const options = digestHourOptions();
		expect(options[0].label).toBe("12:00 AM");
		expect(options[12].label).toBe("12:00 PM");
	});

	it("labels the rest of the morning and afternoon with the correct 12-hour clock and suffix", () => {
		const options = digestHourOptions();
		expect(options[1].label).toBe("1:00 AM");
		expect(options[11].label).toBe("11:00 AM");
		expect(options[13].label).toBe("1:00 PM");
		expect(options[23].label).toBe("11:00 PM");
	});
});
