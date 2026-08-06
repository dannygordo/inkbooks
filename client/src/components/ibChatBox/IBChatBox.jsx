import { useApolloClient, useMutation } from "@apollo/client";
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

const IBChatBox = ({ widget, conversation, setActiveMessages, messages, isInputDisabled = false, loadingMessages = false }) => {
	const { user } = useAuth();
	const messageRef = useRef();
	//const scrollRef = useRef();
	const [arrivalMessage, setArrivalMessage] = useState(null);
	const [onlineUsers, setOnlineUsers] = useState([]);

	// A sentinel at the BOTTOM of the thread, scrolled to whenever the message list changes.
	//
	// This replaces a ref callback attached to every single message, which had three problems and
	// only looked like it worked:
	//
	//   1. `{smooth: true}` is not a scrollIntoView option. The real key is `behavior: "smooth"`,
	//      so the value was silently ignored - an invalid key in an options object throws nothing
	//      and does nothing.
	//   2. `block: "nearest"` means "scroll the minimum needed", so a new message peeking into
	//      view at the bottom edge counted as already visible and produced no scroll at all.
	//   3. A ref callback fires on MOUNT, so it only ever ran for messages being added - not when
	//      an existing thread was opened, which is the moment you most want to be at the bottom.
	//
	// An effect keyed on the message count fires in all three cases: opening a thread, sending,
	// and receiving over the socket.
	const bottomRef = useRef(null);
	// Whether this conversation has been scrolled to the bottom at least once, so the FIRST jump
	// can be instant and later ones can animate. Reset per conversation below.
	const hasScrolledOnce = useRef(false);

	useEffect(() => {
		hasScrolledOnce.current = false;
	}, [conversation?.id]);

	useEffect(() => {
		if (!bottomRef.current) {
			return;
		}
		// "auto" on the first paint of a thread, "smooth" afterwards. Animating through a long
		// history on open is a second of scrolling before the app is usable; the smooth version is
		// only worth it for a message arriving while you are looking at the thread.
		bottomRef.current.scrollIntoView({
			behavior: hasScrolledOnce.current ? "smooth" : "auto",
			block: "end",
		});
		hasScrolledOnce.current = true;
	}, [messages.length, conversation?.id]);

	const [addNewMessage] = useMutation(
		MessengerService.CREATE_MESSAGE_MUTATION
	);

	//create socket context
	const socket = useSocket();
	// Both badges - the sidebar total and the per-thread counts - are separate queries that this
	// component's socket traffic never touches. Refetched by operation name when a message lands.
	const apollo = useApolloClient();
	const refetchUnread = useCallback(() => {
		apollo.refetchQueries({
			// Both section badges, because a message can land in either and this component is
			// mounted in both the messenger and the project widget. Refetching only the messages
			// count would leave the booking-request badge stale.
			include: [
				"GetUnreadMessageCount",
				"GetUnreadBookingRequestCount",
				"GetConversationsByMemberId",
			],
		});
	}, [apollo]);

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
		const onReceive = (message) => {
			addMessageToConversation(message);
			// The socket delivers the message straight into the open thread without any GraphQL
			// query running, so nothing else would tell the badges a message had arrived. Without
			// this, a message that lands while the messenger is open shows in the thread and the
			// sidebar count stays where it was until the next poll - the number visibly disagreeing
			// with what is on screen, which is the fastest way to make people stop believing it.
			//
			// Refetching rather than incrementing locally: the server owns the count (it knows what
			// this user has read), and a client-side +1 is a second place that arithmetic happens.
			refetchUnread();
		};
		socket.on('receive-message', onReceive);
		return () => socket.off('receive-message', onReceive);
	}, [socket, addMessageToConversation, refetchUnread]);

	

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
			// No timestamps. The server stamps them - a client-supplied one decides thread order
			// and unread state, neither of which may be caller-controlled. The local `newMessage`
			// above still carries them for the optimistic render only.
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
				message: msg.message,
				// The SERVER's timestamp, not the local one built above. This was omitted
				// entirely, which happened to look right - moment(undefined) means "now", and a
				// message you just sent really is from now - so the bug only showed up as the
				// message jumping to a different time on the next refetch. It also travels over
				// the socket to the other person, for whom "now" is not the same guess.
				createdAt: msg.createdAt,
				updatedAt: msg.updatedAt
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
						{loadingMessages && messages.length === 0 && (
							<div className="ibChatBoxLoading">Loading conversation...</div>
						)}
						{messages.map((message) => (
							<div key={message.id}>
								<IBMessage
									messageData={message}
									own={user.id === message.senderId}
								/>
							</div>
						))}
						{/* The scroll target. A zero-height element after the last message, rather
						    than the last message itself - a message can be taller than the visible
						    area, and scrolling it into view would land on its TOP, leaving the
						    newest text off screen. */}
						<div ref={bottomRef} />
					</div>
					<div className="ibChatBoxBottom">
						<IBMultilineInput
							id="addMessage"
							variant="outlined"
							inputRef={messageRef}
							disabled={isInputDisabled}
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
