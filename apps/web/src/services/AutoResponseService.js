import { gql, useQuery } from "@apollo/client";

/**
 * Auto-Responses - message templates a shop or artist owns, fired automatically on a lifecycle
 * event (SESSION_COMPLETED today) or sent by hand via a "Send a message" picker. See
 * server/graphql/typeDefs.js's own header on this section for the ownership model: exactly one of
 * `shopId`/`artistUserId` scopes every call, same as ExpenseService.js - but UNLIKE Expenses, a
 * shop-connected artist queries BOTH scopes at once (their own artistUserId set AND their shop's
 * shopId set), never just one or the other. See components/settings/AutoResponsesPanel.jsx for how
 * that plays out on screen.
 */
const AutoResponseService = (() => {
	const _AUTO_RESPONSE_FIELDS = `
		id
		shopId
		artistUserId
		name
		trigger
		enabled
		emailEnabled
		smsEnabled
		emailSubjectTemplate
		emailBodyTemplate
		smsTemplate
		active
		createdAt
		updatedAt
	`;

	const _FETCH_AUTO_RESPONSES = gql`
		query GetAutoResponses($shopId: ID, $artistUserId: ID, $includeInactive: Boolean) {
			getAutoResponses(shopId: $shopId, artistUserId: $artistUserId, includeInactive: $includeInactive) {
				${_AUTO_RESPONSE_FIELDS}
			}
		}
	`;
	const _getAutoResponses = (scope, includeInactive = false, options = {}) => {
		return useQuery(_FETCH_AUTO_RESPONSES, {
			variables: { ...scope, includeInactive },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _CREATE_AUTO_RESPONSE = gql`
		mutation CreateAutoResponse($input: CreateAutoResponseInput!) {
			createAutoResponse(input: $input) {
				${_AUTO_RESPONSE_FIELDS}
			}
		}
	`;
	const _UPDATE_AUTO_RESPONSE = gql`
		mutation UpdateAutoResponse($input: UpdateAutoResponseInput!) {
			updateAutoResponse(input: $input) {
				${_AUTO_RESPONSE_FIELDS}
			}
		}
	`;
	const _ARCHIVE_AUTO_RESPONSE = gql`
		mutation ArchiveAutoResponse($autoResponseId: ID!) {
			archiveAutoResponse(autoResponseId: $autoResponseId) {
				${_AUTO_RESPONSE_FIELDS}
			}
		}
	`;

	// Not wrapped as a hook - used from both the Settings panel and SendAutoResponseButton.jsx
	// (client/session pages), each with its own alert/loading handling around it, same reasoning
	// as FormService.js's SUBMIT_FORM_RESPONSE being exported raw.
	const _SEND_AUTO_RESPONSE_NOW = gql`
		mutation SendAutoResponseNow($autoResponseId: ID!, $clientId: ID!, $appointmentId: ID) {
			sendAutoResponseNow(autoResponseId: $autoResponseId, clientId: $clientId, appointmentId: $appointmentId)
		}
	`;

	return {
		getAutoResponses: _getAutoResponses,
		FETCH_AUTO_RESPONSES: _FETCH_AUTO_RESPONSES,
		CREATE_AUTO_RESPONSE: _CREATE_AUTO_RESPONSE,
		UPDATE_AUTO_RESPONSE: _UPDATE_AUTO_RESPONSE,
		ARCHIVE_AUTO_RESPONSE: _ARCHIVE_AUTO_RESPONSE,
		SEND_AUTO_RESPONSE_NOW: _SEND_AUTO_RESPONSE_NOW,
	};
})();

export default AutoResponseService;
