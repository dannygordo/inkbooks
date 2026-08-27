// BookSessionDatesForm.jsx tests. This form books one or more session-type Appointments off a
// BookingRequest - the first sitting always through convertBookingRequest (which is what actually
// creates the Project), every additional sitting through a plain createAppointment against the
// resulting projectId - plus an optional deposit against the consult this conversion is happening
// from, and (for a Square deposit) a follow-up card charge.
//
// useMutation is mocked directly, the same way AppointmentWizard.test.jsx mocks it - by document
// identity, not call order, since this component calls it three times (convertBookingRequest,
// createAppointment, recordDeposit) and every additional-session createAppointment call carries a
// `createdAt`/`updatedAt` generated fresh at submit time (`new Date().toISOString()`), which a
// MockedProvider exact-variables mock can never match. useApolloClient is left real (via
// MockedProvider, mocks left empty) purely so refetchAppointments' `client.refetchQueries` call has
// a context to run against - nothing is actually mounted for it to refetch, so it resolves as a
// no-op the same way DaySchedule.test.jsx's own unrelated queries do.
//
// DaySchedule is mocked to a trivial stub - same rationale as AppointmentWizard.test.jsx's own
// mocking of AppointmentSlotPicker: it owns its own Apollo query and has its own test file
// (DaySchedule.test.jsx), so it's somebody else's test file, not this one's.
//
// IBSquarePaymentForm is mocked the same way for the same reason (its own component, out of this
// review's scope, with real Square SDK loading this test has no business exercising) - a stub that
// renders its props and lets a test drive onSuccess/onError directly, the same shape
// ConsultDetail.test.jsx uses to stub BookSessionDatesForm itself one layer up.
//
// Explicit React import - see the note in DaySchedule.test.jsx/EntityWizard.test.jsx: under
// Vitest, @vitejs/plugin-react compiles test-file JSX with the classic runtime, so a component
// rendered by a test needs React in scope explicitly.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import moment from "moment";
import BookSessionDatesForm from "./BookSessionDatesForm";
import { AuthContext } from "../../context/auth";
import BookingRequestService from "../../services/BookingRequestService";
import { AppointmentService } from "../../services/AppointmentService";
import DepositService from "../../services/DepositService";

vi.mock("../appointments/DaySchedule", () => ({ default: () => null }));

vi.mock("../IBSquarePayments/IBSquarePaymentForm", () => ({
	default: ({ amountCents, appointmentId, chargeType, onSuccess, onError }) => (
		<div data-testid="square-form-stub">
			<span data-testid="square-amount">{amountCents}</span>
			<span data-testid="square-appointment-id">{appointmentId}</span>
			<span data-testid="square-charge-type">{chargeType}</span>
			<button onClick={() => onSuccess("sq-payment-1")}>stub-charge-success</button>
			<button onClick={() => onError("Card declined")}>stub-charge-error</button>
		</div>
	),
}));

const { convertBookingRequestMock, createAppointmentMock, recordDepositMock, useMutationMock } =
	vi.hoisted(() => ({
		convertBookingRequestMock: vi.fn(),
		createAppointmentMock: vi.fn(),
		recordDepositMock: vi.fn(),
		useMutationMock: vi.fn(),
	}));

vi.mock("@apollo/client", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, useMutation: useMutationMock };
});

const USER = { id: "artist-1", userInfo: { shop: { id: "shop-1" } } };
const BOOKING_REQUEST_ID = "br-1";
const CONSULT_APPOINTMENT_ID = "consult-1";
const INITIAL_DATE = moment("2026-09-10T14:00:00.000Z");

