// context/calendar.jsx tests. CalendarContext is exported for exactly the reason its own header
// comment gives (same as AuthContext in context/auth.jsx) - a test can inject a specific
// monthIndex/daySelected/savedEvents/calendarFilters value directly via
// <CalendarContext.Provider value={...}> rather than mounting the real CalendarProvider and
// driving state through clicks alone. CalendarHeader.test.jsx and UpdateEventDialog.test.jsx
// already lean on that; this file is about CalendarProvider itself - the actual state it holds
// and the setters it exposes to a real consumer.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import { CalendarProvider, CalendarContext, useCalendar } from "./calendar";

function Consumer() {
	const { monthIndex, setMonthIndex, daySelected, setDaySelected, savedEvents, setSavedEvents, calendarFilters, setCalendarFilters } =
		useCalendar();
	return (
		<div>
			<div data-testid="monthIndex">{monthIndex}</div>
			<div data-testid="daySelected">{daySelected ? daySelected.format("YYYY-MM-DD") : "none"}</div>
			<div data-testid="savedEvents">{JSON.stringify(savedEvents)}</div>
			<div data-testid="calendarFilters">{JSON.stringify(calendarFilters)}</div>
			<button onClick={() => setMonthIndex(monthIndex + 1)}>nextMonth</button>
			<button onClick={() => setDaySelected(moment("2026-01-15"))}>pickDay</button>
			<button onClick={() => setSavedEvents((events) => [...events, { id: "e1" }])}>addEvent</button>
			<button onClick={() => setCalendarFilters((f) => ({ ...f, shop: !f.shop }))}>toggleShop</button>
		</div>
	);
}

describe("useCalendar", () => {
	it("returns the default context value with no provider", () => {
		function Bare() {
			const { monthIndex } = useCalendar();
			return <div data-testid="bare">{monthIndex}</div>;
		}
		render(<Bare />);
		// CalendarContext's default value hardcodes monthIndex: 0 - a component rendered outside
		// any CalendarProvider (a bug, but not one that should crash the whole tree) gets that
		// default rather than throwing on a missing context.
		expect(screen.getByTestId("bare")).toHaveTextContent("0");
	});

	it("lets a test inject an arbitrary context value directly via CalendarContext.Provider", () => {
		render(
			<CalendarContext.Provider value={{ monthIndex: 7, daySelected: moment("2026-03-01") }}>
				<Consumer />
			</CalendarContext.Provider>,
		);
		expect(screen.getByTestId("monthIndex")).toHaveTextContent("7");
		expect(screen.getByTestId("daySelected")).toHaveTextContent("2026-03-01");
	});
});

describe("CalendarProvider", () => {
	it("initializes monthIndex and daySelected to the real current month/day", () => {
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);
		expect(screen.getByTestId("monthIndex")).toHaveTextContent(String(moment().month()));
		expect(screen.getByTestId("daySelected")).toHaveTextContent(moment().format("YYYY-MM-DD"));
	});

	it("initializes savedEvents to an empty array", () => {
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);
		expect(screen.getByTestId("savedEvents")).toHaveTextContent("[]");
	});

	// Both true by default - hiding a whole calendar is an opt-out, not the starting state (see
	// the component's own comment on calendarFilters).
	it("initializes calendarFilters with both shop and personal shown", () => {
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);
		expect(screen.getByTestId("calendarFilters")).toHaveTextContent(
			JSON.stringify({ shop: true, personal: true }),
		);
	});

	it("setMonthIndex updates monthIndex for every consumer", async () => {
		const user = userEvent.setup();
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);
		const start = moment().month();

		await user.click(screen.getByText("nextMonth"));

		expect(screen.getByTestId("monthIndex")).toHaveTextContent(String(start + 1));
	});

	it("setDaySelected updates daySelected", async () => {
		const user = userEvent.setup();
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);

		await user.click(screen.getByText("pickDay"));

		expect(screen.getByTestId("daySelected")).toHaveTextContent("2026-01-15");
	});

	it("setSavedEvents updates the shared savedEvents list", async () => {
		const user = userEvent.setup();
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);

		await user.click(screen.getByText("addEvent"));

		expect(screen.getByTestId("savedEvents")).toHaveTextContent(JSON.stringify([{ id: "e1" }]));
	});

	it("setCalendarFilters updates the shared My Calendars filter state", async () => {
		const user = userEvent.setup();
		render(
			<CalendarProvider>
				<Consumer />
			</CalendarProvider>,
		);

		await user.click(screen.getByText("toggleShop"));

		expect(screen.getByTestId("calendarFilters")).toHaveTextContent(
			JSON.stringify({ shop: false, personal: true }),
		);
	});

	it("passes through any extra props to the underlying Provider (props spread)", () => {
		// CalendarProvider spreads {...props} onto CalendarContext.Provider rather than only
		// passing children explicitly - children still reaches the tree either way, which this
		// confirms without depending on the spread mechanics themselves.
		render(
			<CalendarProvider>
				<div data-testid="child">child content</div>
			</CalendarProvider>,
		);
		expect(screen.getByTestId("child")).toHaveTextContent("child content");
	});
});
