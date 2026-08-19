import { gql, useQuery, useLazyQuery, useMutation } from "@apollo/client";
export const ArtistService = (() => {

	// skip defaults to !artistId (not just an explicit opt-in) - a null/undefined artistId means
	// "no artist to look up yet" for every current caller (Artist.jsx passes a route param that's
	// always present; RatesPanel/BookingLinkPanel/FormsPanel pass user.userInfo?.id, which is only
	// ever null for a non-artist user rendering the same shared settings component). Without this,
	// FormsPanel.jsx (task #163) - rendered for shop_admins who aren't artists, not just artists -
	// would fire this query with a null $artistId (ID!) on every load.
	const _fetchArtist = (artistId, options = {}) => {
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
					bookingSlug
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
			skip: !artistId,
			...options,
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

	// includeArchived: archived artists are hidden by default but have to stay reachable, or
	// there'd be no way to find someone to restore them. See server/utils/archiving.js.
	const _fetchArtists = (includeArchived = false, page) => {
		const FETCH_ARTISTS_QUERY = gql`
			query GetArtists($includeArchived: Boolean, $page: PageInput) {
				getArtists(includeArchived: $includeArchived, page: $page) {
					items {
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
					pageInfo { totalCount hasMore limit offset }
				}
			}
		`;
		return useQuery(FETCH_ARTISTS_QUERY, { variables: { includeArchived, page } });
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

	// Archiving replaced deleteArtist, which used to destroy the row and leave their projects,
	// appointments and User account pointing at nothing - see server/graphql/typeDefs.js.
	const _ARCHIVE_ARTIST_MUTATION = gql`
		mutation ArchiveArtist($artistId: ID!) {
			archiveArtist(artistId: $artistId) { id status }
		}
	`;
	const _UNARCHIVE_ARTIST_MUTATION = gql`
		mutation UnarchiveArtist($artistId: ID!) {
			unarchiveArtist(artistId: $artistId) { id status }
		}
	`;

	// Live "is this booking link free" check for the slug field. Lazy, not a useQuery: it fires on
	// a debounce as the artist types, not on render. See server/graphql/resolvers/artists.js -
	// public, and rate-limited there so this can't be walked to enumerate every artist's handle.
	const _CHECK_BOOKING_SLUG = gql`
		query CheckBookingSlugAvailable($slug: String!) {
			checkBookingSlugAvailable(slug: $slug) {
				slug
				available
				reason
			}
		}
	`;
	const _useCheckBookingSlug = () =>
		useLazyQuery(_CHECK_BOOKING_SLUG, {
			// Always ask. A cached "taken" from thirty seconds ago is a worse answer than a fresh
			// one when the artist is actively trying to find a link that works.
			fetchPolicy: "network-only",
		});

	const _UPDATE_MY_BOOKING_SLUG_MUTATION = gql`
		mutation UpdateMyBookingSlug($slug: String!) {
			updateMyBookingSlug(slug: $slug) {
				id
				bookingSlug
			}
		}
	`;

	return {
		UPDATE_MY_BOOKING_SLUG_MUTATION: _UPDATE_MY_BOOKING_SLUG_MUTATION,
		useCheckBookingSlug: _useCheckBookingSlug,
		CHECK_BOOKING_SLUG: _CHECK_BOOKING_SLUG,
		fetchArtist: _fetchArtist,
		fetchArtists: _fetchArtists,
        updateArtist: _updateArtist,
		FETCH_ARTISTS_BY_SHOP: _FETCH_ARTISTS_BY_SHOP,
		fetchArtistsByShop: _fetchArtistsByShop,
		UPDATE_ARTIST_RATE_SETTINGS_MUTATION: _UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
		ARCHIVE_ARTIST_MUTATION: _ARCHIVE_ARTIST_MUTATION,
		UNARCHIVE_ARTIST_MUTATION: _UNARCHIVE_ARTIST_MUTATION,
	};
})();
