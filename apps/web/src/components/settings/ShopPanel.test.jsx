// ShopPanel.jsx tests. Shop-wide money configuration (shop cut %, shop-wide form link) for an
// owner who is also an artist - see the component's own header comment for why this lives on
// Settings at all and why the tax rate/processing offset are deliberately NOT here (that's
// SquarePricingPanel's job).
//
// None of ShopService.fetchShop, ShopService.updateShop, or FormService.getForms export their gql
// documents directly (each builds its query/mutation INSIDE the hook/factory and never exports
// it) - reconstructed here verbatim from ShopService.js/FormService.js's own source, the same
// approach ShopService.test.js and FormsPanel.test.jsx take for their own unexported documents.
// MockedProvider matches by printed shape, not identity, so this still fails loudly (as an Apollo
// "no matching mock" error) if either service's real query ever drifts from the copy below.
// ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION, by contrast, IS exported directly, so it is
// imported and used as-is.
//
// A MemoryRouter wraps every render below - ShopPanel's own "Shop page" link is a react-router
// <Link>, which throws outside a Router.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import { GraphQLError } from "graphql";
import ShopPanel from "./ShopPanel";
import { AuthContext } from "../../context/auth";
import ShopService from "../../services/ShopService";
import { formUrl } from "../../utils/bookingSlug";

const SHOP_ID = "shop-1";

// Reconstructed from ShopService.js's _fetchShop - same field list as ShopService.test.js's own
// FETCH_SHOP_QUERY_FOR_TESTS.
const FETCH_SHOP_QUERY = gql`
	query ($shopId: ID!) {
		getShop(shopId: $shopId) {
			id
			name
			email
			phone
			address
			city
			state
			zip
			instagram
			facebook
			website
			shopMinimum
			hourlyRate
			shopCutPercent
			logo
			billingType
			status
			formSlug
			squareConnected
			squareLocationId
			squareConnectedAt
		}
	}
`;

// Reconstructed from ShopService.js's _updateShop - the document it returns unconditionally
// regardless of its own `shop` argument (see ShopService.test.js's own comment on that).
const UPDATE_SHOP_MUTATION = gql`
	mutation ($shop: ShopInput) {
		updateShop(shop: $shop) {
			id
			name
			email
			phone
			address
			city
			state
			zip
			instagram
			facebook
			website
			shopMinimum
			hourlyRate
			shopCutPercent
			logo
			billingType
			status
		}
	}
`;

// Reconstructed from FormService.js's _FETCH_FORMS / _FORM_FIELDS.
const FETCH_FORMS = gql`
	query GetForms($shopId: ID, $artistUserId: ID, $status: String, $page: PageInput) {
		getForms(shopId: $shopId, artistUserId: $artistUserId, status: $status, page: $page) {
			items {
				id
				shopId
				artistUserId
				title
				description
				status
				allowGuestSubmissions
				publicToken
				slug
				shopUseOnly
				systemKey
				fields {
					key
					type
					label
					helpText
					required
					options
					hidden
				}
				createdByUserId
				createdBy {
					id
					firstName
					lastName
				}
				createdAt
				updatedAt
			}
			pageInfo {
				totalCount
				hasMore
				limit
				offset
			}
		}
	}
`;

