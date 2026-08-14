import { gql, useLazyQuery } from "@apollo/client";

// Global search - see server/utils/search.js. Grouped by type, not one interleaved list - the
// dropdown that renders these (components/search/GlobalSearch.jsx) shows three named sections.
const SearchService = (() => {
	// Selects enough to render both the app bar's compact dropdown AND the fuller /search results
	// page from the same query - a client/project/message row needs the same facts either way,
	// just laid out with more or less room. Field resolvers (Client.avatar, Project.artist/client)
	// - see resolvers/index.js - are the same ones the Clients/Projects list pages already select.
	const _SEARCH = gql`
		query Search($query: String!, $limit: Int) {
			search(query: $query, limit: $limit) {
				clients {
					id
					avatar
					firstName
					lastName
					email
					phone
					city
					state
				}
				projects {
					id
					title
					description
					status
					artist {
						id
						firstName
						lastName
						avatar
					}
					client {
						id
						firstName
						lastName
					}
				}
				messages {
					id
					conversationId
					message
					senderId
					user {
						id
						firstName
						lastName
						avatar
					}
					createdAt
				}
			}
		}
	`;

	return {
		SEARCH: _SEARCH,
		// Lazy, not a plain useQuery - a global search box fires on every keystroke (debounced) and
		// has nothing to search until the person has typed something, which is exactly what a lazy
		// query is for: no request at all until execute() is actually called.
		useSearch: () => useLazyQuery(_SEARCH, { fetchPolicy: "network-only" }),
	};
})();

export default SearchService;
