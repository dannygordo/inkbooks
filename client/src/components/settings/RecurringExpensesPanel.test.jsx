// RecurringExpensesPanel.jsx tests. This is a TEMPLATE editor - see the component's own header
// comment: creating/deleting a template here does not touch the real Expense ledger, it only
// affects what a scheduled job generates going forward. The two owner-scope shapes
// (businessScopeFor: {shopId} for a shop admin at their shop, {artistUserId} for everyone else
// this feature is visible to) are exercised throughout, since a wrong scope means either querying
// the wrong owner's data or - for a create - sending a field the schema doesn't define for that
// caller (see utils/businessScope.js's own comment on createScopeFor).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import RecurringExpensesPanel from "./RecurringExpensesPanel";
import { AuthContext } from "../../context/auth";
import ExpenseService from "../../services/ExpenseService";

// The real documents, imported from the service - not hand-written copies. MockedProvider pairs a
// request with its result by comparing the printed document plus variables, so a near-copy stops
// matching after one field of drift and the test fails as a network error that looks like a
// component bug - same reasoning as FormsPanel.test.jsx/SquarePanel.test.jsx.
function expenseTypesMock(scope, types) {
	return {
		request: {
			query: ExpenseService.FETCH_EXPENSE_TYPES,
			variables: { ...scope, includeInactive: false },
		},
		result: {
			data: { getExpenseTypes: types.map((t) => ({ __typename: "ExpenseType", ...t })) },
		},
	};
}

function recurringExpensesMock(scope, items) {
	return {
		request: {
			query: ExpenseService.FETCH_RECURRING_EXPENSES,
			variables: { ...scope, includeInactive: true },
		},
		result: {
			data: {
				getRecurringExpenses: items.map((item) => ({ __typename: "RecurringExpense", ...item })),
			},
		},
	};
}

function expenseType(overrides = {}) {
	return {
		id: "expense-type-1",
		shopId: "shop-1",
		artistUserId: null,
		name: "Rent",
		description: null,
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function recurringExpense(overrides = {}) {
	return {
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

const SHOP_ADMIN = {
	id: "user-1",
	role: 10,
	userInfo: { id: "user-1", shop: { id: "shop-1" } },
};

const SHOP_SCOPE = { shopId: "shop-1" };

const INDEPENDENT_ARTIST = {
	id: "artist-1",
	role: 20,
	userInfo: null,
};

const ARTIST_SCOPE = { artistUserId: "artist-1" };

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<RecurringExpensesPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("loading and empty states", () => {
	it("shows the empty-state message when there are no recurring expenses yet", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [expenseTypesMock(SHOP_SCOPE, [expenseType()]), recurringExpensesMock(SHOP_SCOPE, [])],
		});

		expect(await screen.findByText("No recurring expenses set up yet.")).toBeInTheDocument();
	});

	it("does not show the empty-state message once data has loaded with items", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
			],
		});

		expect(await screen.findByText("Chair rental")).toBeInTheDocument();
		expect(screen.queryByText("No recurring expenses set up yet.")).not.toBeInTheDocument();
	});
});

describe("owner scope", () => {
	it("queries with a shopId scope for a shop admin at their shop", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
			],
		});

		// Reaching the row (rather than an Apollo "no matching mock" error) IS the assertion that
		// {shopId: "shop-1"} was sent, not {artistUserId: ...}.
		expect(await screen.findByText("Chair rental")).toBeInTheDocument();
	});

	it("queries with an artistUserId scope for an independent artist", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				expenseTypesMock(ARTIST_SCOPE, [expenseType({ shopId: null, artistUserId: "artist-1" })]),
				recurringExpensesMock(ARTIST_SCOPE, [
					recurringExpense({ shopId: null, artistUserId: "artist-1", description: "Studio subscription" }),
				]),
			],
		});

		expect(await screen.findByText("Studio subscription")).toBeInTheDocument();
	});
});

describe("a populated list", () => {
	it("shows the category, formatted amount, frequency, and next run date", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
			],
		});

		expect(await screen.findByText(/Rent/)).toBeInTheDocument();
		expect(screen.getByText(/\$2,000\.00 \/ Monthly/)).toBeInTheDocument();
		expect(screen.getByText(/Next: Sep 1, 2026/)).toBeInTheDocument();
	});

	it("falls back to Unknown category when the expense type has been removed", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ expenseType: null })]),
			],
		});

		expect(await screen.findByText(/Unknown category/)).toBeInTheDocument();
	});

	it("shows a Paused chip for an inactive item and offers Resume instead of Pause", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ active: false })]),
			],
		});

		expect(await screen.findByText("Paused")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
	});

	it("shows an optional description when present, and omits it when absent", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ description: "" })]),
			],
		});

		await screen.findByText(/Rent/);
		expect(screen.queryByText("Chair rental")).not.toBeInTheDocument();
	});

	it("shows an end date when the template has one", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [
					recurringExpense({ endDate: "2027-01-01T00:00:00.000Z" }),
				]),
			],
		});

		expect(await screen.findByText(/Ends Jan 1, 2027/)).toBeInTheDocument();
	});
});

