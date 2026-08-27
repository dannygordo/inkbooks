// React imported explicitly - see the note in AppointmentTypeChip.test.jsx and
// scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import AppointmentWizard from "./AppointmentWizard";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import BookingRequestService from "../../services/BookingRequestService";

// The two heavy children below are somebody else's test file (AppointmentSlotPicker has its own
// date/duration logic; IBProjectsByArtistSelect is a thin IBSelect-alike over a project list) - what
// this file is actually responsible for is the WIZARD'S OWN branching: which steps a Shop vs
// Personal choice leads to, which fields gate "Next", and which of the three mutations each path
// calls with what shape. The project select is mocked to a plain native <select> so a test can still
// drive "pick a project" with userEvent; the slot picker is mocked to nothing since every step
// already seeds startDateTime from `selectedDay` before it would ever render, so no test here needs
// to interact with it.
vi.mock("../appointments/AppointmentSlotPicker", () => ({ default: () => null }));
vi.mock("../inputs/IBProjectsByArtistSelect", () => ({
	default: ({ data, selectedVal, onChange }) => (
		<select aria-label="Project" value={selectedVal} onChange={onChange}>
			<option value="">None</option>
			{(data || []).map((p) => (
				<option key={p.id} value={p.id}>
					{p.title}
				</option>
			))}
		</select>
	),
}));

// AppointmentWizard calls useMutation three times, once per document (CREATE_APPOINTMENT,
// CREATE_BOOKING_REQUEST_MUTATION, CONVERT_BOOKING_REQUEST_MUTATION) - mocked by document identity
// rather than call order below, since call order isn't part of this component's actual contract and
// asserting on it would make a harmless refactor (reordering the three useMutation calls) fail a
// test that has nothing to do with what changed. vi.hoisted because these need to exist before
// vi.mock's factory runs, and plain top-level consts declared after vi.mock calls don't - vi.mock is
// hoisted above every import in the file, these mocks included.
const { createAppointmentMock, createBookingRequestMock, convertBookingRequestMock, useMutationMock } =
	vi.hoisted(() => ({
		createAppointmentMock: vi.fn(),
		createBookingRequestMock: vi.fn(),
		convertBookingRequestMock: vi.fn(),
		useMutationMock: vi.fn(),
	}));

vi.mock("@apollo/client", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, useMutation: useMutationMock };
});

vi.mock("../../services/ProjectService", async (importOriginal) => {
	const actual = await importOriginal();
	return { default: { ...actual.default, fetchProjectsByArtist: vi.fn() } };
});

vi.mock("../../services/ClientService", async (importOriginal) => {
	const actual = await importOriginal();
	return { default: { ...actual.default, useLazyFindClientByEmail: vi.fn() } };
});

import ProjectService from "../../services/ProjectService";
import ClientService from "../../services/ClientService";

const USER = { id: "artist-1", userInfo: { shop: { id: "shop-1" } } };
const SELECTED_DAY = moment("2026-08-20T00:00:00.000Z");

const PROJECTS = [{ id: "proj-1", title: "Half sleeve" }];

function setup({
	projects = PROJECTS,
	matchedClient = null,
	createAppointmentImpl = vi.fn().mockResolvedValue({}),
	createBookingRequestImpl = vi
		.fn()
		.mockResolvedValue({ data: { createBookingRequest: { id: "br-1" } } }),
	convertBookingRequestImpl = vi.fn().mockResolvedValue({}),
} = {}) {
	createAppointmentMock.mockImplementation(createAppointmentImpl);
	createBookingRequestMock.mockImplementation(createBookingRequestImpl);
	convertBookingRequestMock.mockImplementation(convertBookingRequestImpl);

	useMutationMock.mockImplementation((doc) => {
		if (doc === AppointmentService.CREATE_APPOINTMENT) {
			return [createAppointmentMock];
		}
		if (doc === BookingRequestService.CREATE_BOOKING_REQUEST_MUTATION) {
			return [createBookingRequestMock];
		}
		if (doc === BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION) {
			return [convertBookingRequestMock];
		}
		return [vi.fn()];
	});

	ProjectService.fetchProjectsByArtist.mockReturnValue({
		data: { getProjectsByArtist: projects },
		loading: false,
	});

	const findClientByEmail = vi.fn();
	ClientService.useLazyFindClientByEmail.mockReturnValue([
		findClientByEmail,
		{ data: matchedClient ? { findClientByEmail: matchedClient } : undefined },
	]);

	const setModal = vi.fn();
	const setAlert = vi.fn();
	const modal = { isOpen: true };
	render(
		<AuthContext.Provider value={{ user: USER, setModal, modal, setAlert }}>
			<AppointmentWizard selectedDay={SELECTED_DAY} />
		</AuthContext.Provider>,
	);
	return { setModal, setAlert, findClientByEmail };
}

