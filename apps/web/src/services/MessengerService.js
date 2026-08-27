import { gql, useQuery, useLazyQuery, useMutation } from "@apollo/client";

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
					imageUrls
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
					imageUrls
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

	// DELIBERATELY NO `messages` HERE.
	//
	// This used to request the full message list - text, timestamps, and a nested `user` per
	// message - for every conversation the caller belongs to, with fetchPolicy: "network-only" so
	// none of it was ever cached. Opening the messenger therefore pulled every message of every
	// thread on every visit, to render a list that shows a name and a badge. An artist with a
	// year of client history would have paid for all of it to see who had written to them.
	//
	// Nothing about the list needs message bodies. The thread is fetched on click instead, by
	// FETCH_MESSAGES_BY_CONVERSATION_ID below.
	const FETCH_CONVERSATIONS_BY_MEMBER_ID_QUERY = gql`
		query GetConversationsByMemberId($memberId: ID!) {
			getConversationsByMemberId(memberId: $memberId) {
				id
				members
				createdAt
				updatedAt
				# The CALLER's unread count for this thread - what the per-conversation badge in the
				# chat menu shows. Resolved server-side from their own lastReadAt, so it can't
				# disagree with the sidebar total.
				unreadCount
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

	// One thread, fetched when a conversation is opened. Guarded server-side by
	// canAccessConversation - a member, or a shop admin at a member's shop - so this is not a
	// looser door than the list it came from.
	const FETCH_MESSAGES_BY_CONVERSATION_ID_QUERY = gql`
		query GetMessagesByConversationId($conversationId: ID!) {
			getMessagesByConversationId(conversationId: $conversationId) {
				id
				conversationId
				senderId
				message
				imageUrls
				createdAt
				updatedAt
				user {
					firstName
					lastName
					avatar
				}
			}
		}
	`;
	/**
	 * Lazy on purpose: nothing should load until a conversation is actually opened, which is the
	 * whole point of taking `messages` off the list query.
	 */
	const _fetchMessagesByConversationId = () => {
		return useLazyQuery(FETCH_MESSAGES_BY_CONVERSATION_ID_QUERY, {
			// The thread has to reflect messages that arrived since it was last opened. Apollo
			// would otherwise serve the cached copy from the previous visit and show a stale
			// conversation next to an unread badge that says otherwise.
			fetchPolicy: "network-only",
		});
	};

	const _CREATE_MESSAGE_MUTATION = gql`
		mutation CreateMessage(
			$conversationId: ID!
			$senderId: ID!
			$message: String
			$imageUrls: [String!]
		) {
			createMessage(
				conversationId: $conversationId
				senderId: $senderId
				message: $message
				imageUrls: $imageUrls
			) {
				id
				conversationId
				senderId
				message
				imageUrls
				createdAt
				updatedAt
			}
		}
	`;

	// The sidebar badge. Its own query rather than summing the conversation list, because the
	// sidebar is mounted on every page and shouldn't have to fetch every thread and every message
	// in them to render one number. Server-side it's a single aggregation - see
	// utils/conversation-reads.js.
	const _GET_UNREAD_MESSAGE_COUNT = gql`
		query GetUnreadMessageCount {
			getUnreadMessageCount
		}
	`;
	const _useUnreadMessageCount = () =>
		useQuery(_GET_UNREAD_MESSAGE_COUNT, {
			// The count changes because of something someone ELSE did, so a cached answer is stale
			// by nature. Shows the cached number instantly and corrects it from the network.
			fetchPolicy: "cache-and-network",
			// There is nothing in this tab to refetch off - the event that changes this number
			// happens in someone else's browser. The socket updates it immediately while the
			// messenger is open; this is the fallback for every other page, where an artist has
			// the app open on the calendar and a message arrives.
			pollInterval: 60000,
		});

	// The booking-request counterpart to this used to live here and counted unread MESSAGES in
	// booking-request threads. It has moved to BookingRequestService as a count of PENDING REQUESTS
	// instead, which is a different question and the right one for that nav item - see
	// server/utils/booking-inbox.js. It is not a messaging concern at all any more, which is why it
	// is no longer in this file.

	const _MARK_CONVERSATION_READ = gql`
		mutation MarkConversationRead($conversationId: ID!) {
			markConversationRead(conversationId: $conversationId) {
				id
				unreadCount
			}
		}
	`;

	// The reverse of the above - see conversation-reads.js's markConversationUnreadForUser. Same
	// shape deliberately: this is the same field, just clearing it instead of setting it.
	const _MARK_CONVERSATION_UNREAD = gql`
		mutation MarkConversationUnread($conversationId: ID!) {
			markConversationUnread(conversationId: $conversationId) {
				id
				unreadCount
			}
		}
	`;

	return {
		GET_UNREAD_MESSAGE_COUNT: _GET_UNREAD_MESSAGE_COUNT,
		useUnreadMessageCount: _useUnreadMessageCount,
		MARK_CONVERSATION_READ: _MARK_CONVERSATION_READ,
		MARK_CONVERSATION_UNREAD: _MARK_CONVERSATION_UNREAD,
		fetchProjectConversation: _fetchProjectConversation,
		fetchProjectConversationQuery: FETCH_PROJECT_CONVERSATION_QUERY,
		fetchShopConversations: _fetchShopConversations,
		fetchShopConversationsQuery: FETCH_SHOP_CONVERSATIONS_QUERY,
		fetchConversationsByMemberId: _fetchConversationsByMemberId,
		fetchConversationsByMemberIdQuery:
			FETCH_CONVERSATIONS_BY_MEMBER_ID_QUERY,
		fetchMessagesByConversationId: _fetchMessagesByConversationId,
		fetchMessagesByConversationIdQuery:
			FETCH_MESSAGES_BY_CONVERSATION_ID_QUERY,
        CREATE_MESSAGE_MUTATION: _CREATE_MESSAGE_MUTATION
	};
})();

export default MessengerService;
