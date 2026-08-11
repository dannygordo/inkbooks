import { gql, useQuery, useMutation, useLazyQuery } from "@apollo/client";

const ShopService = (() => {
    const _fetchShop = (shopId) => {
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
                    squareConnected
                    squareLocationId
                    squareConnectedAt
				}
			}
		`;
		return useQuery(FETCH_SHOP_QUERY, {
			variables: {
				shopId,
			},
		});
	};

	// Lazy variant of the same query above - used by Settings.jsx right after a successful
	// connectArtistToShop, since that mutation only returns the raw ArtistShopConnection record
	// (id/artistId/shopId/status/rateSource - see ArtistShopConnectionService.js), not the shop's
	// own name/website. Triggered manually (not on mount) so it only ever runs the instant an
	// artist actually connects to a new shop.
	const _useLazyShop = () => {
		const FETCH_SHOP_QUERY = gql`
			query ($shopId: ID!) {
				getShop(shopId: $shopId) {
					id
					name
					website
				}
			}
		`;
		return useLazyQuery(FETCH_SHOP_QUERY);
	};

	const _fetchShops = () => {
		const FETCH_SHOPS_QUERY = gql`
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
		return useQuery(FETCH_SHOPS_QUERY);
	};

	const _updateShop = (shop) => {
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
        return UPDATE_SHOP_MUTATION;
	};

	// --- Square connection (shop-cut ledger) ---
	// See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. Lazy query, not eager - only fetched
	// when the shop actually clicks "Connect with Square", not on every page load.
	const _useSquareAuthorizationUrl = () => {
		const GET_SQUARE_AUTHORIZATION_URL = gql`
			query GetSquareAuthorizationUrl($shopId: ID!) {
				getSquareAuthorizationUrl(shopId: $shopId)
			}
		`;
		return useLazyQuery(GET_SQUARE_AUTHORIZATION_URL);
	};

	const _DISCONNECT_SHOP_SQUARE = gql`
		mutation DisconnectShopSquare($shopId: ID!) {
			disconnectShopSquare(shopId: $shopId) {
				id
				squareConnected
				squareLocationId
				squareConnectedAt
			}
		}
	`;

	// --- The artist's own Square connection (DECISIONS.md M9) ---
	// The shop queries above are for a shop admin looking at a shop. These are for an artist
	// looking at themselves, and they answer a different question: not "is this shop connected"
	// but "where do MY sessions charge". An artist at a shop gets source 'shop' back, which is why
	// the panel can tell them the truth instead of offering a connect button that would build an
	// account nothing routes to.
	const _MY_SQUARE_CONNECTION = gql`
		query GetMySquareConnection {
			getMySquareConnection {
				source
				connected
				locationId
				connectedAt
				ownerName
			}
		}
	`;

	// Eager, unlike the shop authorization url below - the settings panel needs this to decide
	// what to render at all, not just what to do when a button is pressed.
	const _fetchMySquareConnection = () => useQuery(_MY_SQUARE_CONNECTION);

	const _useMySquareAuthorizationUrl = () => {
		const GET_MY_SQUARE_AUTHORIZATION_URL = gql`
			query GetMySquareAuthorizationUrl {
				getMySquareAuthorizationUrl
			}
		`;
		return useLazyQuery(GET_MY_SQUARE_AUTHORIZATION_URL);
	};

	const _DISCONNECT_MY_SQUARE = gql`
		mutation DisconnectMySquare {
			disconnectMySquare {
				source
				connected
				locationId
				connectedAt
				ownerName
			}
		}
	`;

	return {
		fetchShop: _fetchShop,
		useLazyShop: _useLazyShop,
		fetchShops: _fetchShops,
        updateShop: _updateShop,
        useSquareAuthorizationUrl: _useSquareAuthorizationUrl,
        DISCONNECT_SHOP_SQUARE: _DISCONNECT_SHOP_SQUARE,
        fetchMySquareConnection: _fetchMySquareConnection,
        MY_SQUARE_CONNECTION: _MY_SQUARE_CONNECTION,
        useMySquareAuthorizationUrl: _useMySquareAuthorizationUrl,
        DISCONNECT_MY_SQUARE: _DISCONNECT_MY_SQUARE
	};
})();

export default ShopService