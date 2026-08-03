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
import { gql } from "@apollo/client";
import UpdateEventDialog from "./UpdateEventDialog";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";

const USER = {
	id: "artist-1",
	firstName: "Gendry",
	lastName: "Baratheon",
	userInfo: { shop: { id: "shop-1" } },
};

// See the matching note in CreateEventDialog.test.jsx - ProjectService doesn't export this
// document directly, so it's mirrored here for MockedProvider's request matching.
const GET_PROJECTS_BY_ARTIST = gql`
	query GetProjectsByArtist($artistId: ID!) {
		getProjectsByArtist(artistId: $artistId) {
			id
			title
			description
			client {
				user {
					id
					firstName
					lastName
					avatar
				}
			}
			artist {
				user {
					id
					firstName
					lastName
					avatar
				}
			}
		}
	}
`;

function projectsByArtistMock(artistId, projects = []) {
	return {
		request: { query: GET_PROJECTS_BY_ARTIST, variables: { artistId } },
		result: { data: { getProjectsByArtist: projects } },
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
		shopCutAmount: null,
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
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={contextValue}>
				<UpdateEventDialog selectedDay={new Date("2026-08-01T12:00:00Z")} event={event} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return contextValue;
}

describe("UpdateEventDialog", () => {
	it("renders the existing appointment's values", async () => {
		const event = baseEvent();
		renderDialog({ event, mocks: [projectsByArtistMock(USER.id)] });

		expect(await screen.findByDisplayValue("Sleeve session 2")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Continuing the sleeve piece")).toBeInTheDocument();
		expect(screen.getByText(/update/i)).toBeInTheDocument();
		// event.userId === user.id, so the Delete button should be present.
		expect(screen.getByText(/delete/i)).toBeInTheDocument();
	});

	// Regression test locking in the shop-cut panel's removal (see UpdateEventDialog.jsx's own
	// comment) - it used to render whenever event.shopId was set; confirms it doesn't come back.
	it("never shows a shop-cut panel, even when the appointment has a shopId", async () => {
		const event = baseEvent({ shopId: "shop-1", shopCutStatus: "unpaid", shopCutAmount: 80 });
		renderDialog({ event, mocks: [projectsByArtistMock(USER.id)] });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.queryByText(/shop cut:/i)).not.toBeInTheDocument();
		expect(screen.queryByLabelText(/shop cut amount/i)).not.toBeInTheDocument();
		expect(screen.queryByText("Send Square Invoice")).not.toBeInTheDocument();
		expect(screen.queryByText("Mark as Paid (cash)")).not.toBeInTheDocument();
	});

	it("does not render a Delete button when the logged-in user isn't the appointment's own artist", async () => {
		const event = baseEvent({ userId: "someone-else" });
		renderDialog({ event, mocks: [projectsByArtistMock(USER.id)] });

		await screen.findByDisplayValue("Sleeve session 2");
		expect(screen.queryByText(/delete/i)).not.toBeInTheDocument();
	});

	it("clicking DELETE calls deleteAppointment and closes the modal", async () => {
		const user = userEvent.setup();
		const event = baseEvent();
		const mocks = [
			projectsByArtistMock(USER.id),
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
