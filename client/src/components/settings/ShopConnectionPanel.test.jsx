// ShopConnectionPanel.jsx tests. An artist's own shop affiliation - connect, disconnect, or move
// to a different shop. No react-router usage in this component at all (unlike ShopPanel's link
// back to the shop page), so no MemoryRouter is needed here.
//
// CONNECT_ARTIST_TO_SHOP_MUTATION and DISCONNECT_ARTIST_FROM_SHOP_MUTATION are exported directly
// by ArtistShopConnectionService, so the real documents are imported and used as-is. ShopService's
// useLazyShop, by contrast, builds its query INSIDE the hook and never exports it - reconstructed
// here verbatim from ShopService.js's own _useLazyShop (a narrower id/name/website selection than
// its sibling fetchShop query), same approach FormsPanel.test.jsx takes for ArtistService's
// unexported fetchArtist query. MockedProvider matches by printed shape, not identity, so this
// still fails loudly if ShopService.js's real query ever drifts from the copy below.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import { GraphQLError } from "graphql";
import ShopConnectionPanel from "./ShopConnectionPanel";
import { AuthContext } from "../../context/auth";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";

const LAZY_SHOP_QUERY = gql`
	query ($shopId: ID!) {
		getShop(shopId: $shopId) {
			id
			name
			website
		}
	}
`;

const INDEPENDENT_ARTIST = { id: "artist-1", userInfo: { id: "artist-1" } };

const SHOP_ARTIST = {
	id: "artist-2",
	userInfo: {
		id: "artist-2",
		shop: { id: "shop-1", name: "Iron Anchor Tattoo", website: "https://iron-anchor.example" },
	},
};

function connectMock(shopId, extra = {}) {
	return {
		request: {
			query: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
			variables: { artistId: "artist-1", shopId, confirmTransfer: false },
		},
		...extra,
	};
}

function lazyShopMock(shopId, shop) {
	return {
		request: { query: LAZY_SHOP_QUERY, variables: { shopId } },
		result: { data: { getShop: { __typename: "Shop", id: shopId, ...shop } } },
	};
}

const transferError = () =>
	new GraphQLError("Confirm the shop transfer.", {
		extensions: {
			transfer: {
				requiresConfirmation: true,
				newShop: { name: "Copper Wolf Tattoo" },
				currentShops: [{ name: "Old Anchor Tattoo" }],
			},
		},
	});

function renderPanel({ user, mocks = [], setAlert = vi.fn(), updateCurrentUser = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert, updateCurrentUser }}>
				<ShopConnectionPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, updateCurrentUser };
}

