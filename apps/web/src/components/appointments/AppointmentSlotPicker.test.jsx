// AppointmentSlotPicker.jsx tests. See that file's own header comment: it has no date/duration/
// conflict logic of its own - it is pure composition, wiring one `date`/`onDateChange` pair into
// IBDateTimePicker, one `durationMinutes`/`onDurationChange` pair into DurationPicker, and all four
// booking-relevant props into DaySchedule. What's actually under test here is that wiring: does the
// value a caller passes in reach the right child under the right prop name, and does the callback a
// child fires come back out through the right prop.
//
// IBDateTimePicker and DurationPicker are mocked to trivial stubs (a button that fires the child's
// own change callback with a fixed value) rather than driven through their real MUI controls -
// IBDateTimePicker wraps MUI X's MobileDateTimePicker, which opens its own dialog/calendar grid to
// pick a value; no test in this codebase drives that widget end-to-end (see IBDateTimePicker.jsx),
// and doing so here would be testing MUI's picker, not AppointmentSlotPicker's wiring. DurationPicker
// is mocked the same way for the same reason - its own hours/minutes-field logic belongs to
// DurationPicker's own test coverage, not this component's.
//
// DaySchedule is NOT mocked - it's cheap to render for real (see below) - but the
// AppointmentService.getAppointmentsByArtistForCalendar hook it calls IS mocked wholesale, the same
// call and for the same reason IBCalendar.test.jsx already makes on this identical hook: driving it
// through a MockedProvider would mean hand-building an exact-match GraphQL mock (variables, nested
// __typename tree) against DaySchedule's own internal date-range computation, which is DaySchedule's
// concern, not AppointmentSlotPicker's. What matters here is "does AppointmentSlotPicker forward
// artistUserId/date/durationMinutes/excludeAppointmentId to DaySchedule and does DaySchedule render
// what the hook hands back" - which a plain vi.fn() return value exercises just as well, without an
// Apollo provider in the tree at all.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppointmentSlotPicker from "./AppointmentSlotPicker";
import { AppointmentService } from "../../services/AppointmentService";
import { describeDuration } from "./DurationPicker";

vi.mock("../inputs/IBDateTimePicker", () => ({
	default: ({ label, val, setVal }) => (
		<button onClick={() => setVal("2026-08-25T15:00:00.000Z")}>
			{label} val={String(val)}
		</button>
	),
}));

// Preserves DurationPicker's real named exports (describeDuration, CONSULT_DEFAULT_MINUTES,
// SESSION_DEFAULT_MINUTES) via importOriginal, overriding only the default export - so the
// describeDuration tests below exercise the real function, not a stub.
vi.mock("./DurationPicker", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		default: ({ value, onChange }) => (
			<button onClick={() => onChange(150)}>Duration val={value}</button>
		),
	};
});

vi.mock("../../services/AppointmentService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		AppointmentService: {
			...actual.AppointmentService,
			getAppointmentsByArtistForCalendar: vi.fn(),
		},
	};
});

function baseProps(overrides = {}) {
	return {
		label: "Date & time",
		date: "2026-08-25T15:00:00.000Z",
		onDateChange: vi.fn(),
		durationMinutes: 60,
		onDurationChange: vi.fn(),
		artistUserId: "artist-1",
		...overrides,
	};
}

// DaySchedule renders null on an empty/loading day (see its own header comment on why silence is
// the correct default) - most tests below give it one appointment so its output is actually visible
// on screen, rather than every assertion being "this text is present" against a component that
// renders nothing.
function mockDaySchedule(items = []) {
	AppointmentService.getAppointmentsByArtistForCalendar.mockReturnValue({
		data: { getAppointmentsByArtist: { items } },
		loading: false,
	});
}

