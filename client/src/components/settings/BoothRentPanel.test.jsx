// BoothRentPanel.jsx tests. Feature 5 (booth rent vs. percentage cut) - see the component's own
// header comment: this is the artist's read-only view of terms a shop admin set for them
// (ShopCutRatePanel.jsx is where those terms are actually SET), plus the one action that is
// genuinely the artist's own to take - claiming a month's rent as paid.
//
// THE HEADSTONE CASE: renders nothing at all - not a hidden section, not a "you're not on booth
// rent" message - when getBoothRentPlans comes back empty. That is the ordinary state for the
// overwhelming majority of artists (anyone on the plain percentage cut), so it gets its own
// describe block up top rather than being one assertion among many.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import BoothRentPanel from "./BoothRentPanel";
import { AuthContext } from "../../context/auth";
import BoothRentService from "../../services/BoothRentService";

function fatPlan(overrides = {}) {
	return {
		__typename: "BoothRentPlan",
		id: "plan-1",
		artistId: "user-1",
		shopId: "shop-1",
		amountCents: 40000,
		dueDayOfMonth: 1,
		effectiveFrom: "2026-01-01T00:00:00.000Z",
		setByUserId: "admin-1",
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function fatCharge(overrides = {}) {
	return {
		__typename: "BoothRentCharge",
		id: "charge-1",
		artistId: "user-1",
		shopId: "shop-1",
		amountCents: 40000,
		periodMonth: "2026-07-01T00:00:00.000Z",
		dueDate: "2026-07-01T00:00:00.000Z",
		status: "due",
		markedPaidAt: null,
		markedPaidByUserId: null,
		confirmedAt: null,
		confirmedByUserId: null,
		expenseId: null,
		incomeId: null,
		createdAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

// The REAL documents from the service, not hand copies - see FormsPanel.test.jsx's own comment on
// why (a near-copy silently stops matching after one field of drift and fails as a network error
// that looks like a component bug rather than what it is).
function plansMock(artistId, shopId, plans) {
	return {
		request: { query: BoothRentService.GET_BOOTH_RENT_PLANS, variables: { artistId, shopId } },
		result: { data: { getBoothRentPlans: plans.map((p) => ({ __typename: "BoothRentPlan", ...p })) } },
	};
}

function chargesMock(artistId, charges, pageInfo = {}) {
	return {
		request: {
			query: BoothRentService.GET_BOOTH_RENT_CHARGES,
			variables: { artistId, shopId: undefined, status: undefined, page: { limit: 12 } },
		},
		result: {
			data: {
				getBoothRentCharges: {
					__typename: "BoothRentChargeConnection",
					items: charges.map((c) => ({ __typename: "BoothRentCharge", ...c })),
					pageInfo: {
						__typename: "PageInfo",
						totalCount: charges.length,
						hasMore: false,
						limit: 12,
						offset: 0,
						...pageInfo,
					},
				},
			},
		},
	};
}

function markPaidMock(boothRentChargeId, response, { delay } = {}) {
	return {
		request: {
			query: BoothRentService.MARK_BOOTH_RENT_PAID_MANUALLY,
			variables: { boothRentChargeId },
		},
		result: { data: { markBoothRentPaidManually: { __typename: "BoothRentCharge", ...response } } },
		...(delay !== undefined ? { delay } : {}),
	};
}

const SHOP_ARTIST = {
	id: "user-1",
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-1", shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
};

const INDEPENDENT_ARTIST = {
	id: "user-2",
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-2" },
};

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<BoothRentPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("no booth-rent plan history", () => {
	it("renders nothing at all for an artist with an empty plan list", async () => {
		// plans defaults to [] before the query even resolves, so the component returns null on
		// the very first render, not just once the (empty) getBoothRentPlans response lands -
		// asserted synchronously, then again after the query settles to confirm it stays that way.
		const { container } = render(
			<MockedProvider mocks={[plansMock("user-1", "shop-1", []), chargesMock("user-1", [])]}>
				<AuthContext.Provider value={{ user: SHOP_ARTIST, setAlert: vi.fn() }}>
					<BoothRentPanel />
				</AuthContext.Provider>
			</MockedProvider>,
		);

		expect(container).toBeEmptyDOMElement();
		await waitFor(() => expect(container).toBeEmptyDOMElement());
		expect(screen.queryByText("Your booth rent")).not.toBeInTheDocument();
	});

	// getBoothRentPlans itself is skipped (skip: !artistId || !shopId) for an independent artist
	// with no shop at all - no plansMock is supplied, and MockedProvider would surface an
	// unmatched-request error if that query fired anyway. getBoothRentCharges is NOT skipped
	// (skip only cares about the artistId half of its own scope), so a charges mock is still
	// required here even though nothing about charges ever reaches the screen.
	it("never queries plans for an independent artist with no shop", async () => {
		render(
			<MockedProvider mocks={[chargesMock("user-2", [])]}>
				<AuthContext.Provider value={{ user: INDEPENDENT_ARTIST, setAlert: vi.fn() }}>
					<BoothRentPanel />
				</AuthContext.Provider>
			</MockedProvider>,
		);

		expect(screen.queryByText("Your booth rent")).not.toBeInTheDocument();
		await waitFor(() => expect(screen.queryByText("Your booth rent")).not.toBeInTheDocument());
	});
});

describe("with a plan on file", () => {
	it("shows the card, the amount and the ordinal due day", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan({ amountCents: 40000, dueDayOfMonth: 1 })]),
				chargesMock("user-1", []),
			],
		});

		expect(await screen.findByText("Your booth rent")).toBeInTheDocument();
		expect(screen.getByText("$400.00")).toBeInTheDocument();
		expect(screen.getByText(/due on the/)).toBeInTheDocument();
		expect(screen.getByText(/1st/)).toBeInTheDocument();
	});

	it.each([
		[1, "1st"],
		[2, "2nd"],
		[3, "3rd"],
		[4, "4th"],
		[11, "11th"],
	])("renders day %i as %s", async (dueDayOfMonth, ordinal) => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [plansMock("user-1", "shop-1", [fatPlan({ dueDayOfMonth })]), chargesMock("user-1", [])],
		});

		await screen.findByText("Your booth rent");
		expect(screen.getByText(new RegExp(ordinal))).toBeInTheDocument();
	});

	// currentPlan is the latest plan whose effectiveFrom is not in the future - a plan that hasn't
	// taken effect yet must not be shown as the current terms.
	it("shows no current-terms line when every plan is still in the future", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan({ effectiveFrom: "2099-01-01T00:00:00.000Z" })]),
				chargesMock("user-1", []),
			],
		});

		await screen.findByText("Your booth rent");
		expect(screen.queryByText(/due on the/)).not.toBeInTheDocument();
	});

	// The plan whose effectiveFrom is the LATEST one that has already started - not just any past
	// plan - is the one shown as current.
	it("picks the most recent plan that has already taken effect, not an older one", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [
					fatPlan({ id: "plan-old", amountCents: 30000, effectiveFrom: "2025-01-01T00:00:00.000Z" }),
					fatPlan({ id: "plan-new", amountCents: 45000, effectiveFrom: "2026-06-01T00:00:00.000Z" }),
				]),
				chargesMock("user-1", []),
			],
		});

		expect(await screen.findByText("$450.00")).toBeInTheDocument();
		expect(screen.queryByText("$300.00")).not.toBeInTheDocument();
	});
});

