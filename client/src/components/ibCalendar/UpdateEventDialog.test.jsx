// UpdateEventDialog.jsx tests. CreateEventDialog.jsx (and its own test file) were deleted as
// dead code once AppointmentWizard.jsx replaced it at both real entry points - see
// PRODUCTION_ROADMAP.md's Phase 7 section. Focuses on editing/deleting an existing appointment.
// The dialog used to also show a shop-cut status readout (and an editable amount field) whenever
// the appointment had a shopId - removed entirely (see UpdateEventDialog.jsx's own comment on
// why); paying/invoicing a shop cut lives exclusively on the artist dashboard's "Shop Cut Payouts"
// list now (see ShopCutPayoutList.jsx).
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import UpdateEventDialog from "./UpdateEventDialog";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";

const USER = {
	id: "artist-1",
	firstName: "Gendry",
	lastName: "Baratheon",
	userInfo: { shop: { id: "shop-1" } },
};

// The GET_PROJECTS_BY_ARTIST mock that used to live here is gone along with the query itself -
// the dialog no longer fetches the artist's project list, because the project dropdown it fed is
// now a label sourced from event.project (see UpdateEventDialog.jsx's header comment).

// The dialog fetches the full appointment (for its BookingRequest) only when the appointment is a
// consult - a session skips the query entirely, which is why the session cases below need no
// mock at all. Built from AppointmentService's own exported document rather than a hand-copied
// one, so the mock can't drift away from the query the component actually runs.
function consultMock(appointmentId, status) {
	return {
		request: {
			query: AppointmentService.FETCH_APPOINTMENT,
			variables: { appointmentId },
		},
		result: {
			data: {
				getAppointment: {
					__typename: "Appointment",
					id: appointmentId,
					title: "Consult - Arya Stark",
					description: null,
					appointmentType: "consult",
					appointmentDate: "2026-08-01T12:00:00.000Z",
					appointmentStatus: "scheduled",
					projectId: null,
					bookingRequestId: "br-1",
					bookingRequest: {
						__typename: "BookingRequest",
						id: "br-1",
						status,
						description: "Wolf on the forearm",
						placement: "Forearm",
						size: "Medium",
						budget: "500",
						isCoverUp: false,
						referenceImages: [],
						client: {
							__typename: "Client",
							id: "client-1",
							firstName: "Arya",
							lastName: "Stark",
							email: "arya@example.com",
							phone: "555-0100",
						},
					},
				},
			},
		},
	};
}

function baseEvent(overrides = {}) {
	return {
		id: "appt-1",
		userId: USER.id,
		projectId: null,
		shopId: null,
		title: "Sleeve session 2",
		description: "Continuing the sleeve piece",
		appointmentType: "session",
		appointmentStatus: "scheduled",
		appointmentDate: "2026-08-01T12:00:00.000Z",
		createdAt: "2026-07-01T12:00:00.000Z",
		shopCutStatus: "none",
		shopCutCents: 0,
		...overrides,
	};
}

function renderDialog({ event, mocks, contextOverrides = {} } = {}) {
	const contextValue = {
		user: USER,
		modal: { isOpen: true },
		setModal: vi.fn(),
		setAlert: vi.fn(),
		...contextOverrides,
	};
	// MemoryRouter, because the dialog calls useNavigate - "View Project" and "Convert to Session"
	// both navigate away, and react-router throws outright rather than degrading if the hook runs
	// with no Router above it. Added when those two actions were, but this file wasn't updated at
	// the time, so every test here failed on render for several commits.
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<UpdateEventDialog selectedDay={new Date("2026-08-01T12:00:00Z")} event={event} />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return contextValue;
}

