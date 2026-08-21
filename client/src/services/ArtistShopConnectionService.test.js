// ArtistShopConnectionService.js tests. Same convention as ClientService.test.js: a "Service" file
// here is an IIFE exporting a hook-factory function wrapping useQuery around a gql document, plus
// raw gql documents meant to be passed directly to useMutation by a calling component - there is
// almost no pure logic to unit-test in isolation, so every export below is exercised through a
// tiny throwaway harness component rendered under MockedProvider.
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline, and this file
// stays a .js to match its sibling ArtistShopConnectionService.js.
//
// ArtistShopConnectionService is a DEFAULT export only (no named export) - see
// ProjectSessionsList.jsx / RatesPanel.jsx / ShopConnectionPanel.jsx, all of which import it the
// same way.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import ArtistShopConnectionService from "./ArtistShopConnectionService";

// ---- generic harnesses -----------------------------------------------------------------------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// These tests only need to know THAT a request errored (e.g. no mock matched, proving a
		// network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

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

function connection(overrides = {}) {
	return {
		__typename: "ArtistShopConnection",
		id: "connection-1",
		artistId: "artist-1",
		shopId: "shop-1",
		status: "active",
		rateSource: "shop",
		...overrides,
	};
}

// ---- fetchArtistShopConnections / FETCH_ARTIST_SHOP_CONNECTIONS ---------------------------------

describe("ArtistShopConnectionService.fetchArtistShopConnections", () => {
	it("resolves with the artist's shop connections", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistShopConnectionService.fetchArtistShopConnections("artist-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistShopConnectionService.FETCH_ARTIST_SHOP_CONNECTIONS,
								variables: { artistId: "artist-1" },
							},
							result: { data: { getArtistShopConnections: [connection()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("connection-1");
		expect(result).toHaveTextContent("shop-1");
	});

	it("resolves with an empty list for an artist with no shop connections", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistShopConnectionService.fetchArtistShopConnections("artist-2"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistShopConnectionService.FETCH_ARTIST_SHOP_CONNECTIONS,
								variables: { artistId: "artist-2" },
							},
							result: { data: { getArtistShopConnections: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"getArtistShopConnections":[]');
	});

	// skip: !artistId - per the file's own comment, this mirrors the same defensive pattern used
	// throughout the app for shop-optional data (AppointmentService/UserService's skip guards).
	// Registering zero mocks and seeing no error is the proof no request fired.
	it("skips the query entirely when artistId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistShopConnectionService.fetchArtistShopConnections(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("also skips for an empty-string artistId (falsy, not just null/undefined)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistShopConnectionService.fetchArtistShopConnections(""),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- SET_ARTIST_SHOP_RATE_SOURCE_MUTATION --------------------------------------------------------

describe("ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION", () => {
	it("sets which side's rate applies for the artist/shop pair", async () => {
		const user = userEvent.setup();
		const variables = { artistId: "artist-1", shopId: "shop-1", rateSource: "artist" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
								variables,
							},
							result: {
								data: {
									setArtistShopRateSource: connection({ rateSource: "artist" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"rateSource":"artist"');
	});
});

// ---- CONNECT_ARTIST_TO_SHOP_MUTATION --------------------------------------------------------------

describe("ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION", () => {
	it("connects an artist to a shop with confirmTransfer omitted (undefined)", async () => {
		const user = userEvent.setup();
		const variables = { artistId: "artist-1", shopId: "shop-1", confirmTransfer: undefined };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
								variables,
							},
							result: {
								data: {
									connectArtistToShop: {
										__typename: "ArtistShopConnection",
										id: "connection-1",
										artistId: "artist-1",
										shopId: "shop-1",
										status: "active",
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
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":"active"');
	});

	// confirmTransfer: true is only sent on the SECOND call, after the person confirms leaving
	// their current shop (per the file's own comment) - exercised here as its own distinct variable
	// set to prove the mutation is equally usable with the flag actually set.
	it("connects with confirmTransfer: true on a repeat call after the person confirms the transfer", async () => {
		const user = userEvent.setup();
		const variables = { artistId: "artist-1", shopId: "shop-2", confirmTransfer: true };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
								variables,
							},
							result: {
								data: {
									connectArtistToShop: {
										__typename: "ArtistShopConnection",
										id: "connection-2",
										artistId: "artist-1",
										shopId: "shop-2",
										status: "active",
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
		expect(await screen.findByTestId("result")).toHaveTextContent("connection-2");
	});
});

// ---- DISCONNECT_ARTIST_FROM_SHOP_MUTATION ----------------------------------------------------------

describe("ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION", () => {
	it("disconnects an artist from a shop", async () => {
		const user = userEvent.setup();
		const variables = { artistId: "artist-1", shopId: "shop-1" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION,
								variables,
							},
							result: {
								data: {
									disconnectArtistFromShop: connection({ status: "disconnected" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":"disconnected"');
	});
});
