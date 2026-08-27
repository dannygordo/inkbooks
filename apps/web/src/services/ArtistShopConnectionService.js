import { gql, useQuery } from "@apollo/client";

// See models/ArtistShopConnection.js and PRODUCTION_ROADMAP.md's "Rates & settings" section.
// This is deliberately narrow - just enough for the Settings page's "which rate applies" picker,
// not the fuller connection-lifecycle UI (invite links, directory, connect requests) that's still
// open per the roadmap.
const ArtistShopConnectionService = (() => {
	const _FETCH_ARTIST_SHOP_CONNECTIONS = gql`
		query GetArtistShopConnections($artistId: ID!) {
			getArtistShopConnections(artistId: $artistId) {
				id
				artistId
				shopId
				status
				rateSource
			}
		}
	`;

	// skip when there's no artistId - mirrors the same defensive pattern used throughout this
	// app for shop-optional data (see AppointmentService/UserService's skip guards).
	const _fetchArtistShopConnections = (artistId) => {
		return useQuery(_FETCH_ARTIST_SHOP_CONNECTIONS, {
			variables: { artistId },
			skip: !artistId,
		});
	};

	const _SET_ARTIST_SHOP_RATE_SOURCE_MUTATION = gql`
		mutation ($artistId: ID!, $shopId: ID!, $rateSource: String!) {
			setArtistShopRateSource(artistId: $artistId, shopId: $shopId, rateSource: $rateSource) {
				id
				artistId
				shopId
				rateSource
			}
		}
	`;

	// Settings.jsx's "Shop" card - previously there was no client UI for either of these at all
	// (see mutations/artistShopConnections.js's own comment: "there's no invite-link/shop-
	// directory request-approve flow yet" - this is that same direct-connect model, just finally
	// wired up on the client). connectArtistToShop only returns the raw connection record (no
	// shop name/website) - Settings.jsx follows up with ShopService.useLazyShop to get those for
	// display and to update the cached user.
	// confirmTransfer: an artist works at one shop at a time, so connecting to a new shop ends the
	// old connection. Without the flag the server refuses and returns the name of the shop being
	// left in extensions.transfer, so Settings.jsx can name it in the confirmation rather than
	// warning vaguely about "your current shop". Sending it unconditionally would defeat the
	// point - it's only set on the second call, after the person has said yes.
	const _CONNECT_ARTIST_TO_SHOP_MUTATION = gql`
		mutation ($artistId: ID!, $shopId: ID!, $confirmTransfer: Boolean) {
			connectArtistToShop(
				artistId: $artistId
				shopId: $shopId
				confirmTransfer: $confirmTransfer
			) {
				id
				artistId
				shopId
				status
			}
		}
	`;

	const _DISCONNECT_ARTIST_FROM_SHOP_MUTATION = gql`
		mutation ($artistId: ID!, $shopId: ID!) {
			disconnectArtistFromShop(artistId: $artistId, shopId: $shopId) {
				id
				artistId
				shopId
				status
			}
		}
	`;

	return {
		fetchArtistShopConnections: _fetchArtistShopConnections,
		SET_ARTIST_SHOP_RATE_SOURCE_MUTATION: _SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
		CONNECT_ARTIST_TO_SHOP_MUTATION: _CONNECT_ARTIST_TO_SHOP_MUTATION,
		DISCONNECT_ARTIST_FROM_SHOP_MUTATION: _DISCONNECT_ARTIST_FROM_SHOP_MUTATION,
	};
})();

export default ArtistShopConnectionService;
