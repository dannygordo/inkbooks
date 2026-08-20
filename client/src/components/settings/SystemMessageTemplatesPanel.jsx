import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import {
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	Stack,
	TextField,
} from "@mui/material";
import { Edit, RestartAlt } from "@mui/icons-material";
import IBCardWrapper from "../card/ibCard/IBCardWrapper";
import IBMultilineInput from "../inputs/IBMultilineInput";
import SystemMessageTemplateService from "../../services/SystemMessageTemplateService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { ROLES } from "../../constants/auth";

/**
 * Settings > Messages > System Messages - see server/models/SystemMessageTemplate.js and
 * server/utils/system-message-templates.js for the full design. Every hardcoded outbound
 * email/SMS app-wide is manageable here EXCEPT account-invite and password-reset, which stay
 * hardcoded on purpose (identity/security emails, not a shop or artist's own outreach - see
 * DECISIONS.md).
 *
 * A FIXED LIST OF 7 KEYS, not a create/list-of-arbitrary-rows screen like AutoResponsesPanel -
 * every key always exists conceptually (it has a built-in default), so this renders one row per
 * key regardless of whether an override row exists in the database yet. "Customized" vs
 * "Default" is what the badge shows; editing writes the override, resetting deletes it.
 *
 * TWO INDEPENDENT SECTIONS, same shape as AutoResponsesPanel/ResponseTimePanel - a shop-connected
 * artist sees BOTH their own overrides AND (if they administer it) their shop's, at the same
 * time, never a toggle between the two.
 */

// key -> { label, description, hasBody, hasExtraNote, mergeFields }. BOOKING_CONFIRMATION is the
// one narrower key (subject + an appendable note only, never the structural body) - see
// utils/client-booking-emails.js's own comment on why.
const KEY_META = {
	BOOKING_REQUEST_RECEIVED: {
		label: "Booking request received (to client)",
		mergeFields: ["firstName", "artistName", "link"],
	},
	NEW_MESSAGE_TO_GUEST: {
		label: "New message notification (to client)",
		mergeFields: ["firstName", "artistName", "link"],
	},
	NEW_MESSAGE_TO_ARTIST: {
		label: "New message notification (to you)",
		mergeFields: ["artistFirstName", "clientName", "link"],
	},
	NEW_BOOKING_REQUEST_TO_ARTIST: {
		label: "New booking request notification (to you)",
		mergeFields: ["artistFirstName", "clientName"],
	},
	SHOP_CUT_MARKED_PAID: {
		label: "Shop cut marked paid (to shop)",
		mergeFields: ["shopName", "artistName", "formattedAmount"],
		shopOnly: true,
	},
	SHOP_CUT_CONFIRMED: {
		label: "Shop cut confirmed (to you)",
		mergeFields: ["artistFirstName", "shopName"],
		artistOnly: true,
	},
	BOOKING_CONFIRMATION: {
		label: "Booking confirmation (to client)",
		mergeFields: ["clientFirstName", "artistName"],
		hasExtraNote: true,
	},
};

const EMPTY_DRAFT = { key: null, emailSubjectTemplate: "", emailBodyTemplate: "", extraNoteTemplate: "" };

function ownerScopeFilter(isShopSection) {
	return (key) => {
		const meta = KEY_META[key];
		if (isShopSection) return !meta.artistOnly;
		return !meta.shopOnly;
	};
}

