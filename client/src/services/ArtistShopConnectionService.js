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

	return {
		fetchArtistShopConnections: _fetchArtistShopConnections,
		SET_ARTIST_SHOP_RATE_SOURCE_MUTATION: _SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
	};
})();

export default ArtistShopConnectionService;
