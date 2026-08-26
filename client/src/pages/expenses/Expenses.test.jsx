// Expenses.jsx tests. This is the real expense ledger - a shop's (or independent artist's) own
// logged expenses, scoped by businessScopeFor and filtered by the same DateRangePicker the
// analytics dashboards use (see the component's own header comment). Two queries back the page
// (getExpenseTypes for the category dropdown, getExpenses for the ledger itself) and three
// mutations drive it (RECORD_EXPENSE, UPDATE_EXPENSE, DELETE_EXPENSE), so tests are organised
// around: loading/empty/populated states, scope-by-caller (mirroring ExpenseTypesPanel.test.jsx),
// date-range filtering, pagination (mirroring pages/clients/Clients.test.jsx's own pagination
// suite against the same EntityListPager), and the add/edit/delete flows.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import moment from "moment";
import Expenses from "./Expenses";
import ExpenseService from "../../services/ExpenseService";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants/auth";
import { getDefaultRange, buildPresetRanges } from "../../utils/dateRanges";

// THE REAL DOCUMENTS, imported from the service - not copies. ExpenseService exports
// FETCH_EXPENSE_TYPES/FETCH_EXPENSES/RECORD_EXPENSE/UPDATE_EXPENSE/DELETE_EXPENSE directly, and
// it's the SAME object reference the wrapped hooks use internally (see ExpenseService.test.js's
// own header comment), so mocks below reference ExpenseService.FOO rather than reconstructing a
// local copy of the query text.

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

function typesMock({ scope, includeInactive = false, types = [] }) {
	return {
		request: {
			query: ExpenseService.FETCH_EXPENSE_TYPES,
			variables: { ...scope, includeInactive },
		},
		result: { data: { getExpenseTypes: types } },
	};
}

// page defaults to Expenses.jsx's own PAGE_SIZE (25) / initial offset (0), so most callers below
// only need to override it for the pagination suite.
function expensesMock({ scope, range, page = { limit: 25, offset: 0 }, items = [], pageInfoOverrides = {} }) {
	return {
		request: {
			query: ExpenseService.FETCH_EXPENSES,
			variables: { ...scope, start: range.start, end: range.end, page },
		},
		result: {
			data: {
				getExpenses: {
					__typename: "ExpensePage",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: page.limit,
						offset: page.offset,
						...pageInfoOverrides,
					},
				},
			},
		},
	};
}

const SHOP_ADMIN = { id: "user-1", role: ROLES.SHOP_ADMIN, userInfo: { shop: { id: "shop-1" } } };
const INDEPENDENT_ARTIST = { id: "artist-1", role: ROLES.ARTIST, userInfo: {} };
const SHOP_SCOPE = { shopId: "shop-1" };
const ARTIST_SCOPE = { artistUserId: "artist-1" };

function renderPage({ user = SHOP_ADMIN, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<Expenses />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("loading", () => {
	it("shows the page loader and no list content while the expenses query is in flight", () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
			],
		});

		// Both branches of the `loading ? <IBPageLoader/> : <>...</>` render are gated on the
		// getExpenses query alone, so the loader is what's on screen during the initial fetch.
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByText("Ink restock")).not.toBeInTheDocument();
		expect(screen.queryByText("No expenses logged in this range.")).not.toBeInTheDocument();
		// Static chrome (title, help text, entry form) isn't gated on loading at all.
		expect(screen.getByText("Expenses")).toBeInTheDocument();
	});
});

describe("an empty range", () => {
	it("shows the empty message and no total line", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [] }),
			],
		});

		expect(await screen.findByText("No expenses logged in this range.")).toBeInTheDocument();
		expect(screen.queryByText(/Total shown/)).not.toBeInTheDocument();
	});
});

