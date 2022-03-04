import IBAvatar from "../inputs/IBAvatar";
import "./ibConversation.css";

const IBConversation = () => {
	return (
		<div className="ibConversation">
			<IBAvatar
				size={40}
				imgUrl="https://scontent-sea1-1.xx.fbcdn.net/v/t1.18169-9/320965_4319035770110_1966842188_n.jpg?_nc_cat=107&ccb=1-5&_nc_sid=cdbe9c&_nc_ohc=Q_NH_zRi6NgAX-T57ND&tn=XCJtzF0_ZmgxGXDs&_nc_ht=scontent-sea1-1.xx&oh=00_AT8MnVtx2IUBSPueV0fmgk_iflOHJj7V57W5_4tZxEL7zQ&oe=6243FC39"
				label="Paris Schreiber"
				className="ibConversationImage"
			/>
			<span className="ibConversationName">Paris Schreiber</span>
		</div>
	);
};

export default IBConversation;
