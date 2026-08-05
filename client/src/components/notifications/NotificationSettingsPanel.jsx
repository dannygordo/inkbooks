import React, { useEffect, useState } from "react";
import { FormControlLabel, MenuItem, Switch, TextField } from "@mui/material";
import NotificationService from "../../services/NotificationService";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";

/**
 * Notification settings: six toggles, a timezone and an hour.
 *
 * Per category, not per event type. Forty checkboxes is a page nobody reads, which means the
 * defaults end up doing all the work anyway with far more code behind them. Six is few enough that
 * somebody annoyed by one thing goes and turns off that one thing rather than muting everything.
 *
 * Only EMAIL can be switched off. In-app is always on because the inbox is also the record - "did
 * we tell the shop about that payment" has to stay answerable - so the page says that plainly
 * rather than leaving people hunting for a switch that deliberately doesn't exist.
 */

const CATEGORIES = [
	{
		key: "moneyEmail",
		modeKey: "moneyMode",
		label: "Money",
		hint: "Deposits, payments, shop cuts.",
	},
	{
		key: "scheduleEmail",
		modeKey: "scheduleMode",
		label: "Schedule",
		hint: "Booking requests, bookings, cancellations.",
	},
	{
		key: "rosterEmail",
		modeKey: "rosterMode",
		label: "Your team",
		hint: "Artists joining or leaving, rate changes.",
	},
	{
		key: "messageEmail",
		modeKey: "messageMode",
		label: "Messages",
		hint: "New messages from clients and artists.",
	},
];

// What a resolved mode actually means, in words. A toggle that is "on" but resolves to a digest is
// doing something specific, and a settings page that won't say which is a settings page people
// stop believing.
const MODE_TEXT = {
	immediate: "Emailed as it happens",
	digest: "Rolled into your daily summary",
	off: "In-app only",
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h) {
	if (h === 0) return "12 AM";
	if (h === 12) return "12 PM";
	return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const NotificationSettingsPanel = () => {
	const { data, loading } = NotificationService.useSettings();
	const [updateSettings, { loading: saving }] = NotificationService.useUpdateSettings();
	const [localTimezone, setLocalTimezone] = useState(null);

	const settings = data?.getNotificationSettings;

	// Offers the browser's zone when the account hasn't got one yet - which is every account that
	// was created by an admin and has never been to settings. Offered, not applied silently: it is
	// their setting, and a value that appears without being chosen is one nobody can explain later.
	const detectedZone =
		typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

	useEffect(() => {
		if (settings && localTimezone === null) {
			setLocalTimezone(settings.timezone);
		}
	}, [settings, localTimezone]);

	if (loading && !settings) {
		return null;
	}
	if (!settings) {
		return null;
	}

	const save = (changes) => {
		updateSettings({ variables: changes }).catch(() => {
			// Deliberately quiet. A preference that failed to save shows its old value on the next
			// render, which tells the person more accurately than a toast would.
		});
	};

	const toggle = (key, next) => save({ prefs: { [key]: next } });

	// An unset preference resolves to the role default, so a toggle reflects the RESOLVED state
	// rather than the raw null - otherwise every untouched switch reads as "off" when it isn't.
	const isOn = (category) => settings[category.modeKey] !== "off";

	const usesDigest = CATEGORIES.some((c) => settings[c.modeKey] === "digest");

	return (
		<IBCardWrapper>
			<div>
				<h1>Notifications</h1>
				<h6 style={{ color: "#bbb", marginBottom: 15 }}>
					These control email only. Everything still appears in your notifications here,
					because that list is also the record of what happened.
				</h6>

				{CATEGORIES.map((category) => (
					<div key={category.key} className="notificationPrefRow">
						<FormControlLabel
							control={
								<Switch
									checked={isOn(category)}
									disabled={saving}
									onChange={(e) => toggle(category.key, e.target.checked)}
								/>
							}
							label={category.label}
						/>
						<div className="notificationPrefHint">
							{category.hint}{" "}
							<strong>{MODE_TEXT[settings[category.modeKey]]}</strong>
						</div>
					</div>
				))}

				{/* Only shown when something actually digests. A digest hour on a screen where
				    nothing is digested is a control with no effect, which is worse than absent. */}
				{usesDigest && (
					<div className="notificationDigestRow">
						<TextField
							select
							size="small"
							label="Daily summary arrives at"
							value={settings.digestHour}
							disabled={saving}
							onChange={(e) => save({ digestHour: Number(e.target.value) })}
							sx={{ minWidth: 200, mr: 2 }}
						>
							{HOURS.map((h) => (
								<MenuItem key={h} value={h}>
									{hourLabel(h)}
								</MenuItem>
							))}
						</TextField>

						<TextField
							size="small"
							label="Your timezone"
							value={localTimezone || ""}
							disabled={saving}
							onChange={(e) => setLocalTimezone(e.target.value)}
							onBlur={() => localTimezone && save({ timezone: localTimezone })}
							helperText={
								detectedZone && detectedZone !== settings.timezone
									? `This browser says ${detectedZone}`
									: " "
							}
							sx={{ minWidth: 240 }}
						/>
					</div>
				)}
			</div>
		</IBCardWrapper>
	);
};

export default NotificationSettingsPanel;
