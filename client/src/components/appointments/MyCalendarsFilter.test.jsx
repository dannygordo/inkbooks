// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyCalendarsFilter from "./MyCalendarsFilter";
import { CalendarContext } from "../../context/calendar";

function renderFilter({ hasShop = true, calendarFilters = { shop: true, personal: true } } = {}) {
	const setCalendarFilters = vi.fn();
	render(
		<CalendarContext.Provider value={{ calendarFilters, setCalendarFilters }}>
			<MyCalendarsFilter hasShop={hasShop} />
		</CalendarContext.Provider>,
	);
	return { setCalendarFilters };
}

// A thin real-state wrapper, matching what context/calendar.jsx's CalendarProvider actually does
// (a plain useState, not a mock) - used where the test needs to see the CHECKBOX itself change,
// not just introspect the updater function it was called with. MyCalendarsFilter passes
// setCalendarFilters a functional updater (`(prev) => ({...prev, [key]: e.target.checked})`), and
// the most faithful way to prove that merges correctly is to let a real setState run it, the same
// as CalendarProvider would.
function StatefulFilter({ hasShop = true, initial = { shop: true, personal: true } }) {
	const [calendarFilters, setCalendarFilters] = useState(initial);
	return (
		<CalendarContext.Provider value={{ calendarFilters, setCalendarFilters }}>
			<MyCalendarsFilter hasShop={hasShop} />
		</CalendarContext.Provider>
	);
}

describe("MyCalendarsFilter", () => {
	it("shows both the Shop and Personal checkboxes when hasShop is true", () => {
		renderFilter({ hasShop: true });
		expect(screen.getByRole("checkbox", { name: "Shop" })).toBeInTheDocument();
		expect(screen.getByRole("checkbox", { name: "Personal" })).toBeInTheDocument();
	});

	// The whole reason hasShop is a prop rather than always rendering both - an independent artist
	// has no shop calendar for the checkbox to filter, and a checkbox that toggles nothing reads as
	// a broken control, not an absent one. See this component's own header comment.
	it("hides the Shop checkbox when hasShop is false", () => {
		renderFilter({ hasShop: false });
		expect(screen.queryByRole("checkbox", { name: "Shop" })).not.toBeInTheDocument();
		expect(screen.getByRole("checkbox", { name: "Personal" })).toBeInTheDocument();
	});

	it("reflects the current calendarFilters as each checkbox's checked state", () => {
		renderFilter({ calendarFilters: { shop: false, personal: true } });
		expect(screen.getByRole("checkbox", { name: "Shop" })).not.toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Personal" })).toBeChecked();
	});

	it("unchecking Shop flips only Shop, leaving Personal untouched", async () => {
		const user = userEvent.setup();
		render(<StatefulFilter initial={{ shop: true, personal: true }} />);

		await user.click(screen.getByRole("checkbox", { name: "Shop" }));

		expect(screen.getByRole("checkbox", { name: "Shop" })).not.toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Personal" })).toBeChecked();
	});

	it("checking Personal flips only Personal, leaving Shop untouched", async () => {
		const user = userEvent.setup();
		render(<StatefulFilter initial={{ shop: true, personal: false }} />);

		await user.click(screen.getByRole("checkbox", { name: "Personal" }));

		expect(screen.getByRole("checkbox", { name: "Personal" })).toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Shop" })).toBeChecked();
	});

	it("calls setCalendarFilters exactly once per click, with a functional updater", async () => {
		const user = userEvent.setup();
		const { setCalendarFilters } = renderFilter({
			calendarFilters: { shop: true, personal: true },
		});

		await user.click(screen.getByRole("checkbox", { name: "Shop" }));

		expect(setCalendarFilters).toHaveBeenCalledTimes(1);
		expect(setCalendarFilters.mock.calls[0][0]).toBeInstanceOf(Function);
	});
});
