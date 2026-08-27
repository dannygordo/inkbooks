// ShopService.js tests. A "Service" file here is an IIFE exporting a mix of React-hook factories
// wrapping useQuery/useMutation/useLazyQuery around a gql document, and raw gql documents meant to
// be passed directly to useMutation/useQuery by a calling component - there is almost no pure
// logic to unit-test in isolation, so every export below is exercised through a tiny throwaway
// harness component rendered under MockedProvider, matching ClientService.test.js's established
// convention for this exact file shape.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment - this
// codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this project's
// Vite/oxc pipeline, and this file stays a .js to match its sibling ShopService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useQuery, useMutation } from "@apollo/client";
import { print } from "graphql";
import ShopService from "./ShopService";

// ---- queries reconstructed from ShopService.js's internals ------------------------------------
// None of these four are separately exported by ShopService the way e.g. MY_SQUARE_CONNECTION is -
// they're built fresh inside their respective hook-factory closures every call. So they're
// reconstructed here field-for-field from the real source in ShopService.js purely so
// MockedProvider has a document to match against. MockedProvider compares a request by the
// document's printed text plus variables, not by reference identity, so each of these still fails
// loudly if the real query in ShopService.js ever drifts from what's copied here.

// Used internally by _fetchShop.
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

// Used internally by _useLazyShop - deliberately a much narrower selection than the query above
// (id/name/website only), per ShopService.js's own comment on why this exists at all.
const LAZY_SHOP_QUERY_FOR_TESTS = gql`
	query ($shopId: ID!) {
		getShop(shopId: $shopId) {
			id
			name
			website
		}
	}
`;

// Used internally by _fetchShops - a still-narrower field list than FETCH_SHOP_QUERY (no
// shopCutPercent, formSlug, or the Square fields).
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

// Used internally by _useSquareAuthorizationUrl.
const GET_SQUARE_AUTHORIZATION_URL_FOR_TESTS = gql`
	query GetSquareAuthorizationUrl($shopId: ID!) {
		getSquareAuthorizationUrl(shopId: $shopId)
	}
`;

// Used internally by _useMySquareAuthorizationUrl.
const GET_MY_SQUARE_AUTHORIZATION_URL_FOR_TESTS = gql`
	query GetMySquareAuthorizationUrl {
		getMySquareAuthorizationUrl
	}
`;

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
		// Deliberately generic: these tests only need to know THAT a request errored (e.g. no mock
		// matched, proving a network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders whatever a lazy-query-returning hook function produces, plus a button to fire the
// trigger with fixed variables (or none, for the no-arg lazy queries below).
function LazyQueryHarness({ hookFn, variables }) {
	const [trigger, { data, called }] = hookFn();
	return React.createElement(
		"div",
		null,
		React.createElement(
			"button",
			{ onClick: () => trigger(variables !== undefined ? { variables } : undefined) },
			"go",
		),
		React.createElement("div", { "data-testid": "called" }, called ? "called" : "not-called"),
		data && React.createElement("div", { "data-testid": "result" }, JSON.stringify(data)),
	);
}

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once it
// lands.
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

// ---- fetchShop ----------------------------------------------------------------------------------

describe("ShopService.fetchShop", () => {
	it("resolves with the full shop record", async () => {
		const shop = {
			__typename: "Shop",
			id: "shop-1",
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
		};
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ShopService.fetchShop("shop-1") });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_SHOP_QUERY_FOR_TESTS, variables: { shopId: "shop-1" } },
							result: { data: { getShop: shop } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Copper Wolf Tattoo");
		expect(result).toHaveTextContent("copper-wolf");
	});
});

