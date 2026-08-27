// Income.jsx tests. Per the component's own header comment, this is "the income-side mirror of
// pages/expenses/Expenses.jsx" - non-tattoo income only, scoped by businessScopeFor and filtered by
// the same DateRangePicker the analytics dashboards use. Two queries back the page (getIncomeTypes
// for the category dropdown, getIncomes for the ledger itself) and three mutations drive it
// (RECORD_INCOME, UPDATE_INCOME, DELETE_INCOME), so this file mirrors Expenses.test.jsx's structure
// and coverage exactly: loading/empty/populated states, scope-by-caller (mirroring
// IncomeTypesPanel.test.jsx), date-range filtering, pagination (against the same EntityListPager),
// and the add/edit/delete flows - adjusted for IncomeService's own field names (incomeTypeId rather
// than expenseTypeId, no recurring/Chip feature on this side, "Other Income" as the page title).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import moment from "moment";
import Income from "./Income";
import IncomeService from "../../services/IncomeService";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants/auth";
import { getDefaultRange, buildPresetRanges } from "../../utils/dateRanges";

// THE REAL DOCUMENTS, imported from the service - not copies. IncomeService exports
// FETCH_INCOME_TYPES/FETCH_INCOMES/RECORD_INCOME/UPDATE_INCOME/DELETE_INCOME directly, and it's the
// SAME object reference the wrapped hooks use internally (see IncomeService.test.js's own header
// comment), so mocks below reference IncomeService.FOO rather than reconstructing a local copy of
// the query text.

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

function typesMock({ scope, includeInactive = false, types = [] }) {
	return {
		request: {
			query: IncomeService.FETCH_INCOME_TYPES,
			variables: { ...scope, includeInactive },
		},
		result: { data: { getIncomeTypes: types } },
	};
}

// page defaults to Income.jsx's own PAGE_SIZE (25) / initial offset (0), so most callers below only
// need to override it for the pagination suite.
function incomesMock({ scope, range, page = { limit: 25, offset: 0 }, items = [], pageInfoOverrides = {} }) {
	return {
		request: {
			query: IncomeService.FETCH_INCOMES,
			variables: { ...scope, start: range.start, end: range.end, page },
		},
		result: {
			data: {
				getIncomes: {
					__typename: "IncomePage",
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
				<Income />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("loading", () => {
	it("shows the page loader and no list content while the incomes query is in flight", () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income()] }),
			],
		});

		// Both branches of the `loading ? <IBPageLoader/> : <>...</>` render are gated on the
		// getIncomes query alone, so the loader is what's on screen during the initial fetch.
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByText("Convention weekend merch")).not.toBeInTheDocument();
		expect(screen.queryByText("No other income logged in this range.")).not.toBeInTheDocument();
		// Static chrome (title, help text, entry form) isn't gated on loading at all.
		expect(screen.getByText("Other Income")).toBeInTheDocument();
	});
});

describe("an empty range", () => {
	it("shows the empty message and no total line", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [] }),
			],
		});

		expect(await screen.findByText("No other income logged in this range.")).toBeInTheDocument();
		expect(screen.queryByText(/Total shown/)).not.toBeInTheDocument();
	});
});

describe("when the incomes query errors", () => {
	// Income.jsx never destructures `error` off the getIncomes hook - `data?.getIncomes?.items`
	// simply falls back to `[]`, so a network failure should render the same empty-range view
	// rather than crash the page.
	it("falls back to the empty-range message rather than crashing", async () => {
		const range = getDefaultRange();
		const errorMock = {
			request: {
				query: IncomeService.FETCH_INCOMES,
				variables: { ...SHOP_SCOPE, start: range.start, end: range.end, page: { limit: 25, offset: 0 } },
			},
			error: new Error("Network error"),
		};
		renderPage({ mocks: [typesMock({ scope: SHOP_SCOPE, types: [] }), errorMock] });

		expect(await screen.findByText("No other income logged in this range.")).toBeInTheDocument();
	});
});

