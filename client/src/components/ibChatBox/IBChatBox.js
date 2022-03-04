import IBMessage from "../ibMessage/IBMessage";
import IBMultilineInput from "../inputs/IBMultilineInput";
import "./ibChatBox.css";

const IBChatBox = ({ widget }) => {
	return (
		<div className="ibChatBox">
			<div
				className={
					widget
						? "ibChatBoxWrapper widget"
						: "ibChatBoxWrapper"
				}
			>
				<div className={widget ? "ibChatBoxTop widget" : "ibChatBoxTop"}>
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
					<IBMessage />
					<IBMessage own={true} />
					<IBMessage />
				</div>
				<div className="ibChatBoxBottom">
					<IBMultilineInput
						id="addMessage"
						variant="outlined"
						className="chatMessageInput"
						helperText="Type message and press enter"
					/>
				</div>
			</div>
		</div>
	);
};

export default IBChatBox;
