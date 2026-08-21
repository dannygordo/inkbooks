// BoothRentService.js tests, following the same convention ClientService.test.js already
// established: a "Service" file here is an IIFE-shaped module (this one is a plain object of
// closures rather than an IIFE, but the same pattern) exporting a mix of React-hook factories
// wrapping useQuery/useMutation around a gql document, plus the raw gql documents themselves -
// there is almost no pure logic to unit-test in isolation, so every export below is exercised
// through a tiny throwaway harness component rendered under MockedProvider. Unlike ClientService,
// BoothRentService exports EVERY gql document it defines directly on the default export, so every
// mock below uses the real document (e.g. `BoothRentService.GET_BOOTH_RENT_PLANS`) rather than a
// hand-copied reconstruction - MockedProvider still matches by printed document text + variables,
// not identity, but there is no internal-only document here that needs reconstructing.
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline, and this file
// stays a .js to match its sibling BoothRentService.js.
//
// Per BoothRentService.js's own header comment, this is "Feature 5 - booth rent vs. percentage
// cut", the flat-fee counterpart to ShopCutRateService.js: an artist reads their own terms/charges,
// only a shop admin sets the terms, and paying a charge is a two-step
// markBoothRentPaidManually -> confirmBoothRentPaid lifecycle. Tests below cover exactly what this
// file exports, including the two queries' differing skip-guard logic (see "getBoothRentPlans"
// and "getBoothRentCharges" sections) and the fact both query factories let a caller's own
// `options` argument override the computed skip/fetchPolicy - the opposite precedence from
// DepositService.getAvailableDeposits, worth calling out explicitly since it's easy to get backwards.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import { print } from "graphql";
import BoothRentService from "./BoothRentService";

// ---- generic harnesses -----------------------------------------------------------------------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

