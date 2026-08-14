import { gql, useQuery, useMutation } from "@apollo/client";

// Appointment reminders (text + email to CLIENTS) - see server/models/ReminderSettings.js and
// server/utils/reminders.js. Always the caller's OWN row; there is no id argument anywhere here,
// same authority shape as the Square connection.
const RemindersService = (() => {
	const _REMINDER_SETTINGS_FIELDS = `
		emailEnabled
		smsEnabled
		rules {
			id
			offsetMinutes
			enabled
		}
		emailSubjectTemplate
		emailBodyTemplate
		smsTemplate
	`;

	const _GET_SETTINGS = gql`
		query GetReminderSettings {
			getReminderSettings {
				${_REMINDER_SETTINGS_FIELDS}
			}
		}
	`;

	const _UPDATE_SETTINGS = gql`
		mutation UpdateReminderSettings(
			$emailEnabled: Boolean
			$smsEnabled: Boolean
			$rules: [ReminderRuleInput!]
			$emailSubjectTemplate: String
			$emailBodyTemplate: String
			$smsTemplate: String
		) {
			updateReminderSettings(
				emailEnabled: $emailEnabled
				smsEnabled: $smsEnabled
				rules: $rules
				emailSubjectTemplate: $emailSubjectTemplate
				emailBodyTemplate: $emailBodyTemplate
				smsTemplate: $smsTemplate
			) {
				${_REMINDER_SETTINGS_FIELDS}
			}
		}
	`;

	return {
		GET_SETTINGS: _GET_SETTINGS,
		useSettings: () => useQuery(_GET_SETTINGS),
		UPDATE_SETTINGS: _UPDATE_SETTINGS,
		useUpdateSettings: () => useMutation(_UPDATE_SETTINGS),
	};
})();

export default RemindersService;
