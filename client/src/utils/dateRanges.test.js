// Unit tests for utils/dateRanges.js.
//
// Time is frozen for every case here, same reasoning as messageTime.test.js: a module built
// entirely around "now" is only testable against a known now. NOW is pinned to a Friday
// (2026-08-21) so the ISO week (Monday-start) boundaries fall on dates distinct from both
// month and quarter boundaries, which exercises the general case rather than an edge.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	RANGE_KEYS,
	buildPresetRanges,
	getDefaultRange,
	buildScheduleRanges,
	getDefaultScheduleRange,
	buildCustomRange,
	describeRange,
	rangeToFilterBounds,
} from "./dateRanges";

const NOW = new Date(2026, 7, 21, 15, 0, 0); // Friday, Aug 21 2026, 3pm local time

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

// All expected boundaries are built with the local Date constructor (not ISO/UTC strings) so the
// comparison is correct regardless of which timezone the test happens to run in - moment(), under
// fake timers, resolves "now" in local time the same way `new Date(y, m, d)` does.
describe("buildPresetRanges", () => {
	it("builds this_month as [Aug 1, Sep 1) - the current calendar month, half-open", () => {
		const range = buildPresetRanges().find((r) => r.key === RANGE_KEYS.THIS_MONTH);
		expect(range.start).toEqual(new Date(2026, 7, 1));
		expect(range.end).toEqual(new Date(2026, 8, 1));
		expect(range.label).toBe("This month");
	});

	it("builds last_month as [Jul 1, Aug 1) - adjacent to this_month with no gap or overlap", () => {
		const ranges = buildPresetRanges();
		const thisMonth = ranges.find((r) => r.key === RANGE_KEYS.THIS_MONTH);
		const lastMonth = ranges.find((r) => r.key === RANGE_KEYS.LAST_MONTH);
		expect(lastMonth.start).toEqual(new Date(2026, 6, 1));
		expect(lastMonth.end).toEqual(new Date(2026, 7, 1));
		// The adjacency the half-open convention exists for: last month's end is exactly this
		// month's start, so nothing on the boundary is double-counted or dropped.
		expect(lastMonth.end).toEqual(thisMonth.start);
	});

	it("builds this_quarter as [Jul 1, Oct 1) - Q3 contains August", () => {
		const range = buildPresetRanges().find((r) => r.key === RANGE_KEYS.THIS_QUARTER);
		expect(range.start).toEqual(new Date(2026, 6, 1));
		expect(range.end).toEqual(new Date(2026, 9, 1));
	});

	it("builds year_to_date as [Jan 1 this year, Jan 1 next year)", () => {
		const range = buildPresetRanges().find((r) => r.key === RANGE_KEYS.YEAR_TO_DATE);
		expect(range.start).toEqual(new Date(2026, 0, 1));
		expect(range.end).toEqual(new Date(2027, 0, 1));
	});

	it("builds last_12_months as exactly twelve whole months, not twelve-and-a-fraction", () => {
		const range = buildPresetRanges().find((r) => r.key === RANGE_KEYS.LAST_12_MONTHS);
		expect(range.start).toEqual(new Date(2025, 8, 1)); // Sep 1 2025
		expect(range.end).toEqual(new Date(2026, 8, 1)); // Sep 1 2026 - same as this_month's end
		// Sep..Aug inclusive is 12 whole months.
		const months =
			(range.end.getFullYear() - range.start.getFullYear()) * 12 +
			(range.end.getMonth() - range.start.getMonth());
		expect(months).toBe(12);
	});

	it("builds ranges fresh on every call rather than caching a stale 'now'", () => {
		const first = buildPresetRanges().find((r) => r.key === RANGE_KEYS.THIS_MONTH);
		vi.setSystemTime(new Date(2026, 8, 1, 0, 0, 1)); // just into September
		const second = buildPresetRanges().find((r) => r.key === RANGE_KEYS.THIS_MONTH);
		expect(second.start).toEqual(new Date(2026, 8, 1));
		expect(second.start).not.toEqual(first.start);
	});
});

describe("getDefaultRange", () => {
	it("defaults the dashboard to this_month", () => {
		expect(getDefaultRange().key).toBe(RANGE_KEYS.THIS_MONTH);
	});
});

describe("buildScheduleRanges", () => {
	it("builds this_week as [Mon, Mon+1week) using ISO (Monday-start) weeks", () => {
		// Aug 21 2026 is a Friday; the Monday of that ISO week is Aug 17.
		const range = buildScheduleRanges().find((r) => r.key === RANGE_KEYS.THIS_WEEK);
		expect(range.start).toEqual(new Date(2026, 7, 17));
		expect(range.end).toEqual(new Date(2026, 7, 24));
	});

	it("builds next_week immediately after this_week with no gap", () => {
		const ranges = buildScheduleRanges();
		const thisWeek = ranges.find((r) => r.key === RANGE_KEYS.THIS_WEEK);
		const nextWeek = ranges.find((r) => r.key === RANGE_KEYS.NEXT_WEEK);
		expect(nextWeek.start).toEqual(thisWeek.end);
		expect(nextWeek.end).toEqual(new Date(2026, 7, 31));
	});

	it("builds this_month and next_month with no gap", () => {
		const ranges = buildScheduleRanges();
		const thisMonth = ranges.find((r) => r.key === RANGE_KEYS.THIS_MONTH);
		const nextMonth = ranges.find((r) => r.key === RANGE_KEYS.NEXT_MONTH);
		expect(thisMonth.start).toEqual(new Date(2026, 7, 1));
		expect(thisMonth.end).toEqual(new Date(2026, 8, 1));
		expect(nextMonth.start).toEqual(thisMonth.end);
		expect(nextMonth.end).toEqual(new Date(2026, 9, 1));
	});

	it("does not include any backward-looking (analytics) ranges", () => {
		const keys = buildScheduleRanges().map((r) => r.key);
		expect(keys).not.toContain(RANGE_KEYS.LAST_MONTH);
		expect(keys).not.toContain(RANGE_KEYS.YEAR_TO_DATE);
		expect(keys).not.toContain(RANGE_KEYS.LAST_12_MONTHS);
	});
});

