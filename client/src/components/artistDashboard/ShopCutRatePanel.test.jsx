// ShopCutRatePanel.jsx tests. This is the shop-admin-facing counterpart to BoothRentPanel.jsx (the
// artist's own read-only view) - see this component's own giant header comment for why the history
// IS the UI (a rate change applies forward only, DECISIONS.md M7) and why compensation model lives
// on the very same dated row as the percentage.
//
// NOTE ON compensationModel: ShopCutRateService.js's GET_SHOP_CUT_RATES/SET_SHOP_CUT_RATE
// previously omitted `compensationModel` entirely (missing from both the query's field selection
// and the mutation's variable declarations), even though the server schema and resolver have
// always supported it (server/graphql/typeDefs.js's setShopCutRate argument and ShopCutRate.
// compensationModel field, server/graphql/resolvers/shopCutRates.js). That meant a real production
// bug: submitting the BOOTH_RENT form here sent `compensationModel` as an untyped extra key in the
// variables JSON that was never bound to any `$compensationModel` argument in the mutation body, so
// the server-side resolver's `compensationModel` arg was always undefined and every "booth rent"
// rate silently persisted as PERCENTAGE (see utils/shop-cut.js's `resolvedModel = compensationModel
// || 'PERCENTAGE'`) - and the read side could never show "Booth rent" at all, since the field was
// never selected off getShopCutRates in the first place. Fixed minimally in ShopCutRateService.js
// (added `compensationModel` to SHOP_CUT_RATE_FIELDS and `$compensationModel: String` to
// SET_SHOP_CUT_RATE) so this component's own documented behavior is actually reachable - see this
// test file's own diff/report for the exact change.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import moment from "moment";
import ShopCutRatePanel from "./ShopCutRatePanel";
import { GET_SHOP_CUT_RATES, SET_SHOP_CUT_RATE } from "../../services/ShopCutRateService";
import BoothRentService from "../../services/BoothRentService";

const ARTIST_ID = "artist-1";
const SHOP_ID = "shop-1";

function rate(overrides = {}) {
	return {
		__typename: "ShopCutRate",
		id: "rate-1",
		artistId: ARTIST_ID,
		shopId: SHOP_ID,
		percent: 40,
		compensationModel: "PERCENTAGE",
		effectiveFrom: "2026-01-01T00:00:00.000Z",
		setByUserId: "admin-1",
		note: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function ratesMock(rates, { artistId = ARTIST_ID, shopId = SHOP_ID } = {}) {
	return {
		request: { query: GET_SHOP_CUT_RATES, variables: { artistId, shopId } },
		result: { data: { getShopCutRates: rates } },
	};
}

function plansMock(plans, { artistId = ARTIST_ID, shopId = SHOP_ID } = {}) {
	return {
		request: { query: BoothRentService.GET_BOOTH_RENT_PLANS, variables: { artistId, shopId } },
		result: { data: { getBoothRentPlans: plans.map((p) => ({ __typename: "BoothRentPlan", ...p })) } },
	};
}

function chargesMock(charges, { artistId = ARTIST_ID, shopId = SHOP_ID, status = "marked_paid" } = {}) {
	return {
		request: {
			query: BoothRentService.GET_BOOTH_RENT_CHARGES,
			variables: { artistId, shopId, status },
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
						limit: charges.length || 10,
						offset: 0,
					},
				},
			},
		},
	};
}

function charge(overrides = {}) {
	return {
		id: "charge-1",
		artistId: ARTIST_ID,
		shopId: SHOP_ID,
		amountCents: 40000,
		periodMonth: "2026-07-01T00:00:00.000Z",
		dueDate: "2026-07-01T00:00:00.000Z",
		status: "marked_paid",
		markedPaidAt: "2026-07-15T00:00:00.000Z",
		markedPaidByUserId: "artist-1",
		confirmedAt: null,
		confirmedByUserId: null,
		expenseId: null,
		incomeId: null,
		createdAt: "2026-07-01T00:00:00.000Z",
		...overrides,
	};
}

