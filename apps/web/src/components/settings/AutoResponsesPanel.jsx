import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import {
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	MenuItem,
	Stack,
	Switch,
	TextField,
} from "@mui/material";
import { Add, Delete, Edit, Email, Sms } from "@mui/icons-material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBMultilineInput from "../inputs/IBMultilineInput";
import AutoResponseService from "../../services/AutoResponseService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { ROLES } from "../../constants/auth";

/**
 * Settings > Messages > Auto-Responses - see server/models/AutoResponse.js and
 * server/utils/auto-responses.js for the full design this UI follows, and the plan this shipped
 * from for the decision record. Short version relevant to this screen:
 *
 * TWO INDEPENDENT SECTIONS, not a toggle between them - a shop-connected artist sees BOTH their
 * own personal set AND their shop's set, at the same time, always. This mirrors FormsPanel.jsx's
 * own "Your link" / "Manage Forms" split (isArtist vs hasAuditAuthority-ish), except here BOTH
 * sections can render for the same person simultaneously rather than being mutually exclusive -
 * that's the whole point of the "shop sets policy, artist can use their own instead" model this
 * shipped from.
 *
 * ENABLED GOVERNS AUTOMATIC FIRING ONLY - a response the artist/shop has turned off for
 * auto-fire stays in this list (and in the manual "Send a message" picker elsewhere) as long as
 * it hasn't been deactivated. Deactivating (the trash icon) removes it from both.
 */

const TRIGGER_LABELS = {
	SESSION_COMPLETED: "After a session",
	PAYMENT_RECEIVED: "Receipt (payment received)",
	MESSAGE_RECEIVED: "When a client messages you",
	MANUAL: "Manual only",
};

// Shown under the trigger picker only for MESSAGE_RECEIVED - the one trigger whose behavior isn't
// obvious from its label alone: it's the only one that posts a real message into the client's
// conversation thread (in addition to email/SMS, per its own toggles below), rather than sending
// only outside the app. Worth saying up front, not just leaving someone to discover it live.
const TRIGGER_HELP_TEXT = {
	MESSAGE_RECEIVED:
		"Posts this as a reply in the client's conversation thread automatically, once per " +
		"message they send while this is turned on - like an email out-of-office responder. " +
		"Email/SMS below are sent in addition, not instead.",
};

const EMPTY_DRAFT = {
	autoResponseId: null,
	name: "",
	trigger: "SESSION_COMPLETED",
	enabled: false,
	emailEnabled: true,
	smsEnabled: false,
	emailSubjectTemplate: "",
	emailBodyTemplate: "",
	smsTemplate: "",
};

function draftFromResponse(response) {
	return {
		autoResponseId: response.id,
		name: response.name,
		trigger: response.trigger,
		enabled: response.enabled,
		emailEnabled: response.emailEnabled,
		smsEnabled: response.smsEnabled,
		emailSubjectTemplate: response.emailSubjectTemplate || "",
		emailBodyTemplate: response.emailBodyTemplate || "",
		smsTemplate: response.smsTemplate || "",
	};
}

