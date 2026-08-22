// ShopCutConfirmations.jsx tests. Per the component's own header comment, this is the shop-side
// inbox for the manual mark-paid/confirm dual-control flow (see PRODUCTION_ROADMAP.md's "Shop-cut
// ledger" section): an artist marking a shop cut as paid by hand doesn't close the ledger item on
// its own, a shop admin has to independently confirm it here. The page is backed by one query
// (getPendingShopCutConfirmations) and one mutation (CONFIRM_SHOP_CUT_PAID), both real documents
// exported/used by AppointmentService.js - see AppointmentService.test.js's own coverage of both
// (that file's header explains why getPendingShopCutConfirmations has to be reconstructed
// field-for-field here rather than imported raw: it's one of the handful of AppointmentService
// queries that are internal-only, with no FETCH_* export).
//
// Coverage below: the no-shop guard (shopId derives from user.userInfo.shop.id, and this page is
// meaningless without one), loading/empty/populated states, every per-item display fallback
// (missing user, missing title, non-numeric shopCutCents, missing shopCutMarkedPaidAt), the
// per-artist row tint via tagColorRowStyle (the one genuinely multi-artist list in the app, per the
// component's own comment), and the Confirm Received flow's success (alert + refetch) and error
// (alert, no refetch) paths.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import ShopCutConfirmations from "./ShopCutConfirmations";
import { AppointmentService } from "../../services/AppointmentService";
import { AuthContext } from "../../context/auth";
import { tagColorRowStyle } from "../../utils/tagColor";

// getPendingShopCutConfirmations is internal-only in AppointmentService.js (no FETCH_* export) -
// reconstructed here field-for-field from the source, exactly as AppointmentService.test.js's own
// FETCH_PENDING_SHOP_CUT_CONFIRMATIONS_FOR_TESTS does. MockedProvider matches a mock to a call by
// the query's parsed shape and variables, not object identity, so a same-shape document written
// here targets the same operation - if the real query in AppointmentService.js ever drifts from
// this copy, the mock stops matching and the affected test fails loudly with Apollo's "no matching
// mock" error rather than silently passing on stale data.
const FETCH_PENDING_SHOP_CUT_CONFIRMATIONS_FOR_TESTS = gql`
	query GetPendingShopCutConfirmations($shopId: ID!) {
		getPendingShopCutConfirmations(shopId: $shopId) {
			id
			appointmentDate
			durationMinutes
			appointmentEnd
			title
			shopCutCents
			shopCutMarkedPaidAt
			user {
				id
				firstName
				lastName
				avatar
				tagColor
			}
		}
	}
`;

function pendingItem(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "appt-1",
		appointmentDate: "2026-08-01T12:00:00.000Z",
		durationMinutes: 120,
		appointmentEnd: "2026-08-01T14:00:00.000Z",
		title: "Sleeve session 2",
		shopCutCents: 2000,
		shopCutMarkedPaidAt: "2026-08-01T00:00:00.000Z",
		user: {
			__typename: "User",
			id: "user-1",
			firstName: "Gendry",
			lastName: "Baratheon",
			avatar: null,
			tagColor: "#112233",
		},
		...overrides,
	};
}

function pendingMock(shopId, items) {
	return {
		request: { query: FETCH_PENDING_SHOP_CUT_CONFIRMATIONS_FOR_TESTS, variables: { shopId } },
		result: { data: { getPendingShopCutConfirmations: items } },
	};
}

const SHOP_ADMIN = { userType: "user", role: 10, userInfo: { shop: { id: "shop-1" } } };
const INDEPENDENT_ARTIST = { userType: "artist", role: 20, userInfo: {} };

