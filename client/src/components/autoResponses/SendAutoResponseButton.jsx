import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Button, ListSubheader, Menu, MenuItem } from "@mui/material";
import { Send } from "@mui/icons-material";
import AutoResponseService from "../../services/AutoResponseService";
import { useAuth } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";
import { ROLES } from "../../constants/auth";

/**
 * "Send a message" - the manual half of Auto-Responses (decision #7 in the plan this shipped
 * from). Opens a menu of every ACTIVE Auto-Response the viewer may send - their own personal set,
 * plus, when they administer a connected shop, that shop's set too - grouped "Yours" / "From
 * [shop name]" so it's clear whose wording is about to go out. Not gated by `enabled` - that flag
 * only controls automatic firing (see models/AutoResponse.js); a response turned off for
 * auto-fire is still a legitimate thing to send once by hand.
 *
 * AUTHORIZATION MIRRORS WHO CAN MANAGE THE RESPONSE, not just who's looking at this client - the
 * server's sendAutoResponseNow re-checks assertCanManageBusinessRecord against the response's own
 * owner (resolvers/autoResponses.js), the same floor as editing it in Settings. A plain
 * shop-connected artist only ever sees "Yours"; a shop admin who is also an artist sees both
 * groups; shop STAFF (front desk) see neither group and this renders nothing, matching the same
 * shop-admin-only floor Expenses/Income already use for shop-owned business records.
 *
 * Renders nothing when there's nothing to send - no clientId, or the viewer has no Auto-Response
 * in either scope - rather than an empty "Send a message" button that always does nothing.
 *
 * Props:
 * - clientId: the Client document's own _id (see ClientDashboard.jsx's own note on this - NOT the
 *   client's User._id).
 * - appointmentId: optional - when this send is tied to a specific appointment/session (see
 *   SessionDetail.jsx). Omitted for a send with no appointment in play, e.g. from a client's own
 *   dashboard.
 */
const SendAutoResponseButton = ({ clientId, appointmentId }) => {
	const { user, setAlert } = useAuth();
	const [anchorEl, setAnchorEl] = useState(null);
	const [sending, setSending] = useState(false);

	const isArtist = Boolean(user.userInfo) && user.userType === "artist";
	const isShopAdminOrBetter = user.role <= ROLES.SHOP_ADMIN;
	const shop = user.userInfo?.shop;
	const canSendShopResponses = isShopAdminOrBetter && Boolean(shop?.id);

	const { data: mineData } = AutoResponseService.getAutoResponses(
		{ artistUserId: user.id },
		false,
		{ skip: !isArtist }
	);
	const { data: shopData } = AutoResponseService.getAutoResponses(
		{ shopId: shop?.id },
		false,
		{ skip: !canSendShopResponses }
	);
	const [sendAutoResponseNow] = useMutation(AutoResponseService.SEND_AUTO_RESPONSE_NOW);

	const mine = mineData?.getAutoResponses || [];
	const fromShop = shopData?.getAutoResponses || [];

	if (!clientId || (mine.length === 0 && fromShop.length === 0)) {
		return null;
	}

	const handleOpen = (e) => setAnchorEl(e.currentTarget);
	const handleClose = () => setAnchorEl(null);

	const handleSend = (autoResponse) => {
		handleClose();
		setSending(true);
		sendAutoResponseNow({
			variables: {
				autoResponseId: autoResponse.id,
				clientId,
				appointmentId: appointmentId || null,
			},
		})
			.then(() => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
					message: `"${autoResponse.name}" sent.`,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.catch((err) => {
				setAlert({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: err.graphQLErrors?.[0]?.message || err.message,
					timeout: ALERT_CONSTANTS.TIMEOUT,
					location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
				});
			})
			.finally(() => setSending(false));
	};

	return (
		<>
			<Button
				size="small"
				variant="outlined"
				startIcon={<Send />}
				onClick={handleOpen}
				disabled={sending}
			>
				Send a message
			</Button>
			<Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
				{mine.length > 0 && <ListSubheader>Yours</ListSubheader>}
				{mine.map((response) => (
					<MenuItem key={response.id} onClick={() => handleSend(response)}>
						{response.name}
					</MenuItem>
				))}
				{fromShop.length > 0 && (
					<ListSubheader>From {shop?.name || "your shop"}</ListSubheader>
				)}
				{fromShop.map((response) => (
					<MenuItem key={response.id} onClick={() => handleSend(response)}>
						{response.name}
					</MenuItem>
				))}
			</Menu>
		</>
	);
};

export default SendAutoResponseButton;