describe("when the expenses query errors", () => {
	// Expenses.jsx never destructures `error` off the getExpenses hook - `data?.getExpenses?.items`
	// simply falls back to `[]`, so a network failure should render the same empty-range view
	// rather than crash the page.
	it("falls back to the empty-range message rather than crashing", async () => {
		const range = getDefaultRange();
		const errorMock = {
			request: {
				query: ExpenseService.FETCH_EXPENSES,
				variables: { ...SHOP_SCOPE, start: range.start, end: range.end, page: { limit: 25, offset: 0 } },
			},
			error: new Error("Network error"),
		};
		renderPage({ mocks: [typesMock({ scope: SHOP_SCOPE, types: [] }), errorMock] });

		expect(await screen.findByText("No expenses logged in this range.")).toBeInTheDocument();
	});
});

describe("a populated list", () => {
	it("renders each expense's amount, category, description, and meta, plus the running total", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
			],
		});

		expect(await screen.findByText("$45.00")).toBeInTheDocument();
		expect(screen.getByText("Supplies")).toBeInTheDocument();
		expect(screen.getByText("Ink restock")).toBeInTheDocument();
		expect(screen.getByText(/Aug 1, 2026/, { selector: ".businessLedgerMeta" })).toBeInTheDocument();
		expect(screen.getByText(/logged by Gendry Baratheon/)).toBeInTheDocument();
		expect(screen.getByText("Total shown: $45.00")).toBeInTheDocument();
	});

	it("shows a Recurring chip when the entry was generated by a recurring template", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					items: [expense({ recurringExpenseId: "recurring-1" })],
				}),
			],
		});

		expect(await screen.findByText("Recurring")).toBeInTheDocument();
	});

	it("does not show a Recurring chip for a one-off entry", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
			],
		});

		await screen.findByText("Ink restock");
		expect(screen.queryByText("Recurring")).not.toBeInTheDocument();
	});

	it("falls back to Uncategorized when the expense type reference is missing", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense({ expenseType: null })] }),
			],
		});

		expect(await screen.findByText("Uncategorized")).toBeInTheDocument();
	});

	it("omits the description span entirely when the expense has none", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense({ description: "" })] }),
			],
		});

		await screen.findByText("Supplies");
		expect(document.querySelector(".businessLedgerDescription")).not.toBeInTheDocument();
	});

	it("omits the logged-by meta when createdBy is missing", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense({ createdBy: null })] }),
			],
		});

		await screen.findByText("Ink restock");
		expect(screen.queryByText(/logged by/)).not.toBeInTheDocument();
	});
});

describe("scope by caller", () => {
	it("queries expense types and expenses by shopId for a shop admin with a shop", async () => {
		const range = getDefaultRange();
		renderPage({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ name: "Shop-scoped type" })] }),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					items: [expense({ description: "Shop-scoped expense" })],
				}),
			],
		});

		expect(await screen.findByText("Shop-scoped expense")).toBeInTheDocument();
	});

	it("queries expense types and expenses by artistUserId for an independent artist", async () => {
		const range = getDefaultRange();
		renderPage({
			user: INDEPENDENT_ARTIST,
			mocks: [
				typesMock({ scope: ARTIST_SCOPE, types: [expenseType({ shopId: null, artistUserId: "artist-1" })] }),
				expensesMock({
					scope: ARTIST_SCOPE,
					range,
					items: [
						expense({
							shopId: null,
							artistUserId: "artist-1",
							description: "Artist-scoped expense",
						}),
					],
				}),
			],
		});

		expect(await screen.findByText("Artist-scoped expense")).toBeInTheDocument();
	});
});

describe("changing the date range", () => {
	it("refetches for the newly selected preset and resets to the first page", async () => {
		const user = userEvent.setup();
		const thisMonth = getDefaultRange();
		const lastMonth = buildPresetRanges().find((preset) => preset.label === "Last month");
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({
					scope: SHOP_SCOPE,
					range: thisMonth,
					items: [expense({ description: "This month's expense" })],
				}),
				expensesMock({
					scope: SHOP_SCOPE,
					range: lastMonth,
					items: [expense({ id: "expense-2", description: "Last month's expense" })],
				}),
			],
		});

		await screen.findByText("This month's expense");
		await user.click(screen.getByRole("button", { name: "Last month" }));

		expect(await screen.findByText("Last month's expense")).toBeInTheDocument();
		expect(screen.queryByText("This month's expense")).not.toBeInTheDocument();
	});
});