function setup({
	convertImpl = vi.fn().mockResolvedValue({
		data: {
			convertBookingRequest: {
				id: BOOKING_REQUEST_ID,
				status: "session_booked",
				resultingAppointmentId: "appt-new-1",
				resultingAppointment: { id: "appt-new-1", projectId: "project-1" },
			},
		},
	}),
	createAppointmentImpl = vi.fn().mockResolvedValue({ data: { createAppointment: { id: "appt-second" } } }),
	recordDepositImpl = vi.fn().mockResolvedValue({ data: { recordDeposit: { id: CONSULT_APPOINTMENT_ID } } }),
	...props
} = {}) {
	convertBookingRequestMock.mockImplementation(convertImpl);
	createAppointmentMock.mockImplementation(createAppointmentImpl);
	recordDepositMock.mockImplementation(recordDepositImpl);

	useMutationMock.mockImplementation((doc) => {
		if (doc === BookingRequestService.CONVERT_BOOKING_REQUEST_MUTATION) {
			return [convertBookingRequestMock];
		}
		if (doc === AppointmentService.CREATE_APPOINTMENT) {
			return [createAppointmentMock];
		}
		if (doc === DepositService.RECORD_DEPOSIT) {
			return [recordDepositMock];
		}
		return [vi.fn()];
	});

	const utils = render(
		<MockedProvider mocks={[]} addTypename={false}>
			<AuthContext.Provider value={{ user: USER }}>
				<BookSessionDatesForm
					bookingRequestId={BOOKING_REQUEST_ID}
					initialDate={INITIAL_DATE}
					{...props}
				/>
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { ...utils, convertBookingRequestMock, createAppointmentMock, recordDepositMock };
}

describe("BookSessionDatesForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("initial render", () => {
		it("renders a project title field and one session row, with no deposit fields when there's no consult", () => {
			setup();

			expect(screen.getByPlaceholderText("e.g. Sleeve piece")).toBeInTheDocument();
			expect(screen.getByText("Session 1", { selector: "label" })).toBeInTheDocument();
			expect(screen.queryByText("Session 2", { selector: "label" })).not.toBeInTheDocument();
			expect(screen.queryByText("Deposit taken today $")).not.toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
		});

		it("shows the deposit field only when a consultAppointmentId is given", () => {
			setup({ consultAppointmentId: CONSULT_APPOINTMENT_ID });
			expect(screen.getByText("Deposit taken today $")).toBeInTheDocument();
		});

		it("shows a Cancel button only when onCancel is given, and calls it on click", async () => {
			const user = userEvent.setup();
			const onCancel = vi.fn();
			setup({ onCancel });

			const cancelButton = screen.getByRole("button", { name: "Cancel" });
			await user.click(cancelButton);
			expect(onCancel).toHaveBeenCalledTimes(1);
		});

		it("renders no Cancel button when onCancel is not given", () => {
			setup();
			expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
		});
	});

	describe("adding and removing session rows", () => {
		it("adds another session row a week after the last, carrying its duration forward, and shows a remove button", async () => {
			const user = userEvent.setup();
			setup();

			await user.click(screen.getByRole("button", { name: "Add another session" }));

			expect(screen.getByText("Session 2", { selector: "label" })).toBeInTheDocument();
			expect(screen.getAllByLabelText("Remove this session")).toHaveLength(2);
		});

		it("removes a session row, and hides the remove buttons again once only one is left", async () => {
			const user = userEvent.setup();
			setup();

			await user.click(screen.getByRole("button", { name: "Add another session" }));
			expect(screen.getByText("Session 2", { selector: "label" })).toBeInTheDocument();

			const [removeFirst] = screen.getAllByLabelText("Remove this session");
			await user.click(removeFirst);

			expect(screen.queryByText("Session 2", { selector: "label" })).not.toBeInTheDocument();
			expect(screen.queryByLabelText("Remove this session")).not.toBeInTheDocument();
		});
	});

	describe("validation", () => {
		it("requires a project title before submitting", async () => {
			const user = userEvent.setup();
			setup();

			// fireEvent.submit rather than a real click-through: the project title input carries a
			// native `required` attribute, and clicking a submit button in a form without
			// noValidate runs the browser's own constraint validation first, which would block the
			// submit event (and this component's own handleSubmit) before its JS-level check here
			// ever ran (same reasoning as ShopCutRatePanel.test.jsx's own validation tests).
			fireEvent.submit(screen.getByRole("button", { name: "Confirm" }).closest("form"));

			expect(screen.getByText("Give the project a title first.")).toBeInTheDocument();
			expect(convertBookingRequestMock).not.toHaveBeenCalled();
		});

		it("requires a length for every session", async () => {
			const user = userEvent.setup();
			setup();

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			// Zero the only session's duration via DurationPicker's Hours field (it starts at
			// 3h/0m = SESSION_DEFAULT_MINUTES) - clearing a numeric field parses as NaN, which
			// DurationPicker's own emit() floors to 0 rather than leaving the old value in place.
			// Two "Hours" spinbuttons render on this page: DurationPicker's own real
			// `<input type="number">`, AND IBDateTimePicker's sectioned MobileDateTimePicker field,
			// whose hour segment is a `<span role="spinbutton" aria-label="Hours">` (MUI X's
			// accessible-segment pattern, not a real input) - `getByRole` can't tell them apart by
			// name alone, so pick the actual `<input>` element out of both matches.
			const hoursInput = screen
				.getAllByRole("spinbutton", { name: "Hours" })
				.find((el) => el.tagName === "INPUT");
			await user.clear(hoursInput);
			await user.click(screen.getByRole("button", { name: "Confirm" }));

			expect(screen.getByText("Give every session a length.")).toBeInTheDocument();
			expect(convertBookingRequestMock).not.toHaveBeenCalled();
		});
	});

	describe("submitting with a single session and no consult", () => {
		it("shows a submitting state while convertBookingRequest is in flight, then calls onSuccess with the new projectId", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			// A deliberately controlled, never-auto-resolving promise (rather than a MockedProvider
			// `delay`) so the "Booking..." submitting state can be asserted deterministically before
			// resolving it by hand - a plain mockResolvedValue's promise can settle before the
			// assertion below even runs (see DaySchedule.test.jsx-adjacent flakiness notes on fast
			// mocks racing an assertion).
			let resolveConvert;
			const pendingConvert = new Promise((resolve) => {
				resolveConvert = resolve;
			});
			setup({ onSuccess, convertImpl: vi.fn().mockReturnValue(pendingConvert) });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.click(screen.getByRole("button", { name: "Confirm" }));

			expect(screen.getByText("Booking...")).toBeInTheDocument();
			expect(convertBookingRequestMock).toHaveBeenCalledTimes(1);
			expect(convertBookingRequestMock.mock.calls[0][0].variables).toEqual({
				bookingRequestId: BOOKING_REQUEST_ID,
				outcome: "session_booked",
				appointmentInput: {
					appointmentDate: INITIAL_DATE.toISOString(),
					durationMinutes: 180,
					shopCutStatus: "unpaid",
					appointmentStatus: "scheduled",
				},
				projectTitle: "Sleeve piece",
			});

			resolveConvert({
				data: {
					convertBookingRequest: {
						id: BOOKING_REQUEST_ID,
						status: "session_booked",
						resultingAppointmentId: "appt-new-1",
						resultingAppointment: { id: "appt-new-1", projectId: "project-1" },
					},
				},
			});

			await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("project-1"));
			expect(screen.queryByText("Booking...")).not.toBeInTheDocument();
			expect(createAppointmentMock).not.toHaveBeenCalled();
		});

		it("shows the server's error message and stays on the form when the mutation fails", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({ onSuccess, convertImpl: vi.fn().mockRejectedValue(new Error("Network error")) });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.click(screen.getByRole("button", { name: "Confirm" }));

			expect(await screen.findByText("Network error")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
			expect(onSuccess).not.toHaveBeenCalled();
		});
	});

	describe("submitting with an additional session", () => {
		it("creates a second appointment against the resulting project for the second sitting", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({ onSuccess });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.click(screen.getByRole("button", { name: "Add another session" }));
			expect(screen.getByText("Session 2", { selector: "label" })).toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Confirm" }));

			await waitFor(() => expect(createAppointmentMock).toHaveBeenCalledTimes(1));
			const secondDate = moment(INITIAL_DATE).add(1, "week");
			expect(createAppointmentMock.mock.calls[0][0].variables.appointmentInput).toMatchObject({
				projectId: "project-1",
				userId: USER.id,
				shopId: USER.userInfo.shop.id,
				title: "Sleeve piece",
				appointmentType: "session",
				shopCutStatus: "unpaid",
				appointmentStatus: "scheduled",
				appointmentDate: secondDate.toISOString(),
				durationMinutes: 180,
			});
			await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("project-1"));
		});
	});

	describe("recording a cash deposit", () => {
		it("does not require a payment method for cash, and records it against the consult", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({ onSuccess, consultAppointmentId: CONSULT_APPOINTMENT_ID });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");
			// needsMethod is true for ANY deposit amount once there's a consult - Cash still has to
			// be chosen explicitly, same as Square (see the component's own comment on why there's
			// no default method). Confirm keeps its plain label either way once a method IS chosen,
			// unlike Square's "Book and take payment".
			await user.click(screen.getByRole("button", { name: "Cash" }));
			expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();

			await user.click(screen.getByRole("button", { name: "Confirm" }));

			await waitFor(() => expect(recordDepositMock).toHaveBeenCalledTimes(1));
			expect(recordDepositMock.mock.calls[0][0].variables).toEqual({
				appointmentId: CONSULT_APPOINTMENT_ID,
				depositCents: 5000,
				paymentMethod: "cash",
			});
			await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("project-1"));
		});

		it("shows a booked-but-not-recorded error and stops, without calling onSuccess", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({
				onSuccess,
				consultAppointmentId: CONSULT_APPOINTMENT_ID,
				recordDepositImpl: vi.fn().mockRejectedValue(new Error("Deposit service unreachable")),
			});

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");
			// Cash still has to be chosen explicitly - see the matching comment on the cash-success
			// test above. Without it Confirm stays disabled and this click never lands.
			await user.click(screen.getByRole("button", { name: "Cash" }));
			await user.click(screen.getByRole("button", { name: "Confirm" }));

			expect(
				await screen.findByText(/Sessions booked, but the deposit couldn't be recorded/),
			).toBeInTheDocument();
			expect(screen.getByText(/Deposit service unreachable/)).toBeInTheDocument();
			expect(onSuccess).not.toHaveBeenCalled();
		});
	});

	describe("a Square deposit", () => {
		it("disables Confirm until a payment method is chosen once there's a deposit amount", async () => {
			const user = userEvent.setup();
			setup({ consultAppointmentId: CONSULT_APPOINTMENT_ID });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");

			expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();

			await user.click(screen.getByRole("button", { name: "Card (Square)" }));
			expect(screen.getByRole("button", { name: "Book and take payment" })).toBeEnabled();
		});

		it("records a pending deposit, then swaps the form for the Square payment stub", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({ onSuccess, consultAppointmentId: CONSULT_APPOINTMENT_ID });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");
			await user.click(screen.getByRole("button", { name: "Card (Square)" }));
			await user.click(screen.getByRole("button", { name: "Book and take payment" }));

			expect(await screen.findByTestId("square-form-stub")).toBeInTheDocument();
			expect(recordDepositMock.mock.calls[0][0].variables).toEqual({
				appointmentId: CONSULT_APPOINTMENT_ID,
				depositCents: 5000,
				paymentMethod: "square",
				pending: true,
			});
			expect(screen.getByTestId("square-amount")).toHaveTextContent("5000");
			expect(screen.getByTestId("square-appointment-id")).toHaveTextContent(CONSULT_APPOINTMENT_ID);
			expect(screen.getByTestId("square-charge-type")).toHaveTextContent("deposit");
			expect(screen.getByText(/Sessions booked\. Take the \$50\.00 deposit/)).toBeInTheDocument();
			// onSuccess hasn't fired yet - only skipping or a successful charge should trigger it.
			expect(onSuccess).not.toHaveBeenCalled();
		});

		it("calls onSuccess with the project id once the Square charge succeeds", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({ onSuccess, consultAppointmentId: CONSULT_APPOINTMENT_ID });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");
			await user.click(screen.getByRole("button", { name: "Card (Square)" }));
			await user.click(screen.getByRole("button", { name: "Book and take payment" }));

			await screen.findByTestId("square-form-stub");
			await user.click(screen.getByRole("button", { name: "stub-charge-success" }));

			await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("project-1"));
		});

		it("lets the artist skip the deposit from the pending-card screen without charging", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({ onSuccess, consultAppointmentId: CONSULT_APPOINTMENT_ID });

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");
			await user.click(screen.getByRole("button", { name: "Card (Square)" }));
			await user.click(screen.getByRole("button", { name: "Book and take payment" }));

			await screen.findByTestId("square-form-stub");
			await user.click(screen.getByRole("button", { name: "Skip the deposit for now" }));

			expect(onSuccess).toHaveBeenCalledWith("project-1");
		});

		it("shows a booked-but-not-recorded error and keeps the sessions booked when recording the pending deposit fails", async () => {
			const user = userEvent.setup();
			const onSuccess = vi.fn();
			setup({
				onSuccess,
				consultAppointmentId: CONSULT_APPOINTMENT_ID,
				recordDepositImpl: vi.fn().mockRejectedValue(new Error("Deposit service unreachable")),
			});

			await user.type(screen.getByPlaceholderText("e.g. Sleeve piece"), "Sleeve piece");
			await user.type(screen.getByPlaceholderText("0"), "50");
			await user.click(screen.getByRole("button", { name: "Card (Square)" }));
			await user.click(screen.getByRole("button", { name: "Book and take payment" }));

			expect(
				await screen.findByText(/Sessions booked, but the deposit couldn't be recorded/),
			).toBeInTheDocument();
			// Still on the form (not swapped for the payment stub) since the deposit was never
			// recorded as pending.
			expect(screen.queryByTestId("square-form-stub")).not.toBeInTheDocument();
			expect(onSuccess).not.toHaveBeenCalled();
		});
	});
});
