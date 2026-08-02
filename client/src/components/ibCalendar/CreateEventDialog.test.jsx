// CreateEventDialog.jsx tests. Uses AuthContext.Provider directly (same pattern as Login/Register
// tests) since the component reads user/modal/setAlert straight off useAuth(), and MockedProvider
// for both the projects-by-artist query it loads on mount and the createAppointment mutation it
// fires on submit.
// Explicit React import - the app itself relies on @vitejs/plugin-react's automatic JSX runtime,
// but Vitest's transform doesn't apply it to every component rendered under a test the same way -
// see the matching note in Login.jsx/Register.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import CreateEventDialog from "./CreateEventDialog";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";

const USER = {
	id: "artist-1",
	firstName: "Gendry",
	lastName: "Baratheon",
	userInfo: { shop: { id: "shop-1" } },
};

// ProjectService.js doesn't export its GetProjectsByArtist document directly (only the
// fetchProjectsByArtist hook wrapper, which calls useQuery internally) - this mirrors that query
// closely enough for MockedProvider's request matching, same approach Login.test.jsx/
// Register.test.jsx use for their own gql documents.
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

// Empty project list - simplest fixture that satisfies the query without needing the full
// nested client/user shape IBProjectsByArtistSelect reads off each item (item.client.user.*).
function projectsByArtistMock(artistId, projects = []) {
	return {
		request: {
			query: GET_PROJECTS_BY_ARTIST,
			variables: { artistId },
		},
		result: { data: { getProjectsByArtist: projects } },
	};
}

function renderDialog({ mocks, contextOverrides = {} } = {}) {
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
				<CreateEventDialog selectedDay={new Date("2026-08-01T12:00:00Z")} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return contextValue;
}

describe("CreateEventDialog", () => {
	it("renders the appointment fields once the artist's projects load", async () => {
		renderDialog({ mocks: [projectsByArtistMock(USER.id)] });

		// getByText/getAllByText with a regex rather than an exact string for the MUI-labelled
		// fields (date picker, the two Selects) - MUI X's picker label rendering is version-
		// sensitive, and this is more resilient to a label appearing twice (visible + a11y node)
		// than an exact-string match would be.
		expect(await screen.findByPlaceholderText("Add title")).toBeInTheDocument();
		expect(screen.getAllByText(/select date/i).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/appointment type/i).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/^projects$/i).length).toBeGreaterThan(0);
		expect(screen.getByPlaceholderText("e.g. 200")).toBeInTheDocument();
		expect(screen.getByText("Save")).toBeInTheDocument();
	});

	it("on submit with no project selected: creates the appointment with the expected defaults and closes the modal", async () => {
		const user = userEvent.setup();
		const createdAppointment = {
			__typename: "Appointment",
			projectId: null,
			userId: USER.id,
			project: null,
			shopId: USER.userInfo.shop.id,
			user: { __typename: "User", id: USER.id, firstName: USER.firstName, lastName: USER.lastName, tagColor: "#fff" },
			title: "Sleeve touch-up",
			description: "",
			appointmentType: "consult",
			id: "appt-1",
			appointmentDate: "2026-08-01T12:00:00.000Z",
			shopCutStatus: "unpaid",
			shopCutAmount: null,
		};
		let capturedVariables;
		const mocks = [
			projectsByArtistMock(USER.id),
			{
				request: {
					query: AppointmentService.CREATE_APPOINTMENT,
				},
				// A variableMatcher, not a fixed `request.variables` - createdAt/updatedAt are
				// real Date.now() timestamps generated at call time, not something worth pinning
				// down exactly here. MockLink requires exactly one of variableMatcher or
				// request.variables (throws if both are present), so request.variables is
				// deliberately omitted above.
				variableMatcher: (variables) => {
					capturedVariables = variables;
					return true;
				},
				result: { data: { createAppointment: createdAppointment } },
			},
		];
		const contextValue = renderDialog({ mocks });

		await user.type(await screen.findByPlaceholderText("Add title"), "Sleeve touch-up");
		await user.click(screen.getByText("Save"));

		await waitFor(() => expect(contextValue.setModal).toHaveBeenCalledWith({ isOpen: false }));

		const input = capturedVariables.appointmentInput;
		expect(input.title).toBe("Sleeve touch-up");
		expect(input.userId).toBe(USER.id);
		expect(input.shopId).toBe(USER.userInfo.shop.id);
		expect(input.shopCutStatus).toBe("unpaid");
		expect(input.appointmentStatus).toBe("scheduled");
		expect(input.appointmentType).toBe("consult");
		expect(input.shopCutAmount).toBeNull();
		expect(input.projectId).toBeUndefined();
	});

	it("on a failed createAppointment: shows an error alert and leaves the modal open", async () => {
		const user = userEvent.setup();
		const mocks = [
			projectsByArtistMock(USER.id),
			{
				request: { query: AppointmentService.CREATE_APPOINTMENT },
				variableMatcher: () => true,
				error: new Error("Not connected to this shop"),
			},
		];
		const contextValue = renderDialog({ mocks });

		await user.type(await screen.findByPlaceholderText("Add title"), "Sleeve touch-up");
		await user.click(screen.getByText("Save"));

		await waitFor(() => expect(contextValue.setAlert).toHaveBeenCalled());
		expect(contextValue.setModal).not.toHaveBeenCalled();
		const alertArg = contextValue.setAlert.mock.calls[0][0];
		expect(alertArg.severity).toBe("error");
	});
});
