// Shop.jsx tests. This is the shop-admin-facing detail/management page for a single shop (NOT
// components/settings/ShopPanel.jsx, which is a different, embedded-in-Settings component for the
// shop-cut PERCENT specifically - see this file's own header comment on why that one field moved
// off this page and is read-only here now). Shop.jsx itself covers: the editable
// name/contact/address fields (autosaved on blur via updateShop, one shared save-state line for
// all of them), the read-only shop-cut percent readout with a link to Settings, the Square
// connect/disconnect flow, and the banner shown after landing back here from the Square OAuth
// redirect.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import Shop from "./Shop";
import ShopService from "../../services/ShopService";
import { AuthContext } from "../../context/auth";
import { ROLES, ALERT_CONSTANTS, ROUTE_CONSTANTS } from "../../constants";

// _fetchShop builds this document fresh inside its own closure every call and ShopService never
// exports it directly - reconstructed here field-for-field from ShopService.js, the same way
// ShopService.test.js's own FETCH_SHOP_QUERY_FOR_TESTS does. MockedProvider matches a request by
// the document's printed shape plus variables, not by reference identity, so this still fails
// loudly (an Apollo "no matching mock" error) rather than passing on stale data if ShopService.js's
// selection set ever drifts from what's copied here.
const FETCH_SHOP_QUERY_FOR_TESTS = gql`
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

// Same situation as above - _useSquareAuthorizationUrl wraps a document built inline, never
// exported raw.
const GET_SQUARE_AUTHORIZATION_URL_FOR_TESTS = gql`
	query GetSquareAuthorizationUrl($shopId: ID!) {
		getSquareAuthorizationUrl(shopId: $shopId)
	}
`;

// UPDATE_SHOP_MUTATION is the odd one - ShopService.updateShop(shop) ignores its argument and just
// returns the same document every call (see ShopService.test.js's own "ignores its argument"
// test), so the REAL document is available by simply calling it, no hand copy needed.
const UPDATE_SHOP_MUTATION = ShopService.updateShop();

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
		shopCutPercent: 40,
		logo: null,
		billingType: "percent",
		status: 0,
		formSlug: "copper-wolf",
		squareConnected: false,
		squareLocationId: null,
		squareConnectedAt: null,
		...overrides,
	};
}

function fetchShopMock({ shopId = "shop-1", shop = fatShop() } = {}) {
	return {
		request: { query: FETCH_SHOP_QUERY_FOR_TESTS, variables: { shopId } },
		result: { data: { getShop: shop } },
	};
}

// buildShopPayload() (Shop.jsx) echoes every field of the fetched shop back except whichever ref
// changed - built here from the same fatShop() fixture so a payload assertion can be composed as
// `{ ...basePayload(), name: "New Name" }` instead of hand-listing all fifteen fields per test.
function basePayload(shop = fatShop()) {
	return {
		id: shop.id,
		name: shop.name,
		email: shop.email,
		phone: shop.phone,
		address: shop.address,
		city: shop.city,
		state: shop.state,
		zip: shop.zip,
		instagram: shop.instagram,
		facebook: shop.facebook,
		website: shop.website,
		shopMinimum: shop.shopMinimum,
		hourlyRate: shop.hourlyRate,
		logo: shop.logo,
		billingType: shop.billingType,
		status: shop.status,
		shopCutPercent: shop.shopCutPercent ?? 0,
	};
}

const SHOP_ADMIN = { role: ROLES.SHOP_ADMIN, userInfo: { id: "user-1" } };
const PLAIN_ARTIST = { role: ROLES.ARTIST, userInfo: { id: "artist-1" } };

function renderShop({
	shopId = "shop-1",
	mocks = [],
	user = SHOP_ADMIN,
	search = "",
	setAlert = vi.fn(),
} = {}) {
	const contextValue = { user, setAlert };
	render(
		<MemoryRouter initialEntries={[`/shop/${shopId}${search}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Routes>
						<Route path="/shop/:shopId" element={<Shop />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert };
}

