// SessionDetail.jsx tests. See the component's own header comment: opened in the global modal from
// ProjectSessionsList, this is the timer/notes/money/adjustments/deposits view for a single
// session, plus editable date/time, Close Session and Delete Session.
//
// AppointmentService.useChargeQuote (the LAZY hook backing "Charge via Square") and
// DepositService.getAvailableDeposits are mocked directly, the same "don't hand-build a
// MockedProvider mock for every read" reasoning ArtistPerformancePanel.test.jsx uses - a lazy
// query's trigger function is far simpler to control as a plain vi.fn() than to drive through a
// mocked network response. Every other mutation (timers, save, delete, adjustments, deposits) and
// the live/save-time charge quote (a plain apolloClient.query() call - see the component's own
// getFreshQuote comment on why it isn't the lazy hook) go through a real MockedProvider, since
// this file's job includes confirming the right variables go out.
//
// IBSquarePaymentForm (components/IBSquarePayments/ - explicitly out of scope to modify) and
// SendAutoResponseButton (its own full test file already) are mocked out entirely - the same
// "don't exercise somebody else's component" pattern IBPageActionBar.test.jsx uses for the wizards
// it opens.
//
// Sessions default to a zero subtotal/tip in these fixtures wherever the test doesn't care about
// the live money figures - getFreshQuote short-circuits to `null` for a subtotal <= 0 (see its own
// comment), which keeps Save/Close/Delete/Adjustments/Deposits tests from needing a charge-quote
// mock at all. Only the "Charge via Square" tests type in a real subtotal and mock that query.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";
import { MockedProvider } from "@apollo/client/testing";
import SessionDetail from "./SessionDetail";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import DepositService from "../../services/DepositService";

vi.mock("../../services/AppointmentService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		AppointmentService: {
			...actual.AppointmentService,
			useChargeQuote: vi.fn(),
		},
	};
});

vi.mock("../../services/DepositService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		default: {
			...actual.default,
			getAvailableDeposits: vi.fn(),
		},
	};
});

vi.mock("../autoResponses/SendAutoResponseButton", () => ({
	default: vi.fn(({ clientId, appointmentId }) => (
		<div data-testid="send-auto-response">
			{clientId}:{appointmentId}
		</div>
	)),
}));

vi.mock("../IBSquarePayments/IBSquarePaymentForm", () => ({
	default: vi.fn(({ amountCents, appointmentId, applyFeeOffset, tipCents, note, onSuccess, onError }) => (
		<div data-testid="square-payment-form">
			<span data-testid="square-amount">{amountCents}</span>
			<span data-testid="square-appointment-id">{appointmentId}</span>
			<span data-testid="square-fee-offset">{String(applyFeeOffset)}</span>
			<span data-testid="square-tip">{tipCents}</span>
			<span data-testid="square-note">{note}</span>
			<button onClick={onSuccess}>square success</button>
			<button onClick={() => onError("card declined")}>square fail</button>
		</div>
	)),
}));

function appointment(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "sess-1",
		projectId: "proj-1",
		userId: "artist-1",
		shopId: null,
		title: "Full Sleeve",
		description: "",
		appointmentType: "session",
		appointmentDate: "2026-08-10T14:00:00.000Z",
		durationMinutes: 180,
		appointmentEnd: "2026-08-10T17:00:00.000Z",
		appointmentStatus: "scheduled",
		subtotalCents: 0,
		taxCents: 0,
		feeCents: 0,
		tipCents: 0,
		totalCents: 0,
		shopCutCents: 0,
		shopCutStatus: "none",
		shopCutPercentApplied: null,
		depositCents: 0,
		depositStatus: null,
		depositCreditCents: 0,
		depositCreditFromAppointmentId: null,
		timerStatus: "stopped",
		timerStartedAt: null,
		accumulatedSeconds: 0,
		sessionNotes: "",
		adjustments: [],
		...overrides,
	};
}

function project(overrides = {}) {
	return {
		id: "proj-1",
		title: "Full Sleeve",
		clientId: "client-1",
		artistId: "artist-1",
		artist: { billingType: "hourly", hourlyRate: 150, flatRate: 0, shop: null },
		...overrides,
	};
}

