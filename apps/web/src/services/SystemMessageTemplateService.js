import { gql, useQuery } from "@apollo/client";

/**
 * Feature 2 - manageable system-generated text. See server/models/SystemMessageTemplate.js and
 * server/utils/system-message-templates.js for the ownership model, the built-in defaults, and
 * the two identity/security emails (account invite, password reset) deliberately left OUT of
 * this system - they never appear in the key list this service works with.
 */
const SystemMessageTemplateService = (() => {
	const _TEMPLATE_FIELDS = `
		id
		shopId
		artistUserId
		key
		emailSubjectTemplate
		emailBodyTemplate
		extraNoteTemplate
		setByUserId
		createdAt
		updatedAt
	`;

	const _FETCH_SYSTEM_MESSAGE_TEMPLATES = gql`
		query GetSystemMessageTemplates($shopId: ID, $artistUserId: ID) {
			getSystemMessageTemplates(shopId: $shopId, artistUserId: $artistUserId) {
				${_TEMPLATE_FIELDS}
			}
		}
	`;
	const _getSystemMessageTemplates = (scope, options = {}) => {
		return useQuery(_FETCH_SYSTEM_MESSAGE_TEMPLATES, {
			variables: { ...scope },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _UPDATE_SYSTEM_MESSAGE_TEMPLATE = gql`
		mutation UpdateSystemMessageTemplate($input: UpdateSystemMessageTemplateInput!) {
			updateSystemMessageTemplate(input: $input) {
				${_TEMPLATE_FIELDS}
			}
		}
	`;

	const _RESET_SYSTEM_MESSAGE_TEMPLATE = gql`
		mutation ResetSystemMessageTemplate($shopId: ID, $key: String!) {
			resetSystemMessageTemplate(shopId: $shopId, key: $key)
		}
	`;

	return {
		getSystemMessageTemplates: _getSystemMessageTemplates,
		FETCH_SYSTEM_MESSAGE_TEMPLATES: _FETCH_SYSTEM_MESSAGE_TEMPLATES,
		UPDATE_SYSTEM_MESSAGE_TEMPLATE: _UPDATE_SYSTEM_MESSAGE_TEMPLATE,
		RESET_SYSTEM_MESSAGE_TEMPLATE: _RESET_SYSTEM_MESSAGE_TEMPLATE,
	};
})();

export default SystemMessageTemplateService;
