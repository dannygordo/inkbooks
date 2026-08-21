// Unit tests for utils/sessionRate.js - kept dependency-free specifically so it can be tested
// without mounting a component (see its own header comment). Covers the two decisions it makes:
// whose rate applies to a session, and what that rate computes to in cents; plus the timer math
// and its display formatting.
import { describe, it, expect, vi } from "vitest";
import {
	getEffectiveRate,
	computeSessionSubtotalCents,
	getLiveElapsedSeconds,
	formatElapsed,
} from "./sessionRate";

describe("getEffectiveRate", () => {
	it("uses the artist's own rate when there is no shop on the project at all", () => {
		const artist = { billingType: "hourly", hourlyRate: 120, flatRate: 0 };
		expect(getEffectiveRate(artist, null)).toEqual({
			billingType: "hourly",
			hourlyRate: 120,
			flatRate: 0,
			source: "artist",
		});
	});

	it("treats a shop object with no id the same as no shop", () => {
		const artist = { billingType: "hourly", hourlyRate: 120, flatRate: 0 };
		expect(getEffectiveRate(artist, {}).source).toBe("artist");
	});

	it("defaults a bare artist with nothing set to hourly/$0", () => {
		expect(getEffectiveRate(undefined, null)).toEqual({
			billingType: "hourly",
			hourlyRate: 0,
			flatRate: 0,
			source: "artist",
		});
	});

	it("defaults to the shop's rate when there is a shop and no matching connection record", () => {
		const artist = { hourlyRate: 120 };
		const shop = { id: "shop-1", billingType: "hourly", hourlyRate: 150 };
		expect(getEffectiveRate(artist, shop, [])).toEqual({
			billingType: "hourly",
			hourlyRate: 150,
			flatRate: 0,
			source: "shop",
		});
	});

	it("uses the shop's rate when the connection's rateSource is explicitly 'shop'", () => {
		const artist = { hourlyRate: 120 };
		const shop = { id: "shop-1", billingType: "flat_rate", flatRate: 300 };
		const connections = [{ shopId: "shop-1", rateSource: "shop" }];
		expect(getEffectiveRate(artist, shop, connections).source).toBe("shop");
		expect(getEffectiveRate(artist, shop, connections).flatRate).toBe(300);
	});

	it("uses the artist's own rate when the connection's rateSource is 'own'", () => {
		const artist = { billingType: "hourly", hourlyRate: 120 };
		const shop = { id: "shop-1", hourlyRate: 150 };
		const connections = [{ shopId: "shop-1", rateSource: "own" }];
		expect(getEffectiveRate(artist, shop, connections)).toEqual({
			billingType: "hourly",
			hourlyRate: 120,
			flatRate: 0,
			source: "artist",
		});
	});

	it("defaults to the shop's rate when the connection exists but rateSource is unset", () => {
		const artist = { hourlyRate: 120 };
		const shop = { id: "shop-1", hourlyRate: 150 };
		const connections = [{ shopId: "shop-1" }];
		expect(getEffectiveRate(artist, shop, connections).source).toBe("shop");
	});

	it("matches the connection by shopId as a string, so a numeric shop id still matches", () => {
		const artist = { hourlyRate: 120 };
		const shop = { id: 7, hourlyRate: 150 };
		const connections = [{ shopId: "7", rateSource: "own" }];
		expect(getEffectiveRate(artist, shop, connections).source).toBe("artist");
	});

	it("ignores a connection for a different shop", () => {
		const artist = { hourlyRate: 120 };
		const shop = { id: "shop-1", hourlyRate: 150 };
		const connections = [{ shopId: "shop-2", rateSource: "own" }];
		expect(getEffectiveRate(artist, shop, connections).source).toBe("shop");
	});

	it("tolerates a missing connections array", () => {
		const artist = { hourlyRate: 120 };
		const shop = { id: "shop-1", hourlyRate: 150 };
		expect(() => getEffectiveRate(artist, shop, undefined)).not.toThrow();
		expect(getEffectiveRate(artist, shop, undefined).source).toBe("shop");
	});
});