describe("pagination", () => {
	it("hides Previous/Next but still shows the count when everything fits on one page", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					items: [expense()],
					pageInfoOverrides: { totalCount: 1, hasMore: false },
				}),
			],
		});

		await screen.findByText("Ink restock");
		expect(screen.getByText("1 expense")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("advances the offset on Next and requests the next page", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					items: [expense()],
					pageInfoOverrides: { totalCount: 30, hasMore: true },
				}),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					page: { limit: 25, offset: 25 },
					items: [expense({ id: "expense-2", description: "Page two expense" })],
					pageInfoOverrides: { totalCount: 30, hasMore: false, offset: 25 },
				}),
			],
		});

		await screen.findByText("Ink restock");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Page two expense")).toBeInTheDocument();
		expect(screen.queryByText("Ink restock")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	it("changing the page size resets the offset and re-requests with the new limit", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					items: [expense()],
					pageInfoOverrides: { totalCount: 60, hasMore: true },
				}),
				expensesMock({
					scope: SHOP_SCOPE,
					range,
					page: { limit: 10, offset: 0 },
					items: [expense({ id: "expense-2", description: "Ten-per-page expense" })],
					pageInfoOverrides: { totalCount: 60, hasMore: true, limit: 10 },
				}),
			],
		});

		await screen.findByText("Ink restock");
		await user.selectOptions(screen.getByRole("combobox", { name: "Show" }), "10");

		expect(await screen.findByText("Ten-per-page expense")).toBeInTheDocument();
	});
});