function setupHooks({ chargeQuoteFn = vi.fn(), chargeQuoteLoading = false, deposits = [], depositsLoading = false } = {}) {
	AppointmentService.useChargeQuote.mockReturnValue([chargeQuoteFn, { loading: chargeQuoteLoading }]);
	DepositService.getAvailableDeposits.mockReturnValue({
		data: { getAvailableDeposits: deposits },
		loading: depositsLoading,
	});
	return { chargeQuoteFn };
}

function renderDetail({
	appointmentOverrides = {},
	projectOverrides = {},
	connections = [],
	setAlert = vi.fn(),
	modal = { isOpen: false },
	setModal = vi.fn(),
	mocks = [],
	onClosed = vi.fn(),
	onDeleted = vi.fn(),
} = {}) {
	const appt = appointment(appointmentOverrides);
	const proj = project(projectOverrides);
	const { container } = render(
		<MockedProvider mocks={mocks} addTypename={false}>
			<AuthContext.Provider value={{ setModal, modal, setAlert }}>
				<SessionDetail appointment={appt} project={proj} connections={connections} onClosed={onClosed} onDeleted={onDeleted} />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, modal, setModal, appointment: appt, project: proj, onClosed, onDeleted, container };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("rendering an open session", () => {
	it("shows an in-progress status and the artist's hourly rate when there's no shop", () => {
		setupHooks();
		renderDetail();

		expect(screen.getByText("In progress")).toBeInTheDocument();
		expect(screen.getByText("Rate: Artist - $150/hr")).toBeInTheDocument();
		expect(screen.getByText("0:00:00")).toBeInTheDocument();
	});

	it("shows the shop's flat rate when the artist is shop-connected with no override", () => {
		setupHooks();
		renderDetail({
			projectOverrides: {
				artist: { billingType: "hourly", hourlyRate: 150, shop: { id: "shop-1", billingType: "flat_rate", flatRate: 200 } },
			},
		});

		// No ArtistShopConnection record for this shop - getEffectiveRate defaults to 'shop'.
		expect(screen.getByText("Rate: Shop - $200 flat")).toBeInTheDocument();
	});

	it("uses the artist's own rate when their connection's rateSource is 'own'", () => {
		setupHooks();
		renderDetail({
			projectOverrides: {
				artist: { billingType: "hourly", hourlyRate: 150, shop: { id: "shop-1", billingType: "flat_rate", flatRate: 200 } },
			},
			connections: [{ shopId: "shop-1", rateSource: "own" }],
		});

		expect(screen.getByText("Rate: Artist - $150/hr")).toBeInTheDocument();
	});

	it("defaults the subtotal field to the suggested figure only when subtotalCents is null, not merely zero", () => {
		setupHooks();
		renderDetail({ appointmentOverrides: { subtotalCents: null, accumulatedSeconds: 3600 } });

		// 1 hour accumulated at $150/hr = $150.00 suggested, and the field starts there.
		expect(screen.getByText("Suggested from elapsed time: $150.00")).toBeInTheDocument();
		expect(screen.getByLabelText("Tattoo work $")).toHaveValue(150);
	});

	it("keeps an explicit zero subtotal at zero rather than substituting the suggested figure", () => {
		setupHooks();
		renderDetail({ appointmentOverrides: { subtotalCents: 0, accumulatedSeconds: 3600 } });

		expect(screen.getByLabelText("Tattoo work $")).toHaveValue(0);
	});

	it("fills in the suggested subtotal when Use Suggested is clicked", async () => {
		const user = userEvent.setup();
		setupHooks();
		renderDetail({ appointmentOverrides: { subtotalCents: 0, accumulatedSeconds: 3600 } });

		await user.click(screen.getByRole("button", { name: "Use Suggested" }));

		expect(screen.getByLabelText("Tattoo work $")).toHaveValue(150);
	});

	it("mounts SendAutoResponseButton scoped to the project's client and this appointment", () => {
		setupHooks();
		renderDetail();

		expect(screen.getByTestId("send-auto-response")).toHaveTextContent("client-1:sess-1");
	});

	it("shows None recorded when there are no adjustments", () => {
		setupHooks();
		renderDetail();

		expect(screen.getByText("None recorded.")).toBeInTheDocument();
	});
});

describe("rendering a closed session", () => {
	it("shows Completed, disables editing, and reads the saved figures instead of a live quote", () => {
		setupHooks();
		renderDetail({
			appointmentOverrides: {
				appointmentStatus: "completed",
				subtotalCents: 10000,
				taxCents: 800,
				feeCents: 0,
				totalCents: 10800,
			},
		});

		expect(screen.getByText("Completed")).toBeInTheDocument();
		expect(screen.getByLabelText("Tattoo work $")).toBeDisabled();
		expect(screen.getByLabelText("Tip $")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Close Session" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Charge via Square" })).toBeDisabled();
		// Read straight from the appointment - no "—" placeholder, since hasDisplayFigures is
		// unconditionally true once closed. taxCents: 800 is $8.00 (8% of the $100 subtotal), not
		// $800.00 - formatCents divides by 100, so this was a stray extra zero in the assertion,
		// not in the fixture (subtotalCents 10000 + taxCents 800 + feeCents 0 = totalCents 10800,
		// i.e. $100.00 + $8.00 = $108.00, which the second assertion already gets right).
		expect(screen.getByText("$8.00")).toBeInTheDocument();
		expect(screen.getByText("$108.00")).toBeInTheDocument();
	});

	it("hides the fee-offset checkbox once closed", () => {
		setupHooks();
		renderDetail({ appointmentOverrides: { appointmentStatus: "completed" } });

		expect(screen.queryByText("Add the card processing offset to this charge")).not.toBeInTheDocument();
	});
});

