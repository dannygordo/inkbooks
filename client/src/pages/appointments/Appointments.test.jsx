// Appointments.jsx tests. This page is a thin toggle: it owns exactly one piece of state (which
// view is showing) and renders either AppointmentsList or IBCalendar, never both - see the
// component's own header comment on why the view choice is local state rather than a route. Both
// children have their own dedicated test files
// (components/appointments/AppointmentsList.test.jsx, components/ibCalendar/IBCalendar.test.jsx)
// covering what each actually does, so they're mocked out here with prop-capturing spies - what's
// under test in this file is Appointments' own toggle/mount-unmount logic, not either child's
// behavior. Mocking them also sidesteps needing AuthContext/MockedProvider/MemoryRouter at all:
// neither real child can render without a shop-connected user and a live Apollo query.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx and
// pages/home/Home.test.jsx: under Vitest, @vitejs/plugin-react compiles JSX with the classic
// runtime, so any component file rendered by a test needs React in scope itself or it throws
// "React is not defined" at render time.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Appointments from "./Appointments";

const { appointmentsListSpy, ibCalendarSpy } = vi.hoisted(() => ({
	appointmentsListSpy: vi.fn(() => <div data-testid="appointments-list-stub" />),
	ibCalendarSpy: vi.fn(() => <div data-testid="ib-calendar-stub" />),
}));

vi.mock("../../components/appointments/AppointmentsList", () => ({
	default: appointmentsListSpy,
}));
vi.mock("../../components/ibCalendar/IBCalendar", () => ({
	default: ibCalendarSpy,
}));

describe("Appointments", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("opens on the list view by default, with the calendar unmounted entirely", () => {
		render(<Appointments />);

		expect(screen.getByTestId("appointments-list-stub")).toBeInTheDocument();
		expect(screen.queryByTestId("ib-calendar-stub")).not.toBeInTheDocument();
		expect(appointmentsListSpy).toHaveBeenCalledTimes(1);
		expect(ibCalendarSpy).not.toHaveBeenCalled();
	});

	it("has the List toggle pressed and Calendar not pressed on first render", () => {
		render(<Appointments />);

		expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "Calendar view" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("switches to the calendar view on click, unmounting the list rather than hiding it", async () => {
		const user = userEvent.setup();
		render(<Appointments />);

		await user.click(screen.getByRole("button", { name: "Calendar view" }));

		expect(screen.getByTestId("ib-calendar-stub")).toBeInTheDocument();
		expect(screen.queryByTestId("appointments-list-stub")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Calendar view" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("switches back to the list view from the calendar", async () => {
		const user = userEvent.setup();
		render(<Appointments />);

		await user.click(screen.getByRole("button", { name: "Calendar view" }));
		await user.click(screen.getByRole("button", { name: "List view" }));

		expect(screen.getByTestId("appointments-list-stub")).toBeInTheDocument();
		expect(screen.queryByTestId("ib-calendar-stub")).not.toBeInTheDocument();
	});

	// ToggleButtonGroup with `exclusive` hands the onChange handler `null` when the ALREADY active
	// button is clicked again - Appointments.jsx's onChange guards on `next &&` specifically so
	// that never clears the view to nothing (see the component's own comment). Simulated directly
	// against the handler's observable effect: clicking the already-active List button a second
	// time must leave the list mounted, not unmount it.
	it("ignores re-clicking the already-active view rather than showing neither", async () => {
		const user = userEvent.setup();
		render(<Appointments />);

		await user.click(screen.getByRole("button", { name: "List view" }));

		expect(screen.getByTestId("appointments-list-stub")).toBeInTheDocument();
		expect(screen.queryByTestId("ib-calendar-stub")).not.toBeInTheDocument();
	});
});