function renderPage({ user = SHOP_ADMIN, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<ShopCutConfirmations />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("an account with no shop connection", () => {
	// shopId is null (user.userInfo.shop doesn't exist), so the page returns its own guard message
	// before ever reading the query's loading/data - the hook is still called unconditionally above
	// that check (getPendingShopCutConfirmations has no skip guard, per AppointmentService's own
	// comment and AppointmentService.test.js's "still fires the query even when shopId is falsy"),
	// so a real request goes out with no mock registered to answer it. The console.error spy quiets
	// Apollo's resulting "no matching mock" log, which is expected here and not the thing under test.
	it("shows the shop-only message instead of the confirmations list", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		renderPage({ user: INDEPENDENT_ARTIST, mocks: [] });

		expect(screen.getByText("Pending Shop Cut Confirmations")).toBeInTheDocument();
		expect(screen.getByText("This page is only available to shop accounts.")).toBeInTheDocument();
		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
		expect(screen.queryByText("Nothing waiting on confirmation right now.")).not.toBeInTheDocument();
		spy.mockRestore();
	});
});

describe("loading", () => {
	it("shows the page loader while the confirmations query is in flight", () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem()])],
		});

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByText("Sleeve session 2")).not.toBeInTheDocument();
		// The title renders regardless of loading state.
		expect(screen.getByText("Pending Shop Cut Confirmations")).toBeInTheDocument();
	});
});

describe("an empty inbox", () => {
	it("says there's nothing waiting on confirmation", async () => {
		renderPage({ user: SHOP_ADMIN, mocks: [pendingMock("shop-1", [])] });

		expect(await screen.findByText("Nothing waiting on confirmation right now.")).toBeInTheDocument();
	});
});

describe("a populated inbox", () => {
	it("renders an item's artist name, title, date, amount, and marked-paid time", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem()])],
		});

		expect(await screen.findByText("Gendry Baratheon")).toBeInTheDocument();
		expect(screen.getByText(/Sleeve session 2/)).toBeInTheDocument();
		expect(screen.getByText(/Aug 1, 2026/)).toBeInTheDocument();
		expect(screen.getByText("$20.00")).toBeInTheDocument();
		// shopCutMarkedPaidAt is a fixed date safely in the past of any real test run, so
		// moment().fromNow() always renders as "... ago" rather than a future-tense phrase.
		expect(screen.getByText(/Marked paid.*ago/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Confirm Received" })).toBeInTheDocument();
	});

	it("falls back to 'Artist' when the item has no user", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem({ user: null })])],
		});

		expect(await screen.findByText("Artist")).toBeInTheDocument();
	});

	it("falls back to 'Appointment' when the item has no title", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem({ title: null })])],
		});

		expect(await screen.findByText(/Appointment - Aug 1, 2026/)).toBeInTheDocument();
	});

	it("shows 'Amount not set' when shopCutCents isn't a number", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem({ shopCutCents: null })])],
		});

		expect(await screen.findByText("Amount not set")).toBeInTheDocument();
	});

	it("shows a bare 'Marked paid' with no relative time when shopCutMarkedPaidAt is missing", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem({ shopCutMarkedPaidAt: null })])],
		});

		await screen.findByText("Gendry Baratheon");
		expect(screen.getByText("Marked paid")).toBeInTheDocument();
	});

	it("tints each row by its own artist's tagColor rather than sharing one color across the list", async () => {
		renderPage({
			user: SHOP_ADMIN,
			mocks: [
				pendingMock("shop-1", [
					pendingItem({
						id: "appt-1",
						title: "Sleeve session 2",
						user: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon", avatar: null, tagColor: "#112233" },
					}),
					pendingItem({
						id: "appt-2",
						title: "Direwolf back piece",
						shopCutCents: 3000,
						user: { __typename: "User", id: "user-2", firstName: "Sansa", lastName: "Stark", avatar: null, tagColor: "#e2d355" },
					}),
				]),
			],
		});

		const row1 = (await screen.findByText(/Sleeve session 2/)).closest(".shopCutConfirmationRow");
		const row2 = (await screen.findByText(/Direwolf back piece/)).closest(".shopCutConfirmationRow");

		const expectedStyle1 = tagColorRowStyle("#112233");
		const expectedStyle2 = tagColorRowStyle("#e2d355");

		expect(row1.style.backgroundColor).toBe(expectedStyle1.backgroundColor);
		expect(row2.style.backgroundColor).toBe(expectedStyle2.backgroundColor);
		expect(row1.style.backgroundColor).not.toBe(row2.style.backgroundColor);
	});
});