describe("timer controls", () => {
	it("starts the timer and disables Start / enables Stop", async () => {
		const user = userEvent.setup();
		setupHooks();
		const startMock = {
			request: { query: AppointmentService.START_SESSION_TIMER, variables: { appointmentId: "sess-1" } },
			result: {
				data: {
					startSessionTimer: {
						id: "sess-1",
						timerStatus: "running",
						timerStartedAt: "2026-08-10T14:00:00.000Z",
						accumulatedSeconds: 0,
					},
				},
			},
		};
		renderDetail({ mocks: [startMock] });

		await user.click(screen.getByRole("button", { name: "Start" }));

		await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeDisabled());
		expect(screen.getByRole("button", { name: "Stop" })).not.toBeDisabled();
	});

	it("stops the timer, banking the accumulated seconds into the elapsed readout", async () => {
		const user = userEvent.setup();
		setupHooks();
		const stopMock = {
			request: { query: AppointmentService.STOP_SESSION_TIMER, variables: { appointmentId: "sess-1" } },
			result: {
				data: {
					stopSessionTimer: {
						id: "sess-1",
						timerStatus: "stopped",
						timerStartedAt: null,
						accumulatedSeconds: 120,
					},
				},
			},
		};
		renderDetail({
			appointmentOverrides: { timerStatus: "running", timerStartedAt: "2026-08-10T14:00:00.000Z" },
			mocks: [stopMock],
		});

		await user.click(screen.getByRole("button", { name: "Stop" }));

		expect(await screen.findByText("0:02:00")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Start" })).not.toBeDisabled();
	});

	it("resets the timer back to zero", async () => {
		const user = userEvent.setup();
		setupHooks();
		const resetMock = {
			request: { query: AppointmentService.RESET_SESSION_TIMER, variables: { appointmentId: "sess-1" } },
			result: {
				data: {
					resetSessionTimer: { id: "sess-1", timerStatus: "stopped", timerStartedAt: null, accumulatedSeconds: 0 },
				},
			},
		};
		renderDetail({ appointmentOverrides: { accumulatedSeconds: 500 }, mocks: [resetMock] });

		await user.click(screen.getByRole("button", { name: "Reset" }));

		expect(await screen.findByText("0:00:00")).toBeInTheDocument();
	});
});

