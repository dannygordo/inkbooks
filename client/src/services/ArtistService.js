import { gql, useQuery, useMutation } from "@apollo/client";
export const ArtistService = (() => {

	const _fetchArtist = (artistId) => {
		const FETCH_ARTIST_QUERY = gql`
			query ($artistId: ID!) {
				getArtist(artistId: $artistId) {
					id
					firstName
					lastName
					email
					title
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					startDate
					endDate
					hourlyRate
					flatRate
					billingType
					shopId
					userId
					status
				}
			}
		`;
		return useQuery(FETCH_ARTIST_QUERY, {
			variables: {
				artistId,
			},
		});
	};

	const _FETCH_ARTISTS_BY_SHOP = gql`
		query GetArtistsByShop($shopId: ID!) {
			getArtistsByShop(shopId: $shopId) {
				id
				user {
					firstName
					lastName
					id
					tagColor
				}
			}
		}
	`;

	// skip when there's no shopId - an independent artist (no shop connection at all, see
	// PRODUCTION_ROADMAP.md's artist-centric tenancy section) has no shop artist roster to fetch.
	// Without this, ibCalendar/Sidebar.jsx crashed outright reading user.userInfo.shop.id before
	// this even ran (see that file's own fix) - found via manual testing.
	const _fetchArtistsByShop = (shopId) => {
		return useQuery(_FETCH_ARTISTS_BY_SHOP, {
			variables: {
				shopId,
			},
			skip: !shopId,
		});
	}

	const _fetchArtists = () => {
		const FETCH_ARTISTS_QUERY = gql`
			{
				getArtists {
					id
					firstName
					lastName
					email
					title
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					startDate
					hourlyRate
					shopId
					userId
					status
					user{
						avatar
					}
				}
			}
		`;
		return useQuery(FETCH_ARTISTS_QUERY);
	};

	const _updateArtist = (artist) => {
		const UPDATE_ARTIST_MUTATION = gql`
			mutation ($artist: ArtistInput) {
				updateArtist(artist: $artist) {
					id
					firstName
					lastName
					email
					title
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					startDate
					hourlyRate
					shopId
					userId
					status
				}
			}
		`;
        return UPDATE_ARTIST_MUTATION;
	};

	// Self-service rate settings - see server/graphql/mutations/artists.js's comment on why this
	// is a separate mutation from updateArtist above (which is SHOP_ADMIN-or-better only, so a
	// plain artist could never call it on their own record). Used by the new Settings page.
	const _UPDATE_ARTIST_RATE_SETTINGS_MUTATION = gql`
		mutation ($hourlyRate: Int, $flatRate: Int, $billingType: String!) {
			updateArtistRateSettings(hourlyRate: $hourlyRate, flatRate: $flatRate, billingType: $billingType) {
				id
				hourlyRate
				flatRate
				billingType
			}
		}
	`;

	return {
		fetchArtist: _fetchArtist,
		fetchArtists: _fetchArtists,
        updateArtist: _updateArtist,
		FETCH_ARTISTS_BY_SHOP: _FETCH_ARTISTS_BY_SHOP,
		fetchArtistsByShop: _fetchArtistsByShop,
		UPDATE_ARTIST_RATE_SETTINGS_MUTATION: _UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
	};
})();
