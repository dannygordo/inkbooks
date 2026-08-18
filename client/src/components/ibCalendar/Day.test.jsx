// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import Day from "./Day";
import { CalendarContext } from "../../context/calendar";
import { AuthContext } from "../../context/auth";
import UpdateEventDialog from "./UpdateEventDialog";
import ViewEventDialog from "./ViewEventDialog";
import AppointmentWizard from "./AppointmentWizard";

const USER = { id: "artist-1" };
const DAY = moment("2026-08-10");

function shopEvent(overrides = {}) {
	return {
		id: "appt-1",
		userId: USER.id,
		title: "Sleeve session",
		appointmentDate: DAY.clone().hour(14).toISOString(),
		projectId: null,
		user: { id: USER.id, tagColor: "#c69818" },
		isPersonal: false,
		...overrides,
	};
}

function renderDay({ savedEvents = [], rowIdx = 1, setModal = vi.fn(), setDaySelected = vi.fn() } = {}) {
	render(
		<AuthContext.Provider value={{ user: USER, setModal }}>
			<CalendarContext.Provider value={{ savedEvents, setDaySelected }}>
				<Day day={DAY} rowIdx={rowIdx} />
			</CalendarContext.Provider>
		</AuthContext.Provider>,
	);
	return { setModal, setDaySelected };
}

describe("Day", () => {
	it("only renders events whose appointmentDate falls on this day", () => {
		const sameDay = shopEvent({ id: "a", title: "On this day" });
		const otherDay = shopEvent({
			id: "b",
			title: "Different day",
			appointmentDate: DAY.clone().add(1, "day").toISOString(),
		});
		renderDay({ savedEvents: [sameDay, otherDay] });

		expect(screen.getByText(/On this day/)).toBeInTheDocument();
		expect(screen.queryByText(/Different day/)).not.toBeInTheDocument();
	});

	it("shows the weekday header only on the first row", () => {
		const { rerender } = render(
			<AuthContext.Provider value={{ user: USER, setModal: vi.fn() }}>
				<CalendarContext.Provider value={{ savedEvents: [], setDaySelected: vi.fn() }}>
					<Day day={DAY} rowIdx={0} />
				</CalendarContext.Provider>
			</AuthContext.Provider>,
		);
		expect(screen.getByText(DAY.format("ddd").toUpperCase())).toBeInTheDocument();

		rerender(
			<AuthContext.Provider value={{ user: USER, setModal: vi.fn() }}>
				<CalendarContext.Provider value={{ savedEvents: [], setDaySelected: vi.fn() }}>
					<Day day={DAY} rowIdx={1} />
				</CalendarContext.Provider>
			</AuthContext.Provider>,
		);
		expect(screen.queryByText(DAY.format("ddd").toUpperCase())).not.toBeInTheDocument();
	});

	// A shop event fills solid with the owner's tagColor - see Day.jsx's own comment on why this
	// differs from a personal one.
	it("renders a shop event's chip filled with the owner's tagColor", () => {
		renderDay({ savedEvents: [shopEvent()] });
		const chip = screen.getByText(/Sleeve session/);
		expect(chip.style.backgroundColor).toBe("rgb(198, 152, 24)");
		expect(chip).not.toHaveClass("ibCalendarEventChipPersonal");
	});

	// The behaviour this session's change actually added - a personal appointment renders
	// outlined, not filled, and its text tracks the current appearance setting instead of the
	// fixed white a filled chip uses. See Day.jsx's own comment for the full reasoning.
	it("renders a personal event's chip outlined in the owner's tagColor with a transparent fill", () => {
		const personal = shopEvent({ isPersonal: true, title: "Dentist" });
		renderDay({ savedEvents: [personal] });
		const chip = screen.getByText(/Dentist/);
		expect(chip.style.backgroundColor).toBe("transparent");
		expect(chip.style.borderColor).toBe("rgb(198, 152, 24)");
		expect(chip.style.color).toBe("var(--ib-text-primary)");
		expect(chip).toHaveClass("ibCalendarEventChipPersonal");
	});

	it("falls back to the neutral tag colour for a personal event whose owner has none set", () => {
		const personal = shopEvent({ isPersonal: true, title: "Dentist", user: { id: USER.id } });
		renderDay({ savedEvents: [personal] });
		const chip = screen.getByText(/Dentist/);
		expect(chip.style.borderColor).toBe("rgb(95, 99, 104)");
	});

	it("falls back to the linked project's title, then 'Untitled', when the event has no title", () => {
		const withProjectTitle = shopEvent({
			id: "a",
			title: null,
			projectId: "p1",
			project: { title: "Half sleeve", client: { user: { firstName: "Jon", lastName: "Snow" } } },
		});
		renderDay({ savedEvents: [withProjectTitle] });
		expect(screen.getByText(/Half sleeve/)).toBeInTheDocument();
	});

	it("shows 'Untitled' when neither the event nor a project has a title", () => {
		const bare = shopEvent({ id: "a", title: null, projectId: null, project: null });
		renderDay({ savedEvents: [bare] });
		expect(screen.getByText(/Untitled/)).toBeInTheDocument();
	});

	it("clicking the day header opens the appointment wizard for this day", async () => {
		const user = userEvent.setup();
		const { setModal, setDaySelected } = renderDay({ savedEvents: [] });

		await user.click(screen.getByText(DAY.format("DD")));

		expect(setDaySelected).toHaveBeenCalledWith(DAY);
		expect(setModal).toHaveBeenCalledTimes(1);
		const call = setModal.mock.calls[0][0];
		expect(call.isOpen).toBe(true);
		expect(call.content.type).toBe(AppointmentWizard);
		expect(call.content.props.selectedDay).toBe(DAY);
	});

	it("clicking the caller's own event opens UpdateEventDialog", async () => {
		const user = userEvent.setup();
		const evt = shopEvent();
		const { setModal } = renderDay({ savedEvents: [evt] });

		await user.click(screen.getByText(/Sleeve session/));

		const call = setModal.mock.calls[0][0];
		expect(call.content.type).toBe(UpdateEventDialog);
		expect(call.content.props.event).toBe(evt);
	});

	// A shop-connected artist's calendar shows every artist's appointments (getAppointmentsByShop
	// is shop-wide) - clicking someone else's must open the read-only view, never the edit dialog.
	// See Day.jsx's own comment on why this used to silently do nothing.
	it("clicking someone else's event opens the read-only ViewEventDialog", async () => {
		const user = userEvent.setup();
		const evt = shopEvent({ userId: "someone-else" });
		const { setModal } = renderDay({ savedEvents: [evt] });

		await user.click(screen.getByText(/Sleeve session/));

		const call = setModal.mock.calls[0][0];
		expect(call.content.type).toBe(ViewEventDialog);
		expect(call.content.props.event).toBe(evt);
	});
});