describe("saving and closing a session", () => {
	it("saves with a zero subtotal without ever asking for a charge quote", async () => {
		const user = userEvent.setup();
		setupHooks();
		const saveMock = {
			request: {
				query: AppointmentService.UPDATE_SESSION_DETAILS,
				variables: {
					appointmentInput: {
						id: "sess-1",
						appointmentDate: moment("2026-08-10T14:00:00.000Z").toISOString(),
						subtotalCents: 0,
						taxCents: 0,
						feeCents: 0,
						tipCents: 0,
						totalCents: 0,
						sessionNotes: "",
					},
				},
			},
			result: {
				data: {
					updateAppointment: {
						id: "sess-1",
						appointmentDate: "2026-08-10T14:00:00.000Z",
						durationMinutes: 180,
						appointmentEnd: "2026-08-10T17:00:00.000Z",
						subtotalCents: 0,
						tipCents: 0,
						totalCents: 0,
						shopCutCents: 0,
						shopCutStatus: "none",
						sessionNotes: "",
					},
				},
			},
		};
		const { setAlert } = renderDetail({ mocks: [saveMock] });

		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success", message: "Session saved." }),
			),
		);
	});

	it("includes typed session notes in the save payload", async () => {
		const user = userEvent.setup();
		setupHooks();
		const saveMock = {
			request: {
				query: AppointmentService.UPDATE_SESSION_DETAILS,
				variables: {
					appointmentInput: {
						id: "sess-1",
						appointmentDate: moment("2026-08-10T14:00:00.000Z").toISOString(),
						subtotalCents: 0,
						taxCents: 0,
						feeCents: 0,
						tipCents: 0,
						totalCents: 0,
						sessionNotes: "Client wants more shading next time",
					},
				},
			},
			result: {
				data: {
					updateAppointment: {
						id: "sess-1",
						appointmentDate: "2026-08-10T14:00:00.000Z",
						durationMinutes: 180,
						appointmentEnd: "2026-08-10T17:00:00.000Z",
						subtotalCents: 0,
						tipCents: 0,
						totalCents: 0,
						shopCutCents: 0,
						shopCutStatus: "none",
						sessionNotes: "Client wants more shading next time",
					},
				},
			},
		};
		const { setAlert } = renderDetail({ mocks: [saveMock] });

		await user.type(screen.getByLabelText("Session Notes"), "Client wants more shading next time");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ severity: "success", message: "Session saved." })),
		);
	});

	it("closes the session, marking it completed and calling onClosed", async () => {
		const user = userEvent.setup();
		setupHooks();
		const closeMock = {
			request: {
				query: AppointmentService.UPDATE_SESSION_DETAILS,
				variables: {
					appointmentInput: {
						id: "sess-1",
						appointmentDate: moment("2026-08-10T14:00:00.000Z").toISOString(),
						subtotalCents: 0,
						taxCents: 0,
						feeCents: 0,
						tipCents: 0,
						totalCents: 0,
						sessionNotes: "",
						appointmentStatus: "completed",
					},
				},
			},
			result: {
				data: {
					updateAppointment: {
						id: "sess-1",
						appointmentDate: "2026-08-10T18:00:00.000Z",
						durationMinutes: 180,
						appointmentEnd: "2026-08-10T21:00:00.000Z",
						subtotalCents: 0,
						tipCents: 0,
						totalCents: 0,
						shopCutCents: 0,
						shopCutStatus: "none",
						sessionNotes: "",
					},
				},
			},
		};
		const { setAlert, onClosed } = renderDetail({ mocks: [closeMock] });

		await user.click(screen.getByRole("button", { name: "Close Session" }));

		await waitFor(() => expect(onClosed).toHaveBeenCalled());
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: true, severity: "success", message: "Session closed." }),
		);
	});
});

describe("deleting a session", () => {
	it("does nothing when the confirmation is declined", async () => {
		const user = userEvent.setup();
		vi.spyOn(window, "confirm").mockReturnValue(false);
		setupHooks();
		const { onDeleted } = renderDetail();

		await user.click(screen.getByRole("button", { name: "Delete Session" }));

		expect(onDeleted).not.toHaveBeenCalled();
	});

	it("deletes and calls onDeleted when confirmed", async () => {
		const user = userEvent.setup();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		setupHooks();
		const deleteMock = {
			request: { query: AppointmentService.DELETE_APPOINTMENT, variables: { appointmentId: "sess-1" } },
			result: { data: { deleteAppointment: true } },
		};
		const { setAlert, onDeleted } = renderDetail({ mocks: [deleteMock] });

		await user.click(screen.getByRole("button", { name: "Delete Session" }));

		await waitFor(() => expect(onDeleted).toHaveBeenCalled());
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: true, severity: "success", message: "Session deleted." }),
		);
	});

	it("alerts the server's error message and leaves Delete Session clickable again on failure", async () => {
		const user = userEvent.setup();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		setupHooks();
		const failingMock = {
			request: { query: AppointmentService.DELETE_APPOINTMENT, variables: { appointmentId: "sess-1" } },
			error: new Error("Could not delete appointment."),
		};
		const { setAlert, onDeleted } = renderDetail({ mocks: [failingMock] });

		await user.click(screen.getByRole("button", { name: "Delete Session" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "Could not delete appointment." }),
			),
		);
		expect(onDeleted).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Delete Session" })).not.toBeDisabled();
	});
});