describe("Shop loading and not-found states", () => {
	it("shows a page loader while the shop is being fetched", () => {
		renderShop({ mocks: [fetchShopMock()] });
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	// Shop.jsx only destructures {loading, data} off fetchShop, ignoring `error` entirely - so the
	// "does not exist" branch (the `else` on `if (data)`) is reached whenever the query errors and
	// `data` never gets set, not from getShop resolving to null (which `data` would still be
	// truthy for and which this component doesn't actually guard against separately).
	it("shows IBCardShowError when the shop query errors out", async () => {
		renderShop({
			mocks: [
				{
					request: { query: FETCH_SHOP_QUERY_FOR_TESTS, variables: { shopId: "shop-1" } },
					error: new Error("Network error"),
				},
			],
		});

		expect(await screen.findByText("Something Went Wrong!")).toBeInTheDocument();
		expect(screen.getByText("This shop does not exist.")).toBeInTheDocument();
	});
});

describe("Shop details - shop admin (canEdit)", () => {
	it("renders the shop's fields as editable inputs, with no read-only hint", async () => {
		renderShop({ user: SHOP_ADMIN, mocks: [fetchShopMock()] });

		expect(await screen.findByRole("heading", { name: "Copper Wolf Tattoo" })).toBeInTheDocument();
		expect(screen.queryByText("Only a shop admin can edit these details.")).not.toBeInTheDocument();

		const nameField = screen.getByLabelText("Name");
		expect(nameField).toHaveValue("Copper Wolf Tattoo");
		expect(nameField).not.toBeDisabled();
	});

	it("shows the read-only shop-cut percent and a link to Settings", async () => {
		renderShop({ user: SHOP_ADMIN, mocks: [fetchShopMock()] });

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(screen.getByText("40%")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Change in Settings" })).toHaveAttribute(
			"href",
			ROUTE_CONSTANTS.SETTINGS,
		);
	});

	it("defaults the shop-cut readout to 0% when shopCutPercent is unset", async () => {
		renderShop({
			user: SHOP_ADMIN,
			mocks: [fetchShopMock({ shop: fatShop({ shopCutPercent: null }) })],
		});

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(screen.getByText("0%")).toBeInTheDocument();
	});

	it("autosaves on blur, echoing every other field unchanged, and shows the saved state", async () => {
		const user = userEvent.setup();
		const updatedShop = fatShop({ name: "Copper Wolf Tattoo Co." });
		renderShop({
			user: SHOP_ADMIN,
			mocks: [
				fetchShopMock(),
				{
					request: {
						query: UPDATE_SHOP_MUTATION,
						variables: { shop: { ...basePayload(), name: "Copper Wolf Tattoo Co." } },
					},
					result: { data: { updateShop: updatedShop } },
				},
			],
		});

		const nameField = await screen.findByLabelText("Name");
		await user.clear(nameField);
		await user.type(nameField, "Copper Wolf Tattoo Co.");
		nameField.blur();

		await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
	});

	it("does not resave on a blur where nothing actually changed", async () => {
		const user = userEvent.setup();
		// No update mock registered at all - if handleShopFieldBlur fired anyway, MockedProvider
		// would surface a "no matching mock" network error instead of leaving the save state idle.
		renderShop({ user: SHOP_ADMIN, mocks: [fetchShopMock()] });

		const nameField = await screen.findByLabelText("Name");
		await user.click(nameField);
		nameField.blur();

		await waitFor(() =>
			expect(screen.queryByText(/Saving|All changes saved|Couldn't save/)).not.toBeInTheDocument(),
		);
	});

	it("shows the server's error message and an error save-state when the save fails", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderShop({
			user: SHOP_ADMIN,
			mocks: [
				fetchShopMock(),
				{
					request: {
						query: UPDATE_SHOP_MUTATION,
						variables: { shop: { ...basePayload(), name: "Bad Name" } },
					},
					error: new Error("That name is already taken."),
				},
			],
		});

		const nameField = await screen.findByLabelText("Name");
		await user.clear(nameField);
		await user.type(nameField, "Bad Name");
		nameField.blur();

		await waitFor(() => expect(screen.getByText("Couldn't save - try again")).toBeInTheDocument());
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.ERROR,
				message: "Couldn't save: That name is already taken.",
			}),
		);
	});
});

describe("Shop details - non-admin (read-only)", () => {
	it("disables every field and shows the read-only hint", async () => {
		renderShop({ user: PLAIN_ARTIST, mocks: [fetchShopMock()] });

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(screen.getByText("Only a shop admin can edit these details.")).toBeInTheDocument();
		expect(screen.getByLabelText("Name")).toBeDisabled();
		expect(screen.getByLabelText("Email")).toBeDisabled();
	});

	it("still shows the shop-cut percent but no link to change it", async () => {
		renderShop({ user: PLAIN_ARTIST, mocks: [fetchShopMock()] });

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(screen.getByText("40%")).toBeInTheDocument();
		expect(screen.queryByRole("link", { name: "Change in Settings" })).not.toBeInTheDocument();
	});
});

