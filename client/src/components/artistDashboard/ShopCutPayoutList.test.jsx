// ShopCutPayoutList.jsx tests. See the component's own header comment: this is the one place an
// artist settles what they owe the shop across every completed-but-unpaid session at once, in one
// of two shapes - a plain artist's own list (every row `isOwn`, every action button live) or a
// shop admin's shopWide dashboard (showArtist=true, only the viewer's OWN rows get the checkbox
// and buttons - everyone else's render as a read-only "owed by <artist>" row, since the mutations
// are self-service and would 403 otherwise).
//
// Real mutation documents pulled from AppointmentService itself (CREATE_SHOP_CUT_INVOICE/
// CREATE_BATCH_SHOP_CUT_INVOICE/MARK_SHOP_CUT_PAID_MANUALLY), matching this codebase's own
// convention (see RatesPanel.test.jsx/BoothRentPanel.test.jsx) of mocking against the service's
// real document rather than a hand-copied one that can silently drift.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import ShopCutPayoutList from "./ShopCutPayoutList";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";

function appt(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "appt-1",
		title: null,
		appointmentDate: "2026-07-10T14:00:00.000Z",
		durationMinutes: 120,
		appointmentEnd: "2026-07-10T16:00:00.000Z",
		appointmentStatus: "completed",
		totalCents: 40000,
		subtotalCents: 40000,
		shopId: "shop-1",
		shopCutStatus: "unpaid",
		shopCutCents: 16000,
		shopCutPaymentMethod: null,
		shopCutSquareInvoiceId: null,
		userId: "artist-1",
		user: { __typename: "User", id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#c69818" },
		projectId: "proj-1",
		project: {
			__typename: "Project",
			id: "proj-1",
			title: "Full Sleeve",
			status: "in_progress",
			client: {
				__typename: "Client",
				id: "client-1",
				user: { __typename: "User", id: "cu-1", firstName: "Robin", lastName: "Client" },
			},
		},
		...overrides,
	};
}

function renderList({
	appointments,
	onChanged = vi.fn(),
	showArtist = false,
	viewerId = "artist-1",
	mocks = [],
	setAlert = vi.fn(),
} = {}) {
	const { container } = render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ setAlert }}>
				<ShopCutPayoutList
					appointments={appointments}
					onChanged={onChanged}
					showArtist={showArtist}
					viewerId={viewerId}
				/>
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { onChanged, setAlert, container };
}

describe("empty state", () => {
	it("shows the empty message when appointments is an empty array", () => {
		renderList({ appointments: [] });
		expect(
			screen.getByText("No outstanding shop cuts on completed sessions."),
		).toBeInTheDocument();
	});

	it("shows the empty message when appointments is null/undefined", () => {
		renderList({ appointments: null });
		expect(
			screen.getByText("No outstanding shop cuts on completed sessions."),
		).toBeInTheDocument();
	});
});

describe("row rendering", () => {
	it("renders the date, project title/status, client name, status label and amount owed", () => {
		renderList({ appointments: [appt()] });

		expect(screen.getByText(new Date("2026-07-10T14:00:00.000Z").toLocaleDateString())).toBeInTheDocument();
		expect(screen.getByText("Full Sleeve · in_progress")).toBeInTheDocument();
		expect(screen.getByText("Robin Client")).toBeInTheDocument();
		expect(screen.getByText("Unpaid")).toBeInTheDocument();
		expect(screen.getByText("$160.00")).toBeInTheDocument();
	});

	it("falls back to the appointment's own title and '(untitled)' when there is no project", () => {
		renderList({
			appointments: [appt({ title: "Walk-in", projectId: null, project: null })],
		});
		expect(screen.getByText("Walk-in")).toBeInTheDocument();
	});

	it("renders '(untitled)' when neither a project title nor an appointment title exists", () => {
		renderList({ appointments: [appt({ title: null, projectId: null, project: null })] });
		expect(screen.getByText("(untitled)")).toBeInTheDocument();
	});

	it.each([
		["unpaid", "Unpaid"],
		["invoice_sent", "Invoice sent"],
		["pending_confirmation", "Pending confirmation"],
		["paid", "Paid"],
	])("labels shopCutStatus %s as %s", (status, label) => {
		renderList({ appointments: [appt({ shopCutStatus: status })] });
		expect(screen.getByText(label)).toBeInTheDocument();
	});

	it("shows a checkbox and both action buttons for the viewer's own row when showArtist is off", () => {
		renderList({ appointments: [appt()], showArtist: false });
		expect(screen.getByRole("checkbox")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Paid (Cash)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Charge (Card)" })).toBeInTheDocument();
	});

	it("omits the artist column when showArtist is off", () => {
		const { container } = renderList({ appointments: [appt()], showArtist: false });
		expect(container.querySelector(".shopCutPayoutRowArtist")).toBeNull();
	});

	it("shows the artist name column when showArtist is on", () => {
		renderList({ appointments: [appt()], showArtist: true, viewerId: "artist-1" });
		expect(screen.getByText("Sam Artist")).toBeInTheDocument();
	});
});

describe("shopWide read-only rows", () => {
	it("hides the checkbox and action buttons, showing 'Owed by <artist>' instead, for another artist's row", () => {
		renderList({
			appointments: [appt({ userId: "artist-2", user: { id: "artist-2", firstName: "Jordan", lastName: "Other", tagColor: "#333" } })],
			showArtist: true,
			viewerId: "artist-1",
		});

		expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Paid (Cash)" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Charge (Card)" })).not.toBeInTheDocument();
		expect(screen.getByText("Owed by Jordan")).toBeInTheDocument();
	});

	it("still shows the checkbox and buttons for the viewer's OWN row in shopWide mode", () => {
		renderList({
			appointments: [appt({ userId: "artist-1" })],
			showArtist: true,
			viewerId: "artist-1",
		});

		expect(screen.getByRole("checkbox")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Paid (Cash)" })).toBeInTheDocument();
	});

	it("falls back to 'this artist' when the owed-by row has no user record", () => {
		renderList({
			appointments: [appt({ userId: "artist-2", user: null })],
			showArtist: true,
			viewerId: "artist-1",
		});
		expect(screen.getByText("Owed by this artist")).toBeInTheDocument();
	});
});