describe("computeSessionSubtotalCents", () => {
	it("returns 0 for a missing effective rate", () => {
		expect(computeSessionSubtotalCents(3600, null)).toBe(0);
		expect(computeSessionSubtotalCents(3600, undefined)).toBe(0);
	});

	it("computes an hourly subtotal in cents", () => {
		// 1 hour at $150/hr = $150.00 = 15000 cents.
		expect(
			computeSessionSubtotalCents(3600, { billingType: "hourly", hourlyRate: 150 }),
		).toBe(15000);
	});

	// The exact regression named in the source comment: rounding once at the cent, rather than
	// rounding a whole-dollar total first, keeps a fractional session from losing money.
	it("does not truncate a fractional hourly amount to whole dollars", () => {
		// 20 minutes at $150/hr = $50.00 = 5000 cents, not $50 rounded from a whole-dollar figure.
		expect(
			computeSessionSubtotalCents(1200, { billingType: "hourly", hourlyRate: 150 }),
		).toBe(5000);
	});

	it("rounds to the nearest cent for an amount that doesn't land exactly on one", () => {
		// 20 minutes and 1 second at $150/hr = $50.041666...  -> 5004 cents.
		expect(
			computeSessionSubtotalCents(1201, { billingType: "hourly", hourlyRate: 150 }),
		).toBe(5004);
	});

	it("uses the flat rate and ignores elapsed time entirely for flat_rate billing", () => {
		expect(
			computeSessionSubtotalCents(1, { billingType: "flat_rate", flatRate: 300 }),
		).toBe(30000);
		expect(
			computeSessionSubtotalCents(999999, { billingType: "flat_rate", flatRate: 300 }),
		).toBe(30000);
	});

	it("treats negative elapsed seconds as 0 rather than a negative subtotal", () => {
		expect(
			computeSessionSubtotalCents(-500, { billingType: "hourly", hourlyRate: 150 }),
		).toBe(0);
	});

	it("treats a missing hourlyRate/flatRate/elapsedSeconds as 0", () => {
		expect(computeSessionSubtotalCents(undefined, { billingType: "hourly" })).toBe(0);
		expect(computeSessionSubtotalCents(3600, { billingType: "hourly" })).toBe(0);
		expect(computeSessionSubtotalCents(3600, { billingType: "flat_rate" })).toBe(0);
	});
});

describe("getLiveElapsedSeconds", () => {
	it("returns the banked total when the timer isn't running", () => {
		expect(
			getLiveElapsedSeconds({ timerStatus: "stopped", accumulatedSeconds: 120 }, Date.now()),
		).toBe(120);
	});

	it("returns the banked total when running but with no start timestamp", () => {
		expect(
			getLiveElapsedSeconds(
				{ timerStatus: "running", accumulatedSeconds: 120, timerStartedAt: null },
				Date.now(),
			),
		).toBe(120);
	});

	it("adds the current running interval to the banked total", () => {
		const startedAt = new Date("2026-08-05T12:00:00.000Z");
		const now = new Date("2026-08-05T12:05:00.000Z").getTime(); // 5 minutes later
		expect(
			getLiveElapsedSeconds(
				{ timerStatus: "running", accumulatedSeconds: 60, timerStartedAt: startedAt },
				now,
			),
		).toBe(360); // 60 banked + 300 running
	});

	it("clamps a negative running interval (clock skew) to 0 rather than subtracting", () => {
		const startedAt = new Date("2026-08-05T12:05:00.000Z");
		const now = new Date("2026-08-05T12:00:00.000Z").getTime(); // now is BEFORE startedAt
		expect(
			getLiveElapsedSeconds(
				{ timerStatus: "running", accumulatedSeconds: 60, timerStartedAt: startedAt },
				now,
			),
		).toBe(60);
	});

	it("treats a missing appointment as 0 elapsed seconds", () => {
		expect(getLiveElapsedSeconds(null, Date.now())).toBe(0);
		expect(getLiveElapsedSeconds(undefined, Date.now())).toBe(0);
	});

	it("defaults now to Date.now() when not supplied", () => {
		const spy = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-05T12:05:00.000Z").getTime());
		const startedAt = new Date("2026-08-05T12:00:00.000Z");
		expect(
			getLiveElapsedSeconds({ timerStatus: "running", accumulatedSeconds: 0, timerStartedAt: startedAt }),
		).toBe(300);
		spy.mockRestore();
	});
});

describe("formatElapsed", () => {
	it("formats zero seconds", () => {
		expect(formatElapsed(0)).toBe("0:00:00");
	});

	it("pads minutes and seconds but not hours", () => {
		expect(formatElapsed(65)).toBe("0:01:05");
		expect(formatElapsed(3661)).toBe("1:01:01");
	});

	it("does not pad or wrap double-digit hours", () => {
		expect(formatElapsed(25 * 3600)).toBe("25:00:00");
	});

	it("floors a fractional seconds count", () => {
		expect(formatElapsed(59.9)).toBe("0:00:59");
	});

	it("clamps a negative value to zero rather than showing a negative time", () => {
		expect(formatElapsed(-10)).toBe("0:00:00");
	});

	it("treats a missing value as 0", () => {
		expect(formatElapsed(undefined)).toBe("0:00:00");
		expect(formatElapsed(null)).toBe("0:00:00");
	});
});
