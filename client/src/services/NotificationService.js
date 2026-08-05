import { gql, useQuery, useMutation } from "@apollo/client";

export const NotificationService = (() => {
	// Stored events and derived conditions arrive merged and indistinguishable - see
	// server/graphql/resolvers/notifications.js. `key` is the id for a stored one and a
	// subject-derived string for a condition, so it is safe as a React list key either way.
	const _GET_INBOX = gql`
		query GetInbox($includeRead: Boolean) {
			getInbox(includeRead: $includeRead) {
				unreadCount
				items {
					key
					type
					category
					subjectType
					subjectId
					title
					body
					amountCents
					createdAt
					readAt
					doneAt
					isCondition
				}
			}
		}
	`;

	const _useInbox = (includeRead = true) =>
		useQuery(_GET_INBOX, {
			variables: { includeRead },
			// The count changes because of what somebody else did, so a cached answer is stale by
			// nature. Same reasoning as the unread-message badge.
			fetchPolicy: "cache-and-network",
			pollInterval: 60000,
		});

	const _MARK_READ = gql`
		mutation MarkNotificationsRead($notificationIds: [ID!]) {
			markNotificationsRead(notificationIds: $notificationIds)
		}
	`;

	const _MARK_DONE = gql`
		mutation MarkNotificationsDone($notificationIds: [ID!]!) {
			markNotificationsDone(notificationIds: $notificationIds)
		}
	`;

	const _GET_SETTINGS = gql`
		query GetNotificationSettings {
			getNotificationSettings {
				prefs {
					moneyEmail
					scheduleEmail
					rosterEmail
					messageEmail
				}
				moneyMode
				scheduleMode
				rosterMode
				messageMode
				timezone
				digestHour
			}
		}
	`;

	const _UPDATE_SETTINGS = gql`
		mutation UpdateNotificationSettings(
			$prefs: NotificationPrefsInput
			$timezone: String
			$digestHour: Int
		) {
			updateNotificationSettings(prefs: $prefs, timezone: $timezone, digestHour: $digestHour) {
				prefs {
					moneyEmail
					scheduleEmail
					rosterEmail
					messageEmail
				}
				moneyMode
				scheduleMode
				rosterMode
				messageMode
				timezone
				digestHour
			}
		}
	`;

	return {
		GET_INBOX: _GET_INBOX,
		useInbox: _useInbox,
		MARK_READ: _MARK_READ,
		MARK_DONE: _MARK_DONE,
		GET_SETTINGS: _GET_SETTINGS,
		useSettings: () => useQuery(_GET_SETTINGS),
		UPDATE_SETTINGS: _UPDATE_SETTINGS,
		useUpdateSettings: () => useMutation(_UPDATE_SETTINGS),
	};
})();

export default NotificationService;
