import React from "react";
import IBChatBox from "../../components/ibChatBox/IBChatBox";
import IBChatOnline from "../../components/ibChatOnline/IBChatOnline";
import IBConversation from "../../components/ibConversation/IBConversation";
import IBMessage from "../../components/ibMessage/IBMessage";
import IBMultilineInput from "../../components/inputs/IBMultilineInput";
import "./messenger.css";

const Messenger = () => {
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
						<IBConversation />
						<IBConversation />
						<IBConversation />
						<IBConversation />
						<IBConversation />
						<IBConversation />
					</div>
				</div>
				<IBChatBox />
				<div className="chatOnline">
					<div className="chatOnlineWrapper">
            <IBChatOnline />
          </div>
				</div>
			</div>
		</div>
	);
};

export default Messenger;