describe("getDefaultScheduleRange", () => {
	// SURPRISING: the function's own comment says "What an appointments list opens on. This week -
	// the one you are actually working," but it returns buildScheduleRanges()[0], and the first
	// entry in that array's key is THIS_MONTH, not THIS_WEEK (see buildScheduleRanges' return
	// array - THIS_WEEK is the third entry). The comment and the code disagree; this pins down
	// what the code actually does today; if buildScheduleRanges' array order is deliberately
	// changed to put THIS_WEEK first, this test should be updated to match the comment's intent.
	it("actually defaults to this_month, not this_week, despite the comment's stated intent", () => {
		expect(getDefaultScheduleRange().key).toBe(RANGE_KEYS.THIS_MONTH);
	});
});

describe("buildCustomRange", () => {
	it("builds an inclusive-end range: endInput is pushed to the start of the next day", () => {
		const range = buildCustomRange("2026-01-01", "2026-01-31");
		expect(range.key).toBe(RANGE_KEYS.CUSTOM);
		expect(range.start).toEqual(new Date(2026, 0, 1));
		expect(range.end).toEqual(new Date(2026, 1, 1)); // Feb 1, one day past Jan 31
	});

	it("labels the range with the INCLUSIVE end date the user picked, not the exclusive boundary", () => {
		const range = buildCustomRange("2026-01-01", "2026-01-31");
		expect(range.label).toBe("Jan 1, 2026 - Jan 31, 2026");
	});

	it("accepts a single-day range and still labels it as a from-to pair", () => {
		// Unlike describeRange (below), buildCustomRange does not collapse a single-day range to
		// one date in its label - it always renders "start - end", even when they're the same day.
		const range = buildCustomRange("2026-03-15", "2026-03-15");
		expect(range.label).toBe("Mar 15, 2026 - Mar 15, 2026");
		expect(range.end).toEqual(new Date(2026, 2, 16));
	});

	it("returns null when the end date is before the start date", () => {
		expect(buildCustomRange("2026-01-31", "2026-01-01")).toBeNull();
	});

	it("returns null for an unparseable date", () => {
		expect(buildCustomRange("not-a-date", "2026-01-01")).toBeNull();
		expect(buildCustomRange("2026-01-01", "not-a-date")).toBeNull();
	});

	// SURPRISING: moment(undefined) means "now" (the same trap messageTime.test.js documents for
	// prettyMessageTime), and buildCustomRange never checks for a missing input before handing it
	// to moment(). So calling this with no arguments at all doesn't return null the way a caller
	// might expect from "invalid input" - it quietly builds a valid one-day "today to today"
	// custom range instead.
	it("quietly builds a 'today' range for missing inputs instead of returning null", () => {
		const range = buildCustomRange(undefined, undefined);
		expect(range).not.toBeNull();
		expect(range.start).toEqual(new Date(2026, 7, 21));
		expect(range.end).toEqual(new Date(2026, 7, 22));
	});
});

describe("describeRange", () => {
	it("returns an empty string for a missing range", () => {
		expect(describeRange(null)).toBe("");
		expect(describeRange(undefined)).toBe("");
	});

	it("collapses a single-day range to one date", () => {
		const range = buildCustomRange("2026-03-15", "2026-03-15");
		expect(describeRange(range)).toBe("Mar 15, 2026");
	});

	it("shows a from-to pair for a multi-day range, reading back the inclusive end date", () => {
		const range = buildCustomRange("2026-03-15", "2026-03-20");
		expect(describeRange(range)).toBe("Mar 15, 2026 - Mar 20, 2026");
	});

	it("describes a preset range the same way", () => {
		const range = buildPresetRanges().find((r) => r.key === RANGE_KEYS.THIS_MONTH);
		expect(describeRange(range)).toBe("Aug 1, 2026 - Aug 31, 2026");
	});
});

describe("rangeToFilterBounds", () => {
	it("returns {} for a missing range rather than null", () => {
		expect(rangeToFilterBounds(null)).toEqual({});
		expect(rangeToFilterBounds(undefined)).toEqual({});
	});

	it("returns {} when start or end is missing", () => {
		expect(rangeToFilterBounds({ start: new Date(2026, 0, 1) })).toEqual({});
		expect(rangeToFilterBounds({ end: new Date(2026, 0, 1) })).toEqual({});
		expect(rangeToFilterBounds({})).toEqual({});
	});

	it("converts a range's start/end to ISO strings under from/to", () => {
		const start = new Date(2026, 0, 1);
		const end = new Date(2026, 1, 1);
		expect(rangeToFilterBounds({ start, end })).toEqual({
			from: start.toISOString(),
			to: end.toISOString(),
		});
	});

	it("can be spread directly into a filter object without a conditional", () => {
		const bounds = rangeToFilterBounds(null);
		const filter = { upcomingOnly: true, ...bounds };
		expect(filter).toEqual({ upcomingOnly: true });
	});
});
