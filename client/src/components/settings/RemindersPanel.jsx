import React, { useEffect, useState } from "react";
import {
	FormControlLabel,
	IconButton,
	MenuItem,
	Switch,
	TextField,
} from "@mui/material";
import { Delete } from "@mui/icons-material";
import ReminderService from "../../services/ReminderService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

/**
 * Appointment reminders - text and email nudges sent to CLIENTS ahead of an appointment. See
 * server/models/ReminderSettings.js for the full design reasoning; the short version relevant to
 * this screen:
 *
 * ONE SHARED INKBOOKS TEXTING NUMBER, not one registered per artist - so there is nothing to
 * "connect" here the way Square Config has a Connect button. Turning Text reminders on just starts
 * using the number InkBooks already has. The trade-off worth surfacing on screen (see the SMS
 * helper text below) is that this is shared infrastructure: it is why the message has to identify
 * the artist by name in its own text, and why abuse anywhere on the platform can affect
 * deliverability for everyone on it.
 *
 * OFFSETS ARE EDITED IN A HUMAN UNIT (minutes/hours/days) but stored and sent to the server as
 * minutes - see minutesToUnit/unitToMinutes below. The rule's server-side identity is its
 * offsetMinutes value, not any client-side id (see models/ReminderLog.js's own comment on why) -
 * so nothing here needs to preserve a rule's identity across an edit.
 */

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 };

function minutesToUnit(totalMinutes) {
	if (totalMinutes % UNIT_MINUTES.days === 0) {
		return { value: totalMinutes / UNIT_MINUTES.days, unit: "days" };
	}
	if (totalMinutes % UNIT_MINUTES.hours === 0) {
		return { value: totalMinutes / UNIT_MINUTES.hours, unit: "hours" };
	}
	return { value: totalMinutes, unit: "minutes" };
}

function unitToMinutes(value, unit) {
	return Math.max(1, Math.round(Number(value) || 0)) * UNIT_MINUTES[unit];
}

let localRuleKey = 0;
function nextLocalKey() {
	localRuleKey += 1;
	return `local-${localRuleKey}`;
}