describe("recording an adjustment", () => {
	it("keeps Record Adjustment disabled until both an amount and a reason are given", async () => {
		const user = userEvent.setup();
		setupHooks();
		renderDetail();

		expect(screen.getByRole("button", { name: "Record Adjustment" })).toBeDisabled();

		await user.type(screen.getByLabelText("Amount reversed $"), "50");
		expect(screen.getByRole("button", { name: "Record Adjustment" })).toBeDisabled();

		await user.type(screen.getByLabelText("Reason"), "Reversed after a client dispute");
		expect(screen.getByRole("button", { name: "Record Adjustment" })).not.toBeDisabled();
	});

	it("records the adjustment, prepends it to the list and clears the form", async () => {
		const user = userEvent.setup();
		setupHooks();
		const recordMock = {
			request: {
				query: AppointmentService.RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: "sess-1", amountCents: 5000, reason: "Reversed after a dispute" } },
			},
			result: {
				data: {
					recordAdjustment: {
						id: "adj-1",
						amountCents: 5000,
						reason: "Reversed after a dispute",
						createdAt: "2026-08-15T00:00:00.000Z",
						createdBy: { id: "u1", firstName: "Sam", lastName: "Artist" },
					},
				},
			},
		};
		const { setAlert } = renderDetail({ mocks: [recordMock] });

		await user.type(screen.getByLabelText("Amount reversed $"), "50");
		await user.type(screen.getByLabelText("Reason"), "Reversed after a dispute");
		await user.click(screen.getByRole("button", { name: "Record Adjustment" }));

		expect(await screen.findByText("Reversed after a dispute")).toBeInTheDocument();
		expect(screen.getByText("$50.00")).toBeInTheDocument();
		expect(screen.getByLabelText("Amount reversed $")).toHaveValue(null);
		expect(screen.getByLabelText("Reason")).toHaveValue("");
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: true, severity: "success", message: "Adjustment recorded." }),
		);
	});

	it("alerts the server's error message when recording an adjustment fails", async () => {
		const user = userEvent.setup();
		setupHooks();
		const failingMock = {
			request: {
				query: AppointmentService.RECORD_ADJUSTMENT,
				variables: { input: { appointmentId: "sess-1", amountCents: 5000, reason: "Reversed after a dispute" } },
			},
			error: new Error("Could not record adjustment."),
		};
		const { setAlert } = renderDetail({ mocks: [failingMock] });

		await user.type(screen.getByLabelText("Amount reversed $"), "50");
		await user.type(screen.getByLabelText("Reason"), "Reversed after a dispute");
		await user.click(screen.getByRole("button", { name: "Record Adjustment" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "Could not record adjustment." }),
			),
		);
	});
});

