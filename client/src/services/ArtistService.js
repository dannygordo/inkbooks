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

	const _fetchArtistsByShop = (shopId) => {
		return useQuery(_FETCH_ARTISTS_BY_SHOP, {
			variables: {
				shopId,
			},
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

	return {
		fetchArtist: _fetchArtist,
		fetchArtists: _fetchArtists,
        updateArtist: _updateArtist,
		FETCH_ARTISTS_BY_SHOP: _FETCH_ARTISTS_BY_SHOP,
		fetchArtistsByShop: _fetchArtistsByShop
	};
})();
