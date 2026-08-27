// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import CalendarHeader from "./CalendarHeader";
import { CalendarContext } from "../../context/calendar";
import { AuthContext } from "../../context/auth";

// CalendarHeader renders CreateEventButton directly (not mocked out, unlike IBCalendar.test.jsx's
// treatment of CalendarHeader itself) - CreateEventButton reads useAuth().setModal and
// useCalendar().daySelected, so both contexts need real values here even though this file's own
// assertions only care about CalendarHeader's month label and prev/next navigation.
function renderHeader({
	monthIndex = moment().month(),
	setMonthIndex = vi.fn(),
	daySelected = moment(),
	setModal = vi.fn(),
} = {}) {
	render(
		<AuthContext.Provider value={{ setModal }}>
			<CalendarContext.Provider value={{ monthIndex, setMonthIndex, daySelected }}>
				<CalendarHeader />
			</CalendarContext.Provider>
		</AuthContext.Provider>,
	);
	return { setMonthIndex, setModal };
}

describe("CalendarHeader", () => {
	it("renders the current period label from monthIndex and the real current year", () => {
		// The component always combines the context's monthIndex with moment()'s CURRENT year
		// (there's no yearIndex in the calendar context - see calendar.jsx) - so the expected label
		// is built the same way here rather than hardcoded, to stay correct whenever this suite runs.
		const monthIndex = 3;
		renderHeader({ monthIndex });

		const expectedLabel = moment(new Date(moment().year(), monthIndex)).format("MMMM YYYY");
		expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(expectedLabel);
	});

	it("clicking the previous chevron calls setMonthIndex with monthIndex - 1", async () => {
		const user = userEvent.setup();
		const setMonthIndex = vi.fn();
		renderHeader({ monthIndex: 5, setMonthIndex });

		await user.click(screen.getByTestId("ChevronLeftIcon").closest("button"));

		expect(setMonthIndex).toHaveBeenCalledTimes(1);
		expect(setMonthIndex).toHaveBeenCalledWith(4);
	});

	it("clicking the next chevron calls setMonthIndex with monthIndex + 1", async () => {
		const user = userEvent.setup();
		const setMonthIndex = vi.fn();
		renderHeader({ monthIndex: 5, setMonthIndex });

		await user.click(screen.getByTestId("ChevronRightIcon").closest("button"));

		expect(setMonthIndex).toHaveBeenCalledTimes(1);
		expect(setMonthIndex).toHaveBeenCalledWith(6);
	});

	// handleToday's "already on the current month" branch adds Math.random() to force a re-render
	// on a month that hasn't numerically changed - not asserted here, since the exact value it
	// passes is non-deterministic by design. The "viewing a different month" branch is the
	// deterministic, testable half of that same handler.
	it("clicking Today calls setMonthIndex with the real current month when a different month is shown", async () => {
		const user = userEvent.setup();
		const setMonthIndex = vi.fn();
		const otherMonth = (moment().month() + 1) % 12;
		renderHeader({ monthIndex: otherMonth, setMonthIndex });

		await user.click(screen.getByText("Today"));

		expect(setMonthIndex).toHaveBeenCalledWith(moment().month());
	});

	it("renders CreateEventButton", () => {
		renderHeader();
		expect(screen.getByRole("button", { name: /create event/i })).toBeInTheDocument();
	});
});