describe("ShopService.fetchShop has no skip guard", () => {
	// Unlike ClientService's fetchClientDashboard, _fetchShop has no `skip` at all - it fires
	// unconditionally even with a falsy shopId. Registering zero mocks and observing the query
	// still error out (rather than sitting quietly with loading:false/data:undefined the way a
	// skipped query would) is the proof that a real request was attempted.
	it("still fires the query even when shopId is falsy", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ShopService.fetchShop("") });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- useLazyShop ----------------------------------------------------------------------------------

describe("ShopService.useLazyShop", () => {
	it("does not fire until the trigger is called", async () => {
		render(
			React.createElement(
				MockedProvider,
				{ mocks: [] },
				React.createElement(LazyQueryHarness, {
					hookFn: ShopService.useLazyShop,
					variables: { shopId: "shop-1" },
				}),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	// This is the exact use case ShopService.js's own comment describes: fired manually right after
	// connectArtistToShop, with only id/name/website coming back - a narrower selection than the
	// eager fetchShop query above.
	it("fires with the given shopId and returns only id/name/website once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: LAZY_SHOP_QUERY_FOR_TESTS, variables: { shopId: "shop-1" } },
							result: {
								data: {
									getShop: {
										__typename: "Shop",
										id: "shop-1",
										name: "Copper Wolf Tattoo",
										website: "https://copperwolf.example",
									},
								},
							},
						},
					],
				},
				React.createElement(LazyQueryHarness, {
					hookFn: ShopService.useLazyShop,
					variables: { shopId: "shop-1" },
				}),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("copperwolf.example");
	});
});

// ---- fetchShops ----------------------------------------------------------------------------------

describe("ShopService.fetchShops", () => {
	it("resolves with the list of shops and takes no arguments/variables", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ShopService.fetchShops() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_SHOPS_QUERY_FOR_TESTS, variables: {} },
							result: {
								data: {
									getShops: [
										{
											__typename: "Shop",
											id: "shop-1",
											name: "Copper Wolf Tattoo",
											email: "shop@example.com",
											phone: "555-0100",
											address: null,
											city: null,
											state: null,
											zip: null,
											instagram: null,
											facebook: null,
											website: null,
											shopMinimum: 8000,
											hourlyRate: 15000,
											logo: null,
											billingType: "percent",
											status: 0,
										},
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Copper Wolf Tattoo");
	});

	// Locks in that _fetchShops' selection set stays the narrower one (no shopCutPercent/formSlug/
	// Square fields) documented in ShopService.js - a silent widening here would be a regression
	// toward over-fetching every shop's Square connection details on a screen that never needs them.
	it("does not select shopCutPercent, formSlug, or the Square fields", () => {
		const printed = print(FETCH_SHOPS_QUERY_FOR_TESTS);
		expect(printed).toContain("hourlyRate");
		expect(printed).not.toContain("shopCutPercent");
		expect(printed).not.toContain("formSlug");
		expect(printed).not.toContain("squareConnected");
	});
});

// ---- updateShop (an odd one: returns a raw document, ignoring its own argument) ------------------

describe("ShopService.updateShop", () => {
	const UPDATE_SHOP_MUTATION_FOR_TESTS = gql`
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

	// SURPRISE: despite taking a `shop` parameter, _updateShop's body never reads it - it just
	// builds and returns the UPDATE_SHOP_MUTATION document unconditionally, exactly like
	// ClientService.updateClient. Calling it is really just "give me the mutation document", not
	// "give me a mutation bound to this shop".
	it("ignores its argument - the same document comes back regardless of what's passed", () => {
		const docA = ShopService.updateShop({ id: "a" });
		const docB = ShopService.updateShop(undefined);
		expect(print(docA)).toEqual(print(docB));
		expect(print(docA)).toEqual(print(UPDATE_SHOP_MUTATION_FOR_TESTS));
	});

	it("is a usable mutation document when handed to useMutation directly, as real callers would", async () => {
		const user = userEvent.setup();
		const shop = { id: "shop-1", name: "Copper Wolf Tattoo Updated" };
		const document = ShopService.updateShop(shop);

		function Harness() {
			return React.createElement(MutationHarness, { document, variables: { shop } });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UPDATE_SHOP_MUTATION_FOR_TESTS, variables: { shop } },
							result: {
								data: {
									updateShop: {
										__typename: "Shop",
										id: "shop-1",
										name: "Copper Wolf Tattoo Updated",
										email: "shop@example.com",
										phone: "555-0100",
										address: null,
										city: null,
										state: null,
										zip: null,
										instagram: null,
										facebook: null,
										website: null,
										shopMinimum: 8000,
										hourlyRate: 15000,
										shopCutPercent: 40,
										logo: null,
										billingType: "percent",
										status: 0,
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Copper Wolf Tattoo Updated");
	});
});

// ---- UPDATE_MY_SHOP_FORM_SLUG_MUTATION -----------------------------------------------------------

describe("ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION", () => {
	it("sends shopId + slug and the updated formSlug flows back", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION,
				variables: { shopId: "shop-1", slug: "copper-wolf-tattoo" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION,
								variables: { shopId: "shop-1", slug: "copper-wolf-tattoo" },
							},
							result: {
								data: {
									updateMyShopFormSlug: {
										__typename: "Shop",
										id: "shop-1",
										formSlug: "copper-wolf-tattoo",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("copper-wolf-tattoo");
	});

	// The mutation's own comment describes this as a narrow, self-service, "patch what changed"
	// update - locks in that its selection set stays id + formSlug only, not the full shop record.
	it("does not select fields beyond id and formSlug", () => {
		const printed = print(ShopService.UPDATE_MY_SHOP_FORM_SLUG_MUTATION);
		expect(printed).toContain("formSlug");
		expect(printed).not.toContain("shopMinimum");
		expect(printed).not.toContain("squareConnected");
	});
});

// ---- useSquareAuthorizationUrl (shop's own Square connect flow) ----------------------------------

describe("ShopService.useSquareAuthorizationUrl", () => {
	it("does not fire until the trigger is called", async () => {
		render(
			React.createElement(
				MockedProvider,
				{ mocks: [] },
				React.createElement(LazyQueryHarness, {
					hookFn: ShopService.useSquareAuthorizationUrl,
					variables: { shopId: "shop-1" },
				}),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires GetSquareAuthorizationUrl with the given shopId once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
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
						},
					],
				},
				React.createElement(LazyQueryHarness, {
					hookFn: ShopService.useSquareAuthorizationUrl,
					variables: { shopId: "shop-1" },
				}),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("squareup.com/oauth/authorize");
	});
});

// ---- DISCONNECT_SHOP_SQUARE ----------------------------------------------------------------------

describe("ShopService.DISCONNECT_SHOP_SQUARE", () => {
	it("disconnects a shop's Square connection by shopId", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ShopService.DISCONNECT_SHOP_SQUARE,
				variables: { shopId: "shop-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
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
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"squareConnected":false');
	});

	// Selection set is deliberately just the shop's Square-connection fields, not the full shop
	// record (name/email/etc.) - a widening here would mean over-fetching unrelated shop fields on
	// every disconnect.
	it("does not select fields beyond id and the Square connection fields", () => {
		const printed = print(ShopService.DISCONNECT_SHOP_SQUARE);
		expect(printed).toContain("squareConnectedAt");
		expect(printed).not.toContain("name");
		expect(printed).not.toContain("shopMinimum");
	});
});

// ---- fetchMySquareConnection / MY_SQUARE_CONNECTION (raw document) -------------------------------

describe("ShopService.fetchMySquareConnection", () => {
	it("resolves with the caller's own Square connection, eagerly (no args, no variables)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ShopService.fetchMySquareConnection() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.MY_SQUARE_CONNECTION, variables: {} },
							result: {
								data: {
									getMySquareConnection: {
										__typename: "MySquareConnection",
										source: "artist",
										connected: true,
										locationId: "loc-2",
										connectedAt: "2026-02-01T00:00:00.000Z",
										ownerName: "Danny",
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
		expect(result).toHaveTextContent("Danny");
		expect(result).toHaveTextContent('"source":"artist"');
	});

	// The "answers a different question" case from ShopService.js's own comment: an artist working
	// at a shop gets source 'shop' back rather than 'artist', so the panel can tell them the truth
	// instead of offering a connect button that would build an account nothing routes to.
	it("can resolve source: 'shop' for an artist whose sessions charge through their shop", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ShopService.fetchMySquareConnection() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.MY_SQUARE_CONNECTION, variables: {} },
							result: {
								data: {
									getMySquareConnection: {
										__typename: "MySquareConnection",
										source: "shop",
										connected: true,
										locationId: "loc-1",
										connectedAt: "2026-01-01T00:00:00.000Z",
										ownerName: "Copper Wolf Tattoo",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"source":"shop"');
	});
});

describe("ShopService.MY_SQUARE_CONNECTION (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same way a
	// calling component reaching for the raw document (rather than the wrapped hook) would use it -
	// this is the exact document _fetchMySquareConnection itself runs internally.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useQuery(ShopService.MY_SQUARE_CONNECTION),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.MY_SQUARE_CONNECTION, variables: {} },
							result: {
								data: {
									getMySquareConnection: {
										__typename: "MySquareConnection",
										source: "artist",
										connected: false,
										locationId: null,
										connectedAt: null,
										ownerName: null,
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"connected":false');
	});
});

// ---- useMySquareAuthorizationUrl (artist's own Square connect flow) ------------------------------

describe("ShopService.useMySquareAuthorizationUrl", () => {
	it("does not fire until the trigger is called", async () => {
		render(
			React.createElement(
				MockedProvider,
				{ mocks: [] },
				React.createElement(LazyQueryHarness, { hookFn: ShopService.useMySquareAuthorizationUrl }),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires GetMySquareAuthorizationUrl with no variables once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_MY_SQUARE_AUTHORIZATION_URL_FOR_TESTS, variables: {} },
							result: {
								data: {
									getMySquareAuthorizationUrl: "https://squareup.com/oauth/authorize?state=me",
								},
							},
						},
					],
				},
				React.createElement(LazyQueryHarness, { hookFn: ShopService.useMySquareAuthorizationUrl }),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("squareup.com/oauth/authorize");
	});
});

// ---- DISCONNECT_MY_SQUARE ---------------------------------------------------------------------

describe("ShopService.DISCONNECT_MY_SQUARE", () => {
	it("disconnects the caller's own Square connection with no variables", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ShopService.DISCONNECT_MY_SQUARE,
				variables: {},
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.DISCONNECT_MY_SQUARE, variables: {} },
							result: {
								data: {
									disconnectMySquare: {
										__typename: "MySquareConnection",
										source: "artist",
										connected: false,
										locationId: null,
										connectedAt: null,
										ownerName: null,
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"connected":false');
	});
});

// ---- fetchMySquarePricing / MY_SQUARE_PRICING (raw document) -------------------------------------

describe("ShopService.fetchMySquarePricing", () => {
	it("resolves with the caller's tax rate and fee offset, eagerly (no args, no variables)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ShopService.fetchMySquarePricing() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.MY_SQUARE_PRICING, variables: {} },
							result: {
								data: {
									getMySquarePricingSettings: {
										__typename: "MySquarePricingSettings",
										source: "shop",
										ownerName: "Copper Wolf Tattoo",
										taxRateBasisPoints: 940,
										squareFeeOffsetCents: 0,
										canEdit: false,
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
		expect(result).toHaveTextContent('"taxRateBasisPoints":940');
		expect(result).toHaveTextContent('"canEdit":false');
	});
});

describe("ShopService.MY_SQUARE_PRICING (raw document)", () => {
	it("works standalone via useQuery, and rates/offsets stay stored as integers", async () => {
		// Per ShopService.js's own comment: taxRateBasisPoints/squareFeeOffsetCents are stored and
		// transmitted as integers (basis points / cents), not as a float percentage - a percentage
		// held as a float is where 9.4 stops being representable. This test's mock data is
		// deliberately integer-shaped to lock that convention in.
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useQuery(ShopService.MY_SQUARE_PRICING),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.MY_SQUARE_PRICING, variables: {} },
							result: {
								data: {
									getMySquarePricingSettings: {
										__typename: "MySquarePricingSettings",
										source: "artist",
										ownerName: "Danny",
										taxRateBasisPoints: 875,
										squareFeeOffsetCents: 30,
										canEdit: true,
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
		expect(result).toHaveTextContent('"taxRateBasisPoints":875');
		expect(result).toHaveTextContent('"squareFeeOffsetCents":30');
		expect(Number.isInteger(875)).toBe(true);
	});
});

// ---- UPDATE_SQUARE_PRICING ----------------------------------------------------------------------

describe("ShopService.UPDATE_SQUARE_PRICING", () => {
	it("sends taxRateBasisPoints + squareFeeOffsetCents and the updated settings flow back", async () => {
		const user = userEvent.setup();
		const variables = { taxRateBasisPoints: 950, squareFeeOffsetCents: 25 };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ShopService.UPDATE_SQUARE_PRICING,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ShopService.UPDATE_SQUARE_PRICING, variables },
							result: {
								data: {
									updateSquarePricingSettings: {
										__typename: "MySquarePricingSettings",
										source: "shop",
										ownerName: "Copper Wolf Tattoo",
										taxRateBasisPoints: 950,
										squareFeeOffsetCents: 25,
										canEdit: true,
									},
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
		expect(result).toHaveTextContent('"taxRateBasisPoints":950');
		expect(result).toHaveTextContent('"squareFeeOffsetCents":25');
	});
});