describe("a populated list", () => {
	it("renders each income's amount, category, description, and meta, plus the running total", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income()] }),
			],
		});

		expect(await screen.findByText("$35.00")).toBeInTheDocument();
		expect(screen.getByText("Merch sales")).toBeInTheDocument();
		expect(screen.getByText("Convention weekend merch")).toBeInTheDocument();
		expect(screen.getByText(/Aug 1, 2026/, { selector: ".businessLedgerMeta" })).toBeInTheDocument();
		expect(screen.getByText(/logged by Gendry Baratheon/)).toBeInTheDocument();
		expect(screen.getByText("Total shown: $35.00")).toBeInTheDocument();
	});

	it("falls back to Uncategorized when the income type reference is missing", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income({ incomeType: null })] }),
			],
		});

		expect(await screen.findByText("Uncategorized")).toBeInTheDocument();
	});

	it("omits the description span entirely when the income has none", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income({ description: "" })] }),
			],
		});

		await screen.findByText("Merch sales");
		expect(document.querySelector(".businessLedgerDescription")).not.toBeInTheDocument();
	});

	it("omits the logged-by meta when createdBy is missing", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income({ createdBy: null })] }),
			],
		});

		await screen.findByText("Convention weekend merch");
		expect(screen.queryByText(/logged by/)).not.toBeInTheDocument();
	});
});

describe("scope by caller", () => {
	it("queries income types and incomes by shopId for a shop admin with a shop", async () => {
		const range = getDefaultRange();
		renderPage({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType({ name: "Shop-scoped type" })] }),
				incomesMock({
					scope: SHOP_SCOPE,
					range,
					items: [income({ description: "Shop-scoped income" })],
				}),
			],
		});

		expect(await screen.findByText("Shop-scoped income")).toBeInTheDocument();
	});

	it("queries income types and incomes by artistUserId for an independent artist", async () => {
		const range = getDefaultRange();
		renderPage({
			user: INDEPENDENT_ARTIST,
			mocks: [
				typesMock({ scope: ARTIST_SCOPE, types: [incomeType({ shopId: null, artistUserId: "artist-1" })] }),
				incomesMock({
					scope: ARTIST_SCOPE,
					range,
					items: [
						income({
							shopId: null,
							artistUserId: "artist-1",
							description: "Artist-scoped income",
						}),
					],
				}),
			],
		});

		expect(await screen.findByText("Artist-scoped income")).toBeInTheDocument();
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
				incomesMock({
					scope: SHOP_SCOPE,
					range: thisMonth,
					items: [income({ description: "This month's income" })],
				}),
				incomesMock({
					scope: SHOP_SCOPE,
					range: lastMonth,
					items: [income({ id: "income-2", description: "Last month's income" })],
				}),
			],
		});

		await screen.findByText("This month's income");
		await user.click(screen.getByRole("button", { name: "Last month" }));

		expect(await screen.findByText("Last month's income")).toBeInTheDocument();
		expect(screen.queryByText("This month's income")).not.toBeInTheDocument();
	});
});

describe("pagination", () => {
	it("hides Previous/Next but still shows the count when everything fits on one page", async () => {
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({
					scope: SHOP_SCOPE,
					range,
					items: [income()],
					pageInfoOverrides: { totalCount: 1, hasMore: false },
				}),
			],
		});

		await screen.findByText("Convention weekend merch");
		expect(screen.getByText("1 entry")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("advances the offset on Next and requests the next page", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({
					scope: SHOP_SCOPE,
					range,
					items: [income()],
					pageInfoOverrides: { totalCount: 30, hasMore: true },
				}),
				incomesMock({
					scope: SHOP_SCOPE,
					range,
					page: { limit: 25, offset: 25 },
					items: [income({ id: "income-2", description: "Page two income" })],
					pageInfoOverrides: { totalCount: 30, hasMore: false, offset: 25 },
				}),
			],
		});

		await screen.findByText("Convention weekend merch");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Page two income")).toBeInTheDocument();
		expect(screen.queryByText("Convention weekend merch")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
	});

	it("changing the page size resets the offset and re-requests with the new limit", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({
					scope: SHOP_SCOPE,
					range,
					items: [income()],
					pageInfoOverrides: { totalCount: 60, hasMore: true },
				}),
				incomesMock({
					scope: SHOP_SCOPE,
					range,
					page: { limit: 10, offset: 0 },
					items: [income({ id: "income-2", description: "Ten-per-page income" })],
					pageInfoOverrides: { totalCount: 60, hasMore: true, limit: 10 },
				}),
			],
		});

		await screen.findByText("Convention weekend merch");
		await user.selectOptions(screen.getByRole("combobox", { name: "Show" }), "10");

		expect(await screen.findByText("Ten-per-page income")).toBeInTheDocument();
	});
});

