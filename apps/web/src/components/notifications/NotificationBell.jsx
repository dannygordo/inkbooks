import React, { useState } from "react";
import { useMutation } from "@apollo/client";
import { Badge, IconButton, Menu, Tooltip, Button } from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import NotificationService from "../../services/NotificationService";
import NotificationItem from "./NotificationItem";
import "./notifications.css";

/**
 * The bell, and the inbox behind it.
 *
 * Shows stored events and live conditions together, because a person looking at "shop cut invoice
 * issued" and "deposit still unapplied" is looking at two things wanting the same attention. Which
 * one is a database row and which is a query is an implementation detail they should never have to
 * think about (see server/graphql/resolvers/notifications.js).
 */
const NotificationBell = () => {
	const [anchorEl, setAnchorEl] = useState(null);
	const { data } = NotificationService.useInbox();
	const [markRead] = useMutation(NotificationService.MARK_READ, {
		// The bell's own query is what shows the count, so it has to be told. By operation name -
		// naming variables instead is what made the calendar stop refreshing.
		refetchQueries: ["GetInbox"],
	});

	const inbox = data?.getInbox;
	const items = inbox?.items || [];
	const unread = inbox?.unreadCount || 0;

	const open = () => setAnchorEl(document.getElementById("notificationBell"));
	const close = () => setAnchorEl(null);

	// Opening does NOT mark everything read. Glancing at a list is not the same as dealing with
	// what is in it, and auto-clearing on open is how an inbox becomes something people ignore -
	// the badge stops meaning "there is something here" and starts meaning "you have not looked
	// today". Marking read is a deliberate act.
	const markAllRead = () => {
		markRead({ variables: {} }).catch(() => {
			// A badge that stays up is a wrong number, not lost data. An error toast over it would
			// be louder than the problem.
		});
	};

	// Conditions can't be marked read - they go away when they stop being true - so a
	// "mark all read" button is only meaningful when there is a stored event to act on.
	const hasStoredUnread = items.some((i) => !i.isCondition && !i.readAt);

	return (
		<>
			<Tooltip title="Notifications">
				<IconButton id="notificationBell" onClick={open} size="small" sx={{ ml: 1 }}>
					<Badge badgeContent={unread} color="error">
						<NotificationsIcon />
					</Badge>
				</IconButton>
			</Tooltip>
			<Menu
				anchorEl={anchorEl}
				open={Boolean(anchorEl)}
				onClose={close}
				transformOrigin={{ horizontal: "right", vertical: "top" }}
				anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
				slotProps={{ paper: { className: "notificationMenu" } }}
			>
				<div className="notificationMenuHeader">
					<span className="notificationMenuTitle">Notifications</span>
					{hasStoredUnread && (
						<Button size="small" onClick={markAllRead}>
							Mark all read
						</Button>
					)}
				</div>

				{items.length === 0 ? (
					// Deliberately not "no notifications" phrased as a failure. An empty inbox in
					// this system means nothing needs attention, which is the good state.
					<div className="notificationEmpty">Nothing needs your attention.</div>
				) : (
					<div className="notificationList">
						{items.map((item) => (
							<NotificationItem key={item.key} item={item} />
						))}
					</div>
				)}
			</Menu>
		</>
	);
};

export default NotificationBell;