describe("UpdateEventDialog", () => {
	it("renders the existing appointment's values", async () => {
		const event = baseEvent();
		renderDialog({ event });

		expect(await screen.findByDisplayValue("Sleeve session 2")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Continuing the sleeve piece")).toBeInTheDocument();
		expect(screen.getByText(/update/i)).toBeInTheDocument();
		// event.userId === user.id, so the Delete button should be present.
		expect(screen.getByText(/delete/i)).toBeInTheDocument();
	});

	// Regression test locking in the shop-cut panel's removal (see UpdateEventDialog.jsx's own
	// comment) - it used to render whenever event.shopId was set; confirms it doesn't come back.
	it("never shows a shop-cut panel, even when the appointment has a shopId", async () => {
		const event = baseEvent({ shopId: "shop-1", shopCutStatus: "unpaid", shopCutCents: 8000 });
		renderDialog({ event });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.queryByText(/shop cut:/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/shop cut amount/i)).not.toBeInTheDocument();
		expect(screen.queryByText("Send Square Invoice")).not.toBeInTheDocument();
		expect(screen.queryByText("Mark as Paid (cash)")).not.toBeInTheDocument();
	});

	// Regression test locking in that appointment type and project are labels, not inputs - the
	// wizard owns both choices at creation time and changing either from here would break the
	// consult/session invariants those choices carry (see UpdateEventDialog.jsx's header comment).
	it("shows appointment type and project as read-only labels, not dropdowns", async () => {
		const event = baseEvent({
			projectId: "project-1",
			project: { id: "project-1", title: "Half sleeve - koi" },
		});
		renderDialog({ event });

		await screen.findByDisplayValue("Sleeve session 2");
		// Display label from APPOINTMENT_TYPE, not the raw stored 'session'.
		expect(screen.getByText("Session")).toBeInTheDocument();
		expect(screen.getByText("Half sleeve - koi")).toBeInTheDocument();
		// MUI's Select renders with role="combobox" - neither field should be one any more.
		expect(screen.queryAllByRole("combobox")).toHaveLength(0);
	});

	it("falls back to a placeholder when the appointment has no project", async () => {
		// Consults and "Other" appointments have no Project at all - see models/Appointment.js.
		const event = baseEvent({ appointmentType: "consult", projectId: null, project: null });
		renderDialog({ event });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.getByText("Consult")).toBeInTheDocument();
		expect(screen.getByText("No project linked")).toBeInTheDocument();
	});

	// A session's whole point is that it belongs to a Project - the timer, notes and totals all
	// live there - so the dialog has to offer a way through to it. It previously dead-ended.
	it("offers View Project on a session bound to a project", async () => {
		const event = baseEvent({
			appointmentType: "session",
			projectId: "project-1",
			project: { id: "project-1", title: "Half sleeve - koi" },
		});
		renderDialog({ event });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.getByText(/view project/i)).toBeInTheDocument();
		expect(screen.queryByText(/convert to session/i)).not.toBeInTheDocument();
	});

	// Defensive: a session created before convertBookingRequest reliably set projectId has no
	// project to open, and a button that navigates to /project/undefined is worse than no button.
	it("does not offer View Project on a session with no project", async () => {
		const event = baseEvent({ appointmentType: "session", projectId: null, project: null });
		renderDialog({ event });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.queryByText(/view project/i)).not.toBeInTheDocument();
	});

	it("offers Convert to Session on a consult whose booking request is still consult_booked", async () => {
		const event = baseEvent({
			appointmentType: "consult",
			projectId: null,
			bookingRequestId: "br-1",
		});
		renderDialog({ event, mocks: [consultMock(event.id, "consult_booked")] });

		expect(await screen.findByText(/convert to session/i)).toBeInTheDocument();
		expect(screen.queryByText(/view project/i)).not.toBeInTheDocument();
	});

	// Same gate ConsultDetail.jsx applies - a consult that already produced a session has nothing
	// left to convert, and offering the action anyway would let an artist create a duplicate
	// project from the same intake.
	it("does not offer Convert to Session once the consult has already been converted", async () => {
		const event = baseEvent({
			appointmentType: "consult",
			projectId: null,
			bookingRequestId: "br-1",
		});
		renderDialog({ event, mocks: [consultMock(event.id, "session_booked")] });

		expect(
			await screen.findByText(/this consult already led to a booked session/i)
		).toBeInTheDocument();
		expect(screen.queryByText(/convert to session/i)).not.toBeInTheDocument();
	});

	it("does not render a Delete button when the logged-in user isn't the appointment's own artist", async () => {
		const event = baseEvent({ userId: "someone-else" });
		renderDialog({ event });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.queryByText(/delete/i)).not.toBeInTheDocument();
	});

	it("clicking DELETE calls deleteAppointment and closes the modal", async () => {
		const user = userEvent.setup();
		const event = baseEvent();
		const mocks = [
			{
				request: {
					query: AppointmentService.DELETE_APPOINTMENT,
					variables: { appointmentId: event.id },
				},
				result: { data: { deleteAppointment: "Appointment deleted successfully" } },
			},
		];
		const contextValue = renderDialog({ event, mocks });

		await screen.findByDisplayValue("Sleeve session 2");
		await user.click(screen.getByText(/delete/i));

		await waitFor(() => expect(contextValue.setModal).toHaveBeenCalledWith({ isOpen: false }));
	});
});