describe("logging a new income entry", () => {
	it("disables Log Income until a category and a positive amount are set", async () => {
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range: getDefaultRange(), items: [] }),
			],
		});

		await screen.findByText("No other income logged in this range.");
		expect(screen.getByRole("button", { name: "Log Income" })).toBeDisabled();
	});

	it("records an income scoped to the shop, converts dollars to cents, trims the description, and refetches", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = {
			shopId: "shop-1",
			incomeTypeId: "income-type-1",
			amountCents: 3500,
			description: "Convention sales",
			date: isoDate,
		};
		const recordMock = {
			request: { query: IncomeService.RECORD_INCOME, variables: { input } },
			result: { data: { recordIncome: income({ description: "Convention sales", date: isoDate }) } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [] }),
				recordMock,
				incomesMock({ scope: SHOP_SCOPE, range, items: [income({ description: "Convention sales", date: isoDate })] }),
			],
		});

		await screen.findByText("No other income logged in this range.");

		// The add form's own category select. It used to be the only combobox on screen until a row
		// entered edit mode, but EntityListPager's "Show" size selector (components/entityList/
		// EntityListPager.jsx) now renders unconditionally whenever a page-size handler is passed,
		// even with zero items on the page - so there are two comboboxes present from the very
		// first render, not one. Disambiguated by name, the same way the pagination test further up
		// this file already does for the "Show" selector. See IBSelect.test.jsx for the underlying
		// open/pick-option pattern.
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Merch sales" }));
		await user.type(screen.getByLabelText("Amount $"), "35");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.type(screen.getByLabelText("Description (optional)"), "  Convention sales  ");
		await user.click(screen.getByRole("button", { name: "Log Income" }));

		// Reaching the refetched list (rather than an Apollo "no matching mock" error) IS the
		// assertion that the padded description was trimmed and the dollar amount was converted to
		// cents on the wire.
		expect(await screen.findByText("Convention sales")).toBeInTheDocument();
	});

	it("records with just createScopeFor's subset for an independent artist (no artistUserId field)", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = {
			incomeTypeId: "income-type-2",
			amountCents: 2000,
			description: "",
			date: isoDate,
		};
		const recordMock = {
			request: { query: IncomeService.RECORD_INCOME, variables: { input } },
			result: {
				data: {
					recordIncome: income({
						shopId: null,
						artistUserId: "artist-1",
						incomeTypeId: "income-type-2",
						description: "",
						date: isoDate,
					}),
				},
			},
		};
		renderPage({
			user: INDEPENDENT_ARTIST,
			mocks: [
				typesMock({ scope: ARTIST_SCOPE, types: [incomeType({ id: "income-type-2", shopId: null, artistUserId: "artist-1" })] }),
				incomesMock({ scope: ARTIST_SCOPE, range, items: [] }),
				recordMock,
				incomesMock({
					scope: ARTIST_SCOPE,
					range,
					items: [income({ shopId: null, artistUserId: "artist-1", incomeTypeId: "income-type-2", amountCents: 2000, description: "", date: isoDate })],
				}),
			],
		});

		await screen.findByText("No other income logged in this range.");
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Merch sales" }));
		await user.type(screen.getByLabelText("Amount $"), "20");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.click(screen.getByRole("button", { name: "Log Income" }));

		expect(await screen.findByText("$20.00")).toBeInTheDocument();
	});

	it("shows Logging... and disables the button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = { shopId: "shop-1", incomeTypeId: "income-type-1", amountCents: 3500, description: "", date: isoDate };
		const recordMock = {
			request: { query: IncomeService.RECORD_INCOME, variables: { input } },
			delay: 50,
			result: { data: { recordIncome: income({ date: isoDate }) } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [] }),
				recordMock,
				incomesMock({ scope: SHOP_SCOPE, range, items: [income({ date: isoDate })] }),
			],
		});

		await screen.findByText("No other income logged in this range.");
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Merch sales" }));
		await user.type(screen.getByLabelText("Amount $"), "35");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.click(screen.getByRole("button", { name: "Log Income" }));

		expect(await screen.findByRole("button", { name: "Logging..." })).toBeDisabled();
		expect(await screen.findByText("Convention weekend merch")).toBeInTheDocument();
	});

	it("alerts the server's error message when recording fails", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const isoDate = moment("2026-08-15", "YYYY-MM-DD").toISOString();
		const input = { shopId: "shop-1", incomeTypeId: "income-type-1", amountCents: 3500, description: "", date: isoDate };
		const failingMock = {
			request: { query: IncomeService.RECORD_INCOME, variables: { input } },
			error: new Error("Could not record that income."),
		};
		const { setAlert } = renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [] }),
				failingMock,
			],
		});

		await screen.findByText("No other income logged in this range.");
		await user.click(screen.getByRole("combobox", { name: "Category" }));
		await user.click(screen.getByRole("option", { name: "Merch sales" }));
		await user.type(screen.getByLabelText("Amount $"), "35");
		const dateField = screen.getByLabelText("Date");
		await user.clear(dateField);
		await user.type(dateField, "2026-08-15");
		await user.click(screen.getByRole("button", { name: "Log Income" }));

		await screen.findByText("No other income logged in this range.");
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "error",
				message: "Could not record that income.",
			}),
		);
	});
});