// Every render needs the plans AND charges queries answered too, even when a test isn't about
// booth rent at all - both fire unconditionally once shopId exists (see the component's own hooks
// at the top: getBoothRentCharges is only gated on `skip: !shopId`, not on canEdit - canEdit only
// decides whether the RESULT is ever rendered). Bundled here so each test only states what it
// cares about.
function baseMocks({ rates = [], plans = [], charges = [] } = {}) {
	return [ratesMock(rates), plansMock(plans), chargesMock(charges)];
}

function renderPanel({ mocks = [], artistUserId = ARTIST_ID, shopId = SHOP_ID, canEdit = true } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<ShopCutRatePanel artistUserId={artistUserId} shopId={shopId} canEdit={canEdit} />
		</MockedProvider>,
	);
}

describe("an independent artist with no shop", () => {
	it("renders nothing at all", () => {
		const { container } = render(
			<MockedProvider mocks={[]}>
				<ShopCutRatePanel artistUserId={ARTIST_ID} shopId={null} canEdit={false} />
			</MockedProvider>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("no dated rate recorded yet", () => {
	it("shows the shop-default fallback message instead of a confident 0%", async () => {
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		expect(await screen.findByRole("heading", { name: "Shop cut" })).toBeInTheDocument();
		expect(
			screen.getByText("No dated rate recorded — the shop's default applies."),
		).toBeInTheDocument();
	});
});

describe("a PERCENTAGE rate in force", () => {
	it("shows the current percent and effective date", async () => {
		// Noon UTC, not midnight - `effectiveFrom` is rendered via `moment(...).format(...)` in the
		// reader's own local timezone (deliberately - see the component's own comment on
		// `handleSubmit`), so a midnight-UTC fixture rolls back to the previous day for anyone west
		// of Greenwich and would make this assertion depend on the machine running the suite.
		renderPanel({
			mocks: baseMocks({ rates: [rate({ percent: 35, effectiveFrom: "2026-01-01T12:00:00.000Z" })] }),
		});

		const summary = await screen.findByText("35%", { selector: "strong" });
		expect(summary.closest("p")).toHaveTextContent(/since Jan 1, 2026/);
	});

	it("lists every rate in the history, including its note", async () => {
		renderPanel({
			mocks: baseMocks({
				rates: [
					rate({ id: "r1", percent: 40, effectiveFrom: "2026-01-01T00:00:00.000Z", note: "Standard" }),
					rate({ id: "r2", percent: 50, effectiveFrom: "2025-01-01T00:00:00.000Z", note: null }),
				],
			}),
		});

		await screen.findByText("40%", { selector: "strong" });
		expect(screen.getByText("50%")).toBeInTheDocument();
		expect(screen.getByText("Standard")).toBeInTheDocument();
	});

	it("ignores a rate whose effectiveFrom is still in the future when picking the current one", async () => {
		renderPanel({
			mocks: baseMocks({
				rates: [rate({ percent: 99, effectiveFrom: "2099-01-01T00:00:00.000Z" })],
			}),
		});

		await screen.findByRole("heading", { name: "Shop cut" });
		expect(
			screen.getByText("No dated rate recorded — the shop's default applies."),
		).toBeInTheDocument();
		// Still legitimately appears in the history list below (it's a real recorded rate, just
		// not yet in force) - what must NOT happen is it being treated as the CURRENT rate.
		expect(screen.queryByText("99%", { selector: "strong" })).not.toBeInTheDocument();
	});
});

describe("a BOOTH_RENT rate in force", () => {
	it("shows 'Booth rent' with the plan's amount and ordinal due day", async () => {
		renderPanel({
			mocks: baseMocks({
				rates: [rate({ percent: 0, compensationModel: "BOOTH_RENT" })],
				plans: [
					{
						id: "plan-1",
						artistId: ARTIST_ID,
						shopId: SHOP_ID,
						amountCents: 50000,
						dueDayOfMonth: 1,
						effectiveFrom: "2026-01-01T00:00:00.000Z",
						setByUserId: "admin-1",
						active: true,
						createdAt: "2026-01-01T00:00:00.000Z",
					},
				],
			}),
		});

		expect(await screen.findByText("Booth rent")).toBeInTheDocument();
		expect(screen.getByText(/\$500\.00\/month, due on the/)).toBeInTheDocument();
		expect(screen.getByText(/1st/)).toBeInTheDocument();
	});

	it("labels a booth-rent row 'Rent' rather than its (meaningless) 0% in the history list", async () => {
		renderPanel({
			mocks: baseMocks({
				rates: [rate({ percent: 0, compensationModel: "BOOTH_RENT" })],
			}),
		});

		await screen.findByText("Booth rent");
		expect(screen.getByText("Rent")).toBeInTheDocument();
		expect(screen.queryByText("0%")).not.toBeInTheDocument();
	});

	it("shows the booth rent plan history section once plans exist", async () => {
		renderPanel({
			mocks: baseMocks({
				rates: [rate({ compensationModel: "BOOTH_RENT" })],
				plans: [
					{
						id: "plan-old",
						artistId: ARTIST_ID,
						shopId: SHOP_ID,
						amountCents: 40000,
						dueDayOfMonth: 5,
						effectiveFrom: "2025-01-01T00:00:00.000Z",
						setByUserId: "admin-1",
						active: true,
						createdAt: "2025-01-01T00:00:00.000Z",
					},
				],
			}),
		});

		expect(await screen.findByText("Booth rent plan history")).toBeInTheDocument();
		expect(screen.getByText("$400.00")).toBeInTheDocument();
		expect(screen.getByText(/due day 5/)).toBeInTheDocument();
	});
});

describe("awaiting-confirmation booth rent charges", () => {
	it("lists a pending charge and confirms it when canEdit is true", async () => {
		const user = userEvent.setup();
		const confirmMock = {
			request: {
				query: BoothRentService.CONFIRM_BOOTH_RENT_PAID,
				variables: { boothRentChargeId: "charge-1" },
			},
			// Never resolves during this test (same convention as this file's own "Saving…" test) -
			// this test only checks the in-flight state, not what happens after, so there's no
			// reason to race a real resolution against the assertion below.
			delay: 60 * 1000,
			result: {
				data: {
					confirmBoothRentPaid: { __typename: "BoothRentCharge", ...charge({ status: "confirmed" }) },
				},
			},
		};
		renderPanel({
			mocks: [
				...baseMocks({
					rates: [rate({ compensationModel: "BOOTH_RENT" })],
					charges: [charge({ status: "marked_paid" })],
				}),
				confirmMock,
				chargesMock([]),
			],
		});

		expect(await screen.findByText("Awaiting your confirmation")).toBeInTheDocument();
		expect(screen.getByText(/\$400\.00 for July 2026/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Confirm paid" }));

		expect(await screen.findByRole("button", { name: "Confirming…" })).toBeDisabled();
	});

	it("shows the server's error message when confirming fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: BoothRentService.CONFIRM_BOOTH_RENT_PAID,
				variables: { boothRentChargeId: "charge-1" },
			},
			error: new Error("That charge is no longer pending."),
		};
		renderPanel({
			mocks: [
				...baseMocks({
					rates: [rate({ compensationModel: "BOOTH_RENT" })],
					charges: [charge({ status: "marked_paid" })],
				}),
				failingMock,
			],
		});

		await screen.findByText("Awaiting your confirmation");
		await user.click(screen.getByRole("button", { name: "Confirm paid" }));

		expect(await screen.findByText("That charge is no longer pending.")).toBeInTheDocument();
	});

	it("does not show the pending-charges section when canEdit is false", async () => {
		renderPanel({
			mocks: baseMocks({ rates: [rate({ compensationModel: "BOOTH_RENT" })] }),
			canEdit: false,
		});

		await screen.findByText("Booth rent");
		expect(screen.queryByText("Awaiting your confirmation")).not.toBeInTheDocument();
	});
});

describe("canEdit is false", () => {
	it("renders no form at all", async () => {
		renderPanel({ mocks: baseMocks({ rates: [rate()] }), canEdit: false });

		await screen.findByText("40%", { selector: "strong" });
		expect(screen.queryByLabelText("New rate")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Record rate" })).not.toBeInTheDocument();
	});
});

describe("recording a new PERCENTAGE rate", () => {
	it("submits the percent, effective date and note, and clears the form on success", async () => {
		const user = userEvent.setup();
		const today = moment().format("YYYY-MM-DD");
		const isoToday = moment(today, "YYYY-MM-DD").startOf("day").toISOString();
		const setRateMock = {
			request: {
				query: SET_SHOP_CUT_RATE,
				variables: {
					artistId: ARTIST_ID,
					shopId: SHOP_ID,
					percent: 45,
					compensationModel: "PERCENTAGE",
					effectiveFrom: isoToday,
					note: "Raise",
				},
			},
			result: {
				data: {
					setShopCutRate: rate({ id: "rate-new", percent: 45, effectiveFrom: isoToday, note: "Raise" }),
				},
			},
		};
		renderPanel({ mocks: [...baseMocks({ rates: [rate()] }), setRateMock, ratesMock([rate(), rate({ id: "rate-new", percent: 45 })])] });

		await screen.findByText("40%", { selector: "strong" });
		await user.type(screen.getByPlaceholderText("40"), "45");
		await user.type(screen.getByLabelText("Note"), "Raise");
		await user.click(screen.getByRole("button", { name: "Record rate" }));

		await waitFor(() => expect(screen.getByPlaceholderText("40")).toHaveValue(null));
	});

	it("shows a validation error for a percent above 100 instead of submitting", async () => {
		const user = userEvent.setup();
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.type(screen.getByPlaceholderText("40"), "150");
		// fireEvent.submit dispatches the 'submit' event directly, rather than going through a
		// real click on the submit button - the percent input carries a native max="100"
		// attribute, and clicking a submit button inside a form with no noValidate runs the
		// browser's OWN interactive constraint validation first, which would block the submit
		// event (and this component's own handleSubmit) from ever running before its JS-level
		// range check gets a chance to set this error. Dispatching the event directly is the only
		// way to exercise handleSubmit's own bounds check in isolation from that native gate.
		fireEvent.submit(screen.getByRole("button", { name: "Record rate" }).closest("form"));

		expect(
			await screen.findByText("Enter a percentage between 0 and 100."),
		).toBeInTheDocument();
	});

	it("shows the server's field error when the mutation fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: SET_SHOP_CUT_RATE,
				variables: {
					artistId: ARTIST_ID,
					shopId: SHOP_ID,
					percent: 45,
					compensationModel: "PERCENTAGE",
					effectiveFrom: moment(moment().format("YYYY-MM-DD"), "YYYY-MM-DD").startOf("day").toISOString(),
					note: "",
				},
			},
			error: new Error("Could not record rate."),
		};
		renderPanel({ mocks: [...baseMocks({ rates: [] }), failingMock] });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.type(screen.getByPlaceholderText("40"), "45");
		await user.click(screen.getByRole("button", { name: "Record rate" }));

		expect(await screen.findByText("Could not record rate.")).toBeInTheDocument();
	});

	it("disables Record rate until a percent is entered", async () => {
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		await screen.findByRole("heading", { name: "Shop cut" });
		expect(screen.getByRole("button", { name: "Record rate" })).toBeDisabled();
	});
});

describe("switching to and recording a BOOTH_RENT rate", () => {
	it("selecting the Flat booth rent radio swaps the form's inputs", async () => {
		const user = userEvent.setup();
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.click(screen.getByRole("radio", { name: "Flat booth rent" }));

		expect(screen.getByPlaceholderText("500.00")).toBeInTheDocument();
		expect(screen.queryByPlaceholderText("40")).not.toBeInTheDocument();
	});

	it("submits setShopCutRate(compensationModel: BOOTH_RENT) followed by setBoothRentPlan", async () => {
		const user = userEvent.setup();
		const isoToday = moment(moment().format("YYYY-MM-DD"), "YYYY-MM-DD").startOf("day").toISOString();
		const setRateMock = {
			request: {
				query: SET_SHOP_CUT_RATE,
				variables: {
					artistId: ARTIST_ID,
					shopId: SHOP_ID,
					percent: 0,
					compensationModel: "BOOTH_RENT",
					effectiveFrom: isoToday,
					note: "",
				},
			},
			result: {
				data: { setShopCutRate: rate({ percent: 0, compensationModel: "BOOTH_RENT", effectiveFrom: isoToday }) },
			},
		};
		const setPlanMock = {
			request: {
				query: BoothRentService.SET_BOOTH_RENT_PLAN,
				variables: {
					artistId: ARTIST_ID,
					shopId: SHOP_ID,
					amountCents: 60000,
					dueDayOfMonth: 15,
					effectiveFrom: isoToday,
				},
			},
			result: {
				data: {
					setBoothRentPlan: {
						__typename: "BoothRentPlan",
						id: "plan-new",
						artistId: ARTIST_ID,
						shopId: SHOP_ID,
						amountCents: 60000,
						dueDayOfMonth: 15,
						effectiveFrom: isoToday,
						setByUserId: "admin-1",
						active: true,
						createdAt: isoToday,
					},
				},
			},
		};
		renderPanel({
			mocks: [
				...baseMocks({ rates: [] }),
				setRateMock,
				setPlanMock,
				// Two GetBoothRentPlans refetches land here, not one: useSetBoothRentPlan's own
				// `refetchQueries: ["GetBoothRentPlans"]` fires automatically, and handleSubmit
				// ALSO calls `await refetchPlans()` explicitly right after - see the component's
				// own booth-rent branch. Both are separate network requests against the same
				// active query, so both need a mock.
				plansMock([]),
				plansMock([]),
				// useSetShopCutRate's own `refetchQueries: ["GetShopCutRates"]` fires too.
				ratesMock([rate({ percent: 0, compensationModel: "BOOTH_RENT" })]),
			],
		});

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.click(screen.getByRole("radio", { name: "Flat booth rent" }));
		await user.type(screen.getByPlaceholderText("500.00"), "600");
		const dueDayInput = screen.getByDisplayValue("1");
		await user.clear(dueDayInput);
		await user.type(dueDayInput, "15");
		await user.click(screen.getByRole("button", { name: "Record rate" }));

		await waitFor(() => expect(screen.getByPlaceholderText("500.00")).toHaveValue(null));
	});

	it("shows a validation error for a negative rent amount instead of submitting", async () => {
		const user = userEvent.setup();
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.click(screen.getByRole("radio", { name: "Flat booth rent" }));
		await user.type(screen.getByPlaceholderText("500.00"), "-5");
		// See the matching PERCENTAGE-side test's comment: fireEvent.submit bypasses the rent
		// amount input's own native min="0" constraint, which would otherwise block the browser's
		// default submit action (and this component's own handleSubmit) before its JS-level check
		// ever ran.
		fireEvent.submit(screen.getByRole("button", { name: "Record rate" }).closest("form"));

		expect(await screen.findByText("Enter a monthly amount of $0 or more.")).toBeInTheDocument();
	});

	it("shows a validation error for a due day outside 1-31 instead of submitting", async () => {
		const user = userEvent.setup();
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.click(screen.getByRole("radio", { name: "Flat booth rent" }));
		await user.type(screen.getByPlaceholderText("500.00"), "500");
		const dueDayInput = screen.getByDisplayValue("1");
		await user.clear(dueDayInput);
		await user.type(dueDayInput, "45");
		// Same reason as the two validation tests above: the due-day input carries a native
		// max="31", which a real click-through submit would enforce before handleSubmit's own
		// check runs.
		fireEvent.submit(screen.getByRole("button", { name: "Record rate" }).closest("form"));

		expect(await screen.findByText("Enter a due day between 1 and 31.")).toBeInTheDocument();
	});

	it("disables Record rate until a rent amount is entered", async () => {
		const user = userEvent.setup();
		renderPanel({ mocks: baseMocks({ rates: [] }) });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.click(screen.getByRole("radio", { name: "Flat booth rent" }));

		expect(screen.getByRole("button", { name: "Record rate" })).toBeDisabled();
	});
});

describe("saving state", () => {
	it("shows Saving... and disables the button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const isoToday = moment(moment().format("YYYY-MM-DD"), "YYYY-MM-DD").startOf("day").toISOString();
		const pendingMock = {
			request: {
				query: SET_SHOP_CUT_RATE,
				variables: {
					artistId: ARTIST_ID,
					shopId: SHOP_ID,
					percent: 40,
					compensationModel: "PERCENTAGE",
					effectiveFrom: isoToday,
					note: "",
				},
			},
			delay: 60 * 1000,
			result: { data: { setShopCutRate: null } },
		};
		renderPanel({ mocks: [...baseMocks({ rates: [] }), pendingMock] });

		await screen.findByRole("heading", { name: "Shop cut" });
		await user.type(screen.getByPlaceholderText("40"), "40");
		await user.click(screen.getByRole("button", { name: "Record rate" }));

		expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
	});
});