describe("an artist with no shop", () => {
	it("shows the connect form and no disconnect controls", () => {
		renderPanel({ user: INDEPENDENT_ARTIST });

		expect(screen.getByText(/set up as an independent artist/)).toBeInTheDocument();
		expect(screen.getByLabelText("Shop ID")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connect to Shop" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Disconnect/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Move to a Different Shop" })).not.toBeInTheDocument();
	});

	it("requires a shop ID before submitting - no mutation is ever attempted", async () => {
		const user = userEvent.setup();
		// Zero mocks registered: if the mutation fired anyway, MockedProvider would surface an
		// unmatched-request error instead of this validation message.
		renderPanel({ user: INDEPENDENT_ARTIST, mocks: [] });

		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));

		expect(await screen.findByText("Enter the Shop ID your shop gave you.")).toBeInTheDocument();
	});

	it("trims the typed shop ID before sending it", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				connectMock("shop-9", {
					result: {
						data: {
							connectArtistToShop: {
								__typename: "ArtistShopConnection",
								id: "conn-1",
								artistId: "artist-1",
								shopId: "shop-9",
								status: "active",
							},
						},
					},
				}),
				lazyShopMock("shop-9", { name: "Copper Wolf Tattoo", website: "https://copperwolf.example" }),
			],
		});

		// connectMock only matches variables.shopId === "shop-9" (no surrounding whitespace) -
		// reaching the success alert (rather than an Apollo "no matching mock" error) IS the
		// assertion that the padded value was trimmed before it hit the wire.
		await user.type(screen.getByLabelText("Shop ID"), "  shop-9  ");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Connected to shop." }),
			),
		);
	});

	it("connects, fetches the shop's name/website, and updates the cached user on success", async () => {
		const user = userEvent.setup();
		const { setAlert, updateCurrentUser } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				connectMock("shop-9", {
					result: {
						data: {
							connectArtistToShop: {
								__typename: "ArtistShopConnection",
								id: "conn-1",
								artistId: "artist-1",
								shopId: "shop-9",
								status: "active",
							},
						},
					},
				}),
				lazyShopMock("shop-9", { name: "Copper Wolf Tattoo", website: "https://copperwolf.example" }),
			],
		});

		await user.type(screen.getByLabelText("Shop ID"), "shop-9");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));

		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({
					userInfo: expect.objectContaining({
						shop: { id: "shop-9", name: "Copper Wolf Tattoo", website: "https://copperwolf.example" },
					}),
				}),
			),
		);
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: true, severity: "success", message: "Connected to shop." }),
		);
	});

	// fetchShopName's own response has no name/website (per ArtistShopConnectionService.js's
	// comment) - falling back to just { id: targetShopId } when the follow-up lookup comes back
	// empty is the documented degrade, not a crash.
	it("falls back to a bare shop id if the follow-up shop lookup returns nothing", async () => {
		const user = userEvent.setup();
		const { updateCurrentUser } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				connectMock("shop-9", {
					result: {
						data: {
							connectArtistToShop: {
								__typename: "ArtistShopConnection",
								id: "conn-1",
								artistId: "artist-1",
								shopId: "shop-9",
								status: "active",
							},
						},
					},
				}),
				{
					request: { query: LAZY_SHOP_QUERY, variables: { shopId: "shop-9" } },
					result: { data: { getShop: null } },
				},
			],
		});

		await user.type(screen.getByLabelText("Shop ID"), "shop-9");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));

		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({
					userInfo: expect.objectContaining({ shop: { id: "shop-9" } }),
				}),
			),
		);
	});

	it("shows the server's error message when connecting fails for a reason other than a transfer", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				connectMock("bad-id", { result: { errors: [new GraphQLError("No shop exists with that ID.")] } }),
			],
		});

		await user.type(screen.getByLabelText("Shop ID"), "bad-id");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));

		expect(await screen.findByText("No shop exists with that ID.")).toBeInTheDocument();
	});

	it("asks to confirm a transfer, naming both shops, when the server refuses without confirmation", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [connectMock("shop-9", { result: { errors: [transferError()] } })],
		});

		await user.type(screen.getByLabelText("Shop ID"), "shop-9");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));

		expect(
			await screen.findByRole("heading", { name: "Move to Copper Wolf Tattoo?" }),
		).toBeInTheDocument();
		expect(screen.getByText("Old Anchor Tattoo")).toBeInTheDocument();
		expect(screen.getByText(/Your past appointments, projects and earnings stay exactly as they are/)).toBeInTheDocument();
	});

	it("cancelling the transfer confirmation closes it without connecting", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [connectMock("shop-9", { result: { errors: [transferError()] } })],
		});

		await user.type(screen.getByLabelText("Shop ID"), "shop-9");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));
		await screen.findByRole("heading", { name: "Move to Copper Wolf Tattoo?" });

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(
			screen.queryByRole("heading", { name: "Move to Copper Wolf Tattoo?" }),
		).not.toBeInTheDocument();
	});

	it("continuing the transfer confirmation connects with confirmTransfer: true", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				connectMock("shop-9", { result: { errors: [transferError()] } }),
				{
					request: {
						query: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
						variables: { artistId: "artist-1", shopId: "shop-9", confirmTransfer: true },
					},
					result: {
						data: {
							connectArtistToShop: {
								__typename: "ArtistShopConnection",
								id: "conn-2",
								artistId: "artist-1",
								shopId: "shop-9",
								status: "active",
							},
						},
					},
				},
				lazyShopMock("shop-9", { name: "Copper Wolf Tattoo", website: null }),
			],
		});

		await user.type(screen.getByLabelText("Shop ID"), "shop-9");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));
		await screen.findByRole("heading", { name: "Move to Copper Wolf Tattoo?" });
		await user.click(screen.getByRole("button", { name: "Continue" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Connected to shop." }),
			),
		);
		expect(
			screen.queryByRole("heading", { name: "Move to Copper Wolf Tattoo?" }),
		).not.toBeInTheDocument();
	});

	it("clears the shop-action error and resets pendingTransfer if the confirmed retry itself fails", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				connectMock("shop-9", { result: { errors: [transferError()] } }),
				{
					request: {
						query: ArtistShopConnectionService.CONNECT_ARTIST_TO_SHOP_MUTATION,
						variables: { artistId: "artist-1", shopId: "shop-9", confirmTransfer: true },
					},
					result: { errors: [new GraphQLError("That shop no longer exists.")] },
				},
			],
		});

		await user.type(screen.getByLabelText("Shop ID"), "shop-9");
		await user.click(screen.getByRole("button", { name: "Connect to Shop" }));
		await screen.findByRole("heading", { name: "Move to Copper Wolf Tattoo?" });
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(await screen.findByText("That shop no longer exists.")).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Move to Copper Wolf Tattoo?" }),
		).not.toBeInTheDocument();
		expect(setAlert).not.toHaveBeenCalled();
	});
});

