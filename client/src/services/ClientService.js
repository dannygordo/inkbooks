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

	const _fetchClients = () => {
		const FETCH_CLIENTS_QUERY = gql`
			{
				getClients {
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
		return useQuery(FETCH_CLIENTS_QUERY);
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

	return {
		fetchClient: _fetchClient,
		fetchClients: _fetchClients,
        updateClient: _updateClient
	};
})();

export default ClientService