describe("confirming a shop cut", () => {
	it("calls CONFIRM_SHOP_CUT_PAID with the appointment id, alerts success, and refetches the inbox", async () => {
		const user = userEvent.setup();
		const confirmMock = {
			request: {
				query: AppointmentService.CONFIRM_SHOP_CUT_PAID,
				variables: { appointmentId: "appt-1" },
			},
			result: {
				data: {
					confirmShopCutPaid: {
						__typename: "Appointment",
						id: "appt-1",
						shopCutStatus: "paid",
						shopCutConfirmedAt: "2026-08-22T00:00:00.000Z",
					},
				},
			},
		};
		const { setAlert } = renderPage({
			user: SHOP_ADMIN,
			mocks: [
				pendingMock("shop-1", [pendingItem()]),
				confirmMock,
				// The refetch after a successful confirm - the item has now been cleared from the
				// shop's inbox.
				pendingMock("shop-1", []),
			],
		});

		await screen.findByText("Gendry Baratheon");
		await user.click(screen.getByRole("button", { name: "Confirm Received" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Marked as paid.",
				}),
			),
		);
		expect(await screen.findByText("Nothing waiting on confirmation right now.")).toBeInTheDocument();
	});

	it("alerts the mutation's error message and leaves the item in the inbox when it fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: AppointmentService.CONFIRM_SHOP_CUT_PAID,
				variables: { appointmentId: "appt-1" },
			},
			error: new Error("That shop cut has already been confirmed."),
		};
		const { setAlert } = renderPage({
			user: SHOP_ADMIN,
			mocks: [pendingMock("shop-1", [pendingItem()]), failingMock],
		});

		await screen.findByText("Gendry Baratheon");
		await user.click(screen.getByRole("button", { name: "Confirm Received" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "That shop cut has already been confirmed.",
				}),
			),
		);
		// No refetch mock was needed beyond the initial load because none should have fired - the
		// item is still on screen, unaffected by the failed mutation.
		expect(screen.getByText("Gendry Baratheon")).toBeInTheDocument();
	});

	it("scopes the query and mutation to a row in a multi-item inbox, confirming only the clicked one", async () => {
		const user = userEvent.setup();
		const confirmMock = {
			request: {
				query: AppointmentService.CONFIRM_SHOP_CUT_PAID,
				variables: { appointmentId: "appt-2" },
			},
			result: {
				data: {
					confirmShopCutPaid: {
						__typename: "Appointment",
						id: "appt-2",
						shopCutStatus: "paid",
						shopCutConfirmedAt: "2026-08-22T00:00:00.000Z",
					},
				},
			},
		};
		renderPage({
			user: SHOP_ADMIN,
			mocks: [
				pendingMock("shop-1", [
					pendingItem({ id: "appt-1", title: "Sleeve session 2" }),
					pendingItem({
						id: "appt-2",
						title: "Direwolf back piece",
						user: { __typename: "User", id: "user-2", firstName: "Sansa", lastName: "Stark", avatar: null, tagColor: "#e2d355" },
					}),
				]),
				confirmMock,
				// Refetch after confirming appt-2 only: appt-1 remains pending.
				pendingMock("shop-1", [pendingItem({ id: "appt-1", title: "Sleeve session 2" })]),
			],
		});

		await screen.findByText(/Direwolf back piece/);
		const row2 = screen.getByText(/Direwolf back piece/).closest(".shopCutConfirmationRow");
		await user.click(within(row2).getByRole("button", { name: "Confirm Received" }));

		await waitFor(() => expect(screen.queryByText(/Direwolf back piece/)).not.toBeInTheDocument());
		expect(screen.getByText(/Sleeve session 2/)).toBeInTheDocument();
	});
});
