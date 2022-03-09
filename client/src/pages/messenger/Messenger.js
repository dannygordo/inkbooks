import React, { useState } from "react";
import IBChatBox from "../../components/ibChatBox/IBChatBox";
import IBChatOnline from "../../components/ibChatOnline/IBChatOnline";
import IBConversation from "../../components/ibConversation/IBConversation";
import IBMessage from "../../components/ibMessage/IBMessage";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBMultilineInput from "../../components/inputs/IBMultilineInput";
import { useAuth } from "../../context/auth";
import MessengerService from "../../services/MessengerService";
import UtilsService from "../../services/UtilsService";
import "./messenger.css";

const Messenger = () => {
	const { user } = useAuth();
	const { loading, data } = MessengerService.fetchConversationsByMemberId(user.id);
	const [activeConversation, setActiveConversation] = useState({});
	const [activeMessages, setActiveMessages] = useState([]);
	if(loading) {
		return <IBPageLoader />
	}

	
	const handleConversationClick = (conversation) => {
		console.log(conversation);
		setActiveConversation(conversation);
		setActiveMessages(conversation.messages);
	}
	const loadConversations = (setActiveConvoCB) => {
		if(data){
			return (
				data.getConversationsByMemberId.map((conversation) => {
					return <IBConversation activeConversation={setActiveConvoCB} conversation={conversation} key={`${Date.now()}${conversation.id}`} />
				})
			)
		}
	}
	if(data) {
		if(UtilsService.isObjectEmpty(activeConversation)) {
			if(data.getConversationsByMemberId.length > 0) {
				setActiveConversation(data.getConversationsByMemberId[0]);
				setActiveMessages(data.getConversationsByMemberId[0].messages);
			}
		}
		console.log(activeMessages);

		return (
			<div className="messenger">
				<div className="messengerContainer">
					<div className="chatMenu">
						<div className="chatMenuWrapper">
							<IBMultilineInput
								id="searchForUsers"
								label="Search for users"
								className="chatMenuInput"
								helperText="Type name and hit enter"
							/>
							{loadConversations(handleConversationClick)}
						</div>
					</div>
					<IBChatBox
						conversation={activeConversation}
						messages={activeMessages}
						setActiveMessages={setActiveMessages}
					/>
					<div className="chatOnline">
						<div className="chatOnlineWrapper">
							<IBChatOnline />
						</div>
					</div>
				</div>
			</div>
		);
	}else {
		return <div>Oops</div>
	}
	
};

export default Messenger;
