// CreateEventButton.jsx tests. AppointmentWizard is never actually mounted here - it's built as
// the modal's `content` element and handed to setModal (a mock), so this only needs to inspect
// the React element CreateEventButton constructs, the same way CalendarHeader.test.jsx renders
// this component for real (AuthContext + CalendarContext, both real providers) without needing
// to render the wizard itself.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import CreateEventButton from "./CreateEventButton";
import AppointmentWizard from "./AppointmentWizard";
import { AuthContext } from "../../context/auth";
import { CalendarContext } from "../../context/calendar";

function renderButton({ day, setModal = vi.fn(), daySelected = moment("2026-08-01") } = {}) {
	render(
		<AuthContext.Provider value={{ setModal }}>
			<CalendarContext.Provider value={{ daySelected }}>
				<CreateEventButton day={day} />
			</CalendarContext.Provider>
		</AuthContext.Provider>,
	);
	return { setModal };
}

describe("CreateEventButton", () => {
	it("renders a Create Event button", () => {
		renderButton();
		expect(screen.getByRole("button", { name: /create event/i })).toBeInTheDocument();
	});

	it("opens the appointment wizard modal for the calendar's selected day when no day prop is given", async () => {
		const user = userEvent.setup();
		const daySelected = moment("2026-08-01");
		const { setModal } = renderButton({ daySelected });

		await user.click(screen.getByRole("button", { name: /create event/i }));

		expect(setModal).toHaveBeenCalledTimes(1);
		const call = setModal.mock.calls[0][0];
		expect(call.isOpen).toBe(true);
		expect(call.title).toBe(`Appointment for ${daySelected.format("LL")}`);
		expect(call.content.type).toBe(AppointmentWizard);
		expect(call.content.props.selectedDay).toBe(daySelected);
	});

	// `day` overrides the calendar's own selection - used by the appointments LIST view, which has
	// no concept of a "selected day" of its own (see the component's own header comment).
	it("uses the day prop instead of the calendar's daySelected when provided", async () => {
		const user = userEvent.setup();
		const daySelected = moment("2026-08-01");
		const explicitDay = moment("2026-09-15");
		const { setModal } = renderButton({ day: explicitDay, daySelected });

		await user.click(screen.getByRole("button", { name: /create event/i }));

		const call = setModal.mock.calls[0][0];
		expect(call.title).toBe(`Appointment for ${explicitDay.format("LL")}`);
		expect(call.content.props.selectedDay).toBe(explicitDay);
	});
});
