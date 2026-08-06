import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import moment from "moment";
import { prettyMessageTime, fullMessageTime } from "./messageTime";

// Time is frozen for every case here. A formatter that branches on "is this today / yesterday /
// this week" is only testable against a known now - otherwise the suite quietly changes meaning
// depending on what time of day it runs, and the weekday case in particular would flip behaviour
// every Monday.
//
// A Wednesday, deliberately: it leaves real days on both sides inside the six-day window, so the
// weekday branch is exercised rather than sitting at an edge.
const NOW = new Date("2026-08-05T15:30:00");

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("prettyMessageTime", () => {
	it("shows just the time for today", () => {
		expect(prettyMessageTime("2026-08-05T09:14:00")).toBe("9:14 AM");
	});

	it("names yesterday rather than making you count back", () => {
		expect(prettyMessageTime("2026-08-04T18:02:00")).toBe("Yesterday 6:02 PM");
	});

	it("uses a weekday inside the last week", () => {
		// The case relative time handles worst. "3 days ago" doesn't tell an artist whether a
		// client confirmed before or after the Tuesday consult got booked; "Sun" does.
		expect(prettyMessageTime("2026-08-02T11:45:00")).toBe("Sun 11:45 AM");
	});

	it("falls back to a date once the weekday stops being useful", () => {
		expect(prettyMessageTime("2026-07-04T08:00:00")).toBe("Jul 4, 8:00 AM");
	});

	it("includes the year once it isn't this one", () => {
		expect(prettyMessageTime("2025-12-20T16:20:00")).toBe("Dec 20 2025, 4:20 PM");
	});

	it("returns nothing for a missing timestamp instead of the current time", () => {
		// THE case worth guarding. moment(undefined) means "now", so an absent createdAt would
		// render as the present moment - a plausible-looking wrong answer rather than a visible
		// gap. That is exactly what the optimistic message in IBChatBox used to produce.
		expect(prettyMessageTime(undefined)).toBe("");
		expect(prettyMessageTime(null)).toBe("");
		expect(prettyMessageTime("")).toBe("");
	});

	it("returns nothing for an unparseable value", () => {
		expect(prettyMessageTime("not a date")).toBe("");
	});

	it("accepts what the server actually sends", () => {
		// The GraphQL DateTime scalar serialises to an ISO string; Mongoose hands back a Date.
		// Both reach this function depending on whether a message came from a query or from the
		// optimistic path, so both have to work.
		const asDate = prettyMessageTime(new Date("2026-08-05T09:14:00"));
		const asIso = prettyMessageTime(moment("2026-08-05T09:14:00").toISOString());
		expect(asDate).toBe("9:14 AM");
		expect(asIso).toBe("9:14 AM");
	});
});

describe("fullMessageTime", () => {
	it("spells the whole thing out for a tooltip", () => {
		expect(fullMessageTime("2026-08-05T09:14:00")).toBe(
			"Wednesday, August 5 2026 at 9:14 AM",
		);
	});

	it("stays empty rather than guessing", () => {
		expect(fullMessageTime(null)).toBe("");
		expect(fullMessageTime("not a date")).toBe("");
	});
});
