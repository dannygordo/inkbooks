import { gql, useQuery } from "@apollo/client";

/**
 * Dashboard analytics. Both queries return the same Analytics shape from the same server-side
 * aggregation (see server/utils/analytics.js), so an artist's own figures and the shop's view of
 * that artist can't drift apart.
 *
 * Money fields are nullable and come back null for a caller below Shop Admin - the split is
 * enforced in the resolver, not here. A component checking `revenueCents == null` is reading the
 * server's decision, not making its own.
 */
export const AnalyticsService = (() => {
	// The money fields, shared by both documents. A single fragment-ish string rather than two
	// copies, so adding a figure server-side means editing one place on the client too.
	const _MONEY_FIELDS = `
		revenueCents
		subtotalCents
		taxCents
		feeCents
		tipsCents
		averageTipCents
		tippedCount
		shopCutEarnedCents
		shopCutOutstandingCents
		shopCutAwaitingConfirmationCents
	`;

	const _ACTIVITY_FIELDS = `
		completedSessionCount
		consultCount
		appointmentCount
		upcomingCount
		activeProjectCount
		newProjectCount
		totalClientCount
		newClientCount
		artistCount
	`;

	const _FETCH_SHOP_ANALYTICS = gql`
		query GetShopAnalytics($shopId: ID!, $start: DateTime!, $end: DateTime!) {
			getShopAnalytics(shopId: $shopId, start: $start, end: $end) {
				start
				end
				${_MONEY_FIELDS}
				${_ACTIVITY_FIELDS}
				artists {
					userId
					artistId
					revenueCents
					tipsCents
					shopCutEarnedCents
					shopCutOutstandingCents
					completedSessionCount
					consultCount
					appointmentCount
					user {
						id
						firstName
						lastName
						avatar
						tagColor
					}
				}
			}
		}
	`;

	const _getShopAnalytics = (shopId, range) => {
		return useQuery(_FETCH_SHOP_ANALYTICS, {
			variables: {
				shopId,
				start: range?.start,
				end: range?.end,
			},
			skip: !shopId || !range,
			// Same reasoning as the artist appointment query: closing a session or confirming a
			// shop cut happens through mutations that have no idea this aggregate exists, so a
			// cache-only read would show figures that silently predate the change the user just
			// made. The cached copy still renders instantly, so switching back to a range already
			// viewed doesn't flash a spinner.
			fetchPolicy: "cache-and-network",
		});
	};

	const _FETCH_ARTIST_ANALYTICS = gql`
		query GetArtistAnalytics($userId: ID!, $start: DateTime!, $end: DateTime!) {
			getArtistAnalytics(userId: $userId, start: $start, end: $end) {
				start
				end
				${_MONEY_FIELDS}
				${_ACTIVITY_FIELDS}
			}
		}
	`;

	const _getArtistAnalytics = (userId, range) => {
		return useQuery(_FETCH_ARTIST_ANALYTICS, {
			variables: {
				userId,
				start: range?.start,
				end: range?.end,
			},
			skip: !userId || !range,
			fetchPolicy: "cache-and-network",
		});
	};

	return {
		FETCH_SHOP_ANALYTICS: _FETCH_SHOP_ANALYTICS,
		FETCH_ARTIST_ANALYTICS: _FETCH_ARTIST_ANALYTICS,
		getShopAnalytics: _getShopAnalytics,
		getArtistAnalytics: _getArtistAnalytics,
	};
})();

export default AnalyticsService;
