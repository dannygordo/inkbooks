import { gql, useQuery, useMutation } from "@apollo/client";

const MessengerService = (() => {
	const FETCH_PROJECT_CONVERSATION_QUERY = gql`
		query GetProjectConversation($artistId: ID!, $clientId: ID!) {
			getProjectConversation(artistId: $artistId, clientId: $clientId) {
				id
				members
				messages {
					id
					conversationId
					senderId
					message
					createdAt
					updatedAt
					user {
						firstName
						lastName
						avatar
						userInfo {
							firstName
							lastName
							avatar
						}
					}
				}
				createdAt
				updatedAt
			}
		}
	`;
	/**
	 * Takes the ids of users communicating through a project.  This will almost always be one artist and one client. This function will be used
	 * @param {The artist id tied to a Project's conversation. } artistId
	 * @param {The client id tied to a Project's conversation} clientId
	 * @returns A QueryResult containing conversation data
	 */
	const _fetchProjectConversation = (artistId, clientId) => {
		return useQuery(FETCH_PROJECT_CONVERSATION_QUERY, {
			variables: {
				artistId,
				clientId,
			},
		});
	};

	const FETCH_SHOP_CONVERSATIONS_QUERY = gql`
		query GetConversationsByShopId($shopId: ID!) {
			getConversationsByShopId(shopId: $shopId) {
				id
				members
				messages {
					id
					conversationId
					senderId
					user {
						firstName
						lastName
						avatar
					}
					message
					createdAt
					updatedAt
				}
				membersInfo {
					firstName
					lastName
					avatar
				}
			}
		}
	`;
	/**
	 * Fetches all of the conversations associated with a shop.  Conversations between artists and staff, as well as group conversations will be returned.
	 * @param {The logged in user's associated shopId} shopId
	 * @returns QueryResult containing conversation data
	 */
	const _fetchShopConversations = (shopId) => {
		return useQuery(FETCH_SHOP_CONVERSATIONS_QUERY, {
			variables: {
				shopId,
			},
		});
	};

	const FETCH_CONVERSATIONS_BY_MEMBER_ID_QUERY = gql`
		query GetConversationsByMemberId($memberId: ID!) {
			getConversationsByMemberId(memberId: $memberId) {
				id
				members
				messages {
					id
					senderId
					user {
						firstName
						lastName
						avatar
					}
					message
					createdAt
					updatedAt
					conversationId
				}
				createdAt
				updatedAt
				membersInfo {
					firstName
					lastName
					avatar
					id
				}
			}
		}
	`;
	const _fetchConversationsByMemberId = (memberId) => {
		return useQuery(FETCH_CONVERSATIONS_BY_MEMBER_ID_QUERY, {
			variables: {
				memberId,
			},
            fetchPolicy: "network-only"
		});
	};

	const _CREATE_MESSAGE_MUTATION = gql`
		mutation CreateMessage(
			$conversationId: ID!
			$senderId: ID!
			$message: String!
			$createdAt: DateTime
			$updatedAt: DateTime
		) {
			createMessage(
				conversationId: $conversationId
				senderId: $senderId
				message: $message
				createdAt: $createdAt
				updatedAt: $updatedAt
			) {
				id
				conversationId
				senderId
				message
				createdAt
				updatedAt
			}
		}
	`;

	return {
		fetchProjectConversation: _fetchProjectConversation,
		fetchProjectConversationQuery: FETCH_PROJECT_CONVERSATION_QUERY,
		fetchShopConversations: _fetchShopConversations,
		fetchShopConversationsQuery: FETCH_SHOP_CONVERSATIONS_QUERY,
		fetchConversationsByMemberId: _fetchConversationsByMemberId,
		fetchConversationsByMemberIdQuery:
			FETCH_CONVERSATIONS_BY_MEMBER_ID_QUERY,
        CREATE_MESSAGE_MUTATION: _CREATE_MESSAGE_MUTATION
	};
})();

export default MessengerService;