describe("deposits", () => {
	it("skips the available-deposits query once a credit is already applied, and shows the applied message", () => {
		setupHooks();
		renderDetail({ appointmentOverrides: { depositCreditCents: 5000 } });

		expect(DepositService.getAvailableDeposits).toHaveBeenCalledWith("sess-1", { skip: true });
		expect(
			screen.getByText("$50.00 deposit applied - already paid, deducted from this session's total."),
		).toBeInTheDocument();
	});

	it("lists available deposits to apply when there's no credit yet", () => {
		setupHooks({
			deposits: [
				// depositCollectedAt noon UTC, not midnight - rendered via `moment(...).format(...)`
				// in the reader's own local timezone (same fix as ShopCutRatePanel.test.jsx's "since
				// Jan 1, 2026" assertion), so a midnight-UTC fixture rolls back to the previous day
				// for anyone west of Greenwich.
				{ id: "dep-1", title: "Consult", appointmentType: "consult", appointmentDate: "2026-07-01T00:00:00.000Z", depositCents: 5000, depositStatus: "collected", depositCollectedAt: "2026-07-01T12:00:00.000Z" },
			],
		});
		renderDetail();

		expect(screen.getByText(/\$50\.00 taken Jul 1, 2026 at consult/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Apply to this session" })).toBeInTheDocument();
	});

	it("applies a deposit and shows the applied state afterward", async () => {
		const user = userEvent.setup();
		setupHooks({
			deposits: [
				{ id: "dep-1", title: "Consult", appointmentType: "consult", appointmentDate: "2026-07-01T00:00:00.000Z", depositCents: 5000, depositStatus: "collected", depositCollectedAt: "2026-07-01T00:00:00.000Z" },
			],
		});
		const applyMock = {
			request: {
				query: DepositService.APPLY_DEPOSIT,
				variables: { depositAppointmentId: "dep-1", targetAppointmentId: "sess-1" },
			},
			result: {
				data: {
					applyDeposit: {
						id: "sess-1",
						depositCreditCents: 5000,
						depositCreditFromAppointmentId: "dep-1",
						subtotalCents: 0,
						totalCents: 0,
						shopCutCents: 0,
						shopCutPercentApplied: null,
						shopCutStatus: "none",
					},
				},
			},
		};
		const { setAlert } = renderDetail({ mocks: [applyMock] });

		await user.click(screen.getByRole("button", { name: "Apply to this session" }));

		expect(await screen.findByText("$50.00 deposit applied - already paid, deducted from this session's total.")).toBeInTheDocument();
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: true, severity: "success", message: "Deposit applied." }),
		);
	});

	it("alerts the server's error message when applying a deposit fails", async () => {
		const user = userEvent.setup();
		setupHooks({
			deposits: [
				{ id: "dep-1", title: "Consult", appointmentType: "consult", appointmentDate: "2026-07-01T00:00:00.000Z", depositCents: 5000, depositStatus: "collected", depositCollectedAt: "2026-07-01T00:00:00.000Z" },
			],
		});
		const failingMock = {
			request: {
				query: DepositService.APPLY_DEPOSIT,
				variables: { depositAppointmentId: "dep-1", targetAppointmentId: "sess-1" },
			},
			error: new Error("This deposit has already been applied."),
		};
		const { setAlert } = renderDetail({ mocks: [failingMock] });

		await user.click(screen.getByRole("button", { name: "Apply to this session" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "This deposit has already been applied." }),
			),
		);
	});
});

