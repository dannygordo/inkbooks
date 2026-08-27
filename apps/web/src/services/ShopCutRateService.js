import { gql, useMutation, useQuery } from "@apollo/client";

/**
 * The shop cut rate history for one artist at one shop.
 *
 * Read by the artist themselves or by a shop admin there; written by a shop admin only. That
 * asymmetry is enforced server-side (see resolvers/shopCutRates.js) and is deliberate: this is what
 * the artist OWES the shop, so a party setting the number they owe is not a rate. But an artist who
 * cannot see what they are being charged, or from when, has a worse problem than a wrong number.
 */
const SHOP_CUT_RATE_FIELDS = `
	id
	artistId
	shopId
	percent
	compensationModel
	effectiveFrom
	setByUserId
	note
	createdAt
`;

export const GET_SHOP_CUT_RATES = gql`
	query GetShopCutRates($artistId: ID!, $shopId: ID!) {
		getShopCutRates(artistId: $artistId, shopId: $shopId) {
			${SHOP_CUT_RATE_FIELDS}
		}
	}
`;

export const SET_SHOP_CUT_RATE = gql`
	mutation SetShopCutRate(
		$artistId: ID!
		$shopId: ID!
		$percent: Int!
		$compensationModel: String
		$effectiveFrom: DateTime
		$note: String
	) {
		setShopCutRate(
			artistId: $artistId
			shopId: $shopId
			percent: $percent
			compensationModel: $compensationModel
			effectiveFrom: $effectiveFrom
			note: $note
		) {
			${SHOP_CUT_RATE_FIELDS}
		}
	}
`;

export const useShopCutRates = (artistId, shopId) =>
	useQuery(GET_SHOP_CUT_RATES, {
		variables: { artistId, shopId },
		skip: !artistId || !shopId,
		fetchPolicy: "cache-and-network",
	});

export const useSetShopCutRate = () =>
	useMutation(SET_SHOP_CUT_RATE, {
		// By operation name. A new rate changes what the history shows, and the history is the only
		// place the change is visible - there is no derived total on screen to give it away.
		refetchQueries: ["GetShopCutRates"],
	});
