import { gql, useQuery, useMutation, useLazyQuery } from "@apollo/client";

const ClientService = (() => {
    const _fetchClient = (clientId) => {
		const FETCH_CLIENT_QUERY = gql`
			query ($clientId: ID!) {
				getClient(clientId: $clientId) {
					id
					firstName
					lastName
					email
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					userId
					# status drives the archived badge and which action ArchiveControl offers -
					# without it the control always reads "not archived".
					status
					user{
						avatar
					}
				}
			}
		`;
		return useQuery(FETCH_CLIENT_QUERY, {
			variables: {
				clientId,
			},
		});
	};

	// See ArtistService's matching comment on includeArchived.
	const _fetchClients = (includeArchived = false, page) => {
		const FETCH_CLIENTS_QUERY = gql`
			query GetClients($includeArchived: Boolean, $page: PageInput) {
				getClients(includeArchived: $includeArchived, page: $page) {
					items {
						id
						firstName
						lastName
						email
						phone
						address
						city
						state
						zip
						instagram
						facebook
						avatar
						userId
						# Needed to mute and label an archived row when the list is showing them.
						status
					}
					pageInfo { totalCount hasMore limit offset }
				}
			}
		`;
		return useQuery(FETCH_CLIENTS_QUERY, { variables: { includeArchived, page } });
	};

	const _updateClient = (client) => {
		const UPDATE_CLIENT_MUTATION = gql`
			mutation ($client: ClientInput) {
				updateClient(client: $client) {
					id
					firstName
					lastName
					email
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					userId
				}
			}
		`;
        return UPDATE_CLIENT_MUTATION;
	};

	// Everything the client dashboard needs in one round trip - see
	// components/clientDashboard/ClientDashboard.jsx. Kept separate from _fetchClient rather than
	// bolted onto it: that query feeds the plain client-detail header and the edit form, and
	// making every one of those callers pay for the full project/appointment/notes graph would be
	// a real cost for no benefit.
	//
	// The money fields are integer CENTS (see utils/money.js) - subtotalCents and tipCents are
	// selected separately rather than just totalCents because "total spent" and "total tipped"
	// are different questions and the whole point of storing them apart is being able to answer
	// both.
	//
	// fetchPolicy: 'cache-and-network' for the same reason ArtistPerformancePanel uses it - the
	// mutations that change this data (closing a session, charging via Square, adding a note)
	// have no reason to know this query exists, so a pure cache read would show stale totals
	// after any of them.
	// projects/appointments now take their own PageInput each - see typeDefs.js's own comment on
	// Client.projects/appointments for why (a client's full history used to ship on every
	// dashboard visit). stats is a separate field computed server-side over the client's FULL
	// history regardless of either page - see ClientStats in typeDefs.js - so the stat cards stay
	// correct no matter what page of either list happens to be showing.
	const _FETCH_CLIENT_DASHBOARD = gql`
		query GetClientDashboard($clientId: ID!, $projectsPage: PageInput, $appointmentsPage: PageInput) {
			getClient(clientId: $clientId) {
				id
				firstName
				lastName
				email
				phone
				avatar
				userId
				stats {
					totalSpentCents
					totalTipsCents
					averageTipCents
					tippedSessionCount
					completedSessionCount
					projectCount
					upcomingAppointmentCount
				}
				projects(page: $projectsPage) {
					items {
						id
						title
						status
						createdAt
					}
					pageInfo { totalCount hasMore limit offset }
				}
				appointments(page: $appointmentsPage) {
					items {
						id
						title
						appointmentDate
						appointmentType
						appointmentStatus
						subtotalCents
						taxCents
						feeCents
						tipCents
						totalCents
						projectId
						project {
							id
							title
						}
					}
					pageInfo { totalCount hasMore limit offset }
				}
				notes {
					id
					author
					note
					createdAt
					updatedAt
				}
				# Live flags only - see models/ClientFlag.js. Shop-side only, same as notes above -
				# ClientDashboard.jsx fetches this for both mounts (self and shop-side) but only
				# renders the panel when !isSelf, matching how notes already works.
				flags {
					id
					typeKey
					note
					systemGenerated
					createdAt
					type {
						key
						label
					}
					createdBy {
						id
						firstName
						lastName
					}
				}
			}
		}
	`;

	const _fetchClientDashboard = (clientId, projectsPage, appointmentsPage) => {
		return useQuery(_FETCH_CLIENT_DASHBOARD, {
			variables: { clientId, projectsPage, appointmentsPage },
			skip: !clientId,
			fetchPolicy: "cache-and-network",
		});
	};

	const _UPDATE_CLIENT_NOTES = gql`
		mutation UpdateClientNotes($notes: [IBNoteInput], $clientId: ID!) {
			updateClientNotes(notes: $notes, clientId: $clientId) {
				id
				notes {
					id
					author
					note
					createdAt
					updatedAt
				}
			}
		}
	`;

	// "Do we already have this person?", by email, for the booking wizard.
	//
	// The wizard used to answer this by scanning the client list it had already fetched. That was
	// fine while the list was everything; once getClients paged it could only match the first page,
	// and a MISS is not harmless - the wizard asks for a name, createClientAccount finds the
	// existing record by email anyway, and the typed name overwrites the real one.
	//
	// Lazy, not eager: this fires when an email has actually been typed, not on mount.
	const _FIND_CLIENT_BY_EMAIL = gql`
		query FindClientByEmail($email: String!) {
			findClientByEmail(email: $email) {
				id
				firstName
				lastName
				email
				phone
			}
		}
	`;

	const _useLazyFindClientByEmail = () => useLazyQuery(_FIND_CLIENT_BY_EMAIL);

	// The manual-flag picker's options - see typeDefs.js's getClientFlagTypes. shopId is optional
	// (platform-wide types only when omitted); Client.jsx doesn't currently know the viewer's own
	// shop, so this is called without one for now - a shop wanting its own custom types is a real
	// but separate follow-up, not something this first pass needs to solve.
	const _GET_CLIENT_FLAG_TYPES = gql`
		query GetClientFlagTypes($shopId: ID) {
			getClientFlagTypes(shopId: $shopId) {
				key
				label
				systemGenerated
			}
		}
	`;
	const _getClientFlagTypes = (shopId, options = {}) => {
		return useQuery(_GET_CLIENT_FLAG_TYPES, { variables: { shopId }, ...options });
	};

	// Hand-raises a flag - see typeDefs.js's raiseClientFlag and utils/client-flags.js. Returns the
	// new row plus its type/createdBy so ClientDashboard.jsx can prepend it to the list it already
	// has without a refetch, the same pattern SessionDetail.jsx's recordAdjustment follows.
	const _RAISE_CLIENT_FLAG = gql`
		mutation RaiseClientFlag($input: RaiseClientFlagInput!) {
			raiseClientFlag(input: $input) {
				id
				typeKey
				note
				systemGenerated
				createdAt
				type {
					key
					label
				}
				createdBy {
					id
					firstName
					lastName
				}
			}
		}
	`;

	const _ARCHIVE_CLIENT_MUTATION = gql`
		mutation ArchiveClient($clientId: ID!) {
			archiveClient(clientId: $clientId) { id status }
		}
	`;
	const _UNARCHIVE_CLIENT_MUTATION = gql`
		mutation UnarchiveClient($clientId: ID!) {
			unarchiveClient(clientId: $clientId) { id status }
		}
	`;

	return {
		fetchClient: _fetchClient,
		fetchClients: _fetchClients,
        updateClient: _updateClient,
		fetchClientDashboard: _fetchClientDashboard,
		FETCH_CLIENT_DASHBOARD: _FETCH_CLIENT_DASHBOARD,
		UPDATE_CLIENT_NOTES: _UPDATE_CLIENT_NOTES,
		useLazyFindClientByEmail: _useLazyFindClientByEmail,
		ARCHIVE_CLIENT_MUTATION: _ARCHIVE_CLIENT_MUTATION,
		UNARCHIVE_CLIENT_MUTATION: _UNARCHIVE_CLIENT_MUTATION,
		getClientFlagTypes: _getClientFlagTypes,
		RAISE_CLIENT_FLAG: _RAISE_CLIENT_FLAG,
	};
})();

export default ClientService