describe("selection and the batch bar", () => {
	it("shows the default hint and a disabled Send button with nothing selected", () => {
		renderList({ appointments: [appt({ id: "a1" }), appt({ id: "a2" })] });
		expect(
			screen.getByText("Select multiple sessions to send one combined invoice"),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send Combined Invoice" })).toBeDisabled();
	});

	it("keeps the batch button disabled with only one row selected", async () => {
		const user = userEvent.setup();
		renderList({ appointments: [appt({ id: "a1" }), appt({ id: "a2" })] });

		await user.click(screen.getAllByRole("checkbox")[0]);

		expect(screen.getByRole("button", { name: "Send Combined Invoice" })).toBeDisabled();
	});

	it("shows the selected count and total, and enables Send, once two rows are checked", async () => {
		const user = userEvent.setup();
		renderList({
			appointments: [
				appt({ id: "a1", shopCutCents: 10000 }),
				appt({ id: "a2", shopCutCents: 5000 }),
			],
		});

		const checkboxes = screen.getAllByRole("checkbox");
		await user.click(checkboxes[0]);
		await user.click(checkboxes[1]);

		expect(screen.getByText("2 selected - $150.00 total")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send Combined Invoice" })).not.toBeDisabled();
	});

	it("unchecking a row drops it back out of the selected total", async () => {
		const user = userEvent.setup();
		renderList({
			appointments: [
				appt({ id: "a1", shopCutCents: 10000 }),
				appt({ id: "a2", shopCutCents: 5000 }),
			],
		});
		const checkboxes = screen.getAllByRole("checkbox");
		await user.click(checkboxes[0]);
		await user.click(checkboxes[1]);
		await user.click(checkboxes[0]);

		expect(screen.getByText("1 selected - $50.00 total")).toBeInTheDocument();
	});
});

describe("marking a shop cut paid in cash", () => {
	it("calls markShopCutPaidManually, alerts success and calls onChanged", async () => {
		const user = userEvent.setup();
		const mock = {
			request: {
				query: AppointmentService.MARK_SHOP_CUT_PAID_MANUALLY,
				variables: { appointmentId: "appt-1" },
			},
			result: {
				data: {
					markShopCutPaidManually: {
						__typename: "Appointment",
						id: "appt-1",
						shopCutStatus: "pending_confirmation",
						shopCutPaymentMethod: "cash",
						shopCutMarkedPaidAt: "2026-07-11T00:00:00.000Z",
					},
				},
			},
		};
		const { onChanged, setAlert } = renderList({ appointments: [appt()], mocks: [mock] });

		await user.click(screen.getByRole("button", { name: "Paid (Cash)" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Marked as paid - the shop has been notified to confirm.",
				}),
			),
		);
		expect(onChanged).toHaveBeenCalledTimes(1);
	});

	it("alerts the server's error message and does not call onChanged when it fails", async () => {
		const user = userEvent.setup();
		const mock = {
			request: {
				query: AppointmentService.MARK_SHOP_CUT_PAID_MANUALLY,
				variables: { appointmentId: "appt-1" },
			},
			error: new Error("That session has already been settled."),
		};
		const { onChanged, setAlert } = renderList({ appointments: [appt()], mocks: [mock] });

		await user.click(screen.getByRole("button", { name: "Paid (Cash)" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "That session has already been settled.",
				}),
			),
		);
		expect(onChanged).not.toHaveBeenCalled();
	});
});