// One scope (either { artistUserId } or { shopId }), rendered as its own card - see the header
// comment above on why the panel below renders up to two of these, never a toggle between them.
function AutoResponseSection({ scope, title, description }) {
	const { setAlert } = useAuth();
	const { data, loading, refetch } = AutoResponseService.getAutoResponses(scope, false);
	const [createAutoResponse] = useMutation(AutoResponseService.CREATE_AUTO_RESPONSE);
	const [updateAutoResponse] = useMutation(AutoResponseService.UPDATE_AUTO_RESPONSE);
	const [archiveAutoResponse] = useMutation(AutoResponseService.ARCHIVE_AUTO_RESPONSE);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [draft, setDraft] = useState(EMPTY_DRAFT);
	const [saving, setSaving] = useState(false);

	const responses = data?.getAutoResponses || [];

	const showAlert = (severity, message) =>
		setAlert({
			isAlert: true,
			severity,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});

	const openCreate = () => {
		setDraft(EMPTY_DRAFT);
		setDialogOpen(true);
	};
	const openEdit = (response) => {
		setDraft(draftFromResponse(response));
		setDialogOpen(true);
	};
	const closeDialog = () => setDialogOpen(false);

	const handleSave = () => {
		if (!draft.name.trim()) {
			return;
		}
		setSaving(true);
		// Empty box means "use the built-in default" - sent as null, not an empty string, same
		// convention as RemindersPanel's own template fields.
		const templates = {
			emailSubjectTemplate: draft.emailSubjectTemplate.trim() || null,
			emailBodyTemplate: draft.emailBodyTemplate.trim() || null,
			smsTemplate: draft.smsTemplate.trim() || null,
		};
		const action = draft.autoResponseId
			? updateAutoResponse({
					variables: {
						input: {
							autoResponseId: draft.autoResponseId,
							name: draft.name,
							enabled: draft.enabled,
							emailEnabled: draft.emailEnabled,
							smsEnabled: draft.smsEnabled,
							...templates,
						},
					},
			  })
			: createAutoResponse({
					variables: {
						input: {
							// CreateAutoResponseInput only accepts shopId - never artistUserId. The
							// artist scope is resolved server-side from the caller's own identity (see
							// resolveBusinessOwner in resolvers/autoResponses.js), so scope.shopId is
							// the only part of `scope` that's ever a valid field to send here; the
							// artist-section's scope={{ artistUserId: user.id }} is only meaningful for
							// the getAutoResponses query above, not for this mutation.
							...(scope.shopId ? { shopId: scope.shopId } : {}),
							name: draft.name,
							trigger: draft.trigger,
							enabled: draft.enabled,
							emailEnabled: draft.emailEnabled,
							smsEnabled: draft.smsEnabled,
							...templates,
						},
					},
			  });

		action
			.then(() => {
				showAlert(
					ALERT_CONSTANTS.SEVERITY.SUCCESS,
					draft.autoResponseId ? "Auto-Response updated." : "Auto-Response created.",
				);
				setDialogOpen(false);
				return refetch();
			})
			.catch((err) => {
				showAlert(
					ALERT_CONSTANTS.SEVERITY.ERROR,
					err.graphQLErrors?.[0]?.extensions?.errors?.enabled ||
						err.graphQLErrors?.[0]?.extensions?.errors?.name ||
						err.message,
				);
			})
			.finally(() => setSaving(false));
	};

	const handleToggleEnabled = (response, enabled) => {
		updateAutoResponse({ variables: { input: { autoResponseId: response.id, enabled } } })
			.then(() => refetch())
			.catch((err) => showAlert(ALERT_CONSTANTS.SEVERITY.ERROR, err.message));
	};

	const handleDeactivate = (response) => {
		archiveAutoResponse({ variables: { autoResponseId: response.id } })
			.then(() => {
				showAlert(ALERT_CONSTANTS.SEVERITY.SUCCESS, `"${response.name}" deactivated.`);
				return refetch();
			})
			.catch((err) => showAlert(ALERT_CONSTANTS.SEVERITY.ERROR, err.message));
	};

	if (loading && !data) {
		return null;
	}

	return (
		<IBCardWrapper>
			<div>
				<h1>{title}</h1>
				<p className="settingsPanelHelp">{description}</p>
			</div>

			<div className="businessTypeList">
				{responses.length === 0 && (
					<p className="settingsPanelHelp">No Auto-Responses yet - add one below.</p>
				)}
				{responses.map((response) => (
					<div className="autoResponseRow" key={response.id}>
						<Switch
							size="small"
							checked={response.enabled}
							disabled={response.trigger === "MANUAL"}
							onChange={(e) => handleToggleEnabled(response, e.target.checked)}
						/>
						<div className="autoResponseRowMain">
							<span className="autoResponseRowName">{response.name}</span>
							<div className="autoResponseRowMeta">
								<Chip
									size="small"
									label={TRIGGER_LABELS[response.trigger] || response.trigger}
								/>
								{response.emailEnabled && <Email fontSize="small" titleAccess="Sends by email" />}
								{response.smsEnabled && <Sms fontSize="small" titleAccess="Sends by text" />}
							</div>
						</div>
						<div className="autoResponseRowActions">
							<IconButton aria-label="Edit" size="small" onClick={() => openEdit(response)}>
								<Edit fontSize="small" />
							</IconButton>
							<IconButton
								aria-label="Deactivate"
								size="small"
								onClick={() => handleDeactivate(response)}
							>
								<Delete fontSize="small" />
							</IconButton>
						</div>
					</div>
				))}
			</div>

			<div className="settingsActions">
				<Button variant="contained" startIcon={<Add />} onClick={openCreate}>
					New Auto-Response
				</Button>
			</div>

			<Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
				<DialogTitle>{draft.autoResponseId ? "Edit Auto-Response" : "New Auto-Response"}</DialogTitle>
				<DialogContent>
					<Stack spacing={2} sx={{ mt: 1 }}>
						<TextField
							label="Name"
							value={draft.name}
							onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
							autoFocus
							fullWidth
						/>
						<TextField
							select
							label="When this sends"
							value={draft.trigger}
							disabled={Boolean(draft.autoResponseId)}
							onChange={(e) => setDraft((prev) => ({ ...prev, trigger: e.target.value }))}
							helperText={
								draft.autoResponseId
									? "Can't be changed after creation."
									: draft.trigger === "MANUAL"
									  ? "Manual-only responses never fire on their own - use them from the Send a message picker instead."
									  : TRIGGER_HELP_TEXT[draft.trigger]
							}
							fullWidth
						>
							<MenuItem value="SESSION_COMPLETED">After a session</MenuItem>
							<MenuItem value="PAYMENT_RECEIVED">Receipt (payment received)</MenuItem>
							<MenuItem value="MESSAGE_RECEIVED">When a client messages you</MenuItem>
							<MenuItem value="MANUAL">Manual only</MenuItem>
						</TextField>

						{draft.trigger !== "MANUAL" && (
							<FormControlLabel
								control={
									<Switch
										checked={draft.enabled}
										onChange={(e) =>
											setDraft((prev) => ({ ...prev, enabled: e.target.checked }))
										}
									/>
								}
								label="Send automatically"
							/>
						)}

						<FormControlLabel
							control={
								<Switch
									checked={draft.emailEnabled}
									onChange={(e) =>
										setDraft((prev) => ({ ...prev, emailEnabled: e.target.checked }))
									}
								/>
							}
							label="Send by email"
						/>
						<FormControlLabel
							control={
								<Switch
									checked={draft.smsEnabled}
									onChange={(e) =>
										setDraft((prev) => ({ ...prev, smsEnabled: e.target.checked }))
									}
								/>
							}
							label="Send by text"
						/>

						<p className="settingsPanelHelp">
							Leave a box blank to use the built-in default wording. Available merge fields:{" "}
							<code>{"{{clientFirstName}}"}</code>, <code>{"{{artistName}}"}</code>,{" "}
							<code>{"{{appointmentDate}}"}</code>, <code>{"{{appointmentTime}}"}</code>.
						</p>

						<TextField
							label="Email subject"
							value={draft.emailSubjectTemplate}
							onChange={(e) =>
								setDraft((prev) => ({ ...prev, emailSubjectTemplate: e.target.value }))
							}
							fullWidth
						/>
						<IBMultilineInput
							label="Email body"
							value={draft.emailBodyTemplate}
							onChange={(e) =>
								setDraft((prev) => ({ ...prev, emailBodyTemplate: e.target.value }))
							}
							minRows={4}
						/>
						<IBMultilineInput
							label="Text message"
							value={draft.smsTemplate}
							onChange={(e) => setDraft((prev) => ({ ...prev, smsTemplate: e.target.value }))}
							minRows={2}
							helperText="Keep this short - a longer message costs more and may split across multiple texts."
						/>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={closeDialog} disabled={saving}>
						Cancel
					</Button>
					<Button variant="contained" onClick={handleSave} disabled={saving || !draft.name.trim()}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</IBCardWrapper>
	);
}

const AutoResponsesPanel = () => {
	const { user } = useAuth();
	const isArtist = Boolean(user.userInfo) && user.userType === "artist";
	const isShopAdminOrBetter = user.role <= ROLES.SHOP_ADMIN;
	const shop = user.userInfo?.shop;
	const canManageShopAutoResponses = isShopAdminOrBetter && Boolean(shop?.id);

	return (
		<>
			{isArtist && (
				<AutoResponseSection
					scope={{ artistUserId: user.id }}
					title="Your Auto-Responses"
					description="Messages sent automatically after something happens, or attached by hand when you message a client. If you enable one here for a trigger your shop also has, yours is the one that sends."
				/>
			)}
			{canManageShopAutoResponses && (
				<AutoResponseSection
					scope={{ shopId: shop.id }}
					title={`${shop.name || "Shop"} Auto-Responses`}
					description="Shop-wide defaults, available to every artist here. An artist's own Auto-Response for the same trigger sends instead of the shop's, if they have one enabled."
				/>
			)}
		</>
	);
};

export default AutoResponsesPanel;