describe("charging via Square", () => {
	it("disables Charge via Square while there's no subtotal entered", () => {
		setupHooks();
		renderDetail();

		expect(screen.getByRole("button", { name: "Charge via Square" })).toBeDisabled();
	});

	it("saves the current figures, then opens the payment modal when the quote says it can charge", async () => {
		const user = userEvent.setup();
		const chargeQuoteFn = vi.fn().mockResolvedValue({
			data: {
				getChargeQuote: { amountDueCents: 10800, canCharge: true, source: "artist" },
			},
		});
		setupHooks({ chargeQuoteFn });
		const freshQuoteMock = {
			request: {
				query: AppointmentService.GET_CHARGE_QUOTE,
				variables: { appointmentId: "sess-1", applyFeeOffset: false, tipCents: 0, subtotalCentsOverride: 10000 },
			},
			result: {
				data: {
					getChargeQuote: {
						subtotalCents: 10000,
						depositCreditCents: 0,
						netSubtotalCents: 10000,
						feeOffsetCents: 0,
						taxableCents: 10000,
						taxCents: 800,
						tipCents: 0,
						totalCents: 10800,
						giftCardCents: 0,
						amountDueCents: 10800,
						source: "artist",
						canCharge: true,
					},
				},
			},
			// The debounced live-preview effect (see the component's own comment on it) watches
			// these same fields and could fire this identical query a second time in the
			// background if enough real wall-clock time passes before this test's assertions
			// finish - allowed for here rather than assumed away.
			maxUsageCount: 3,
		};
		const saveMock = {
			request: {
				query: AppointmentService.UPDATE_SESSION_DETAILS,
				variables: {
					appointmentInput: {
						id: "sess-1",
						appointmentDate: moment("2026-08-10T14:00:00.000Z").toISOString(),
						subtotalCents: 10000,
						taxCents: 800,
						feeCents: 0,
						tipCents: 0,
						totalCents: 10800,
						sessionNotes: "",
					},
				},
			},
			result: {
				data: {
					updateAppointment: {
						id: "sess-1",
						appointmentDate: "2026-08-10T14:00:00.000Z",
						durationMinutes: 180,
						appointmentEnd: "2026-08-10T17:00:00.000Z",
						subtotalCents: 10000,
						tipCents: 0,
						totalCents: 10800,
						shopCutCents: 0,
						shopCutStatus: "none",
						sessionNotes: "",
					},
				},
			},
		};
		const { setModal } = renderDetail({ mocks: [freshQuoteMock, saveMock] });

		await user.clear(screen.getByLabelText("Tattoo work $"));
		await user.type(screen.getByLabelText("Tattoo work $"), "100");
		await user.click(screen.getByRole("button", { name: "Charge via Square" }));

		await waitFor(() => expect(setModal).toHaveBeenCalled());
		const call = setModal.mock.calls[0][0];
		expect(call.isOpen).toBe(true);
		expect(call.title).toBe("Charge $108.00 for Full Sleeve");
		render(call.content);
		expect(screen.getByTestId("square-amount")).toHaveTextContent("10800");
		expect(screen.getByTestId("square-appointment-id")).toHaveTextContent("sess-1");
		expect(screen.getByTestId("square-note")).toHaveTextContent("Session for project Full Sleeve");
	});

	it("shows a shop-specific error and never opens the modal when the shop has no Square account connected", async () => {
		const user = userEvent.setup();
		const chargeQuoteFn = vi.fn().mockResolvedValue({
			data: { getChargeQuote: { amountDueCents: 10800, canCharge: false, source: "shop" } },
		});
		setupHooks({ chargeQuoteFn });
		const freshQuoteMock = {
			request: {
				query: AppointmentService.GET_CHARGE_QUOTE,
				variables: { appointmentId: "sess-1", applyFeeOffset: false, tipCents: 0, subtotalCentsOverride: 10000 },
			},
			result: {
				data: {
					getChargeQuote: {
						subtotalCents: 10000,
						depositCreditCents: 0,
						netSubtotalCents: 10000,
						feeOffsetCents: 0,
						taxableCents: 10000,
						taxCents: 800,
						tipCents: 0,
						totalCents: 10800,
						giftCardCents: 0,
						amountDueCents: 10800,
						source: "shop",
						canCharge: false,
					},
				},
			},
			maxUsageCount: 3,
		};
		const saveMock = {
			request: {
				query: AppointmentService.UPDATE_SESSION_DETAILS,
				variables: {
					appointmentInput: {
						id: "sess-1",
						appointmentDate: moment("2026-08-10T14:00:00.000Z").toISOString(),
						subtotalCents: 10000,
						taxCents: 800,
						feeCents: 0,
						tipCents: 0,
						totalCents: 10800,
						sessionNotes: "",
					},
				},
			},
			result: {
				data: {
					updateAppointment: {
						id: "sess-1",
						appointmentDate: "2026-08-10T14:00:00.000Z",
						durationMinutes: 180,
						appointmentEnd: "2026-08-10T17:00:00.000Z",
						subtotalCents: 10000,
						tipCents: 0,
						totalCents: 10800,
						shopCutCents: 0,
						shopCutStatus: "none",
						sessionNotes: "",
					},
				},
			},
		};
		const { setAlert, setModal } = renderDetail({ mocks: [freshQuoteMock, saveMock] });

		await user.clear(screen.getByLabelText("Tattoo work $"));
		await user.type(screen.getByLabelText("Tattoo work $"), "100");
		await user.click(screen.getByRole("button", { name: "Charge via Square" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "This shop has not connected a Square account yet.",
				}),
			),
		);
		expect(setModal).not.toHaveBeenCalled();
	});
});
