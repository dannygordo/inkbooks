// ConsultDetail.jsx tests. This page pairs with AppointmentService.getAppointment (see that
// service's own "Consult detail view" section) - a consult Appointment has no Project of its own
// to view/edit through, so this page fetches the single appointment plus its bookingRequest field
// resolver directly, rather than going through a project page.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx: under Vitest,
// @vitejs/plugin-react compiles JSX with the classic runtime, so a component rendered by a test
// needs React in scope or it throws "React is not defined" in this file.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import ConsultDetail from "./ConsultDetail";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";

// BookSessionDatesForm pulls in useAuth (requiring a real user.userInfo.shop shape), Square
// payment UI, and its own set of mutations - none of which this page's own tests are about, so it
// is stubbed the same way Client.test.jsx stubs ClientDashboard: a fake that renders the props
// ConsultDetail passed it and lets a test drive onSuccess/onCancel directly, without needing to
// satisfy every dependency of the real form.
vi.mock("../../components/booking/BookSessionDatesForm", () => ({
	default: vi.fn(({ bookingRequestId, initialDate, consultAppointmentId, onSuccess, onCancel }) => (
		<div data-testid="book-session-form-stub">
			<span data-testid="stub-booking-request-id">{bookingRequestId}</span>
			<span data-testid="stub-consult-appointment-id">{consultAppointmentId}</span>
			<span data-testid="stub-initial-date">
				{initialDate && typeof initialDate.toISOString === "function"
					? initialDate.toISOString()
					: String(initialDate)}
			</span>
			<button onClick={() => onSuccess("project-99")}>stub-convert-with-project</button>
			<button onClick={() => onSuccess()}>stub-convert-no-project</button>
			<button onClick={() => onCancel()}>stub-cancel</button>
		</div>
	)),
}));

const APPOINTMENT_ID = "appt-1";

function baseAppointment(overrides = {}) {
	return {
		__typename: "Appointment",
		id: APPOINTMENT_ID,
		title: "Consult",
		description: null,
		appointmentType: "consult",
		appointmentDate: "2026-09-01T15:00:00.000Z",
		durationMinutes: 30,
		appointmentEnd: "2026-09-01T15:30:00.000Z",
		appointmentStatus: "scheduled",
		projectId: null,
		bookingRequestId: "br-1",
		bookingRequest: {
			__typename: "BookingRequest",
			id: "br-1",
			status: "consult_booked",
			description: "Small script piece, forearm.",
			placement: "Forearm",
			size: "3 inches",
			budget: "$150",
			isCoverUp: false,
			referenceImages: [],
			client: {
				__typename: "Client",
				id: "client-1",
				firstName: "Renee",
				lastName: "Wolf",
				email: "renee@example.com",
				phone: "555-0100",
			},
		},
		...overrides,
	};
}

function appointmentMock(appointment, appointmentId = APPOINTMENT_ID) {
	return {
		request: {
			query: AppointmentService.FETCH_APPOINTMENT,
			variables: { appointmentId },
		},
		result: { data: { getAppointment: appointment } },
	};
}

function errorMock(appointmentId = APPOINTMENT_ID) {
	return {
		request: {
			query: AppointmentService.FETCH_APPOINTMENT,
			variables: { appointmentId },
		},
		error: new Error("Network error"),
	};
}

// Route + Routes on top of MemoryRouter, the same way FormBuilder.test.jsx exercises useParams
// for real rather than stubbing it out - ConsultDetail reads appointmentId straight off the URL,
// not a prop. A second route at /project/:projectId lets tests confirm handleConverted's navigate
// call landed on the real target rather than asserting on a mocked useNavigate.
function NavigatedProjectMarker() {
	const { projectId } = useParams();
	return <div data-testid="navigated-project">{projectId}</div>;
}

