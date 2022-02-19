import { gql, useQuery, useMutation } from "@apollo/client";

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

	return {
		fetchShop: _fetchShop,
		fetchShops: _fetchShops,
        updateShop: _updateShop
	};
})();

export default ShopService