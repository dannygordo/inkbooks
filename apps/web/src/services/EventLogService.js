import { gql, useQuery } from "@apollo/client";

// The audit trail - see server/models/EventLog.js. Read-only from the client; nothing ever writes
// one of these directly, they're a side effect of the money/appointment/client mutations that
// already exist (see server/utils/event-log.js's call sites).
const EventLogService = (() => {
	const _FETCH_EVENT_LOGS = gql`
		query GetEventLogs($filter: EventLogFilter, $page: PageInput) {
			getEventLogs(filter: $filter, page: $page) {
				items {
					id
					entityType
					entityId
					action
					actorName
					summary
					changes {
						field
						from
						to
					}
					createdAt
				}
				pageInfo {
					totalCount
					hasMore
					limit
					offset
				}
			}
		}
	`;

	// entityType/page are the only filters exposed today - EventLogFilter also takes shopId/
	// actorUserId/from/to, but the resolver already scopes shopId server-side (see
	// resolvers/eventLogs.js) and there's no caller yet needing to filter by actor or date. Add
	// them here when a real screen needs to.
	const _fetchEventLogs = (entityType, page) => {
		return useQuery(_FETCH_EVENT_LOGS, {
			variables: { filter: entityType ? { entityType } : undefined, page },
			fetchPolicy: "cache-and-network",
		});
	};

	return {
		fetchEventLogs: _fetchEventLogs,
	};
})();

export default EventLogService;