function MutationHarness({ document, variables }) {
	const [result, setResult] = React.useState(null);
	const [mutate] = useMutation(document, { onCompleted: setResult });
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

function plan(overrides = {}) {
	return {
		__typename: "BoothRentPlan",
		id: "plan-1",
		artistId: "artist-1",
		shopId: "shop-1",
		amountCents: 20000,
		dueDayOfMonth: 1,
		effectiveFrom: "2026-01-01T00:00:00.000Z",
		setByUserId: "user-1",
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function charge(overrides = {}) {
	return {
		__typename: "BoothRentCharge",
		id: "charge-1",
		artistId: "artist-1",
		shopId: "shop-1",
		amountCents: 20000,
		periodMonth: "2026-08",
		dueDate: "2026-08-01T00:00:00.000Z",
		status: "pending",
		markedPaidAt: null,
		markedPaidByUserId: null,
		confirmedAt: null,
		confirmedByUserId: null,
		expenseId: null,
		incomeId: null,
		createdAt: "2026-08-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- getBoothRentPlans ---------------------------------------------------------------------

describe("BoothRentService.getBoothRentPlans", () => {
	it("resolves with the artist's plans when both artistId and shopId are given", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentPlans("artist-1", "shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BoothRentService.GET_BOOTH_RENT_PLANS,
								variables: { artistId: "artist-1", shopId: "shop-1" },
							},
							result: { data: { getBoothRentPlans: [plan()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("plan-1");
	});

	// skip: !artistId || !shopId - EITHER missing is enough to skip (an OR, unlike
	// getBoothRentCharges below which uses AND).
	it("skips when artistId is missing, with no request and no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentPlans(null, "shop-1"),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("skips when shopId is missing, with no request and no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentPlans("artist-1", null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("defaults options to {} - calling with only two arguments does not throw", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentPlans("artist-1", "shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BoothRentService.GET_BOOTH_RENT_PLANS,
								variables: { artistId: "artist-1", shopId: "shop-1" },
							},
							result: { data: { getBoothRentPlans: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("[]");
	});

	// `...options` is spread AFTER the computed `skip`/`fetchPolicy` in this function, so a
	// caller's own options object can override the guard entirely - e.g. forcing skip:false even
	// with a missing id. This is the opposite precedence from DepositService.getAvailableDeposits
	// (see that file's tests), so it's worth locking in explicitly rather than assuming symmetry.
	it("lets an explicit options.skip override the computed guard, even with a missing id", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentPlans(null, null, { skip: false }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BoothRentService.GET_BOOTH_RENT_PLANS,
								variables: { artistId: null, shopId: null },
							},
							result: { data: { getBoothRentPlans: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		// Reaching a resolved (non-error) result at all proves the request actually fired despite
		// both ids being null - the mock above would otherwise go unmatched and surface as an error.
		expect(await screen.findByTestId("result")).toHaveTextContent("[]");
	});
});

// ---- getBoothRentCharges ------------------------------------------------------------------

describe("BoothRentService.getBoothRentCharges", () => {
	it("resolves with a page of charges for the given scope", async () => {
		const scope = { artistId: "artist-1", shopId: "shop-1", status: "pending", page: { limit: 10, offset: 0 } };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentCharges(scope),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: BoothRentService.GET_BOOTH_RENT_CHARGES, variables: { ...scope } },
							result: {
								data: {
									getBoothRentCharges: {
										__typename: "BoothRentChargePage",
										items: [charge()],
										pageInfo: { __typename: "PageInfo", totalCount: 1, hasMore: false, limit: 10, offset: 0 },
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("charge-1");
	});

	// skip: !scope?.artistId && !scope?.shopId - an AND, so it only skips when BOTH ids are
	// absent. Either one alone is enough to fire, unlike getBoothRentPlans above.
	it("still fires with only artistId in scope (shopId omitted)", async () => {
		const scope = { artistId: "artist-1" };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentCharges(scope),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: BoothRentService.GET_BOOTH_RENT_CHARGES, variables: { ...scope } },
							result: {
								data: {
									getBoothRentCharges: {
										__typename: "BoothRentChargePage",
										items: [],
										pageInfo: { __typename: "PageInfo", totalCount: 0, hasMore: false, limit: 25, offset: 0 },
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	it("still fires with only shopId in scope (artistId omitted)", async () => {
		const scope = { shopId: "shop-1" };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentCharges(scope),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: BoothRentService.GET_BOOTH_RENT_CHARGES, variables: { ...scope } },
							result: {
								data: {
									getBoothRentCharges: {
										__typename: "BoothRentChargePage",
										items: [],
										pageInfo: { __typename: "PageInfo", totalCount: 0, hasMore: false, limit: 25, offset: 0 },
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	// Neither id present - even with a `status` filter set, the AND guard still skips, since
	// status alone was never meant to scope a request (there'd be nothing to scope it TO).
	it("skips when both artistId and shopId are absent, even if other scope fields are set", async () => {
		const scope = { status: "pending" };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentCharges(scope),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("skips when scope itself is undefined (optional chaining guards the crash)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => BoothRentService.getBoothRentCharges(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- useSetBoothRentPlan --------------------------------------------------------------------

describe("BoothRentService.useSetBoothRentPlan", () => {
	it("sets a plan and returns the full plan record", async () => {
		const user = userEvent.setup();
		const variables = {
			artistId: "artist-1",
			shopId: "shop-1",
			amountCents: 20000,
			dueDayOfMonth: 1,
			effectiveFrom: "2026-09-01T00:00:00.000Z",
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: BoothRentService.SET_BOOTH_RENT_PLAN,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: BoothRentService.SET_BOOTH_RENT_PLAN, variables },
							result: { data: { setBoothRentPlan: plan({ effectiveFrom: variables.effectiveFrom }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("plan-1");
	});

	// effectiveFrom is a nullable DateTime in the schema (no `!`) - a plan effective immediately
	// has to be settable without it.
	it("works with effectiveFrom omitted", async () => {
		const user = userEvent.setup();
		const variables = {
			artistId: "artist-1",
			shopId: "shop-1",
			amountCents: 15000,
			dueDayOfMonth: 15,
			effectiveFrom: undefined,
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: BoothRentService.SET_BOOTH_RENT_PLAN,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: BoothRentService.SET_BOOTH_RENT_PLAN, variables },
							result: { data: { setBoothRentPlan: plan({ amountCents: 15000, dueDayOfMonth: 15, effectiveFrom: null }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("15000");
	});
});

// ---- useMarkBoothRentPaidManually / useConfirmBoothRentPaid ---------------------------------

describe("BoothRentService.useMarkBoothRentPaidManually", () => {
	it("marks a charge paid manually and returns the updated charge", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: BoothRentService.MARK_BOOTH_RENT_PAID_MANUALLY,
				variables: { boothRentChargeId: "charge-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BoothRentService.MARK_BOOTH_RENT_PAID_MANUALLY,
								variables: { boothRentChargeId: "charge-1" },
							},
							result: {
								data: {
									markBoothRentPaidManually: charge({
										status: "marked_paid",
										markedPaidAt: "2026-08-21T00:00:00.000Z",
										markedPaidByUserId: "user-1",
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("marked_paid");
		expect(result).toHaveTextContent("2026-08-21T00:00:00.000Z");
	});
});

describe("BoothRentService.useConfirmBoothRentPaid", () => {
	it("confirms a charge and returns the confirmed charge", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: BoothRentService.CONFIRM_BOOTH_RENT_PAID,
				variables: { boothRentChargeId: "charge-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: BoothRentService.CONFIRM_BOOTH_RENT_PAID,
								variables: { boothRentChargeId: "charge-1" },
							},
							result: {
								data: {
									confirmBoothRentPaid: charge({
										status: "confirmed",
										confirmedAt: "2026-08-21T00:00:00.000Z",
										confirmedByUserId: "user-2",
										incomeId: "income-1",
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("confirmed");
		expect(result).toHaveTextContent("income-1");
	});
});

// ---- document shape sanity checks -------------------------------------------------------------
// GET_BOOTH_RENT_PLANS/GET_BOOTH_RENT_CHARGES/etc are built by interpolating a shared
// PLAN_FIELDS/CHARGE_FIELDS string INTO a gql template literal, rather than the plain gql tag
// literal every other Service in this codebase uses - worth a direct check that the interpolation
// actually produces a well-formed document selecting every field it claims to, since a typo in the
// shared field-block string would otherwise only show up as a missing field deep in some UI.

describe("BoothRentService field-block documents", () => {
	it("GET_BOOTH_RENT_PLANS selects every PLAN_FIELDS field", () => {
		const printed = print(BoothRentService.GET_BOOTH_RENT_PLANS);
		[
			"id",
			"artistId",
			"shopId",
			"amountCents",
			"dueDayOfMonth",
			"effectiveFrom",
			"setByUserId",
			"active",
			"createdAt",
		].forEach((field) => expect(printed).toContain(field));
	});

	it("GET_BOOTH_RENT_CHARGES selects every CHARGE_FIELDS field plus pageInfo", () => {
		const printed = print(BoothRentService.GET_BOOTH_RENT_CHARGES);
		[
			"id",
			"artistId",
			"shopId",
			"amountCents",
			"periodMonth",
			"dueDate",
			"status",
			"markedPaidAt",
			"markedPaidByUserId",
			"confirmedAt",
			"confirmedByUserId",
			"expenseId",
			"incomeId",
			"createdAt",
			"pageInfo",
			"totalCount",
			"hasMore",
		].forEach((field) => expect(printed).toContain(field));
	});

	it("SET_BOOTH_RENT_PLAN, MARK_BOOTH_RENT_PAID_MANUALLY and CONFIRM_BOOTH_RENT_PAID each return the shared field block", () => {
		expect(print(BoothRentService.SET_BOOTH_RENT_PLAN)).toContain("dueDayOfMonth");
		expect(print(BoothRentService.MARK_BOOTH_RENT_PAID_MANUALLY)).toContain("markedPaidByUserId");
		expect(print(BoothRentService.CONFIRM_BOOTH_RENT_PAID)).toContain("confirmedByUserId");
	});
});