describe("pausing and resuming", () => {
	it("pauses an active item via UPDATE_RECURRING_EXPENSE and refetches", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ExpenseService.UPDATE_RECURRING_EXPENSE,
				variables: { input: { recurringExpenseId: "recurring-1", active: false } },
			},
			result: {
				data: {
					updateRecurringExpense: { __typename: "RecurringExpense", ...recurringExpense({ active: false }) },
				},
			},
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
				updateMock,
				// refetch after the mutation
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ active: false })]),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Pause" }));

		expect(await screen.findByText("Paused")).toBeInTheDocument();
	});

	it("resumes a paused item via UPDATE_RECURRING_EXPENSE with active: true", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ExpenseService.UPDATE_RECURRING_EXPENSE,
				variables: { input: { recurringExpenseId: "recurring-1", active: true } },
			},
			result: {
				data: {
					updateRecurringExpense: { __typename: "RecurringExpense", ...recurringExpense({ active: true }) },
				},
			},
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ active: false })]),
				updateMock,
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ active: true })]),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Resume" }));

		await waitFor(() => expect(screen.queryByText("Paused")).not.toBeInTheDocument());
	});

	it("alerts the server's error message when the toggle fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ExpenseService.UPDATE_RECURRING_EXPENSE,
				variables: { input: { recurringExpenseId: "recurring-1", active: false } },
			},
			error: new Error("Could not update recurring expense."),
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
				failingMock,
			],
		});

		await user.click(await screen.findByRole("button", { name: "Pause" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not update recurring expense.",
				}),
			),
		);
	});
});

describe("deleting", () => {
	it("does nothing when the confirmation is declined", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const user = userEvent.setup();
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		// Still present: no mutation fired, and MockedProvider would have thrown on an unmocked one.
		expect(screen.getByText("Chair rental")).toBeInTheDocument();
		expect(confirmSpy).toHaveBeenCalledWith(
			"Delete this recurring expense? Entries it already generated are kept.",
		);
		confirmSpy.mockRestore();
	});

	it("deletes via DELETE_RECURRING_EXPENSE and refetches when confirmed", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const user = userEvent.setup();
		const deleteMock = {
			request: {
				query: ExpenseService.DELETE_RECURRING_EXPENSE,
				variables: { recurringExpenseId: "recurring-1" },
			},
			result: { data: { deleteRecurringExpense: true } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense()]),
				deleteMock,
				recurringExpensesMock(SHOP_SCOPE, []),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(await screen.findByText("No recurring expenses set up yet.")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});
});

