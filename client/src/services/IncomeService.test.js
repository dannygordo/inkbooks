// IncomeService.js tests. A "Service" file here is an IIFE exporting a mix of React-hook
// factories wrapping useQuery/useMutation around a gql document, and raw gql documents meant to be
// passed directly to useMutation/useQuery by a calling component - there is almost no pure logic
// to unit-test in isolation, so every export below is exercised through a tiny throwaway harness
// component rendered under MockedProvider, the same convention ClientService.test.js already
// established for this codebase.
//
// IncomeService.js's own header comment calls this file "the income-side mirror of
// ExpenseService.js" (same `{shopId}`/`{artistUserId}` scope convention, minus the recurring-
// expense feature), so this test file mirrors ExpenseService.test.js's structure accordingly.
// Every query document IncomeService builds (FETCH_INCOME_TYPES, FETCH_INCOMES) is also exported
// raw, and it's the SAME object reference the wrapped hook uses internally - so mocks below
// reference IncomeService.FOO directly rather than reconstructing a local copy of the query text.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling IncomeService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useQuery, useMutation } from "@apollo/client";
import IncomeService from "./IncomeService";

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query-returning hook function produces. `hookFn` is called with no args and
// must itself close over any variables it needs - this lets one harness cover every query-shaped
// export without repeating the loading/error/data plumbing each time.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// Deliberately generic: these tests only need to know THAT a request errored (e.g. no
		// mock matched, proving a network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once
// it lands.
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