describe("charge history", () => {
	it("renders no history list when there are no charges yet", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [plansMock("user-1", "shop-1", [fatPlan()]), chargesMock("user-1", [])],
		});

		await screen.findByText("Your booth rent");
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});

	it("renders each charge's amount, period, due date and status", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan()]),
				chargesMock("user-1", [
					fatCharge({ status: "due", periodMonth: "2026-07-01T00:00:00.000Z", dueDate: "2026-07-01T00:00:00.000Z" }),
				]),
			],
		});

		await screen.findByText("Your booth rent");
		expect(screen.getByText("$400.00")).toBeInTheDocument();
		expect(screen.getByText(/July 2026/)).toBeInTheDocument();
		expect(screen.getByText(/due Jul 1/)).toBeInTheDocument();
		expect(screen.getByText("Due")).toBeInTheDocument();
	});

	it.each([
		["due", "Due"],
		["marked_paid", "Awaiting confirmation"],
		["confirmed", "Confirmed paid"],
	])("labels a %s charge as %s", async (status, label) => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [plansMock("user-1", "shop-1", [fatPlan()]), chargesMock("user-1", [fatCharge({ status })])],
		});

		await screen.findByText("Your booth rent");
		expect(screen.getByText(label)).toBeInTheDocument();
	});

	// Mark paid is offered only while a charge is still due - once it's been marked or confirmed,
	// the artist has nothing left to do with it.
	it("offers Mark paid only for a due charge", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan()]),
				chargesMock("user-1", [fatCharge({ id: "charge-due", status: "due" })]),
			],
		});

		await screen.findByText("Your booth rent");
		expect(screen.getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
	});

	it.each(["marked_paid", "confirmed"])("offers no Mark paid button for a %s charge", async (status) => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [plansMock("user-1", "shop-1", [fatPlan()]), chargesMock("user-1", [fatCharge({ status })])],
		});

		await screen.findByText("Your booth rent");
		expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
	});

	it("renders multiple charges as separate rows", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan()]),
				chargesMock("user-1", [
					fatCharge({ id: "charge-1", periodMonth: "2026-07-01T00:00:00.000Z", status: "due" }),
					fatCharge({ id: "charge-2", periodMonth: "2026-06-01T00:00:00.000Z", status: "confirmed" }),
				]),
			],
		});

		await screen.findByText("Your booth rent");
		expect(screen.getByText(/July 2026/)).toBeInTheDocument();
		expect(screen.getByText(/June 2026/)).toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
	});
});

