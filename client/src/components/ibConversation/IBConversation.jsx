import { Badge } from "@mui/material";
import { useAuth } from "../../context/auth";
import IBAvatar from "../inputs/IBAvatar";
import "./ibConversation.css";

const IBConversation = ({ conversation, activeConversation, isActive = false }) => {
	const { user } = useAuth();
	const member = conversation.membersInfo.filter((member) => {
		if (member.id !== user.id) {
			return member;
		}
	})[0];

	const handleClick = (e) => {
		e.preventDefault();
		activeConversation(conversation);
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
			</div>
		);
	} else {
		return <div>No Conversations Found</div>;
	}
};

export default IBConversation;