function incomeType(overrides = {}) {
	return {
		__typename: "IncomeType",
		id: "income-type-1",
		shopId: "shop-1",
		artistUserId: null,
		name: "Merch sales",
		description: "T-shirts, prints, aftercare products",
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function income(overrides = {}) {
	return {
		__typename: "Income",
		id: "income-1",
		shopId: "shop-1",
		artistUserId: null,
		incomeTypeId: "income-type-1",
		incomeType: { __typename: "IncomeType", id: "income-type-1", name: "Merch sales" },
		amountCents: 3500,
		description: "Convention weekend merch",
		date: "2026-08-01T00:00:00.000Z",
		createdAt: "2026-08-01T00:00:00.000Z",
		createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
		...overrides,
	};
}

// ---- getIncomeTypes ------------------------------------------------------------------------------
//
// getIncomeTypes/getIncomes share one shape:
//   useQuery(DOC, { variables: {...scope, ...}, skip: !scope?.shopId && !scope?.artistUserId,
//                   fetchPolicy: "cache-and-network", ...options })
// getIncomeTypes is used below as the flagship test of that shared shape - including how
// `...options` spread AFTER `skip`/`fetchPolicy` lets a caller's options object override either
// one. getIncomes further down only re-verifies the scope/skip half of this, since the
// options-override mechanics are identical code and don't need re-proving per hook.

describe("IncomeService.getIncomeTypes", () => {
	it("resolves with income types for a shopId scope, using the includeInactive=false default", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomeTypes({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: IncomeService.FETCH_INCOME_TYPES,
								variables: { shopId: "shop-1", includeInactive: false },
							},
							result: { data: { getIncomeTypes: [incomeType()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Merch sales");
	});

	it("resolves with income types for an artistUserId scope, with includeInactive explicitly true", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomeTypes({ artistUserId: "artist-1" }, true),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: IncomeService.FETCH_INCOME_TYPES,
								variables: { artistUserId: "artist-1", includeInactive: true },
							},
							result: {
								data: {
									getIncomeTypes: [
										incomeType({
											id: "income-type-2",
											shopId: null,
											artistUserId: "artist-1",
											active: false,
											name: "Inactive income type",
										}),
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Inactive income type");
	});

	// !scope?.shopId && !scope?.artistUserId - neither present (including the default-args case of
	// calling with no scope at all) must skip the query entirely rather than sending shopId/
	// artistUserId as null/undefined to the server.
	it("skips the query when called with no scope at all (default arguments)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => IncomeService.getIncomeTypes() });
		}
		// Zero mocks registered: if this fired a real request it would blow up with "no matching
		// mock" and surface as an error, which the assertion below rules out.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("also skips when scope is an empty object (neither shopId nor artistUserId set)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomeTypes({}),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The third `options` argument is spread onto the useQuery config AFTER the computed `skip`,
	// so options.skip: false overrides the computed skip - this fires the query anyway despite an
	// empty scope, proving the override actually reaches useQuery rather than being ignored.
	it("fires anyway when options explicitly overrides skip to false, even with no scope", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomeTypes(undefined, false, { skip: false }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: IncomeService.FETCH_INCOME_TYPES,
								variables: { includeInactive: false },
							},
							result: { data: { getIncomeTypes: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("[]");
	});

	// The same override works in the other direction: options.skip: true forces a skip even with a
	// perfectly valid scope.
	it("skips anyway when options explicitly overrides skip to true, even with a valid scope", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomeTypes({ shopId: "shop-1" }, false, { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- CREATE_INCOME_TYPE / UPDATE_INCOME_TYPE ------------------------------------------------------

describe("IncomeService.CREATE_INCOME_TYPE", () => {
	it("creates an income type from a CreateIncomeTypeInput", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Merch sales", description: "T-shirts, prints, aftercare products" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: IncomeService.CREATE_INCOME_TYPE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: IncomeService.CREATE_INCOME_TYPE, variables: { input } },
							result: { data: { createIncomeType: incomeType() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Merch sales");
	});
});

describe("IncomeService.UPDATE_INCOME_TYPE", () => {
	it("updates an income type from an UpdateIncomeTypeInput", async () => {
		const user = userEvent.setup();
		const input = { id: "income-type-1", name: "Merch & aftercare sales" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: IncomeService.UPDATE_INCOME_TYPE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: IncomeService.UPDATE_INCOME_TYPE, variables: { input } },
							result: {
								data: {
									updateIncomeType: incomeType({ name: "Merch & aftercare sales" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Merch & aftercare sales");
	});
});

// ---- FETCH_INCOME_TYPES (raw document, standalone) -------------------------------------------------

describe("IncomeService.FETCH_INCOME_TYPES (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same way a
	// calling component reaching for the raw document (rather than the wrapped hook) would use it.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(IncomeService.FETCH_INCOME_TYPES, {
						variables: { shopId: "shop-1", includeInactive: false },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: IncomeService.FETCH_INCOME_TYPES,
								variables: { shopId: "shop-1", includeInactive: false },
							},
							result: { data: { getIncomeTypes: [incomeType()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Merch sales");
	});
});

// ---- getIncomes -----------------------------------------------------------------------------------

describe("IncomeService.getIncomes", () => {
	it("resolves with a page of incomes for a shopId scope, mapping range/page into variables", async () => {
		const range = { start: "2026-08-01T00:00:00.000Z", end: "2026-08-31T23:59:59.999Z" };
		const page = { limit: 10, offset: 0 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomes({ shopId: "shop-1" }, range, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: IncomeService.FETCH_INCOMES,
								variables: { shopId: "shop-1", start: range.start, end: range.end, page },
							},
							result: {
								data: {
									getIncomes: {
										__typename: "IncomePage",
										items: [income()],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 1,
											hasMore: false,
											limit: 10,
											offset: 0,
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Convention weekend merch");
		expect(result).toHaveTextContent("Gendry");
	});

	// range/page are always present as explicit variables keys (start/end/page), unlike scope's
	// ad-hoc spread - calling with just a scope must still send start/end/page as explicit
	// undefined, not omit them.
	it("defaults start/end/page to undefined when range and page are omitted", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomes({ artistUserId: "artist-1" }, undefined, undefined),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: IncomeService.FETCH_INCOMES,
								variables: { artistUserId: "artist-1", start: undefined, end: undefined, page: undefined },
							},
							result: {
								data: {
									getIncomes: {
										__typename: "IncomePage",
										items: [],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 0,
											hasMore: false,
											limit: 25,
											offset: 0,
										},
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

	it("skips the query when scope has neither shopId nor artistUserId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => IncomeService.getIncomes({}, undefined, undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- RECORD_INCOME / UPDATE_INCOME / DELETE_INCOME --------------------------------------------------

describe("IncomeService.RECORD_INCOME", () => {
	it("records an income from a RecordIncomeInput", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", incomeTypeId: "income-type-1", amountCents: 3500, date: "2026-08-01T00:00:00.000Z" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: IncomeService.RECORD_INCOME,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: IncomeService.RECORD_INCOME, variables: { input } },
							result: { data: { recordIncome: income() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Convention weekend merch");
	});
});

describe("IncomeService.UPDATE_INCOME", () => {
	it("updates an income from an UpdateIncomeInput", async () => {
		const user = userEvent.setup();
		const input = { id: "income-1", amountCents: 4000 };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: IncomeService.UPDATE_INCOME,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: IncomeService.UPDATE_INCOME, variables: { input } },
							result: { data: { updateIncome: income({ amountCents: 4000 }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"amountCents":4000');
	});
});

describe("IncomeService.DELETE_INCOME", () => {
	it("deletes an income by id, returning a boolean", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: IncomeService.DELETE_INCOME,
				variables: { incomeId: "income-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: IncomeService.DELETE_INCOME, variables: { incomeId: "income-1" } },
							result: { data: { deleteIncome: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"deleteIncome":true');
	});
});