async function chooseCalendar(user, label) {
	await user.click(screen.getByRole("combobox", { name: "Calendar" }));
	await user.click(screen.getByRole("option", { name: label }));
}

describe("AppointmentWizard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("defaults to the Shop calendar and asks what's being scheduled", () => {
		setup();
		expect(screen.getByText("What are you scheduling?")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Consult" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Session" })).toBeInTheDocument();
	});

	// The behaviour this session's change actually added - Personal skips the Consult/Session
	// question entirely (see AppointmentWizard.jsx's own header comment on why neither answer means
	// anything for a private entry).
	it("switching Calendar to Personal replaces the Consult/Session question with a single Continue", async () => {
		const user = userEvent.setup();
		setup();

		await chooseCalendar(user, "Personal");

		expect(screen.queryByText("What are you scheduling?")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Consult" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
	});

	it("Personal: requires a title before it will submit", async () => {
		const user = userEvent.setup();
		setup();
		await chooseCalendar(user, "Personal");
		await user.click(screen.getByRole("button", { name: "Continue" }));

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(screen.getByText("Give it a title first.")).toBeInTheDocument();
		expect(createAppointmentMock).not.toHaveBeenCalled();
	});

	it("Personal: saves with isPersonal true, appointmentType 'other', and no shopId/projectId", async () => {
		const user = userEvent.setup();
		const { setModal, setAlert } = setup();
		await chooseCalendar(user, "Personal");
		await user.click(screen.getByRole("button", { name: "Continue" }));

		await user.type(screen.getByLabelText("Title"), "Dentist appointment");
		await user.type(screen.getByLabelText("Description"), "Cleaning");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(1));
		const call = createAppointmentMock.mock.calls[0][0];
		expect(call.variables.appointmentInput).toMatchObject({
			userId: USER.id,
			isPersonal: true,
			title: "Dentist appointment",
			description: "Cleaning",
			appointmentType: "other",
		});
		expect(call.variables.appointmentInput.shopId).toBeUndefined();
		expect(call.variables.appointmentInput.projectId).toBeUndefined();
		expect(call.refetchQueries).toBe(AppointmentService.CALENDAR_REFETCH_QUERIES);

		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Personal appointment saved." }),
		);
		expect(setModal).toHaveBeenCalledWith(expect.objectContaining({ isOpen: false }));
	});

	it("Personal: a failed save shows the error inline and via alert, and leaves the modal open", async () => {
		const user = userEvent.setup();
		const { setModal, setAlert } = setup({
			createAppointmentImpl: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		await chooseCalendar(user, "Personal");
		await user.click(screen.getByRole("button", { name: "Continue" }));
		await user.type(screen.getByLabelText("Title"), "Dentist appointment");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(screen.getByText("Network error")).toBeInTheDocument());
		expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ message: "Network error" }));
		expect(setModal).not.toHaveBeenCalled();
	});

	it("Consult: Next is blocked without a valid email, then without a name for a new client", async () => {
		const user = userEvent.setup();
		setup();
		await user.click(screen.getByRole("button", { name: "Consult" }));
		expect(screen.getByLabelText("Client email")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("Enter a valid client email first.")).toBeInTheDocument();

		await user.type(screen.getByLabelText("Client email"), "new.client@example.com");
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(
			screen.getByText("First and last name are required for a new client."),
		).toBeInTheDocument();
	});

	// The debounced lookup itself is ClientService's own concern (mocked here) - what belongs to
	// this component is that a match short-circuits the manual name/phone entry and Next proceeds
	// straight through using the matched record.
	it("Consult: a matched client shows a Found card and skips manual name entry on Next", async () => {
		const user = userEvent.setup();
		setup({
			matchedClient: {
				email: "known@example.com",
				firstName: "Jon",
				lastName: "Snow",
				phone: "555-1234",
			},
		});
		await user.click(screen.getByRole("button", { name: "Consult" }));
		await user.type(screen.getByLabelText("Client email"), "known@example.com");

		expect(await screen.findByText(/Found: Jon Snow/)).toBeInTheDocument();
		expect(screen.queryByLabelText("First Name")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("What's the idea? (required)")).toBeInTheDocument();
	});

	it("Consult: full happy path calls createBookingRequest then convertBookingRequest with outcome consult_booked", async () => {
		const user = userEvent.setup();
		const { setModal, setAlert } = setup();
		await user.click(screen.getByRole("button", { name: "Consult" }));
		await user.type(screen.getByLabelText("Client email"), "new.client@example.com");
		await user.type(screen.getByLabelText("First Name"), "Arya");
		await user.type(screen.getByLabelText("Last Name"), "Stark");
		await user.click(screen.getByRole("button", { name: "Next" }));

		// intake-details - no Project Title field for a consult.
		expect(screen.queryByLabelText("Project Title")).not.toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("Describe the idea first.")).toBeInTheDocument();
		await user.type(screen.getByLabelText("What's the idea? (required)"), "Small script");
		await user.click(screen.getByRole("button", { name: "Next" }));

		// datetime step - submit.
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(convertBookingRequestMock).toHaveBeenCalledTimes(1));
		expect(createBookingRequestMock).toHaveBeenCalledTimes(1);
		expect(createBookingRequestMock.mock.calls[0][0].variables.bookingRequestInput).toMatchObject({
			artistId: USER.id,
			firstName: "Arya",
			lastName: "Stark",
			email: "new.client@example.com",
			source: "artist_created",
		});
		const convertCall = convertBookingRequestMock.mock.calls[0][0];
		expect(convertCall.variables.bookingRequestId).toBe("br-1");
		expect(convertCall.variables.outcome).toBe("consult_booked");
		expect(convertCall.variables.projectTitle).toBeUndefined();

		expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ message: "Consult saved." }));
		expect(setModal).toHaveBeenCalledWith(expect.objectContaining({ isOpen: false }));
	});

	it("Session (new project): requires a project title, and converts with outcome session_booked", async () => {
		const user = userEvent.setup();
		setup();
		await user.click(screen.getByRole("button", { name: "Session" }));

		// session-project step - "New project" skips straight to the shared client-email step.
		await user.click(screen.getByRole("radio", { name: "New project" }));
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByLabelText("Client email")).toBeInTheDocument();

		await user.type(screen.getByLabelText("Client email"), "new.client@example.com");
		await user.type(screen.getByLabelText("First Name"), "Sansa");
		await user.type(screen.getByLabelText("Last Name"), "Stark");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(screen.getByLabelText("Project Title")).toBeInTheDocument();
		await user.type(screen.getByLabelText("What's the idea? (required)"), "Full back piece");
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("A project title is required for a session.")).toBeInTheDocument();

		await user.type(screen.getByLabelText("Project Title"), "Back piece");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(convertBookingRequestMock).toHaveBeenCalledTimes(1));
		const convertCall = convertBookingRequestMock.mock.calls[0][0];
		expect(convertCall.variables.outcome).toBe("session_booked");
		expect(convertCall.variables.projectTitle).toBe("Back piece");
	});

	it("Session (existing project): requires picking a project, then creates the appointment directly against it", async () => {
		const user = userEvent.setup();
		const { setModal, setAlert } = setup();
		await user.click(screen.getByRole("button", { name: "Session" }));

		// "Existing project" is the default radio - Next with nothing picked is blocked.
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(screen.getByText("Pick a project first.")).toBeInTheDocument();

		await userEvent.selectOptions(screen.getByRole("combobox", { name: "Project" }), "proj-1");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(1));
		// This path never touches the booking-request pipeline at all - the project already has a
		// client, so there's no intake to run.
		expect(createBookingRequestMock).not.toHaveBeenCalled();
		expect(convertBookingRequestMock).not.toHaveBeenCalled();

		const call = createAppointmentMock.mock.calls[0][0];
		expect(call.variables.appointmentInput).toMatchObject({
			projectId: "proj-1",
			userId: USER.id,
			shopId: "shop-1",
			title: "Half sleeve",
			appointmentType: "session",
		});
		expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ message: "Session saved." }));
		expect(setModal).toHaveBeenCalledWith(expect.objectContaining({ isOpen: false }));
	});
});