const RemindersPanel = () => {
	const { setAlert } = useAuth();
	const { data, loading } = ReminderService.useSettings();
	const [updateSettings, { loading: saving }] = ReminderService.useUpdateSettings();

	const [hydrated, setHydrated] = useState(false);
	const [emailEnabled, setEmailEnabled] = useState(false);
	const [smsEnabled, setSmsEnabled] = useState(false);
	const [rules, setRules] = useState([]);
	const [emailSubjectTemplate, setEmailSubjectTemplate] = useState("");
	const [emailBodyTemplate, setEmailBodyTemplate] = useState("");
	const [smsTemplate, setSmsTemplate] = useState("");

	const settings = data?.getReminderSettings;

	useEffect(() => {
		if (settings && !hydrated) {
			setEmailEnabled(settings.emailEnabled);
			setSmsEnabled(settings.smsEnabled);
			setRules(
				settings.rules.map((rule) => ({
					key: rule.id,
					enabled: rule.enabled,
					...minutesToUnit(rule.offsetMinutes),
				})),
			);
			setEmailSubjectTemplate(settings.emailSubjectTemplate || "");
			setEmailBodyTemplate(settings.emailBodyTemplate || "");
			setSmsTemplate(settings.smsTemplate || "");
			setHydrated(true);
		}
	}, [settings, hydrated]);

	if (loading && !settings) {
		return null;
	}
	if (!settings) {
		return null;
	}

	const updateRule = (key, changes) => {
		setRules((prev) => prev.map((rule) => (rule.key === key ? { ...rule, ...changes } : rule)));
	};

	const removeRule = (key) => {
		setRules((prev) => prev.filter((rule) => rule.key !== key));
	};

	const addRule = () => {
		setRules((prev) => [...prev, { key: nextLocalKey(), value: 24, unit: "hours", enabled: true }]);
	};

	const handleSave = (e) => {
		e.preventDefault();
		updateSettings({
			variables: {
				emailEnabled,
				smsEnabled,
				rules: rules.map((rule) => ({
					offsetMinutes: unitToMinutes(rule.value, rule.unit),
					enabled: rule.enabled,
				})),
				// Empty box means "use the built-in default" - sent as null, not an empty string,
				// so the server's own default (utils/reminders.js) is what actually goes out rather
				// than a literal blank message.
				emailSubjectTemplate: emailSubjectTemplate.trim() || null,
				emailBodyTemplate: emailBodyTemplate.trim() || null,
				smsTemplate: smsTemplate.trim() || null,
			},
		})
			.then(() => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: "Reminder settings saved.",
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.catch((err) => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			});
	};

	return (
		<IBCardWrapper>
			<div>
				<h1>Reminders</h1>
				<p className="settingsPanelHelp">
					Automatic reminders to clients ahead of an appointment - by email, by text, or both.
					Nothing sends until you turn a channel on below.
				</p>
			</div>

			<form onSubmit={handleSave}>
				<div className="remindersChannelRow">
					<FormControlLabel
						control={
							<Switch
								checked={emailEnabled}
								disabled={saving}
								onChange={(e) => setEmailEnabled(e.target.checked)}
							/>
						}
						label="Email reminders"
					/>
				</div>
				<div className="remindersChannelRow">
					<FormControlLabel
						control={
							<Switch
								checked={smsEnabled}
								disabled={saving}
								onChange={(e) => setSmsEnabled(e.target.checked)}
							/>
						}
						label="Text reminders"
					/>
					<p className="settingsPanelHelp remindersSmsHelp">
						Sent from InkBooks' own number, with your name in the message - not a number
						registered to you individually. Shared infrastructure across every artist using
						this feature, so keep an eye on your reply rate.
					</p>
				</div>

				<h2 className="remindersSubheading">When</h2>
				<div className="remindersRules">
					{rules.map((rule) => (
						<div className="remindersRuleRow" key={rule.key}>
							<Switch
								size="small"
								checked={rule.enabled}
								disabled={saving}
								onChange={(e) => updateRule(rule.key, { enabled: e.target.checked })}
							/>
							<TextField
								size="small"
								type="number"
								label="How long before"
								value={rule.value}
								disabled={saving}
								onChange={(e) => updateRule(rule.key, { value: e.target.value })}
								sx={{ width: 130, mr: 1 }}
								slotProps={{ htmlInput: { min: 1 } }}
							/>
							<TextField
								size="small"
								select
								label="Unit"
								value={rule.unit}
								disabled={saving}
								onChange={(e) => updateRule(rule.key, { unit: e.target.value })}
								sx={{ width: 130, mr: 1 }}
							>
								<MenuItem value="minutes">minutes</MenuItem>
								<MenuItem value="hours">hours</MenuItem>
								<MenuItem value="days">days</MenuItem>
							</TextField>
							<IconButton
								aria-label="Remove reminder"
								disabled={saving}
								onClick={() => removeRule(rule.key)}
							>
								<Delete fontSize="small" />
							</IconButton>
						</div>
					))}
					<button
						type="button"
						className="ibButtonSecondary"
						disabled={saving}
						onClick={addRule}
					>
						+ Add a reminder
					</button>
				</div>

				<h2 className="remindersSubheading">Message</h2>
				<p className="settingsPanelHelp">
					Leave a box blank to use InkBooks' default wording. Available merge fields:{" "}
					<code>{"{{clientFirstName}}"}</code>, <code>{"{{artistName}}"}</code>,{" "}
					<code>{"{{appointmentDate}}"}</code>, <code>{"{{appointmentTime}}"}</code>,{" "}
					<code>{"{{link}}"}</code>.
				</p>
				<TextField
					fullWidth
					size="small"
					label="Email subject"
					placeholder="Reminder: your appointment with {{artistName}}"
					value={emailSubjectTemplate}
					disabled={saving}
					onChange={(e) => setEmailSubjectTemplate(e.target.value)}
					sx={{ mb: 2 }}
				/>
				<TextField
					fullWidth
					size="small"
					multiline
					minRows={3}
					label="Email body"
					placeholder="Hi {{clientFirstName}}, this is a reminder from {{artistName}} about your appointment on {{appointmentDate}} at {{appointmentTime}}. {{link}}"
					value={emailBodyTemplate}
					disabled={saving}
					onChange={(e) => setEmailBodyTemplate(e.target.value)}
					sx={{ mb: 2 }}
				/>
				<TextField
					fullWidth
					size="small"
					multiline
					minRows={2}
					label="Text message"
					placeholder="Hi {{clientFirstName}}, this is a reminder from {{artistName}} for your appointment on {{appointmentDate}} at {{appointmentTime}}. {{link}}"
					value={smsTemplate}
					disabled={saving}
					onChange={(e) => setSmsTemplate(e.target.value)}
					helperText="Keep this short - a longer message costs more and may split across multiple texts."
					sx={{ mb: 2 }}
				/>

				<div className="settingsActions">
					<button type="submit" className="ibButton" disabled={saving}>
						{saving ? "Saving..." : "Save Reminder Settings"}
					</button>
				</div>
			</form>
		</IBCardWrapper>
	);
};

export default RemindersPanel;
