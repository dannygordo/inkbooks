// React imported explicitly: under Vitest, @vitejs/plugin-react compiles JSX with the CLASSIC
// runtime, so a component rendered by a test needs React in scope or it throws "React is not
// defined" - see Day.test.jsx / IBCalendar.test.jsx for the same note and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import moment from "moment";
import Month from "./Month";

// Month's own job (per its source) is purely layout: given `month` - an array of week-rows, each
// row an array of "day" cells (moment instances elsewhere in the app - see IBCalendar.jsx's
// `weeks[0][0].clone()` and Day.jsx's `day.format(...)`) - it renders one <Day day rowIdx /> per
// cell inside the MUI grid. The real Day pulls in useCalendar()/useAuth() unconditionally (see
// Day.jsx), so rendering it for real here would mean wiring up CalendarContext/AuthContext just to
// satisfy a component whose own behaviour is Day.test.jsx's concern, not Month's - exactly the
// reasoning IBCalendar.test.jsx gives for mocking OUT Month itself when testing IBCalendar. Mocking
// Day the same way isolates what Month actually does: fan a 2-D array out into the right number of
// cells, in the right order, with the right day/rowIdx per cell.
vi.mock("./Day", () => ({
	default: ({ day, rowIdx }) => (
		<div data-testid="day-mock" data-row-idx={rowIdx} data-day={day.format("YYYY-MM-DD")} />
	),
}));

// A realistic 5-week grid: getMonth() (see IBCalendar.jsx's comment on it) returns five weeks of 7
// days each, spilling into the surrounding months so every visible cell is filled.
function buildWeeks(weekCount = 5, daysPerWeek = 7, start = "2026-07-27") {
	const first = moment(start);
	return Array.from({ length: weekCount }, (_, w) =>
		Array.from({ length: daysPerWeek }, (_, d) => first.clone().add(w * 7 + d, "day")),
	);
}

describe("Month", () => {
	it("renders one Day cell for every day across every week", () => {
		const month = buildWeeks(5, 7);
		render(<Month month={month} />);

		expect(screen.getAllByTestId("day-mock")).toHaveLength(35);
	});

	it("passes each row's own day objects through to Day, in order", () => {
		const month = buildWeeks(2, 3, "2026-08-01");
		render(<Month month={month} />);

		const rendered = screen.getAllByTestId("day-mock").map((el) => el.dataset.day);
		const expected = month.flat().map((day) => day.format("YYYY-MM-DD"));
		expect(rendered).toEqual(expected);
	});

	it("passes the row index - not the column index - as rowIdx to every Day in that row", () => {
		const month = buildWeeks(3, 4, "2026-08-01");
		render(<Month month={month} />);

		const cells = screen.getAllByTestId("day-mock");
		// 3 rows of 4 columns: rowIdx must be constant within a row and increase across rows.
		expect(cells.slice(0, 4).map((el) => el.dataset.rowIdx)).toEqual(["0", "0", "0", "0"]);
		expect(cells.slice(4, 8).map((el) => el.dataset.rowIdx)).toEqual(["1", "1", "1", "1"]);
		expect(cells.slice(8, 12).map((el) => el.dataset.rowIdx)).toEqual(["2", "2", "2", "2"]);
	});

	it("supports rows of uneven length rather than assuming a fixed 7-column week", () => {
		// Month.jsx maps `row.map(...)` with no length check, so nothing about it actually requires
		// every row to be 7 long - only IBCalendar's real getMonth() output happens to be. A ragged
		// input should still render exactly as many cells as are actually present.
		const month = [
			[moment("2026-08-01"), moment("2026-08-02")],
			[moment("2026-08-08"), moment("2026-08-09"), moment("2026-08-10")],
		];
		render(<Month month={month} />);

		expect(screen.getAllByTestId("day-mock")).toHaveLength(5);
	});

	it("renders no cells, without crashing, for an empty month", () => {
		render(<Month month={[]} />);
		expect(screen.queryAllByTestId("day-mock")).toHaveLength(0);
	});

	it("skips an empty week without crashing, while still rendering the surrounding weeks", () => {
		const month = [
			[moment("2026-08-01"), moment("2026-08-02")],
			[],
			[moment("2026-08-15")],
		];
		render(<Month month={month} />);

		const cells = screen.getAllByTestId("day-mock");
		expect(cells).toHaveLength(3);
		// The lone cell after the empty week still carries the row index of that empty row's
		// successor (2), not 1 - confirming the empty row didn't shift the index sequence.
		expect(cells.at(-1).dataset.rowIdx).toBe("2");
	});

	it("wraps each Day cell in its own MUI Paper-based grid item", () => {
		// Guards the Item/Grid wrapper (see Month.jsx's styled(Paper) `Item`) that gives every day
		// cell its card background and flex layout - losing it would silently flatten the whole
		// calendar grid back to unstyled divs.
		const month = buildWeeks(1, 7);
		render(<Month month={month} />);

		const cell = screen.getAllByTestId("day-mock")[0];
		expect(cell.closest(".MuiPaper-root")).not.toBeNull();
	});
});
