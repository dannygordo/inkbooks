// Shops.jsx tests. Shops is a thin adapter: ShopService.fetchShops() -> EntityList rows, with
// IBPageActionBar rendering the "Shops" heading (and, per its own switch statement, no "Add"
// button for this pageType - see IBPageActionBar.jsx's own comment on why "Add Shop" was removed
// rather than left pointing at a route that never existed). Most of what's worth locking in here
// is the per-row mapping in SHOP_COLUMNS / the `items` map: which field feeds which column, the
// website-or-email secondary fallback, and that hourlyRate/shopMinimum are rendered as whole
// dollars with a bare $ (NOT formatCents - see Shops.jsx's own header comment on why: those two
// fields are shop configuration a human types, never in cents, and running them through
// formatCents would misread $150/hr as $1.50).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import Shops from "./Shops";
import { AuthContext } from "../../context/auth";
import UtilsService from "../../services/UtilsService";
import { ROLES } from "../../constants";

// _fetchShops builds this document fresh inside its own closure every call - ShopService never
// exports it directly (there's no ShopService.FETCH_SHOPS_QUERY the way there is for e.g.
// DISCONNECT_SHOP_SQUARE), so it's reconstructed here field-for-field from ShopService.js, the
// same way ShopService.test.js's own FETCH_SHOPS_QUERY_FOR_TESTS does. MockedProvider matches a
// request by the document's printed shape plus variables, not by reference identity, so this
// still fails loudly (an Apollo "no matching mock" error) rather than passing on stale data if
// ShopService.js's selection set ever drifts from what's copied here.
const FETCH_SHOPS_QUERY_FOR_TESTS = gql`
	{
		getShops {
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
			logo
			billingType
			status
		}
	}
`;

function fatShop(overrides = {}) {
	return {
		__typename: "Shop",
		id: "shop-1",
		name: "Copper Wolf Tattoo",
		email: "shop@example.com",
		phone: "2125551234",
		address: "1 Main St",
		city: "Portland",
		state: "OR",
		zip: "97201",
		instagram: null,
		facebook: null,
		website: "https://copperwolf.example",
		shopMinimum: 100,
		hourlyRate: 150,
		logo: null,
		billingType: "percent",
		status: 0,
		...overrides,
	};
}

function shopsMock(shops) {
	return {
		request: { query: FETCH_SHOPS_QUERY_FOR_TESTS, variables: {} },
		result: { data: { getShops: shops } },
	};
}

// IBPageActionBar reads user/setModal/modal off the same AuthContext even though this page never
// touches auth itself - it's rendered as a child of Shops, so the context has to be able to
// answer whatever it asks for, same as any other page built on top of it.
function renderShops({
	mocks = [],
	user = { role: ROLES.SHOP_ADMIN, userInfo: null },
} = {}) {
	const contextValue = {
		user,
		setModal: vi.fn(),
		modal: { isOpen: false, title: "", content: "" },
	};
	render(
		<MemoryRouter initialEntries={["/shops"]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Routes>
						<Route path="/shops" element={<Shops />} />
						{/* Purely to observe navigation - proves EntityList's row click actually
						    routed to ROUTE_CONSTANTS.SHOP + shop.id rather than just rendering it. */}
						<Route
							path="/shop/:shopId"
							element={<div data-testid="navigated-to-shop" />}
						/>
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return contextValue;
}

describe("Shops loading and heading", () => {
	it("shows a page loader while shops are being fetched", () => {
		renderShops({ mocks: [shopsMock([])] });
		// MUI's CircularProgress renders with role="progressbar" - asserted before any await, so
		// this only passes if the loader is actually what's on screen before the mock resolves.
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	it("renders the Shops heading via IBPageActionBar, with no Add button", async () => {
		renderShops({ mocks: [shopsMock([])] });
		expect(await screen.findByRole("heading", { name: "Shops" })).toBeInTheDocument();
		// IBPageActionBar's own 'shops' case never renders a button, unlike 'artists'/'staff' -
		// see its header comment on why "Add Shop" was removed rather than left dead.
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("Shops empty state", () => {
	it("shows the EntityList empty message when there are no shops", async () => {
		renderShops({ mocks: [shopsMock([])] });
		expect(await screen.findByText("No shops yet.")).toBeInTheDocument();
	});
});

describe("Shops row mapping", () => {
	it("renders phone, location, hourly rate and minimum for a fully populated shop", async () => {
		renderShops({ mocks: [shopsMock([fatShop()])] });

		expect(await screen.findByText("Copper Wolf Tattoo")).toBeInTheDocument();
		// Same derivation Shops.jsx itself calls (UtilsService.formatPhone), so this checks that
		// Shops.jsx passed the raw phone through it rather than re-deriving the format logic.
		expect(screen.getByText(UtilsService.formatPhone("2125551234"))).toBeInTheDocument();
		expect(screen.getByText("Portland, OR")).toBeInTheDocument();
		// Whole dollars, bare $, no /hr suffix and no formatCents-style decimals - see this file's
		// header comment on why $150 (not $1.50 and not $150.00) is the correct rendering.
		expect(screen.getByText("$150")).toBeInTheDocument();
		expect(screen.getByText("$100")).toBeInTheDocument();
		// secondary defaults to website when one is set.
		expect(screen.getByText("https://copperwolf.example")).toBeInTheDocument();
	});

	it("falls back to email as the secondary line when no website is set", async () => {
		renderShops({ mocks: [shopsMock([fatShop({ website: null })])] });

		await screen.findByText("Copper Wolf Tattoo");
		expect(screen.getByText("shop@example.com")).toBeInTheDocument();
		expect(screen.queryByText("https://copperwolf.example")).not.toBeInTheDocument();
	});

	it("joins only the location parts that are actually set", async () => {
		renderShops({
			mocks: [shopsMock([fatShop({ id: "shop-2", name: "Solo City Shop", city: "Austin", state: null })])],
		});

		await screen.findByText("Solo City Shop");
		// [city, state].filter(Boolean).join(", ") - a lone city gets no trailing comma/space.
		expect(screen.getByText("Austin")).toBeInTheDocument();
	});

	it("shows an em dash (via EntityList) for unset hourly rate and minimum", async () => {
		renderShops({
			mocks: [
				shopsMock([
					fatShop({ id: "shop-3", name: "No Rates Shop", hourlyRate: null, shopMinimum: 0 }),
				]),
			],
		});

		await screen.findByText("No Rates Shop");
		// Shops.jsx maps a falsy rate to "", and EntityList renders "" (like null/undefined) as an
		// em dash rather than a blank cell - see EntityList.jsx's own comment on why a blank in an
		// aligned grid reads as a rendering fault. Two columns are empty here, so two dashes.
		expect(screen.getAllByText("—")).toHaveLength(2);
	});
});

describe("Shops row navigation", () => {
	it("navigates to the shop detail page when a row is clicked", async () => {
		const user = userEvent.setup();
		renderShops({ mocks: [shopsMock([fatShop()])] });

		await user.click(await screen.findByText("Copper Wolf Tattoo"));

		expect(await screen.findByTestId("navigated-to-shop")).toBeInTheDocument();
	});
});
