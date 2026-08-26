// ExpenseTypesPanel.jsx tests. The panel lists a shop/artist's expense categories, lets them add
// one, and toggles active/inactive (types are deactivated rather than deleted - see the
// component's own header comment and server/models/ExpenseType.js). Every query/mutation is scoped
// by businessScopeFor(user) - a shop admin at their own shop gets {shopId}, everyone else this
// feature is visible to gets {artistUserId} - so most of these tests are organised around that
// split, the same way FormsPanel.test.jsx organises around its own visibility gate.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import ExpenseTypesPanel from "./ExpenseTypesPanel";
import ExpenseService from "../../services/ExpenseService";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants/auth";

// THE REAL DOCUMENTS, imported from the service - not copies. ExpenseService exports
// FETCH_EXPENSE_TYPES/CREATE_EXPENSE_TYPE/UPDATE_EXPENSE_TYPE directly (see
// ExpenseService.test.js's own header comment on why: unlike EventLogService, these documents are
// the SAME object reference the wrapped hook uses internally), so mocks below reference
// ExpenseService.FOO rather than reconstructing a local copy of the query text.

function expenseType(overrides = {}) {
	return {
		__typename: "ExpenseType",
		id: "expense-type-1",
		shopId: "shop-1",
		artistUserId: null,
		name: "Rent",
		description: "Monthly chair rent",
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function typesMock({ scope, includeInactive = true, types = [] }) {
	return {
		request: {
			query: ExpenseService.FETCH_EXPENSE_TYPES,
			variables: { ...scope, includeInactive },
		},
		result: { data: { getExpenseTypes: types } },
	};
}

const SHOP_ADMIN = {
	id: "user-1",
	role: ROLES.SHOP_ADMIN,
	userInfo: { shop: { id: "shop-1" } },
};

const INDEPENDENT_ARTIST = {
	id: "artist-1",
	role: ROLES.ARTIST,
	userInfo: {},
};

const SHOP_SCOPE = { shopId: "shop-1" };
const ARTIST_SCOPE = { artistUserId: "artist-1" };

function renderPanel({ user = SHOP_ADMIN, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<ExpenseTypesPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("loading", () => {
	it("shows neither the list nor the empty message while the query is in flight", () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [typesMock({ scope: SHOP_SCOPE, types: [expenseType()] })],
		});

		// Both branches are gated on `!loading`, so during the initial fetch neither renders - the
		// heading/help text/form are the only things on screen.
		expect(screen.queryByText("Rent")).not.toBeInTheDocument();
		expect(screen.queryByText("No expense categories yet.")).not.toBeInTheDocument();
		expect(screen.getByText("Expense Categories")).toBeInTheDocument();
	});
});

describe("an empty list", () => {
	it("says there are no categories yet", async () => {
		renderPanel({ user: SHOP_ADMIN, mocks: [typesMock({ scope: SHOP_SCOPE, types: [] })] });

		expect(await screen.findByText("No expense categories yet.")).toBeInTheDocument();
	});
});

describe("a populated list", () => {
	it("renders each type's name, description, and Deactivate action", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({
					scope: SHOP_SCOPE,
					types: [expenseType({ name: "Rent", description: "Monthly chair rent" })],
				}),
			],
		});

		expect(await screen.findByText("Rent")).toBeInTheDocument();
		expect(screen.getByText("Monthly chair rent")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
		expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
	});

	it("marks an inactive type with a chip and offers Reactivate instead of Deactivate", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({
					scope: SHOP_SCOPE,
					types: [expenseType({ name: "Old category", active: false })],
				}),
			],
		});

		expect(await screen.findByText("Old category")).toBeInTheDocument();
		expect(screen.getByText("Inactive")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
	});

	it("omits the description span entirely when a type has none", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({
					scope: SHOP_SCOPE,
					types: [expenseType({ name: "No description", description: "" })],
				}),
			],
		});

		await screen.findByText("No description");
		expect(document.querySelector(".businessTypeDescription")).not.toBeInTheDocument();
	});
});

