import { useAuth } from "../../context/auth";
import IBAvatar from "../inputs/IBAvatar";
import "./ibConversation.css";

const IBConversation = ({conversation, activeConversation}) => {
	const { user } = useAuth();
	const member = conversation.membersInfo.filter((member) => {
		if (member.id !== user.id) {
			return member;
		}
	})[0];

	const handleClick = (e) => {
		e.preventDefault();
		activeConversation(conversation);
		//activeConversation(conversation.id);
	}
	if(member) {

		return (
			<div className="ibConversation" onClick={handleClick}>
				<IBAvatar
					size={40}
					imgUrl={member.avatar}
					label={`${member.firstName} ${member.lastName}`}
					className="ibConversationImage"
				/>
				<span className="ibConversationName">{`${member.firstName} ${member.lastName}`}</span>
			</div>
		);
	} else {
		return (<div>No Conversations Found</div>)
	}
};

export default IBConversation;