describe("editing an income entry", () => {
	it("prefills the edit form, saves the updated amount via UPDATE_INCOME, and exits edit mode", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const original = income();
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
				query: IncomeService.UPDATE_INCOME,
				variables: {
					input: {
						incomeId: "income-1",
						incomeTypeId: "income-type-1",
						amountCents: 5000,
						description: "Convention weekend merch",
						date: roundTrippedDate,
					},
				},
			},
			result: { data: { updateIncome: income({ amountCents: 5000 }) } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [original] }),
				updateMock,
				incomesMock({ scope: SHOP_SCOPE, range, items: [income({ amountCents: 5000 })] }),
			],
		});

		const row = (await screen.findByText("Convention weekend merch")).closest("li");
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
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income()] }),
			],
		});

		const row = (await screen.findByText("Convention weekend merch")).closest("li");
		await user.click(within(row).getByRole("button", { name: "Edit" }));
		expect(within(row).getByRole("button", { name: "Save" })).toBeInTheDocument();

		await user.click(within(row).getByRole("button", { name: "Cancel" }));

		// Still present with its original amount: no mutation fired, and MockedProvider would have
		// thrown on an unmocked UPDATE_INCOME request had saveEdit run anyway.
		expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
		expect(screen.getByText("$35.00")).toBeInTheDocument();
	});

	it("alerts the server's error message when saving an edit fails", async () => {
		const user = userEvent.setup();
		const range = getDefaultRange();
		const original = income();
		const roundTrippedDate = moment(moment.utc(original.date).format("YYYY-MM-DD"), "YYYY-MM-DD").toISOString(); // utc-ok: mirrors the production round trip explained above
		const failingMock = {
			request: {
				query: IncomeService.UPDATE_INCOME,
				variables: {
					input: {
						incomeId: "income-1",
						incomeTypeId: "income-type-1",
						amountCents: 5000,
						description: "Convention weekend merch",
						date: roundTrippedDate,
					},
				},
			},
			error: new Error("Could not save that change."),
		};
		const { setAlert } = renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [incomeType()] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [original] }),
				failingMock,
			],
		});

		const row = (await screen.findByText("Convention weekend merch")).closest("li");
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

describe("deleting an income entry", () => {
	it("does nothing when the confirmation is declined", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const user = userEvent.setup();
		const range = getDefaultRange();
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income()] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(confirmSpy).toHaveBeenCalledWith("Delete this income entry? This can't be undone.");
		// Still present: no mutation fired, and MockedProvider would have thrown on an unmocked one.
		expect(screen.getByText("Convention weekend merch")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});

	it("deletes via DELETE_INCOME and refetches when confirmed", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const user = userEvent.setup();
		const range = getDefaultRange();
		const deleteMock = {
			request: { query: IncomeService.DELETE_INCOME, variables: { incomeId: "income-1" } },
			result: { data: { deleteIncome: true } },
		};
		renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income()] }),
				deleteMock,
				incomesMock({ scope: SHOP_SCOPE, range, items: [] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		expect(await screen.findByText("No other income logged in this range.")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});

	it("alerts the server's error message when the delete fails", async () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const user = userEvent.setup();
		const range = getDefaultRange();
		const failingMock = {
			request: { query: IncomeService.DELETE_INCOME, variables: { incomeId: "income-1" } },
			error: new Error("Could not delete that income entry."),
		};
		const { setAlert } = renderPage({
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				incomesMock({ scope: SHOP_SCOPE, range, items: [income()] }),
				failingMock,
			],
		});

		await user.click(await screen.findByRole("button", { name: "Delete" }));

		await vi.waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not delete that income entry.",
				}),
			),
		);
		// Still present - the failed mutation leaves the ledger unchanged.
		expect(screen.getByText("Convention weekend merch")).toBeInTheDocument();
		confirmSpy.mockRestore();
	});
});