describe("adding a recurring expense", () => {
	it("disables Add Recurring Expense until a category and a positive amount are set", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [expenseTypesMock(SHOP_SCOPE, [expenseType()]), recurringExpensesMock(SHOP_SCOPE, [])],
		});

		expect(await screen.findByRole("button", { name: "Add Recurring Expense" })).toBeDisabled();
	});

	it("stays disabled with a category chosen but a zero amount", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [expenseTypesMock(SHOP_SCOPE, [expenseType()]), recurringExpensesMock(SHOP_SCOPE, [])],
		});

		await screen.findByRole("button", { name: "Add Recurring Expense" });
		await user.selectOptions(screen.getByLabelText("Category"), "expense-type-1");

		expect(screen.getByRole("button", { name: "Add Recurring Expense" })).toBeDisabled();
	});

	it("submits CREATE_RECURRING_EXPENSE with dollars converted to cents, refetches, resets the form, and alerts success", async () => {
		const user = userEvent.setup();
		const createMock = {
			request: {
				query: ExpenseService.CREATE_RECURRING_EXPENSE,
				variables: {
					input: {
						shopId: "shop-1",
						expenseTypeId: "expense-type-1",
						amountCents: 250000,
						description: "New chair",
						frequency: "monthly",
						startDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
						endDate: null,
					},
				},
			},
			result: {
				data: {
					createRecurringExpense: {
						__typename: "RecurringExpense",
						...recurringExpense({ id: "recurring-2", description: "New chair", amountCents: 250000 }),
					},
				},
			},
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, []),
				createMock,
				recurringExpensesMock(SHOP_SCOPE, [
					recurringExpense({ id: "recurring-2", description: "New chair", amountCents: 250000 }),
				]),
			],
		});

		await screen.findByText("No recurring expenses set up yet.");
		await user.selectOptions(screen.getByLabelText("Category"), "expense-type-1");
		await user.type(screen.getByLabelText("Amount $"), "2500");
		await user.type(screen.getByLabelText("Description (optional)"), "New chair");
		// Start date is set explicitly rather than left at the component's own
		// moment().format("YYYY-MM-DD") default, so this assertion holds no matter what day the
		// suite actually runs on. Frequency is left at its "monthly" default.
		// fireEvent.change rather than userEvent.type: jsdom's type="date" input does not behave
		// like a real browser's segmented date picker, so typing the string character-by-character
		// (including the "-" separators) is not a reliable way to set it - setting the value
		// directly and dispatching change is what the component's own onChange handler listens for.
		fireEvent.change(screen.getByLabelText("First occurrence"), {
			target: { value: "2026-06-01" },
		});
		await user.click(screen.getByRole("button", { name: "Add Recurring Expense" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message:
						"Recurring expense set up. The first entry appears on the Expenses page once it's due.",
				}),
			),
		);
		expect(screen.getByLabelText("Amount $")).toHaveValue(null);
		expect(screen.getByLabelText("Description (optional)")).toHaveValue("");
	});

	it("sends a null endDate when the optional end date is left blank, and a real one when set", async () => {
		const user = userEvent.setup();
		const createMock = {
			request: {
				query: ExpenseService.CREATE_RECURRING_EXPENSE,
				variables: {
					input: {
						shopId: "shop-1",
						expenseTypeId: "expense-type-1",
						amountCents: 5000,
						description: "",
						frequency: "yearly",
						startDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
						endDate: new Date("2027-06-01T00:00:00.000Z").toISOString(),
					},
				},
			},
			result: {
				data: {
					createRecurringExpense: {
						__typename: "RecurringExpense",
						...recurringExpense({ id: "recurring-3", amountCents: 5000, frequency: "yearly" }),
					},
				},
			},
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, []),
				createMock,
				recurringExpensesMock(SHOP_SCOPE, [recurringExpense({ id: "recurring-3" })]),
			],
		});

		await screen.findByText("No recurring expenses set up yet.");
		await user.selectOptions(screen.getByLabelText("Category"), "expense-type-1");
		await user.type(screen.getByLabelText("Amount $"), "50");
		await user.selectOptions(screen.getByLabelText("Frequency"), "yearly");
		// fireEvent.change rather than userEvent.type: jsdom's type="date" input does not behave
		// like a real browser's segmented date picker, so typing the string character-by-character
		// (including the "-" separators) is not a reliable way to set it - setting the value
		// directly and dispatching change is what the component's own onChange handler listens for.
		fireEvent.change(screen.getByLabelText("First occurrence"), {
			target: { value: "2026-06-01" },
		});
		fireEvent.change(screen.getByLabelText("Ends (optional)"), {
			target: { value: "2027-06-01" },
		});
		await user.click(screen.getByRole("button", { name: "Add Recurring Expense" }));

		// Reaching the success alert IS the assertion that the typed end date was converted to an
		// ISO string rather than sent as the raw "2027-08-21".
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success" }),
			),
		);
	});

	it("alerts the server's error message when creating fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ExpenseService.CREATE_RECURRING_EXPENSE,
				variables: {
					input: {
						shopId: "shop-1",
						expenseTypeId: "expense-type-1",
						amountCents: 1000,
						description: "",
						frequency: "monthly",
						startDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
						endDate: null,
					},
				},
			},
			error: new Error("Could not create recurring expense."),
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, []),
				failingMock,
			],
		});

		await screen.findByText("No recurring expenses set up yet.");
		await user.selectOptions(screen.getByLabelText("Category"), "expense-type-1");
		await user.type(screen.getByLabelText("Amount $"), "10");
		// fireEvent.change rather than userEvent.type: jsdom's type="date" input does not behave
		// like a real browser's segmented date picker, so typing the string character-by-character
		// (including the "-" separators) is not a reliable way to set it - setting the value
		// directly and dispatching change is what the component's own onChange handler listens for.
		fireEvent.change(screen.getByLabelText("First occurrence"), {
			target: { value: "2026-06-01" },
		});
		await user.click(screen.getByRole("button", { name: "Add Recurring Expense" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not create recurring expense.",
				}),
			),
		);
	});

	it("shows Adding... while the create mutation is in flight", async () => {
		const user = userEvent.setup();
		const pendingMock = {
			request: {
				query: ExpenseService.CREATE_RECURRING_EXPENSE,
				variables: {
					input: {
						shopId: "shop-1",
						expenseTypeId: "expense-type-1",
						amountCents: 1000,
						description: "",
						frequency: "monthly",
						startDate: new Date("2026-06-01T00:00:00.000Z").toISOString(),
						endDate: null,
					},
				},
			},
			delay: 60 * 1000,
			result: { data: { createRecurringExpense: null } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				expenseTypesMock(SHOP_SCOPE, [expenseType()]),
				recurringExpensesMock(SHOP_SCOPE, []),
				pendingMock,
			],
		});

		await screen.findByText("No recurring expenses set up yet.");
		await user.selectOptions(screen.getByLabelText("Category"), "expense-type-1");
		await user.type(screen.getByLabelText("Amount $"), "10");
		// fireEvent.change rather than userEvent.type: jsdom's type="date" input does not behave
		// like a real browser's segmented date picker, so typing the string character-by-character
		// (including the "-" separators) is not a reliable way to set it - setting the value
		// directly and dispatching change is what the component's own onChange handler listens for.
		fireEvent.change(screen.getByLabelText("First occurrence"), {
			target: { value: "2026-06-01" },
		});
		await user.click(screen.getByRole("button", { name: "Add Recurring Expense" }));

		expect(await screen.findByRole("button", { name: "Adding..." })).toBeDisabled();
	});
});
