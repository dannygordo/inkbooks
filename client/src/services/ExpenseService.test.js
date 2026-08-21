// ExpenseService.js tests. A "Service" file here is an IIFE exporting a mix of React-hook
// factories wrapping useQuery/useMutation around a gql document, and raw gql documents meant to be
// passed directly to useMutation/useQuery by a calling component - there is almost no pure logic
// to unit-test in isolation, so every export below is exercised through a tiny throwaway harness
// component rendered under MockedProvider, the same convention ClientService.test.js already
// established for this codebase.
//
// Unlike ClientService, every query document ExpenseService builds (FETCH_EXPENSE_TYPES,
// FETCH_EXPENSES, FETCH_RECURRING_EXPENSES) is also exported raw, and it's the SAME object
// reference the wrapped hook uses internally - so mocks below reference ExpenseService.FOO
// directly rather than reconstructing a local copy of the query text.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling ExpenseService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useQuery, useMutation } from "@apollo/client";
import ExpenseService from "./ExpenseService";

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

function expenseType(overrides = {}) {
	return {
		__typename: "ExpenseType",
		id: "expense-type-1",
		shopId: "shop-1",
		artistUserId: null,
		name: "Supplies",
		description: "Needles, ink, gloves",
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function expense(overrides = {}) {
	return {
		__typename: "Expense",
		id: "expense-1",
		shopId: "shop-1",
		artistUserId: null,
		expenseTypeId: "expense-type-1",
		expenseType: { __typename: "ExpenseType", id: "expense-type-1", name: "Supplies" },
		amountCents: 4500,
		description: "Ink restock",
		date: "2026-08-01T00:00:00.000Z",
		recurringExpenseId: null,
		createdAt: "2026-08-01T00:00:00.000Z",
		createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
		...overrides,
	};
}

function recurringExpense(overrides = {}) {
	return {
		__typename: "RecurringExpense",
		id: "recurring-1",
		shopId: "shop-1",
		artistUserId: null,
		expenseTypeId: "expense-type-1",
		expenseType: { __typename: "ExpenseType", id: "expense-type-1", name: "Rent" },
		amountCents: 200000,
		description: "Chair rental",
		frequency: "monthly",
		startDate: "2026-01-01T00:00:00.000Z",
		nextRunDate: "2026-09-01T00:00:00.000Z",
		endDate: null,
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- getExpenseTypes ----------------------------------------------------------------------------
//
// getExpenseTypes/getExpenses/getRecurringExpenses all share one shape:
//   useQuery(DOC, { variables: {...scope, ...}, skip: !scope?.shopId && !scope?.artistUserId,
//                   fetchPolicy: "cache-and-network", ...options })
// getExpenseTypes is used below as the flagship test of that shared shape - including how
// `...options` spread AFTER `skip`/`fetchPolicy` lets a caller's options object override either
// one. getExpenses/getRecurringExpenses further down only re-verify the scope/skip half of this,
// since the options-override mechanics are identical code and don't need re-proving per hook.

describe("ExpenseService.getExpenseTypes", () => {
	it("resolves with expense types for a shopId scope, using the includeInactive=false default", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getExpenseTypes({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_EXPENSE_TYPES,
								variables: { shopId: "shop-1", includeInactive: false },
							},
							result: { data: { getExpenseTypes: [expenseType()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Supplies");
	});

	it("resolves with expense types for an artistUserId scope, with includeInactive explicitly true", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getExpenseTypes({ artistUserId: "artist-1" }, true),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_EXPENSE_TYPES,
								variables: { artistUserId: "artist-1", includeInactive: true },
							},
							result: {
								data: {
									getExpenseTypes: [
										expenseType({
											id: "expense-type-2",
											shopId: null,
											artistUserId: "artist-1",
											active: false,
											name: "Inactive supplies",
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

		expect(await screen.findByTestId("result")).toHaveTextContent("Inactive supplies");
	});

	// !scope?.shopId && !scope?.artistUserId - neither present (including the default-args case of
	// calling with no scope at all) must skip the query entirely rather than sending shopId/
	// artistUserId as null/undefined to the server.
	it("skips the query when called with no scope at all (default arguments)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ExpenseService.getExpenseTypes() });
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
				hookFn: () => ExpenseService.getExpenseTypes({}),
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
				hookFn: () => ExpenseService.getExpenseTypes(undefined, false, { skip: false }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_EXPENSE_TYPES,
								variables: { includeInactive: false },
							},
							result: { data: { getExpenseTypes: [] } },
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
				hookFn: () => ExpenseService.getExpenseTypes({ shopId: "shop-1" }, false, { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- CREATE_EXPENSE_TYPE / UPDATE_EXPENSE_TYPE --------------------------------------------------

describe("ExpenseService.CREATE_EXPENSE_TYPE", () => {
	it("creates an expense type from a CreateExpenseTypeInput", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Supplies", description: "Needles, ink, gloves" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.CREATE_EXPENSE_TYPE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
							result: { data: { createExpenseType: expenseType() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Supplies");
	});
});

describe("ExpenseService.UPDATE_EXPENSE_TYPE", () => {
	it("updates an expense type from an UpdateExpenseTypeInput", async () => {
		const user = userEvent.setup();
		const input = { id: "expense-type-1", name: "Supplies & consumables" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.UPDATE_EXPENSE_TYPE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.UPDATE_EXPENSE_TYPE, variables: { input } },
							result: {
								data: {
									updateExpenseType: expenseType({ name: "Supplies & consumables" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Supplies & consumables");
	});
});

// ---- FETCH_EXPENSE_TYPES (raw document, standalone) ----------------------------------------------

describe("ExpenseService.FETCH_EXPENSE_TYPES (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same way a
	// calling component reaching for the raw document (rather than the wrapped hook) would use it.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(ExpenseService.FETCH_EXPENSE_TYPES, {
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
								query: ExpenseService.FETCH_EXPENSE_TYPES,
								variables: { shopId: "shop-1", includeInactive: false },
							},
							result: { data: { getExpenseTypes: [expenseType()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Supplies");
	});
});

// ---- getExpenses ---------------------------------------------------------------------------------

describe("ExpenseService.getExpenses", () => {
	it("resolves with a page of expenses for a shopId scope, mapping range/page into variables", async () => {
		const range = { start: "2026-08-01T00:00:00.000Z", end: "2026-08-31T23:59:59.999Z" };
		const page = { limit: 10, offset: 0 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getExpenses({ shopId: "shop-1" }, range, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_EXPENSES,
								variables: { shopId: "shop-1", start: range.start, end: range.end, page },
							},
							result: {
								data: {
									getExpenses: {
										__typename: "ExpensePage",
										items: [expense()],
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
		expect(result).toHaveTextContent("Ink restock");
		expect(result).toHaveTextContent("Gendry");
	});

	// range/page are always present as explicit variables keys (start/end/page), unlike scope's
	// ad-hoc spread - calling with just a scope must still send start/end/page as explicit
	// undefined, not omit them.
	it("defaults start/end/page to undefined when range and page are omitted", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getExpenses({ artistUserId: "artist-1" }, undefined, undefined),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_EXPENSES,
								variables: { artistUserId: "artist-1", start: undefined, end: undefined, page: undefined },
							},
							result: {
								data: {
									getExpenses: {
										__typename: "ExpensePage",
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
				hookFn: () => ExpenseService.getExpenses({}, undefined, undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- RECORD_EXPENSE / UPDATE_EXPENSE / DELETE_EXPENSE --------------------------------------------

describe("ExpenseService.RECORD_EXPENSE", () => {
	it("records an expense from a RecordExpenseInput", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", expenseTypeId: "expense-type-1", amountCents: 4500, date: "2026-08-01T00:00:00.000Z" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.RECORD_EXPENSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.RECORD_EXPENSE, variables: { input } },
							result: { data: { recordExpense: expense() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Ink restock");
	});
});

describe("ExpenseService.UPDATE_EXPENSE", () => {
	it("updates an expense from an UpdateExpenseInput", async () => {
		const user = userEvent.setup();
		const input = { id: "expense-1", amountCents: 5000 };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.UPDATE_EXPENSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.UPDATE_EXPENSE, variables: { input } },
							result: { data: { updateExpense: expense({ amountCents: 5000 }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"amountCents":5000');
	});
});

describe("ExpenseService.DELETE_EXPENSE", () => {
	it("deletes an expense by id, returning a boolean", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.DELETE_EXPENSE,
				variables: { expenseId: "expense-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.DELETE_EXPENSE, variables: { expenseId: "expense-1" } },
							result: { data: { deleteExpense: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"deleteExpense":true');
	});
});

// ---- getRecurringExpenses ------------------------------------------------------------------------

describe("ExpenseService.getRecurringExpenses", () => {
	it("resolves with recurring expenses for a shopId scope, using the includeInactive=false default", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getRecurringExpenses({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_RECURRING_EXPENSES,
								variables: { shopId: "shop-1", includeInactive: false },
							},
							result: { data: { getRecurringExpenses: [recurringExpense()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Chair rental");
	});

	it("resolves with recurring expenses for an artistUserId scope, with includeInactive explicitly true", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getRecurringExpenses({ artistUserId: "artist-1" }, true),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.FETCH_RECURRING_EXPENSES,
								variables: { artistUserId: "artist-1", includeInactive: true },
							},
							result: {
								data: {
									getRecurringExpenses: [
										recurringExpense({
											id: "recurring-2",
											shopId: null,
											artistUserId: "artist-1",
											active: false,
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

		expect(await screen.findByTestId("result")).toHaveTextContent("recurring-2");
	});

	it("skips the query when scope has neither shopId nor artistUserId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ExpenseService.getRecurringExpenses(),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- CREATE_RECURRING_EXPENSE / UPDATE_RECURRING_EXPENSE / DELETE_RECURRING_EXPENSE --------------

describe("ExpenseService.CREATE_RECURRING_EXPENSE", () => {
	it("creates a recurring expense from a CreateRecurringExpenseInput", async () => {
		const user = userEvent.setup();
		const input = {
			shopId: "shop-1",
			expenseTypeId: "expense-type-1",
			amountCents: 200000,
			frequency: "monthly",
			startDate: "2026-01-01T00:00:00.000Z",
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.CREATE_RECURRING_EXPENSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.CREATE_RECURRING_EXPENSE, variables: { input } },
							result: { data: { createRecurringExpense: recurringExpense() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Chair rental");
	});
});

describe("ExpenseService.UPDATE_RECURRING_EXPENSE", () => {
	it("updates a recurring expense from an UpdateRecurringExpenseInput", async () => {
		const user = userEvent.setup();
		const input = { id: "recurring-1", active: false };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.UPDATE_RECURRING_EXPENSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ExpenseService.UPDATE_RECURRING_EXPENSE, variables: { input } },
							result: { data: { updateRecurringExpense: recurringExpense({ active: false }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"active":false');
	});
});

describe("ExpenseService.DELETE_RECURRING_EXPENSE", () => {
	it("deletes a recurring expense by id, returning a boolean", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ExpenseService.DELETE_RECURRING_EXPENSE,
				variables: { recurringExpenseId: "recurring-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ExpenseService.DELETE_RECURRING_EXPENSE,
								variables: { recurringExpenseId: "recurring-1" },
							},
							result: { data: { deleteRecurringExpense: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"deleteRecurringExpense":true');
	});
});