describe("marking a charge paid manually", () => {
	it("shows Marking… while in flight, then alerts success and refetches with the confirmed status", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan()]),
				chargesMock("user-1", [fatCharge({ status: "due" })]),
				// A brief real delay, just enough to observe the in-flight label before it resolves.
				markPaidMock("charge-1", fatCharge({ status: "marked_paid" }), { delay: 20 }),
				chargesMock("user-1", [fatCharge({ status: "marked_paid" })]),
			],
		});

		await screen.findByText("Your booth rent");
		await user.click(screen.getByRole("button", { name: "Mark paid" }));

		expect(await screen.findByRole("button", { name: "Marking…" })).toBeDisabled();

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Marked paid - awaiting the shop's confirmation.",
				}),
			),
		);
		expect(await screen.findByText("Awaiting confirmation")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
	});

	it("alerts the server's error message and leaves the charge due when marking fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: BoothRentService.MARK_BOOTH_RENT_PAID_MANUALLY,
				variables: { boothRentChargeId: "charge-1" },
			},
			error: new Error("That charge has already been settled."),
		};
		const { setAlert } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [plansMock("user-1", "shop-1", [fatPlan()]), chargesMock("user-1", [fatCharge({ status: "due" })]), failingMock],
		});

		await screen.findByText("Your booth rent");
		await user.click(screen.getByRole("button", { name: "Mark paid" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "That charge has already been settled.",
				}),
			),
		);
		expect(await screen.findByRole("button", { name: "Mark paid" })).not.toBeDisabled();
	});

	// Only the charge actually clicked shows the in-flight label - a second due charge sitting in
	// the same list keeps its own ordinary button.
	it("only disables the clicked charge's own button while marking", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				plansMock("user-1", "shop-1", [fatPlan()]),
				chargesMock("user-1", [
					fatCharge({ id: "charge-1", periodMonth: "2026-07-01T00:00:00.000Z", status: "due" }),
					fatCharge({ id: "charge-2", periodMonth: "2026-06-01T00:00:00.000Z", status: "due" }),
				]),
				markPaidMock("charge-1", fatCharge({ id: "charge-1", status: "marked_paid" }), { delay: 20 }),
				chargesMock("user-1", [
					fatCharge({ id: "charge-1", periodMonth: "2026-07-01T00:00:00.000Z", status: "marked_paid" }),
					fatCharge({ id: "charge-2", periodMonth: "2026-06-01T00:00:00.000Z", status: "due" }),
				]),
			],
		});

		await screen.findByText("Your booth rent");
		const [julyButton] = screen.getAllByRole("button", { name: "Mark paid" });
		await user.click(julyButton);

		const buttons = screen.getAllByRole("button", { name: /Mark paid|Marking…/ });
		expect(buttons.find((b) => b.textContent === "Marking…")).toBeDisabled();
		expect(buttons.find((b) => b.textContent === "Mark paid")).not.toBeDisabled();
	});
});