describe("AppointmentSlotPicker", () => {
	it("renders all three composed pieces", () => {
		mockDaySchedule([
			{
				id: "appt-1",
				appointmentDate: "2026-08-25T16:00:00.000Z",
				appointmentEnd: "2026-08-25T17:00:00.000Z",
				appointmentType: "consult",
				title: "Walk-in touch-up",
			},
		]);

		render(<AppointmentSlotPicker {...baseProps()} />);

		// IBDateTimePicker stub - label and current value passed through as `val`.
		expect(
			screen.getByText("Date & time val=2026-08-25T15:00:00.000Z"),
		).toBeInTheDocument();
		// DurationPicker stub - current value passed through as `value`.
		expect(screen.getByText("Duration val=60")).toBeInTheDocument();
		// DaySchedule - rendered for real, showing what the mocked hook returned.
		expect(screen.getByText(/1 already booked/)).toBeInTheDocument();
		expect(screen.getByText("Walk-in touch-up")).toBeInTheDocument();
	});

	it("selecting a date/time calls onDateChange with the emitted value", async () => {
		const user = userEvent.setup();
		mockDaySchedule([]);
		const onDateChange = vi.fn();
		render(<AppointmentSlotPicker {...baseProps({ onDateChange })} />);

		await user.click(screen.getByText(/Date & time val=/));

		expect(onDateChange).toHaveBeenCalledTimes(1);
		expect(onDateChange).toHaveBeenCalledWith("2026-08-25T15:00:00.000Z");
	});

	it("selecting a duration calls onDurationChange with the emitted value", async () => {
		const user = userEvent.setup();
		mockDaySchedule([]);
		const onDurationChange = vi.fn();
		render(<AppointmentSlotPicker {...baseProps({ onDurationChange })} />);

		await user.click(screen.getByText(/Duration val=/));

		expect(onDurationChange).toHaveBeenCalledTimes(1);
		expect(onDurationChange).toHaveBeenCalledWith(150);
	});

	it("forwards artistUserId to DaySchedule's fetch", () => {
		mockDaySchedule([]);
		render(<AppointmentSlotPicker {...baseProps({ artistUserId: "artist-42" })} />);

		expect(AppointmentService.getAppointmentsByArtistForCalendar).toHaveBeenCalledWith(
			"artist-42",
			expect.anything(),
		);
	});

	// durationMinutes isn't just handed to DurationPicker - DaySchedule also needs it to compute
	// whether the slot being booked overlaps an existing appointment (see DaySchedule.jsx). This
	// confirms the same value AppointmentSlotPicker exposes to the duration field is the one
	// DaySchedule actually uses to flag a clash, not two independently-plumbed copies.
	it("passes durationMinutes through to DaySchedule's overlap detection", () => {
		mockDaySchedule([
			{
				id: "appt-2",
				appointmentDate: "2026-08-25T15:30:00.000Z",
				appointmentEnd: "2026-08-25T16:30:00.000Z",
				appointmentType: "session",
				title: "Overlapping booking",
			},
		]);

		// date 15:00 + durationMinutes 60 => [15:00, 16:00), which overlaps the 15:30-16:30 booking
		// above.
		render(<AppointmentSlotPicker {...baseProps({ date: "2026-08-25T15:00:00.000Z", durationMinutes: 60 })} />);

		expect(screen.getByText(/1 conflict/)).toBeInTheDocument();
	});

	// excludeAppointmentId is what keeps the appointment being EDITED from clashing with itself
	// (see DaySchedule.jsx's own comment) - confirms AppointmentSlotPicker actually forwards it
	// rather than silently dropping it, which would show a false conflict on every edit.
	it("forwards excludeAppointmentId so DaySchedule omits the appointment being edited", () => {
		mockDaySchedule([
			{
				id: "appt-1",
				appointmentDate: "2026-08-25T15:00:00.000Z",
				appointmentEnd: "2026-08-25T16:00:00.000Z",
				appointmentType: "session",
				title: "Being edited",
			},
		]);

		render(<AppointmentSlotPicker {...baseProps({ excludeAppointmentId: "appt-1" })} />);

		// The only appointment that day is the one being excluded, so the day reads as clear and
		// DaySchedule renders nothing at all (see its own empty-day comment).
		expect(screen.queryByText("Being edited")).not.toBeInTheDocument();
		expect(screen.queryByText(/already booked/)).not.toBeInTheDocument();
	});
});

// describeDuration is DurationPicker's own exported helper (see that file's header comment on why
// minutes are the storage unit and hours/minutes the interface) - not used by AppointmentSlotPicker
// itself, but exposed for callers that want a human label from a stored minute count. Covered here
// since it has no test file of its own yet and the vi.mock above already re-exports the real
// implementation.
describe("describeDuration", () => {
	it("returns an empty string for a falsy/zero duration", () => {
		expect(describeDuration(0)).toBe("");
		expect(describeDuration(null)).toBe("");
		expect(describeDuration(undefined)).toBe("");
	});

	it("formats a sub-hour duration as minutes only", () => {
		expect(describeDuration(45)).toBe("45 min");
	});

	it("formats an exact-hour duration with no trailing minutes", () => {
		expect(describeDuration(120)).toBe("2 hr");
	});

	it("formats an hours-and-minutes duration as both", () => {
		expect(describeDuration(150)).toBe("2 hr 30");
	});
});