describe("scope by caller", () => {
	it("queries by shopId for a shop admin with a shop", async () => {
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [typesMock({ scope: SHOP_SCOPE, types: [expenseType({ name: "Shop-scoped" })] })],
		});

		expect(await screen.findByText("Shop-scoped")).toBeInTheDocument();
	});

	it("queries by artistUserId for an independent artist", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				typesMock({
					scope: ARTIST_SCOPE,
					types: [expenseType({ id: "expense-type-2", shopId: null, artistUserId: "artist-1", name: "Artist-scoped" })],
				}),
			],
		});

		expect(await screen.findByText("Artist-scoped")).toBeInTheDocument();
	});
});

describe("adding a category", () => {
	it("disables Add Category until a name is typed", async () => {
		renderPanel({ user: SHOP_ADMIN, mocks: [typesMock({ scope: SHOP_SCOPE, types: [] })] });

		await screen.findByText("No expense categories yet.");
		expect(screen.getByRole("button", { name: "Add Category" })).toBeDisabled();
	});

	it("enables Add Category once a name is typed", async () => {
		const user = userEvent.setup();
		renderPanel({ user: SHOP_ADMIN, mocks: [typesMock({ scope: SHOP_SCOPE, types: [] })] });

		await screen.findByText("No expense categories yet.");
		await user.type(screen.getByLabelText("New category name"), "Supplies");

		expect(screen.getByRole("button", { name: "Add Category" })).not.toBeDisabled();
	});

	it("does not submit when the name is only whitespace", async () => {
		const user = userEvent.setup();
		renderPanel({ user: SHOP_ADMIN, mocks: [typesMock({ scope: SHOP_SCOPE, types: [] })] });

		await screen.findByText("No expense categories yet.");
		await user.type(screen.getByLabelText("New category name"), "   ");

		// handleAdd's own `if (!newName.trim())` guard - the button also stays disabled by the same
		// trimmed check, so this proves both the button state and the submit guard agree.
		expect(screen.getByRole("button", { name: "Add Category" })).toBeDisabled();
	});

	it("creates a type scoped to the shop, trims name/description, and refetches the list", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Supplies", description: "Needles and ink" };
		const createMock = {
			request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
			result: { data: { createExpenseType: expenseType({ id: "expense-type-2", name: "Supplies", description: "Needles and ink" }) } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				createMock,
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ id: "expense-type-2", name: "Supplies", description: "Needles and ink" })] }),
			],
		});

		await screen.findByText("No expense categories yet.");
		// Deliberately padded - handleAdd trims both fields before sending, and reaching the
		// refetched list (rather than an Apollo "no matching mock" error) IS the assertion that the
		// padding was stripped on the wire.
		await user.type(screen.getByLabelText("New category name"), "  Supplies  ");
		await user.type(screen.getByLabelText("Description (optional)"), "  Needles and ink  ");
		await user.click(screen.getByRole("button", { name: "Add Category" }));

		expect(await screen.findByText("Supplies")).toBeInTheDocument();
	});

	it("creates a type with just createScopeFor's subset for an independent artist (no artistUserId field)", async () => {
		const user = userEvent.setup();
		// createScopeFor drops artistUserId entirely for an independent artist - CreateExpenseTypeInput
		// has no such field, so the input carries only name/description.
		const input = { name: "Booth rent", description: "" };
		const createMock = {
			request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
			result: {
				data: {
					createExpenseType: expenseType({
						id: "expense-type-3",
						shopId: null,
						artistUserId: "artist-1",
						name: "Booth rent",
						description: "",
					}),
				},
			},
		};
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				typesMock({ scope: ARTIST_SCOPE, types: [] }),
				createMock,
				typesMock({
					scope: ARTIST_SCOPE,
					types: [expenseType({ id: "expense-type-3", shopId: null, artistUserId: "artist-1", name: "Booth rent", description: "" })],
				}),
			],
		});

		await screen.findByText("No expense categories yet.");
		await user.type(screen.getByLabelText("New category name"), "Booth rent");
		await user.click(screen.getByRole("button", { name: "Add Category" }));

		expect(await screen.findByText("Booth rent")).toBeInTheDocument();
	});

	it("clears the form after a successful add", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Supplies", description: "" };
		const createMock = {
			request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
			result: { data: { createExpenseType: expenseType({ id: "expense-type-2", name: "Supplies" }) } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				createMock,
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ id: "expense-type-2", name: "Supplies" })] }),
			],
		});

		await screen.findByText("No expense categories yet.");
		const nameField = screen.getByLabelText("New category name");
		await user.type(nameField, "Supplies");
		await user.click(screen.getByRole("button", { name: "Add Category" }));

		await screen.findByText("Supplies");
		expect(nameField).toHaveValue("");
	});

	it("shows the server's field error via setAlert when the create mutation fails", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Duplicate", description: "" };
		const failingMock = {
			request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
			result: {
				errors: [
					{
						message: "Validation failed",
						extensions: { errors: { name: "A category with that name already exists." } },
					},
				],
			},
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [typesMock({ scope: SHOP_SCOPE, types: [] }), failingMock],
		});

		await screen.findByText("No expense categories yet.");
		await user.type(screen.getByLabelText("New category name"), "Duplicate");
		await user.click(screen.getByRole("button", { name: "Add Category" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "A category with that name already exists.",
				}),
			),
		);
	});

	it("falls back to the raw error message when the server sends no field-level error", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Whatever", description: "" };
		const failingMock = {
			request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
			error: new Error("Network error"),
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [typesMock({ scope: SHOP_SCOPE, types: [] }), failingMock],
		});

		await screen.findByText("No expense categories yet.");
		await user.type(screen.getByLabelText("New category name"), "Whatever");
		await user.click(screen.getByRole("button", { name: "Add Category" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error", message: "Network error" }),
			),
		);
	});

	it("shows Adding... and disables the button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", name: "Supplies", description: "" };
		const createMock = {
			request: { query: ExpenseService.CREATE_EXPENSE_TYPE, variables: { input } },
			delay: 50,
			result: { data: { createExpenseType: expenseType({ id: "expense-type-2", name: "Supplies" }) } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [] }),
				createMock,
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ id: "expense-type-2", name: "Supplies" })] }),
			],
		});

		await screen.findByText("No expense categories yet.");
		await user.type(screen.getByLabelText("New category name"), "Supplies");
		await user.click(screen.getByRole("button", { name: "Add Category" }));

		expect(await screen.findByRole("button", { name: "Adding..." })).toBeDisabled();

		expect(await screen.findByText("Supplies")).toBeInTheDocument();
	});
});

