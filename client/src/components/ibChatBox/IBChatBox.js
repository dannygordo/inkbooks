import { useMutation } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/auth";
import MessengerService from "../../services/MessengerService";
import UtilsService from "../../services/UtilsService";
import IBMessage from "../ibMessage/IBMessage";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import IBMultilineInput from "../inputs/IBMultilineInput";
import "./ibChatBox.css";
import { ObjectID } from "bson";
import ProjectService from "../../services/ProjectService";
import { io } from "socket.io-client";
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import { useSocket } from "../../context/SocketProvider";

const IBChatBox = ({ widget, conversation, setActiveMessages, messages }) => {
	const { user } = useAuth();
	const messageRef = useRef();
	//const scrollRef = useRef();
	const [arrivalMessage, setArrivalMessage] = useState(null);
	const [onlineUsers, setOnlineUsers] = useState([]);

	const scrollRef = useCallback((node) => {
		if(node) {
			node.scrollIntoView({smooth: true, block: "nearest", inline: "nearest"});
		}
	},[])

	const [addNewMessage] = useMutation(
		MessengerService.CREATE_MESSAGE_MUTATION
	);

	//create socket context
	const socket = useSocket();

	const addMessageToConversation = useCallback(({recipients, sender, message}) => {
		console.log(recipients);
		console.log('------------------------------');
		console.log(sender);
		console.log('------------------------------');
		console.log(message);
		const newMessageList = [...messages, message];
		setActiveMessages(newMessageList);
	});

	useEffect(() => {
		if(socket === null) {
			return;
		}
		socket.on('receive-message', addMessageToConversation);	
		return () => socket.off('receive-message');
	}, [socket, addMessageToConversation]);

	

	const handleSaveMessage = (e) => {
		e.preventDefault();
			const newMessage = {
			id: new ObjectID(),
			conversationId: conversation.id,
			senderId: user.id,
			message: messageRef.current.value,
			createdAt: UtilsService.formatDateToISO(Date.now()),
			updatedAt: UtilsService.formatDateToISO(Date.now()),
		};
		let savedMessage = {};

		addNewMessage({
		variables: {
			conversationId: newMessage.conversationId,
			senderId: newMessage.senderId,
			message: newMessage.message,
			createdAt: newMessage.createdAt,
			updatedAt: newMessage.updatedAt,
		},
		}).then(({ data: { createMessage: msg } }) => {
			console.log(msg);
			
			savedMessage = {
				__typename: "Message",
				id: msg.id,
				senderId: user.id,
				user: {
					__typename: 'User',
					firstName: user.firstName,
					lastName: user.lastName,
					avatar: user.avatar
				},
				message: msg.message
			};

			const newMessageList = [...messages, savedMessage];
			setActiveMessages(newMessageList);
			const receiverId = conversation.members.find(
				(member) => member !== user.id
			);

			const recipients = conversation.members.filter(
				(member) => member !== user.id
			);
	
			const messageData = {
				recipients,
				savedMessage
			};
			socket.emit('send-message', {recipients, savedMessage});


		});


		

		if (messageRef.current) {
		messageRef.current.value = "";
		}

	}


	//update: (cache, { data: { createMessage: msg } }) => {
	// const messageData = cache.readQuery({
	// 	query: ProjectService.FETCH_PROJECT_QUERY,
	// 	variables: {
	// 		projectId: '61eac8fa4c62e2c5f2304b90'
	// 	}
	// });
	// console.log(conversation);
	// console.log(messageData);
	// console.log(msg);
	// const usr = {
	// 	user: {
	// 		avatar: user.avatar,
	// 		firstName: user.firstName,
	// 		lastName: user.lastName,
	// 		__typename: 'User'
	// 	}
	// };
	// const finalAnswer = Object.assign({}, msg, usr);
	// console.log(finalAnswer);
	// const newMessageList = [...conversation.messages, finalAnswer];
	// console.log(newMessageList);

	// cache.writeQuery({
	// 	query:ProjectService.FETCH_PROJECT_QUERY,
	// variables: {
	// 	projectId: '61eac8fa4c62e2c5f2304b90'
	// },
	// 	data: {
	// 		getProject: {
	// 			...messageData.getProject,
	// 			conversation: {
	// 				...messageData.getProject.conversation,
	// 				messages: newMessageList
	// 			}
	// 		}
	// 	}
	// });
	// console.log(cacheCB);
	// const nml = cacheCB(conversation, cache, msg);
	// 	const finalAnswer = Object.assign({}, msg, newMessage);
	// 	console.log(finalAnswer);
	// 	const newMessageList = [...conversation.messages, finalAnswer];
	// 	console.log(newMessageList);
	// 	setActiveMessages(newMessageList);
	// 	if(messageRef.current) {
	// 		messageRef.current.value = '';
	// 	}
	// }

	if (conversation) {
		return (
			<div className="ibChatBox">
				<div
					className={
						widget ? "ibChatBoxWrapper widget" : "ibChatBoxWrapper"
					}
				>
					<div
						className={
							widget ? "ibChatBoxTop widget" : "ibChatBoxTop"
						}
					>
						{messages.map((message, index) => {
							if (user.id === message.senderId) {
								return (
									<div ref={scrollRef} key={message.id}>
										<IBMessage
											messageData={message}
											own={true}
										/>
									</div>
								);
							} else {
								return (
									<div ref={scrollRef} key={message.id}>
										<IBMessage messageData={message} />
									</div>
								);
							}
						})}
					</div>
					<div className="ibChatBoxBottom">
						<IBMultilineInput
							id="addMessage"
							variant="outlined"
							inputRef={messageRef}
							className="chatMessageInput"
							helperText="Type message and press enter"
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSaveMessage(e, e.target.value);
								}
							}}
						/>
					</div>
				</div>
			</div>
		);
	}
	return <div>wha happened</div>;
};

export default IBChatBox;
