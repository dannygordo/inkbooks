import { gql, useQuery } from "@apollo/client";

/**
 * Feature 3 - unanswered-message nudges. See server/models/ResponseTimeSettings.js and
 * server/utils/response-time.js for the ownership model and the shop-ceiling clamp this settings
 * screen configures. Same shopId/artistUserId scoping shape as AutoResponseService.js, but a
 * SINGLETON per owner rather than a list - one query returns the one row (real or defaulted),
 * never an array.
 */
const ResponseTimeSettingsService = (() => {
	const _RESPONSE_TIME_SETTINGS_FIELDS = `
		id
		shopId
		artistUserId
		initialThresholdMinutes
		repeatIntervalMinutes
		shopCeiling {
			initialThresholdMinutes
			repeatIntervalMinutes
		}
		setByUserId
		createdAt
		updatedAt
	`;

	const _FETCH_RESPONSE_TIME_SETTINGS = gql`
		query GetResponseTimeSettings($shopId: ID, $artistUserId: ID) {
			getResponseTimeSettings(shopId: $shopId, artistUserId: $artistUserId) {
				${_RESPONSE_TIME_SETTINGS_FIELDS}
			}
		}
	`;
	const _getResponseTimeSettings = (scope, options = {}) => {
		return useQuery(_FETCH_RESPONSE_TIME_SETTINGS, {
			variables: { ...scope },
			skip: !scope?.shopId && !scope?.artistUserId,
			fetchPolicy: "cache-and-network",
			...options,
		});
	};

	const _UPDATE_RESPONSE_TIME_SETTINGS = gql`
		mutation UpdateResponseTimeSettings($input: UpdateResponseTimeSettingsInput!) {
			updateResponseTimeSettings(input: $input) {
				${_RESPONSE_TIME_SETTINGS_FIELDS}
			}
		}
	`;

	return {
		getResponseTimeSettings: _getResponseTimeSettings,
		FETCH_RESPONSE_TIME_SETTINGS: _FETCH_RESPONSE_TIME_SETTINGS,
		UPDATE_RESPONSE_TIME_SETTINGS: _UPDATE_RESPONSE_TIME_SETTINGS,
	};
})();

export default ResponseTimeSettingsService;
