import moment from "moment";

/**
 * The date ranges both dashboards offer, defined once.
 *
 * Every range is HALF-OPEN: start inclusive, end exclusive. That's not pedantry - it's the only
 * way "January" and "February" can be adjacent without either double-counting an appointment at
 * midnight on the 1st or dropping it entirely. The server's aggregation matches on
 * `$gte: start, $lt: end` for the same reason (see server/utils/analytics.js), so the two halves
 * agree by construction rather than by both happening to round the same way.
 *
 * Ranges are built at call time rather than being module-level constants: a tab left open
 * overnight would otherwise keep reporting yesterday's idea of "this month" against a server
 * that has moved on.
 */

export const RANGE_KEYS = {
	THIS_MONTH: "this_month",
	LAST_MONTH: "last_month",
	THIS_QUARTER: "this_quarter",
	YEAR_TO_DATE: "year_to_date",
	LAST_12_MONTHS: "last_12_months",
	// Scheduling ranges - see buildScheduleRanges below for why these are separate.
	THIS_WEEK: "this_week",
	NEXT_WEEK: "next_week",
	NEXT_MONTH: "next_month",
	CUSTOM: "custom",
};

/**
 * @returns {Array<{key: string, label: string, start: Date, end: Date}>}
 */
export function buildPresetRanges() {
	const now = moment();
	return [
		{
			key: RANGE_KEYS.THIS_MONTH,
			label: "This month",
			start: now.clone().startOf("month").toDate(),
			// End of the CURRENT month, not now - so a mid-month view and an end-of-month view of
			// "this month" describe the same window, and an appointment booked for later today
			// doesn't drop out of "this month" just because the clock hasn't reached it. The
			// figures that shouldn't include future work exclude it by status (revenue counts
			// completed appointments only), not by clipping the window.
			end: now.clone().add(1, "month").startOf("month").toDate(),
		},
		{
			key: RANGE_KEYS.LAST_MONTH,
			label: "Last month",
			start: now.clone().subtract(1, "month").startOf("month").toDate(),
			end: now.clone().startOf("month").toDate(),
		},
		{
			key: RANGE_KEYS.THIS_QUARTER,
			label: "This quarter",
			start: now.clone().startOf("quarter").toDate(),
			end: now.clone().add(1, "quarter").startOf("quarter").toDate(),
		},
		{
			key: RANGE_KEYS.YEAR_TO_DATE,
			label: "Year to date",
			start: now.clone().startOf("year").toDate(),
			end: now.clone().add(1, "year").startOf("year").toDate(),
		},
		{
			key: RANGE_KEYS.LAST_12_MONTHS,
			label: "Last 12 months",
			// A rolling window from the start of the month 11 back, so it's twelve whole months
			// rather than twelve months and a fraction - "last 12 months" compared against
			// another "last 12 months" a week later should cover the same number of days.
			start: now.clone().subtract(11, "months").startOf("month").toDate(),
			end: now.clone().add(1, "month").startOf("month").toDate(),
		},
	];
}

export function getDefaultRange() {
	return buildPresetRanges()[0];
}

/**
 * Ranges for looking at a SCHEDULE, as opposed to looking at performance.
 *
 * A separate set from buildPresetRanges above, and deliberately so. Those ranges look BACKWARD -
 * last month, this quarter, year to date - because the question a dashboard answers is "how did I
 * do". A schedule is read FORWARD: what's on this week, what's coming next week. Offering "year to
 * date" on an appointments list is offering to show somebody a year of appointments they have
 * already worked, which is not a thing anyone opens that screen for.
 *
 * Sharing one list would mean the dashboards grow scheduling ranges nobody wants there, or the
 * appointments list carries analytics ranges nobody wants here. Two lists, one picker.
 *
 * Weeks start on Monday, via moment's own locale-aware startOf('isoWeek'). A tattoo shop's week is
 * a working week; `startOf('week')` would put Sunday at the head of it under the default locale,
 * which splits a normal weekend across two ranges.
 */
export function buildScheduleRanges() {
	const now = moment();
	return [
		{
			key: RANGE_KEYS.THIS_MONTH,
			label: "This month",
			start: now.clone().startOf("month").toDate(),
			end: now.clone().add(1, "month").startOf("month").toDate(),
		},
		{
			key: RANGE_KEYS.NEXT_MONTH,
			label: "Next month",
			start: now.clone().add(1, "month").startOf("month").toDate(),
			end: now.clone().add(2, "months").startOf("month").toDate(),
		},
		{
			key: RANGE_KEYS.THIS_WEEK,
			label: "This week",
			start: now.clone().startOf("isoWeek").toDate(),
			end: now.clone().startOf("isoWeek").add(1, "week").toDate(),
		},
		{
			key: RANGE_KEYS.NEXT_WEEK,
			label: "Next week",
			start: now.clone().startOf("isoWeek").add(1, "week").toDate(),
			end: now.clone().startOf("isoWeek").add(2, "weeks").toDate(),
		}
	];
}

/** What an appointments list opens on. This week - the one you are actually working. */
export function getDefaultScheduleRange() {
	return buildScheduleRanges()[0];
}

/**
 * Builds a range from two date inputs. `endInput` is the last day the user wants INCLUDED, so it
 * gets pushed to the start of the following day - otherwise picking "Jan 1 to Jan 31" would
 * silently exclude everything on the 31st, which is the classic off-by-one in every custom range
 * picker and is invisible until someone reconciles a total by hand.
 */
export function buildCustomRange(startInput, endInput) {
	const start = moment(startInput);
	const end = moment(endInput);
	if (!start.isValid() || !end.isValid() || !end.isSameOrAfter(start, "day")) {
		return null;
	}
	return {
		key: RANGE_KEYS.CUSTOM,
		label: `${start.format("MMM D, YYYY")} - ${end.format("MMM D, YYYY")}`,
		start: start.startOf("day").toDate(),
		end: end.add(1, "day").startOf("day").toDate(),
	};
}

/**
 * Human-readable description of a range, for the "showing X" line under a set of figures. Reads
 * back the INCLUSIVE end date, since that's what the user picked - showing the exclusive
 * boundary would display Feb 1 for a range the user thinks of as ending Jan 31.
 */
export function describeRange(range) {
	if (!range) {
		return "";
	}
	const start = moment(range.start);
	const inclusiveEnd = moment(range.end).subtract(1, "day");
	if (start.isSame(inclusiveEnd, "day")) {
		return start.format("MMM D, YYYY");
	}
	return `${start.format("MMM D, YYYY")} - ${inclusiveEnd.format("MMM D, YYYY")}`;
}
