import { gql, useQuery, useMutation } from "@apollo/client";

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
	const _fetchClients = (includeArchived = false) => {
		const FETCH_CLIENTS_QUERY = gql`
			query GetClients($includeArchived: Boolean) {
				getClients(includeArchived: $includeArchived) {
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
			}
		`;
		return useQuery(FETCH_CLIENTS_QUERY, { variables: { includeArchived } });
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
	const _FETCH_CLIENT_DASHBOARD = gql`
		query GetClientDashboard($clientId: ID!) {
			getClient(clientId: $clientId) {
				id
				firstName
				lastName
				email
				phone
				avatar
				userId
				projects {
					id
					title
					status
					createdAt
				}
				appointments {
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

	const _fetchClientDashboard = (clientId) => {
		return useQuery(_FETCH_CLIENT_DASHBOARD, {
			variables: { clientId },
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
		ARCHIVE_CLIENT_MUTATION: _ARCHIVE_CLIENT_MUTATION,
		UNARCHIVE_CLIENT_MUTATION: _UNARCHIVE_CLIENT_MUTATION,
	};
})();

export default ClientService