describe("toggling active state", () => {
	it("deactivates an active type and refetches", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ExpenseService.UPDATE_EXPENSE_TYPE,
				variables: { input: { expenseTypeId: "expense-type-1", active: false } },
			},
			result: { data: { updateExpenseType: expenseType({ active: false }) } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ active: true })] }),
				updateMock,
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ active: false })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Deactivate" }));

		expect(await screen.findByText("Inactive")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
	});

	it("reactivates an inactive type and refetches", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ExpenseService.UPDATE_EXPENSE_TYPE,
				variables: { input: { expenseTypeId: "expense-type-1", active: true } },
			},
			result: { data: { updateExpenseType: expenseType({ active: true }) } },
		};
		renderPanel({
			user: SHOP_ADMIN,
			mocks: [
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ active: false })] }),
				updateMock,
				typesMock({ scope: SHOP_SCOPE, types: [expenseType({ active: true })] }),
			],
		});

		await user.click(await screen.findByRole("button", { name: "Reactivate" }));

		await waitFor(() => expect(screen.queryByText("Inactive")).not.toBeInTheDocument());
		expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
	});

	it("alerts the server's error message when the toggle fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ExpenseService.UPDATE_EXPENSE_TYPE,
				variables: { input: { expenseTypeId: "expense-type-1", active: false } },
			},
			error: new Error("You can't deactivate a category in use this week."),
		};
		const { setAlert } = renderPanel({
			user: SHOP_ADMIN,
			mocks: [typesMock({ scope: SHOP_SCOPE, types: [expenseType({ active: true })] }), failingMock],
		});

		await user.click(await screen.findByRole("button", { name: "Deactivate" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "You can't deactivate a category in use this week.",
				}),
			),
		);
	});
});