describe("an artist connected to a shop", () => {
	it("shows the shop's name, website, and disconnect/move controls - no connect form", () => {
		renderPanel({ user: SHOP_ARTIST });

		expect(screen.getByText("Iron Anchor Tattoo")).toBeInTheDocument();
		expect(screen.getByText("https://iron-anchor.example")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Disconnect from Shop" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Move to a Different Shop" })).toBeInTheDocument();
		expect(screen.queryByLabelText("Shop ID")).not.toBeInTheDocument();
	});

	it("does nothing when the disconnect confirmation is declined", async () => {
		const user = userEvent.setup();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
		const { setAlert } = renderPanel({ user: SHOP_ARTIST, mocks: [] });

		await user.click(screen.getByRole("button", { name: "Disconnect from Shop" }));

		expect(confirmSpy).toHaveBeenCalled();
		// Still connected: no mutation fired, and MockedProvider (zero mocks registered) would
		// have thrown on an unmocked one.
		expect(screen.getByText("Iron Anchor Tattoo")).toBeInTheDocument();
		expect(setAlert).not.toHaveBeenCalled();
		confirmSpy.mockRestore();
	});

	it("disconnects and clears the cached shop on confirmation", async () => {
		const user = userEvent.setup();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const { setAlert, updateCurrentUser } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				{
					request: {
						query: ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION,
						variables: { artistId: "artist-2", shopId: "shop-1" },
					},
					result: {
						data: {
							disconnectArtistFromShop: {
								__typename: "ArtistShopConnection",
								id: "conn-1",
								artistId: "artist-2",
								shopId: "shop-1",
								status: "disconnected",
							},
						},
					},
				},
			],
		});

		await user.click(screen.getByRole("button", { name: "Disconnect from Shop" }));

		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({ userInfo: expect.objectContaining({ shop: null }) }),
			),
		);
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ severity: "success", message: "Disconnected from shop." }),
		);
		confirmSpy.mockRestore();
	});

	it("alerts the server's error message when disconnecting fails", async () => {
		const user = userEvent.setup();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
		const { setAlert } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				{
					request: {
						query: ArtistShopConnectionService.DISCONNECT_ARTIST_FROM_SHOP_MUTATION,
						variables: { artistId: "artist-2", shopId: "shop-1" },
					},
					result: { errors: [new GraphQLError("You are not currently connected to that shop.")] },
				},
			],
		});

		await user.click(screen.getByRole("button", { name: "Disconnect from Shop" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: "error",
					message: "You are not currently connected to that shop.",
				}),
			),
		);
		confirmSpy.mockRestore();
	});

	it("shows the move-shops form, naming the shop that will be left, when Move is clicked", async () => {
		const user = userEvent.setup();
		renderPanel({ user: SHOP_ARTIST });

		await user.click(screen.getByRole("button", { name: "Move to a Different Shop" }));

		expect(
			screen.getByText("Connecting to a different shop ends your connection to Iron Anchor Tattoo."),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Move to This Shop" })).toBeInTheDocument();
		// One form on screen at a time - the button that opened it is gone (per the component's
		// own !showMoveForm guard).
		expect(
			screen.queryByRole("button", { name: "Move to a Different Shop" }),
		).not.toBeInTheDocument();
	});
});