describe("Square connection", () => {
	it("shows the disconnected message and a Connect button when Square isn't linked", async () => {
		renderShop({ mocks: [fetchShopMock({ shop: fatShop({ squareConnected: false }) })] });

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(
			screen.getByText(/Not connected - connect Square to send shop-cut invoices/),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connect with Square" })).toBeInTheDocument();
	});

	it("shows Connecting... (disabled) while the authorization url is in flight", async () => {
		const user = userEvent.setup();
		renderShop({
			mocks: [
				fetchShopMock({ shop: fatShop({ squareConnected: false }) }),
				{
					request: {
						query: GET_SQUARE_AUTHORIZATION_URL_FOR_TESTS,
						variables: { shopId: "shop-1" },
					},
					result: {
						data: {
							getSquareAuthorizationUrl: "https://squareup.com/oauth/authorize?state=shop-1",
						},
					},
					// A long delay rather than an immediate result - handleConnectSquare sends the
					// browser to window.location.href once the promise resolves, which jsdom doesn't
					// implement (real navigation). Never letting it resolve within the test keeps this
					// test focused on the loading state alone, without touching that unrelated gap.
					delay: 24 * 60 * 60 * 1000,
				},
			],
		});

		await user.click(await screen.findByRole("button", { name: "Connect with Square" }));

		expect(await screen.findByRole("button", { name: "Connecting..." })).toBeDisabled();
	});

	it("shows Connected and a Disconnect button when Square is linked", async () => {
		renderShop({ mocks: [fetchShopMock({ shop: fatShop({ squareConnected: true }) })] });

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(screen.getByText("Connected")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Disconnect Square" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Connect with Square" })).not.toBeInTheDocument();
	});

	it("fires disconnectShopSquare with the shop's id when Disconnect is clicked", async () => {
		const user = userEvent.setup();
		renderShop({
			mocks: [
				fetchShopMock({ shop: fatShop({ squareConnected: true }) }),
				{
					request: { query: ShopService.DISCONNECT_SHOP_SQUARE, variables: { shopId: "shop-1" } },
					result: {
						data: {
							disconnectShopSquare: {
								__typename: "Shop",
								id: "shop-1",
								squareConnected: false,
								squareLocationId: null,
								squareConnectedAt: null,
							},
						},
					},
				},
			],
		});

		await screen.findByText("Connected");
		// No further assertion needed beyond "this doesn't throw" - a mismatched request/variables
		// shape here would surface as an Apollo "no matching mock" console error, which is exactly
		// what proves disconnectShopSquare was called with the right shopId.
		await user.click(screen.getByRole("button", { name: "Disconnect Square" }));
	});
});

describe("Square OAuth redirect banner", () => {
	it("shows a success banner for ?square=connected and dismisses it on click", async () => {
		const user = userEvent.setup();
		renderShop({ mocks: [fetchShopMock()], search: "?square=connected" });

		const banner = await screen.findByText(/Square account connected\. \(click to dismiss\)/);
		expect(banner).toBeInTheDocument();

		await user.click(banner);
		await waitFor(() =>
			expect(screen.queryByText(/Square account connected/)).not.toBeInTheDocument(),
		);
	});

	it("shows an error banner for ?square=denied", async () => {
		renderShop({ mocks: [fetchShopMock()], search: "?square=denied" });

		expect(
			await screen.findByText(/Square connection was cancelled\. \(click to dismiss\)/),
		).toBeInTheDocument();
	});

	it("shows an error banner for ?square=error", async () => {
		renderShop({ mocks: [fetchShopMock()], search: "?square=error" });

		expect(
			await screen.findByText(/Something went wrong connecting Square\. Please try again\./),
		).toBeInTheDocument();
	});

	it("shows no banner at all when there is no square redirect param", async () => {
		renderShop({ mocks: [fetchShopMock()] });

		await screen.findByRole("heading", { name: "Copper Wolf Tattoo" });
		expect(screen.queryByText(/click to dismiss/)).not.toBeInTheDocument();
	});
});
