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

	return {
		fetchShop: _fetchShop,
		fetchShops: _fetchShops,
        updateShop: _updateShop,
        useSquareAuthorizationUrl: _useSquareAuthorizationUrl,
        DISCONNECT_SHOP_SQUARE: _DISCONNECT_SHOP_SQUARE
	};
})();

export default ShopService