function shopRecord(overrides = {}) {
	return {
		__typename: "Shop",
		id: SHOP_ID,
		name: "Copper Wolf Tattoo",
		email: "shop@example.com",
		phone: "555-0100",
		address: "1 Main St",
		city: "Portland",
		state: "OR",
		zip: "97201",
		instagram: null,
		facebook: null,
		website: "https://copperwolf.example",
		shopMinimum: 8000,
		hourlyRate: 15000,
		shopCutPercent: 40,
		logo: null,
		billingType: "percent",
		status: 0,
		formSlug: "copper-wolf",
		squareConnected: true,
		squareLocationId: "loc-1",
		squareConnectedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function shopMock(overrides = {}) {
	return {
		request: { query: FETCH_SHOP_QUERY, variables: { shopId: SHOP_ID } },
		result: { data: { getShop: shopRecord(overrides) } },
	};
}

function form(overrides = {}) {
	return {
		__typename: "Form",
		id: "form-1",
		shopId: SHOP_ID,
		artistUserId: null,
		title: "Shop Waiver",
		description: null,
		status: "published",
		allowGuestSubmissions: true,
		publicToken: "tok-1",
		slug: "waiver",
		shopUseOnly: true,
		systemKey: null,
		fields: [],
		createdByUserId: "admin-1",
		createdBy: { __typename: "User", id: "admin-1", firstName: "Danny", lastName: "Wolf" },
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// getForms's variables include `page` explicitly as `undefined` (ShopPanel calls
// FormService.getForms({ shopId }, "published") with no third argument) - matched here with the
// same shape rather than omitting the key outright.
function formsMock(items = []) {
	return {
		request: {
			query: FETCH_FORMS,
			variables: { shopId: SHOP_ID, status: "published", page: undefined },
		},
		result: {
			data: {
				getForms: {
					__typename: "FormPage",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: 25,
						offset: 0,
					},
				},
			},
		},
	};
}

function renderPanel({ shopName, mocks, setAlert = vi.fn() } = {}) {
	const resolvedMocks = mocks ?? [shopMock(), formsMock([])];
	render(
		<MemoryRouter>
			<MockedProvider mocks={resolvedMocks}>
				<AuthContext.Provider value={{ setAlert }}>
					<ShopPanel shopId={SHOP_ID} shopName={shopName} />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert };
}

describe("loading and population", () => {
	it("renders nothing while the shop query is still loading", () => {
		renderPanel();

		expect(screen.queryByRole("heading", { name: "Shop" })).not.toBeInTheDocument();
	});

	it("shows the shop cut, shop link, and a link back to the shop page once loaded", async () => {
		renderPanel();

		expect(await screen.findByRole("heading", { name: "Shop" })).toBeInTheDocument();
		expect(screen.getByLabelText("Shop cut (%)")).toHaveValue(40);
		expect(screen.getByLabelText("Shop link")).toHaveValue("copper-wolf");
		expect(screen.getByRole("link", { name: "Shop page" })).toHaveAttribute("href", `/shop/${SHOP_ID}`);
	});

	it("prefers the shopName prop over the fetched shop's own name in the help text", async () => {
		renderPanel({ shopName: "The Renamed Shop" });

		expect(
			await screen.findByText(/Settings for The Renamed Shop, applied to every artist working there\./),
		).toBeInTheDocument();
	});

	it("falls back to the fetched shop's name when no shopName prop is given", async () => {
		renderPanel({ mocks: [shopMock(), formsMock([])] });

		expect(
			await screen.findByText(/Settings for Copper Wolf Tattoo, applied to every artist working there\./),
		).toBeInTheDocument();
	});
});

describe("shop-wide form links", () => {
	it("lists only shopUseOnly forms, with their full public URL", async () => {
		renderPanel({
			mocks: [
				shopMock(),
				formsMock([
					form({ id: "form-1", title: "Shop Waiver", slug: "waiver", shopUseOnly: true }),
					form({ id: "form-2", title: "Per-Artist Intake", slug: "intake", shopUseOnly: false }),
				]),
			],
		});

		expect(await screen.findByText("Shop Waiver")).toBeInTheDocument();
		expect(screen.getByText(formUrl("waiver", "copper-wolf"))).toBeInTheDocument();
		expect(screen.queryByText("Per-Artist Intake")).not.toBeInTheDocument();
	});

	it("shows no list at all when the shop has no shopUseOnly forms", async () => {
		renderPanel({
			mocks: [shopMock(), formsMock([form({ shopUseOnly: false })])],
		});

		await screen.findByLabelText("Shop link");
		expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
	});

	it("shows no list when the shop has not set its own link yet, even with a shopUseOnly form", async () => {
		renderPanel({
			mocks: [shopMock({ formSlug: "" }), formsMock([form({ shopUseOnly: true })])],
		});

		await screen.findByLabelText("Shop link");
		expect(screen.queryByText("Shop Waiver")).not.toBeInTheDocument();
	});

	it("copies the exact public URL and shows Copied", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		// jsdom has no clipboard implementation - see FormsPanel.test.jsx's identical comment.
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

		renderPanel({
			mocks: [shopMock(), formsMock([form({ slug: "waiver", shopUseOnly: true })])],
		});

		await screen.findByText("Shop Waiver");
		await user.click(screen.getByRole("button", { name: "Copy" }));

		expect(writeText).toHaveBeenCalledWith(formUrl("waiver", "copper-wolf"));
		expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
	});
});

describe("editing the shop cut percentage", () => {
	it("saves a valid whole number on blur", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				shopMock(),
				formsMock([]),
				{
					request: {
						query: UPDATE_SHOP_MUTATION,
						variables: { shop: { id: SHOP_ID, shopCutPercent: 55 } },
					},
					result: { data: { updateShop: shopRecord({ shopCutPercent: 55 }) } },
				},
			],
		});

		const field = await screen.findByLabelText("Shop cut (%)");
		await user.clear(field);
		await user.type(field, "55");
		await user.tab();

		expect(await screen.findByText("Saved")).toBeInTheDocument();
	});

	it("rejects a value outside 0-100 without saving", async () => {
		const user = userEvent.setup();
		// Zero extra mocks beyond the initial fetch - an attempted save would surface as an
		// unmatched-request error rather than this validation message.
		renderPanel();

		const field = await screen.findByLabelText("Shop cut (%)");
		await user.clear(field);
		await user.type(field, "150");
		await user.tab();

		expect(
			await screen.findByText("Enter a whole number between 0 and 100"),
		).toBeInTheDocument();
	});

	it("does nothing on blur when the value is unchanged", async () => {
		const user = userEvent.setup();
		renderPanel();

		const field = await screen.findByLabelText("Shop cut (%)");
		await user.click(field);
		await user.tab();

		expect(screen.queryByText("Saved")).not.toBeInTheDocument();
		expect(screen.queryByText("Enter a whole number between 0 and 100")).not.toBeInTheDocument();
	});
});