function renderConsultDetail({
	appointmentId = APPOINTMENT_ID,
	mocks = [],
	setAlert = vi.fn(),
} = {}) {
	render(
		<MemoryRouter initialEntries={[`/consult/${appointmentId}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={{ user: { userInfo: { id: "user-1" } }, setAlert }}>
					<Routes>
						<Route path="/consult/:appointmentId" element={<ConsultDetail />} />
						<Route path="/project/:projectId" element={<NavigatedProjectMarker />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert };
}

describe("loading and error states", () => {
	it("shows a spinner while the appointment is loading", () => {
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });
		// MUI's CircularProgress renders with role="progressbar".
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	it("shows a not-found message when the query errors", async () => {
		renderConsultDetail({ mocks: [errorMock()] });
		expect(await screen.findByText(/Couldn't load this consult/)).toBeInTheDocument();
	});

	it("shows a not-found message when the query resolves with no appointment", async () => {
		renderConsultDetail({
			mocks: [appointmentMock(null)],
		});
		expect(await screen.findByText(/Couldn't load this consult/)).toBeInTheDocument();
		expect(await screen.findByText(/not found/)).toBeInTheDocument();
	});
});

describe("an appointment with no consult details to show", () => {
	it("shows the fallback message when appointmentType is not consult", async () => {
		renderConsultDetail({
			mocks: [appointmentMock(baseAppointment({ appointmentType: "session" }))],
		});
		expect(
			await screen.findByText(/doesn't have any consult details on file/),
		).toBeInTheDocument();
	});

	it("shows the fallback message when there is no bookingRequest at all", async () => {
		renderConsultDetail({
			mocks: [appointmentMock(baseAppointment({ bookingRequest: null }))],
		});
		expect(
			await screen.findByText(/doesn't have any consult details on file/),
		).toBeInTheDocument();
	});
});

describe("rendering a consult's details", () => {
	it("shows the client's name, status label, contact info and appointment date", async () => {
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });

		expect(await screen.findByText("Renee Wolf")).toBeInTheDocument();
		expect(screen.getByText("Consult booked")).toBeInTheDocument();
		expect(screen.getByText(/renee@example.com/)).toBeInTheDocument();
		expect(screen.getByText(/555-0100/)).toBeInTheDocument();
	});

	it("shows the intake description, placement, size and budget when present", async () => {
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });

		await screen.findByText("Renee Wolf");
		expect(screen.getByText("Small script piece, forearm.")).toBeInTheDocument();
		expect(screen.getByText("Placement: Forearm")).toBeInTheDocument();
		expect(screen.getByText("Size: 3 inches")).toBeInTheDocument();
		expect(screen.getByText("Budget: $150")).toBeInTheDocument();
		expect(screen.queryByText("Cover-up / touch-up")).not.toBeInTheDocument();
	});

	it("omits placement/size/budget when not set, and shows the cover-up flag when set", async () => {
		renderConsultDetail({
			mocks: [
				appointmentMock(
					baseAppointment({
						bookingRequest: {
							...baseAppointment().bookingRequest,
							placement: null,
							size: null,
							budget: null,
							isCoverUp: true,
						},
					}),
				),
			],
		});

		await screen.findByText("Renee Wolf");
		expect(screen.queryByText(/^Placement:/)).not.toBeInTheDocument();
		expect(screen.queryByText(/^Size:/)).not.toBeInTheDocument();
		expect(screen.queryByText(/^Budget:/)).not.toBeInTheDocument();
		expect(screen.getByText("Cover-up / touch-up")).toBeInTheDocument();
	});

	it("shows reference images as links when present", async () => {
		renderConsultDetail({
			mocks: [
				appointmentMock(
					baseAppointment({
						bookingRequest: {
							...baseAppointment().bookingRequest,
							referenceImages: ["https://example.com/ref1.jpg", "https://example.com/ref2.jpg"],
						},
					}),
				),
			],
		});

		await screen.findByText("Renee Wolf");
		const links = screen.getAllByRole("link", { name: "Reference" });
		expect(links).toHaveLength(2);
		expect(links[0]).toHaveAttribute("href", "https://example.com/ref1.jpg");
		expect(links[0]).toHaveAttribute("target", "_blank");
		expect(links[1]).toHaveAttribute("href", "https://example.com/ref2.jpg");
	});

	it("shows no reference-images block when the list is empty", async () => {
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });
		await screen.findByText("Renee Wolf");
		expect(screen.queryByRole("link", { name: "Reference" })).not.toBeInTheDocument();
	});

	it.each([
		["consult_booked", "Consult booked"],
		["session_booked", "Session booked"],
		["not_booked", "Not booked"],
		["declined", "Declined"],
	])("maps bookingRequest.status %s to the label %s", async (status, label) => {
		renderConsultDetail({
			mocks: [
				appointmentMock(
					baseAppointment({
						bookingRequest: { ...baseAppointment().bookingRequest, status },
					}),
				),
			],
		});
		expect(await screen.findByText(label)).toBeInTheDocument();
	});

	it("falls back to the raw status string for an unrecognized status", async () => {
		renderConsultDetail({
			mocks: [
				appointmentMock(
					baseAppointment({
						bookingRequest: { ...baseAppointment().bookingRequest, status: "some_new_status" },
					}),
				),
			],
		});
		expect(await screen.findByText("some_new_status")).toBeInTheDocument();
	});
});

describe("converting a consult to a session", () => {
	it("shows Convert to Session only when the booking request is still consult_booked", async () => {
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });
		expect(await screen.findByRole("button", { name: "Convert to Session" })).toBeInTheDocument();
	});

	it("hides Convert to Session and shows the already-booked note once session_booked", async () => {
		renderConsultDetail({
			mocks: [
				appointmentMock(
					baseAppointment({
						bookingRequest: { ...baseAppointment().bookingRequest, status: "session_booked" },
					}),
				),
			],
		});
		await screen.findByText("Renee Wolf");
		expect(screen.queryByRole("button", { name: "Convert to Session" })).not.toBeInTheDocument();
		expect(
			screen.getByText("This consult already led to a booked session."),
		).toBeInTheDocument();
	});

	it("opens BookSessionDatesForm with the booking request id, consult appointment id and initial date, and hides the button while it's open", async () => {
		const user = userEvent.setup();
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });

		const convertButton = await screen.findByRole("button", { name: "Convert to Session" });
		await user.click(convertButton);

		expect(screen.getByTestId("book-session-form-stub")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Convert to Session" })).not.toBeInTheDocument();
		expect(screen.getByTestId("stub-booking-request-id")).toHaveTextContent("br-1");
		expect(screen.getByTestId("stub-consult-appointment-id")).toHaveTextContent(APPOINTMENT_ID);
		// initialDate is moment(appointment.appointmentDate) - confirms the appointment's own date
		// was passed through rather than defaulting to "now".
		expect(screen.getByTestId("stub-initial-date")).toHaveTextContent("2026-09-01T15:00:00.000Z");
	});

	it("closes the form again when onCancel fires, and shows the Convert button once more", async () => {
		const user = userEvent.setup();
		renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });

		await user.click(await screen.findByRole("button", { name: "Convert to Session" }));
		await user.click(screen.getByRole("button", { name: "stub-cancel" }));

		expect(screen.queryByTestId("book-session-form-stub")).not.toBeInTheDocument();
		expect(await screen.findByRole("button", { name: "Convert to Session" })).toBeInTheDocument();
	});

	it("on success with a projectId, closes the form, alerts success, and navigates to that project", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });

		await user.click(await screen.findByRole("button", { name: "Convert to Session" }));
		await user.click(screen.getByRole("button", { name: "stub-convert-with-project" }));

		expect(screen.queryByTestId("book-session-form-stub")).not.toBeInTheDocument();
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "success",
				message: "Session booked.",
			}),
		);
		expect(await screen.findByTestId("navigated-project")).toHaveTextContent("project-99");
	});

	it("on success with no projectId, closes the form and alerts success, but does not navigate away", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderConsultDetail({ mocks: [appointmentMock(baseAppointment())] });

		await user.click(await screen.findByRole("button", { name: "Convert to Session" }));
		await user.click(screen.getByRole("button", { name: "stub-convert-no-project" }));

		expect(screen.queryByTestId("book-session-form-stub")).not.toBeInTheDocument();
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: true, severity: "success", message: "Session booked." }),
		);
		// Still on the consult page - no navigation happened without a projectId.
		expect(screen.getByText("Renee Wolf")).toBeInTheDocument();
		expect(screen.queryByTestId("navigated-project")).not.toBeInTheDocument();
	});
});
