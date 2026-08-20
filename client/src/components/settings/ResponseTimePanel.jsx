import React, { useEffect, useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, Stack, TextField } from "@mui/material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import ResponseTimeSettingsService from "../../services/ResponseTimeSettingsService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { ROLES } from "../../constants/auth";

/**
 * Settings > Messages > Response Time - see server/models/ResponseTimeSettings.js and
 * server/utils/response-time.js for the full design: how long a client's message may sit
 * unanswered before the artist is nudged (8 hours by default), and how often the nudge repeats
 * until they reply (every 3 hours by default).
 *
 * TWO INDEPENDENT SECTIONS, same shape as AutoResponsesPanel.jsx - a shop-connected artist sees
 * BOTH their own row AND (read-only, as a ceiling) their shop's, at the same time, never a toggle
 * between the two. Unlike AutoResponsesPanel, the shop's own numbers are never shown to the
 * artist as an editable section here - only as `shopCeiling` on their own row (see
 * server/graphql/typeDefs.js's own comment on that field) - an ordinary shop-connected artist has
 * no authority to manage the shop's row, only to be bound by it.
 *
 * MINUTES ON THE WIRE, HOURS ON SCREEN - the server (and its 5-minute-to-30-day validation
 * bounds) works entirely in minutes, same unit as ReminderRule.offsetMinutes, but "8 hours" reads
 * far better than "480 minutes" for a setting nobody needs finer than hour-level control over.
 * Converted at the edges only; nothing about the stored value or the server's own math changes.
 */

const MINUTES_PER_HOUR = 60;

function minutesToHours(minutes) {
	return Math.round((minutes / MINUTES_PER_HOUR) * 100) / 100;
}

function hoursToMinutes(hours) {
	return Math.round(Number(hours) * MINUTES_PER_HOUR);
}

// One scope (either { artistUserId } or { shopId }), its own card - see the header comment above
// on why the artist's own card is the only editable one; a shop-admin-only card renders when the
// caller may manage the shop's row, and an artist's own card shows the shop's ceiling read-only
// alongside it via shopCeiling.
function ResponseTimeSection({ scope, title, description, ceilingHint }) {
	const { setAlert } = useAuth();
	const { data, loading } = ResponseTimeSettingsService.getResponseTimeSettings(scope);
	const [updateResponseTimeSettings] = useMutation(
		ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
	);

	const settings = data?.getResponseTimeSettings;
	const ceiling = settings?.shopCeiling;

	const [initialHours, setInitialHours] = useState("");
	const [repeatHours, setRepeatHours] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (settings) {
			setInitialHours(String(minutesToHours(settings.initialThresholdMinutes)));
			setRepeatHours(String(minutesToHours(settings.repeatIntervalMinutes)));
		}
	}, [settings?.initialThresholdMinutes, settings?.repeatIntervalMinutes]);

	const showAlert = (severity, message) =>
		setAlert({
			isAlert: true,
			severity,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});

	// Client-side only - the server is still the real guard (resolveResponseTimeThresholds clamps
	// the EFFECTIVE value regardless of what's stored), but a save that's silently going to be
	// overridden by the shop's ceiling deserves a clearer message than just letting it happen.
	const exceedsCeiling =
		ceiling &&
		(hoursToMinutes(initialHours) > ceiling.initialThresholdMinutes ||
			hoursToMinutes(repeatHours) > ceiling.repeatIntervalMinutes);

	const handleSave = () => {
		const initialThresholdMinutes = hoursToMinutes(initialHours);
		const repeatIntervalMinutes = hoursToMinutes(repeatHours);
		if (!initialThresholdMinutes || !repeatIntervalMinutes) {
			return;
		}
		setSaving(true);
		updateResponseTimeSettings({
			variables: {
				input: {
					...(scope.shopId ? { shopId: scope.shopId } : {}),
					initialThresholdMinutes,
					repeatIntervalMinutes,
				},
			},
		})
			.then(() => showAlert(ALERT_CONSTANTS.SEVERITY.SUCCESS, "Response time settings updated."))
			.catch((err) =>
				showAlert(
					ALERT_CONSTANTS.SEVERITY.ERROR,
					err.graphQLErrors?.[0]?.extensions?.errors?.initialThresholdMinutes ||
						err.graphQLErrors?.[0]?.extensions?.errors?.repeatIntervalMinutes ||
						err.message,
				),
			)
			.finally(() => setSaving(false));
	};

	if (loading && !data) {
		return null;
	}

	return (
		<IBCardWrapper>
			<div>
				<h1>{title}</h1>
				<p className="settingsPanelHelp">{description}</p>
				{ceiling && (
					<p className="settingsPanelHelp">
						{(ceilingHint || "Your shop limits this to at most")} {minutesToHours(ceiling.initialThresholdMinutes)}{" "}
						hour(s) before the first nudge, repeating at most every{" "}
						{minutesToHours(ceiling.repeatIntervalMinutes)} hour(s).
					</p>
				)}
			</div>

			<Stack spacing={2} sx={{ mt: 1, maxWidth: 360 }}>
				<TextField
					label="Nudge after (hours unanswered)"
					type="number"
					value={initialHours}
					onChange={(e) => setInitialHours(e.target.value)}
					inputProps={{ min: 0.1, step: 0.5 }}
					fullWidth
				/>
				<TextField
					label="Repeat every (hours)"
					type="number"
					value={repeatHours}
					onChange={(e) => setRepeatHours(e.target.value)}
					inputProps={{ min: 0.1, step: 0.5 }}
					fullWidth
					helperText="Keeps repeating on this interval until you reply - see Settings' own help text above."
				/>
				{exceedsCeiling && (
					<p className="settingsPanelHelp">
						Your shop's ceiling is stricter than this - saving will still take effect, but the
						shop's limit is what actually applies until it changes.
					</p>
				)}
			</Stack>

			<div className="settingsActions">
				<Button
					variant="contained"
					onClick={handleSave}
					disabled={saving || !initialHours || !repeatHours}
				>
					{saving ? "Saving..." : "Save"}
				</Button>
			</div>
		</IBCardWrapper>
	);
}

const ResponseTimePanel = () => {
	const { user } = useAuth();
	const isArtist = Boolean(user.userInfo) && user.userType === "artist";
	const isShopAdminOrBetter = user.role <= ROLES.SHOP_ADMIN;
	const shop = user.userInfo?.shop;
	const canManageShopResponseTime = isShopAdminOrBetter && Boolean(shop?.id);

	return (
		<>
			{isArtist && (
				<ResponseTimeSection
					scope={{ artistUserId: user.id }}
					title="Your Response Time"
					description="How long a client's message can go unanswered before you're nudged to reply, and how often the reminder repeats."
				/>
			)}
			{canManageShopResponseTime && (
				<ResponseTimeSection
					scope={{ shopId: shop.id }}
					title={`${shop.name || "Shop"} Response Time`}
					description="The most lenient response-time policy any artist here may use. An artist can set a shorter window for themselves, but never a longer one than this."
				/>
			)}
		</>
	);
};

export default ResponseTimePanel;