describe("logging a new expense", () => {
	it("disables Log Expense until a category and a positive amount are set", async () => {
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range: getDefaultRange(), items: [] }),
			],
		});

		await screen.findByText("No expenses logged in this range.");
		expect(screen.getByRole("button", { name: "Log Expense" })).toBeDisabled();
	});

	it("records an expense scoped to the shop, converts dollars to cents, trims the description, and refetches", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = {
			shopId: "shop-1",
			expenseTypeId: "expense-type-1",
			amountCents: 4500,
			description: "New ink",
			date: isoDate,
		};
		const recordMock = {
			request: { query: ExpenseService.RECORD_EXPENSE, variables: { input } },
			result: { data: { recordExpense: expense({ description: "New ink", date: isoDate }) } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [] }),
				recordMock,
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense({ description: "New ink", date: isoDate })] }),
			],
		});

		await screen.findByText("No expenses logged in this range.");

		// The add form's own category select. It used to be the only combobox on screen until a row
		// entered edit mode, but EntityListPager's "Show" size selector (components/entityList/
		// EntityListPager.jsx) now renders unconditionally whenever a page-size handler is passed,
		// even with zero items on the page - so there are two comboboxes present from the very
		// first render, not one. Disambiguated by name, the same way the pagination test further up
		// this file already does for the "Show" selector. See IBSelect.test.jsx for the underlying
		// open/pick-option pattern.
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Supplies" }));
		await user.type(screen.getByLabelText("Amount $"), "45");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.type(screen.getByLabelText("Description (optional)"), "  New ink  ");
		await user.click(screen.getByRole("button", { name: "Log Expense" }));

		// Reaching the refetched list (rather than an Apollo "no matching mock" error) IS the
		// assertion that the padded description was trimmed and the dollar amount was converted to
		// cents on the wire.
		expect(await screen.findByText("New ink")).toBeInTheDocument();
	});

	it("records with just createScopeFor's subset for an independent artist (no artistUserId field)", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = {
			expenseTypeId: "expense-type-2",
			amountCents: 2000,
			description: "",
			date: isoDate,
		};
		const recordMock = {
			request: { query: ExpenseService.RECORD_EXPENSE, variables: { input } },
			result: {
				data: {
					recordExpense: expense({
						shopId: null,
						artistUserId: "artist-1",
						expenseTypeId: "expense-type-2",
						description: "",
						date: isoDate,
					}),
				},
			},
		};
		renderPage({
			user: INDEPENDENT_ARTIST,
			mocks: [
				typesMock({ scope: ARTIST_SCOPE, types: [expenseType({ id: "expense-type-2", shopId: null, artistUserId: "artist-1" })] }),
				expensesMock({ scope: ARTIST_SCOPE, range, items: [] }),
				recordMock,
				expensesMock({
					scope: ARTIST_SCOPE,
					range,
					items: [expense({ shopId: null, artistUserId: "artist-1", expenseTypeId: "expense-type-2", amountCents: 2000, description: "", date: isoDate })],
				}),
			],
		});

		await screen.findByText("No expenses logged in this range.");
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Supplies" }));
		await user.type(screen.getByLabelText("Amount $"), "20");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.click(screen.getByRole("button", { name: "Log Expense" }));

		expect(await screen.findByText("$20.00")).toBeInTheDocument();
	});

	it("shows Logging... and disables the button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = { shopId: "shop-1", expenseTypeId: "expense-type-1", amountCents: 4500, description: "", date: isoDate };
		const recordMock = {
			request: { query: ExpenseService.RECORD_EXPENSE, variables: { input } },
			delay: 50,
			result: { data: { recordExpense: expense({ date: isoDate }) } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [] }),
				recordMock,
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense({ date: isoDate })] }),
			],
		});

		await screen.findByText("No expenses logged in this range.");
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Supplies" }));
		await user.type(screen.getByLabelText("Amount $"), "45");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.click(screen.getByRole("button", { name: "Log Expense" }));

		expect(await screen.findByRole("button", { name: "Logging..." })).toBeDisabled();
		expect(await screen.findByText("Ink restock")).toBeInTheDocument();
	});

	it("alerts the server's error message when recording fails", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = { shopId: "shop-1", expenseTypeId: "expense-type-1", amountCents: 4500, description: "", date: isoDate };
		const failingMock = {
			request: { query: ExpenseService.RECORD_EXPENSE, variables: { input } },
			error: new Error("Could not record that expense."),
		};
		const { setAlert } = renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [] }),
				failingMock,
			],
		});

		await screen.findByText("No expenses logged in this range.");
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Supplies" }));
		await user.type(screen.getByLabelText("Amount $"), "45");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.click(screen.getByRole("button", { name: "Log Expense" }));

		await screen.findByText("No expenses logged in this range.");
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "error",
				message: "Could not record that expense.",
			}),
		);
	});
});

