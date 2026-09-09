import { gql, useQuery } from "@apollo/client";

/**
 * Gift cards - see DECISIONS.md M6 for the full design and M6's own follow-up entry on real
 * Square payment collection at sale time (createArtistGiftCard/createShopGiftCard now take a
 * required paymentMethod, and a 'square' sale is only ever recorded as saleStatus: 'pending' here
 * - see components/IBSquarePayments/IBGiftCardPaymentForm.jsx and
 * routes/squarePayments.js's process-gift-card-payment for the half that actually charges it and
 * flips it to 'complete').
 *
 * A local service file with its own gql tags, NOT packages/api - matching every other web-only
 * service in this app (DepositService.js, FormService.js, PasswordService.js) rather than the
 * generated-hooks package apps/mobile consumes. See DECISIONS.md's mobile-parity entries for why
 * packages/api exists at all - it was built for mobile's typed Apollo hooks, not to replace web's
 * own hand-written services.
 */
const GiftCardService = (() => {
	const _GIFT_CARD_FIELDS = `
		id
		code
		issuerType
		issuerArtistId
		shopId
		faceValueCents
		balanceCents
		feeOffsetCents
		soldAt
		soldByUserId
		paymentMethod
		saleStatus
		squarePaymentId
		shopCutStatus
		shopCutCents
		shopCutPercentApplied
		shopCutPaymentMethod
		shopCutSquareInvoiceId
	`;

	const _FETCH_MY_GIFT_CARDS = gql`
		query GetMyGiftCards {
			getMyGiftCards {
				${_GIFT_CARD_FIELDS}
			}
		}
	`;
	const _getMyGiftCards = (options = {}) => {
		return useQuery(_FETCH_MY_GIFT_CARDS, {
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _FETCH_GIFT_CARDS_BY_SHOP = gql`
		query GetGiftCardsByShop($shopId: ID!) {
			getGiftCardsByShop(shopId: $shopId) {
				${_GIFT_CARD_FIELDS}
			}
		}
	`;
	const _getGiftCardsByShop = (shopId, options = {}) => {
		return useQuery(_FETCH_GIFT_CARDS_BY_SHOP, {
			variables: { shopId },
			skip: !shopId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _FETCH_MY_LIABILITY_REPORT = gql`
		query GetMyGiftCardLiabilityReport {
			getMyGiftCardLiabilityReport {
				outstandingBalanceCents
				cardCount
				oldestIssuedAt
			}
		}
	`;
	const _getMyGiftCardLiabilityReport = (options = {}) => {
		return useQuery(_FETCH_MY_LIABILITY_REPORT, {
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _FETCH_SHOP_LIABILITY_REPORT = gql`
		query GetGiftCardLiabilityReport($shopId: ID!) {
			getGiftCardLiabilityReport(shopId: $shopId) {
				outstandingBalanceCents
				cardCount
				oldestIssuedAt
			}
		}
	`;
	const _getGiftCardLiabilityReport = (shopId, options = {}) => {
		return useQuery(_FETCH_SHOP_LIABILITY_REPORT, {
			variables: { shopId },
			skip: !shopId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	// paymentMethod is required (cash or square); a 'square' sale MUST also pass pending: true -
	// see resolvers/giftCards.js's own inline check. Refetches the relevant list query rather than
	// writing this into the cache by hand - a brand new card has no existing cache entry for
	// Apollo to merge into the way an update mutation would.
	const CREATE_ARTIST_GIFT_CARD = gql`
		mutation CreateArtistGiftCard($input: CreateArtistGiftCardInput!) {
			createArtistGiftCard(input: $input) {
				${_GIFT_CARD_FIELDS}
			}
		}
	`;

	const CREATE_SHOP_GIFT_CARD = gql`
		mutation CreateShopGiftCard($input: CreateShopGiftCardInput!) {
			createShopGiftCard(input: $input) {
				${_GIFT_CARD_FIELDS}
			}
		}
	`;

	const REDEEM_GIFT_CARD = gql`
		mutation RedeemGiftCard($appointmentId: ID!, $code: String!, $amountCents: Int!) {
			redeemGiftCard(appointmentId: $appointmentId, code: $code, amountCents: $amountCents) {
				giftCard {
					id
					balanceCents
				}
				appointment {
					id
					subtotalCents
					totalCents
					shopCutCents
					shopCutPercentApplied
					giftCardCreditCents
					artistIssuedGiftCardCreditCents
				}
				redemption {
					id
					amountCents
					shopPayoutCents
				}
			}
		}
	`;

	const CREATE_GIFT_CARD_SHOP_CUT_INVOICE = gql`
		mutation CreateGiftCardShopCutInvoice($giftCardId: ID!, $paymentMethod: String) {
			createGiftCardShopCutInvoice(giftCardId: $giftCardId, paymentMethod: $paymentMethod) {
				giftCard {
					${_GIFT_CARD_FIELDS}
				}
				invoiceUrl
			}
		}
	`;

	const MARK_GIFT_CARD_SHOP_CUT_PAID_MANUALLY = gql`
		mutation MarkGiftCardShopCutPaidManually($giftCardId: ID!) {
			markGiftCardShopCutPaidManually(giftCardId: $giftCardId) {
				${_GIFT_CARD_FIELDS}
			}
		}
	`;

	const CONFIRM_GIFT_CARD_SHOP_CUT_PAID = gql`
		mutation ConfirmGiftCardShopCutPaid($giftCardId: ID!) {
			confirmGiftCardShopCutPaid(giftCardId: $giftCardId) {
				${_GIFT_CARD_FIELDS}
			}
		}
	`;

	return {
		getMyGiftCards: _getMyGiftCards,
		getGiftCardsByShop: _getGiftCardsByShop,
		getMyGiftCardLiabilityReport: _getMyGiftCardLiabilityReport,
		getGiftCardLiabilityReport: _getGiftCardLiabilityReport,
		CREATE_ARTIST_GIFT_CARD,
		CREATE_SHOP_GIFT_CARD,
		REDEEM_GIFT_CARD,
		CREATE_GIFT_CARD_SHOP_CUT_INVOICE,
		MARK_GIFT_CARD_SHOP_CUT_PAID_MANUALLY,
		CONFIRM_GIFT_CARD_SHOP_CUT_PAID,
	};
})();

export default GiftCardService;