describe("editing the shop's form link", () => {
	it("saves a normalized (trimmed, lowercased) slug on blur", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				shopMock(),
				formsMock([]),
				{
					request: {
						query: ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION,
						variables: { shopId: SHOP_ID, slug: "new-handle" },
					},
					result: { data: { updateMyShopFormSlug: { __typename: "Shop", id: SHOP_ID, formSlug: "new-handle" } } },
				},
			],
		});

		const field = await screen.findByLabelText("Shop link");
		await user.clear(field);
		await user.type(field, " New-Handle ");
		await user.tab();

		expect(await screen.findByText("Saved")).toBeInTheDocument();
	});

	it("does nothing on blur when cleared to blank", async () => {
		const user = userEvent.setup();
		renderPanel();

		const field = await screen.findByLabelText("Shop link");
		await user.clear(field);
		await user.tab();

		expect(screen.queryByText("Saved")).not.toBeInTheDocument();
		expect(screen.queryByText(/couldn't be saved/)).not.toBeInTheDocument();
	});

	it("alerts and shows an inline error when the server rejects the slug", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			mocks: [
				shopMock(),
				formsMock([]),
				{
					request: {
						query: ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION,
						variables: { shopId: SHOP_ID, slug: "taken" },
					},
					result: {
						errors: [
							new GraphQLError("Validation failed.", {
								extensions: { errors: { slug: "That link is already taken." } },
							}),
						],
					},
				},
			],
		});

		const field = await screen.findByLabelText("Shop link");
		await user.clear(field);
		await user.type(field, "taken");
		await user.tab();

		expect(
			await screen.findByText("That link couldn't be saved - it may already be taken."),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "error", message: "That link is already taken." }),
			),
		);
	});
});