describe("charging a single shop cut by card", () => {
	it("calls createShopCutInvoice with paymentMethod card and alerts the invoice URL", async () => {
		const user = userEvent.setup();
		const mock = {
			request: {
				query: AppointmentService.CREATE_SHOP_CUT_INVOICE,
				variables: { appointmentId: "appt-1", paymentMethod: "card" },
			},
			result: {
				data: {
					createShopCutInvoice: {
						__typename: "ShopCutInvoiceResult",
						invoiceUrl: "https://square.example/invoice/abc",
						appointment: {
							__typename: "Appointment",
							id: "appt-1",
							shopCutStatus: "invoice_sent",
							shopCutPaymentMethod: "card",
							shopCutSquareInvoiceId: "sq-1",
						},
					},
				},
			},
		};
		const { onChanged, setAlert } = renderList({ appointments: [appt()], mocks: [mock] });

		await user.click(screen.getByRole("button", { name: "Charge (Card)" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Invoice sent: https://square.example/invoice/abc",
				}),
			),
		);
		expect(onChanged).toHaveBeenCalledTimes(1);
	});
});

describe("sending a combined invoice", () => {
	it("calls createBatchShopCutInvoice with the selected ids, alerts success and clears the selection", async () => {
		const user = userEvent.setup();
		const mock = {
			request: {
				query: AppointmentService.CREATE_BATCH_SHOP_CUT_INVOICE,
				variables: { appointmentIds: ["a1", "a2"], paymentMethod: "card" },
			},
			result: {
				data: {
					createBatchShopCutInvoice: {
						__typename: "BatchShopCutInvoiceResult",
						invoiceUrl: "https://square.example/invoice/combined",
						appointments: [
							{ __typename: "Appointment", id: "a1", shopCutStatus: "invoice_sent", shopCutPaymentMethod: "card", shopCutSquareInvoiceId: "sq-2" },
							{ __typename: "Appointment", id: "a2", shopCutStatus: "invoice_sent", shopCutPaymentMethod: "card", shopCutSquareInvoiceId: "sq-2" },
						],
					},
				},
			},
		};
		const { onChanged, setAlert } = renderList({
			appointments: [appt({ id: "a1" }), appt({ id: "a2" })],
			mocks: [mock],
		});

		const checkboxes = screen.getAllByRole("checkbox");
		await user.click(checkboxes[0]);
		await user.click(checkboxes[1]);
		await user.click(screen.getByRole("button", { name: "Send Combined Invoice" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Combined invoice sent: https://square.example/invoice/combined",
				}),
			),
		);
		expect(onChanged).toHaveBeenCalledTimes(1);
		await waitFor(() =>
			expect(
				screen.getByText("Select multiple sessions to send one combined invoice"),
			).toBeInTheDocument(),
		);
	});

	it("shows Sending... while the batch mutation is in flight", async () => {
		const user = userEvent.setup();
		const pendingMock = {
			request: {
				query: AppointmentService.CREATE_BATCH_SHOP_CUT_INVOICE,
				variables: { appointmentIds: ["a1", "a2"], paymentMethod: "card" },
			},
			delay: 60 * 1000,
			result: { data: { createBatchShopCutInvoice: null } },
		};
		renderList({
			appointments: [appt({ id: "a1" }), appt({ id: "a2" })],
			mocks: [pendingMock],
		});

		const checkboxes = screen.getAllByRole("checkbox");
		await user.click(checkboxes[0]);
		await user.click(checkboxes[1]);
		await user.click(screen.getByRole("button", { name: "Send Combined Invoice" }));

		expect(await screen.findByRole("button", { name: "Sending..." })).toBeDisabled();
	});
});

describe("multiple rows tinted by artist", () => {
	it("renders one row per appointment, each carrying its own tagColor style", () => {
		const { container } = renderList({
			appointments: [
				appt({ id: "a1", user: { id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#122152" } }),
				appt({ id: "a2", user: { id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#e2d355" } }),
			],
		});
		const rows = container.querySelectorAll(".shopCutPayoutRow");
		expect(rows).toHaveLength(2);
		expect(rows[0].style.borderLeft).not.toBe(rows[1].style.borderLeft);
	});
});
