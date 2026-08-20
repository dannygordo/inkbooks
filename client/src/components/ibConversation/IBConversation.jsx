import { useState } from "react";
import { Badge, IconButton, Menu, MenuItem } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useAuth } from "../../context/auth";
import IBAvatar from "../inputs/IBAvatar";
import "./ibConversation.css";

const IBConversation = ({ conversation, activeConversation, isActive = false, onMarkUnread }) => {
	const { user } = useAuth();
	const member = conversation.membersInfo.filter((member) => {
		if (member.id !== user.id) {
			return member;
		}
	})[0];

	// The row's own overflow menu - "Mark as unread" lives here rather than behind a right-click,
	// since a right-click has no visible affordance and this is the same pattern already used for
	// NotificationBell's menu (anchorEl null = closed).
	const [menuAnchorEl, setMenuAnchorEl] = useState(null);

	const handleClick = (e) => {
		e.preventDefault();
		activeConversation(conversation);
	};

	const openMenu = (e) => {
		// Stop propagation, not preventDefault - the row's own onClick would otherwise also fire
		// and open the conversation underneath the menu it's opening.
		e.stopPropagation();
		setMenuAnchorEl(e.currentTarget);
	};
	const closeMenu = (e) => {
		e?.stopPropagation();
		setMenuAnchorEl(null);
	};
	const handleMarkUnread = (e) => {
		e.stopPropagation();
		setMenuAnchorEl(null);
		onMarkUnread?.(conversation);
	};

	// From the server, resolved against this user's own lastReadAt - never counted here from the
	// message list. Counting client-side would let this number and the sidebar total disagree, and
	// the one people stop trusting is whichever they notice second.
	const unread = conversation.unreadCount || 0;

	if (member) {
		return (
			<div
				className={`ibConversation${isActive ? " ibConversationActive" : ""}${
					unread > 0 ? " ibConversationUnread" : ""
				}`}
				onClick={handleClick}
			>
				{/* On the avatar, so it reads as "this person messaged you" rather than as a
				    property of the row. Renders nothing at 0 without a conditional. */}
				<Badge badgeContent={unread} color="error" overlap="circular">
					<IBAvatar
						size={40}
						imgUrl={member.avatar}
						label={`${member.firstName} ${member.lastName}`}
						className="ibConversationImage"
					/>
				</Badge>
				<span className="ibConversationName">{`${member.firstName} ${member.lastName}`}</span>
				{onMarkUnread && (
					<>
						<IconButton
							size="small"
							className="ibConversationMenuButton"
							onClick={openMenu}
							aria-label="Conversation options"
						>
							<MoreVertIcon fontSize="small" />
						</IconButton>
						<Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={closeMenu}>
							{/* Hidden rather than disabled when already unread - marking an
							    already-unread thread unread again is a no-op with nothing to show
							    for it, and a disabled item invites clicking it to see what happens.
							    Also hidden on the OPEN conversation - Messenger.jsx marks whatever's
							    open read on every render, so marking it unread here would flip right
							    back the instant this menu closed, which reads as broken rather than
							    as nothing happening. */}
							{unread === 0 && !isActive && (
								<MenuItem onClick={handleMarkUnread}>Mark as unread</MenuItem>
							)}
						</Menu>
					</>
				)}
			</div>
		);
	} else {
		return <div>No Conversations Found</div>;
	}
};

export default IBConversation;