// One scope (either { artistUserId } or { shopId }), its own card.
function SystemMessageTemplateSection({ scope, title, description, isShopSection }) {
	const { setAlert } = useAuth();
	const { data, loading, refetch } = SystemMessageTemplateService.getSystemMessageTemplates(scope);
	const [updateTemplate] = useMutation(SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE);
	const [resetTemplate] = useMutation(SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [draft, setDraft] = useState(EMPTY_DRAFT);
	const [saving, setSaving] = useState(false);

	const overridesByKey = new Map((data?.getSystemMessageTemplates || []).map((row) => [row.key, row]));
	const keys = Object.keys(KEY_META).filter(ownerScopeFilter(isShopSection));

	const showAlert = (severity, message) =>
		setAlert({
			isAlert: true,
			severity,
			message,
			timeout: ALERT_CONSTANTS.TIMEOUT,
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
		});

	const openEdit = (key) => {
		const existing = overridesByKey.get(key);
		setDraft({
			key,
			emailSubjectTemplate: existing?.emailSubjectTemplate || "",
			emailBodyTemplate: existing?.emailBodyTemplate || "",
			extraNoteTemplate: existing?.extraNoteTemplate || "",
		});
		setDialogOpen(true);
	};
	const closeDialog = () => setDialogOpen(false);

	const handleSave = () => {
		setSaving(true);
		updateTemplate({
			variables: {
				input: {
					...(scope.shopId ? { shopId: scope.shopId } : {}),
					key: draft.key,
					emailSubjectTemplate: draft.emailSubjectTemplate.trim() || null,
					emailBodyTemplate: draft.emailBodyTemplate.trim() || null,
					extraNoteTemplate: draft.extraNoteTemplate.trim() || null,
				},
			},
		})
			.then(() => {
				showAlert(ALERT_CONSTANTS.SEVERITY.SUCCESS, "Template updated.");
				setDialogOpen(false);
				return refetch();
			})
			.catch((err) => showAlert(ALERT_CONSTANTS.SEVERITY.ERROR, err.message))
			.finally(() => setSaving(false));
	};

	const handleReset = (key) => {
		resetTemplate({
			variables: { ...(scope.shopId ? { shopId: scope.shopId } : {}), key },
		})
			.then(() => {
				showAlert(ALERT_CONSTANTS.SEVERITY.SUCCESS, "Reset to the built-in default.");
				return refetch();
			})
			.catch((err) => showAlert(ALERT_CONSTANTS.SEVERITY.ERROR, err.message));
	};

	if (loading && !data) {
		return null;
	}

	const meta = draft.key ? KEY_META[draft.key] : null;

	return (
		<IBCardWrapper>
			<div>
				<h1>{title}</h1>
				<p className="settingsPanelHelp">{description}</p>
			</div>

			<div className="businessTypeList">
				{keys.map((key) => {
					const isCustomized = overridesByKey.has(key);
					return (
						<div className="autoResponseRow" key={key}>
							<div className="autoResponseRowMain">
								<span className="autoResponseRowName">{KEY_META[key].label}</span>
								<div className="autoResponseRowMeta">
									<Chip
										size="small"
										color={isCustomized ? "primary" : "default"}
										label={isCustomized ? "Customized" : "Default"}
									/>
								</div>
							</div>
							<div className="autoResponseRowActions">
								<IconButton aria-label="Edit" size="small" onClick={() => openEdit(key)}>
									<Edit fontSize="small" />
								</IconButton>
								{isCustomized && (
									<IconButton
										aria-label="Reset to default"
										size="small"
										onClick={() => handleReset(key)}
									>
										<RestartAlt fontSize="small" />
									</IconButton>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
				<DialogTitle>{meta?.label}</DialogTitle>
				<DialogContent>
					<Stack spacing={2} sx={{ mt: 1 }}>
						<p className="settingsPanelHelp">
							Leave a box blank to use the built-in default wording. Available merge fields:{" "}
							{meta?.mergeFields.map((field) => (
								<code key={field}>{`{{${field}}} `}</code>
							))}
						</p>
						<TextField
							label="Email subject"
							value={draft.emailSubjectTemplate}
							onChange={(e) =>
								setDraft((prev) => ({ ...prev, emailSubjectTemplate: e.target.value }))
							}
							fullWidth
						/>
						{meta?.hasExtraNote ? (
							<IBMultilineInput
								label="Extra note (appended to the confirmation)"
								value={draft.extraNoteTemplate}
								onChange={(e) =>
									setDraft((prev) => ({ ...prev, extraNoteTemplate: e.target.value }))
								}
								minRows={3}
								helperText="The schedule, deposit, and request details always stay code-generated - this is only an optional line appended at the end."
							/>
						) : (
							<IBMultilineInput
								label="Email body"
								value={draft.emailBodyTemplate}
								onChange={(e) =>
									setDraft((prev) => ({ ...prev, emailBodyTemplate: e.target.value }))
								}
								minRows={4}
							/>
						)}
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={closeDialog} disabled={saving}>
						Cancel
					</Button>
					<Button variant="contained" onClick={handleSave} disabled={saving}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogActions>
			</Dialog>
		</IBCardWrapper>
	);
}

const SystemMessageTemplatesPanel = () => {
	const { user } = useAuth();
	const isArtist = Boolean(user.userInfo) && user.userType === "artist";
	const isShopAdminOrBetter = user.role <= ROLES.SHOP_ADMIN;
	const shop = user.userInfo?.shop;
	const canManageShopTemplates = isShopAdminOrBetter && Boolean(shop?.id);

	return (
		<>
			{isArtist && (
				<SystemMessageTemplateSection
					scope={{ artistUserId: user.id }}
					title="Your System Messages"
					description="The wording of every automatic email your clients and shop receive about your bookings, messages, and payments."
					isShopSection={false}
				/>
			)}
			{canManageShopTemplates && (
				<SystemMessageTemplateSection
					scope={{ shopId: shop.id }}
					title={`${shop.name || "Shop"} System Messages`}
					description="Shop-wide defaults for the same messages, used whenever an artist hasn't set their own."
					isShopSection
				/>
			)}
		</>
	);
};

export default SystemMessageTemplatesPanel;