describe("editing an expense", () => {
	it("prefills the edit form, saves the updated amount via UPDATE_EXPENSE, and exits edit mode", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const original = expense();
		// The round trip startEdit/saveEdit puts every date through: item.date -> moment.utc().format
		// ("YYYY-MM-DD") to seed the field (item.date is a pure calendar date with no time-of-day
		// meaning - see Expenses.jsx/Income.jsx's own comment on that field - so startEdit parses it
		// with .utc() to avoid rolling it back a day for anyone west of UTC), then
		// moment(..., "YYYY-MM-DD").toISOString() to send the edited LOCAL calendar date back as a
		// new UTC timestamp, same as a brand-new entry's date. Deriving the expected value the same
		// way (rather than assuming a timezone) is what makes this assertion timezone-independent.
		const roundTrippedDate = moment(moment.utc(original.date).format("YYYY-MM-DD"), "YYYY-MM-DD").toISOString(); // utc-ok: mirrors the production round trip explained above
		const updateMock = {
			request: {
				query: ExpenseService.UPDATE_EXPENSE,
				variables: {
					input: {
						expenseId: "expense-1",
						expenseTypeId: "expense-type-1",
						amountCents: 5000,
						description: "Ink restock",
						date: roundTrippedDate,
					},
				},
			},
			result: { data: { updateExpense: expense({ amountCents: 5000 }) } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [original] }),
				updateMock,
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense({ amountCents: 5000 })] }),
			],
		});

		const row = (await screen.findByText("Ink restock")).closest("li");
		await user.click(within(row).getByRole("button", { name: "Edit" }));

		const amountField = within(row).getByRole("spinbutton");
		await user.clear(amountField);
		await user.type(amountField, "50");
		await user.click(within(row).getByRole("button", { name: "Save" }));

		expect(await screen.findByText("$50.00")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
	});

	it("Cancel exits edit mode without calling any mutation", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
			],
		});

		const row = (await screen.findByText("Ink restock")).closest("li");
		await user.click(within(row).getByRole("button", { name: "Edit" }));
		expect(within(row).getByRole("button", { name: "Save" })).toBeInTheDocument();

		await user.click(within(row).getByRole("button", { name: "Cancel" }));

		// Still present with its original amount: no mutation fired, and MockedProvider would have
		// thrown on an unmocked UPDATE_EXPENSE request had saveEdit run anyway.
		expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
		expect(screen.getByText("$45.00")).toBeInTheDocument();
	});

	it("alerts the server's error message when saving an edit fails", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const original = expense();
		const roundTrippedDate = moment(moment.utc(original.date).format("YYYY-MM-DD"), "YYYY-MM-DD").toISOString(); // utc-ok: mirrors the production round trip explained above
		const failingMock = {
			request: {
				query: ExpenseService.UPDATE_EXPENSE,
				variables: {
					input: {
						expenseId: "expense-1",
						expenseTypeId: "expense-type-1",
						amountCents: 5000,
						description: "Ink restock",
						date: roundTrippedDate,
					},
				},
			},
			error: new Error("Could not save that change."),
		};
		const { setAlert } = renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType()] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [original] }),
				failingMock,
			],
		});

		const row = (await screen.findByText("Ink restock")).closest("li");
		await user.click(within(row).getByRole("button", { name: "Edit" }));
		const amountField = within(row).getByRole("spinbutton");
		await user.clear(amountField);
		await user.type(amountField, "50");
		await user.click(within(row).getByRole("button", { name: "Save" }));

		await vi.waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not save that change.",
				}),
			),
		);
		// The failed save leaves the row in edit mode rather than silently discarding the draft.
		expect(within(row).getByRole("button", { name: "Save" })).toBeInTheDocument();
	});
});

describe("deleting an expense", () => {
	it("does nothing when the confirmation is declined", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(confirmSpy).toHaveBeenCalledWith("Delete this expense entry? This can't be undone.");
		// Still present: no mutation fired, and MockedProvider would have thrown on an unmocked one.
		expect(screen.getByText("Ink restock")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});

	it("deletes via DELETE_EXPENSE and refetches when confirmed", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const user = userEvent.setup();
		const range = getDefaultRange();
		const deleteMock = {
			request: { query: ExpenseService.DELETE_EXPENSE, variables: { expenseId: "expense-1" } },
			result: { data: { deleteExpense: true } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
				deleteMock,
				expensesMock({ scope: SHOP_SCOPE, range, items: [] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(await screen.findByText("No expenses logged in this range.")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});

	it("alerts the server's error message when the delete fails", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const user = userEvent.setup();
		const range = getDefaultRange();
		const failingMock = {
			request: { query: ExpenseService.DELETE_EXPENSE, variables: { expenseId: "expense-1" } },
			error: new Error("Could not delete that expense."),
		};
		const { setAlert } = renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				expensesMock({ scope: SHOP_SCOPE, range, items: [expense()] }),
				failingMock,
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		await vi.waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not delete that expense.",
				}),
			),
		);
		// Still present - the failed mutation leaves the ledger unchanged.
		expect(screen.getByText("Ink restock")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});
});
