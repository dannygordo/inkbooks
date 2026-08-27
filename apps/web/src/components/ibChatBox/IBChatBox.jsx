import { useApolloClient, useMutation } from "@apollo/client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, CircularProgress } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import SendIcon from "@mui/icons-material/Send";
import CloseIcon from "@mui/icons-material/Close";
import { useAuth } from "../../context/auth";
import MessengerService from "../../services/MessengerService";
import UtilsService from "../../services/UtilsService";
import { CacheService } from "../../services/CacheService";
import { apiUrl } from "../../utils/apiUrl";
import IBMessage from "../ibMessage/IBMessage";
import IBPageLoader from "../ibPageLoader/IBPageLoader";
import IBMultilineInput from "../inputs/IBMultilineInput";
import "./ibChatBox.css";
import { ObjectID } from "bson";
import ProjectService from "../../services/ProjectService";
import { io } from "socket.io-client";
import { APP_SETTINGS_CONSTANTS } from "../../constants";
import { useSocket } from "../../context/SocketProvider";

// Same allowlist as routes/messageUploads.js - kept in sync manually since the two run in
// different processes. A mismatch here just means the server rejects something the client
// thought was fine, not a security gap (the server's own fileFilter is the real enforcement).
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif";
const MAX_IMAGES_PER_MESSAGE = 5;

const IBChatBox = ({ widget, conversation, setActiveMessages, messages, isInputDisabled = false, loadingMessages = false }) => {
	const { user } = useAuth();
	const messageRef = useRef();
	const fileInputRef = useRef();
	//const scrollRef = useRef();
	const [arrivalMessage, setArrivalMessage] = useState(null);
	const [onlineUsers, setOnlineUsers] = useState([]);

	// Already-uploaded URLs waiting to go out on the next send - see routes/messageUploads.js.
	// Upload happens on file selection, not on send, so the compose box can show real thumbnails
	// (and a real per-file failure) before the person commits to sending anything.
	const [pendingImageUrls, setPendingImageUrls] = useState([]);
	const [uploadingImages, setUploadingImages] = useState(false);
	const [uploadError, setUploadError] = useState(null);

	// Tracked separately from messageRef's own uncontrolled value purely to enable/disable the
	// Send button below - the text field itself stays uncontrolled (messageRef is still what
	// handleSaveMessage actually reads on send). Without this, the only way to send an
	// image-only message was pressing Enter in an empty text field, which nothing on screen
	// suggested would do anything - see handleSaveMessage's own comment on why that shipped a
	// real bug (attached images that silently never sent).
	const [hasText, setHasText] = useState(false);

	const handleAttachClick = () => {
		fileInputRef.current?.click();
	};

	const handleFilesSelected = async (e) => {
		const files = Array.from(e.target.files || []);
		// Reset immediately so choosing the SAME file again later still fires onChange - a raw
		// file input only fires when its value actually changes.
		e.target.value = "";
		if (files.length === 0) {
			return;
		}
		if (pendingImageUrls.length + files.length > MAX_IMAGES_PER_MESSAGE) {
			setUploadError(`You can attach at most ${MAX_IMAGES_PER_MESSAGE} images per message.`);
			return;
		}
		setUploadError(null);
		setUploadingImages(true);
		try {
			const formData = new FormData();
			files.forEach((file) => formData.append("files", file));
			// Not through Apollo/GraphQL - same reasoning as Form file_upload fields and booking
			// intake photos (see FormFieldsRenderer.jsx): binary payloads go through a plain REST
			// route, never as a GraphQL variable. The Authorization header is built by hand here
			// because this is the one upload route that needs one (routes/messageUploads.js is
			// authenticated, unlike /form-uploads and /booking-uploads) - Apollo's own authLink
			// (see index.jsx) has no reach over a raw fetch like this one.
			//
			// CacheService.getItem("token") returns the whole stored user object
			// ({id, email, accessToken, ...}), not the raw JWT - the same shape index.jsx's own
			// authLink reads `.accessToken` off, and the same shape IBSquarePaymentForm.jsx's own
			// hand-built Authorization header reads `user.accessToken` off. Interpolating the bare
			// object here (as this line used to) stringifies it to the literal text
			// "[object Object]", which the server's jwt.verify rejects - every attachment upload
			// failed with "Invalid/expired token" for exactly this reason.
			const token = CacheService.getItem("token");
			const response = await fetch(apiUrl("message-uploads"), {
				method: "POST",
				headers: { Authorization: `Bearer ${token?.accessToken}` },
				body: formData,
			});
			const result = await response.json();
			if (!response.ok) {
				setUploadError(result?.error || "Upload failed.");
				return;
			}
			setPendingImageUrls((prev) => [...prev, ...(result.urls || [])]);
		} catch (err) {
			setUploadError("Upload failed. Check your connection and try again.");
		} finally {
			setUploadingImages(false);
		}
	};

	const handleRemovePendingImage = (url) => {
		setPendingImageUrls((prev) => prev.filter((u) => u !== url));
	};

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
			// The Booking Requests badge is deliberately NOT here. It counts requests awaiting a
			// decision, not unread messages, so a message arriving cannot change it - see
			// services/BookingRequestService.js. This used to refetch it, back when the two badges
			// measured the same thing.
			include: ["GetUnreadMessageCount", "GetConversationsByMemberId"],
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
		const messageText = messageRef.current.value;
		// Mirrors the server's own rule (utils/validation.js's createMessageInputSchema .refine) -
		// nothing to send if both are empty. Checked here too so a stray Enter on an empty,
		// image-less box doesn't round-trip to the server just to be told no.
		if (!messageText.trim() && pendingImageUrls.length === 0) {
			return;
		}
			const newMessage = {
			id: new ObjectID(),
			conversationId: conversation.id,
			senderId: user.id,
			message: messageText,
			imageUrls: pendingImageUrls,
			createdAt: UtilsService.formatDateToISO(Date.now()),
			updatedAt: UtilsService.formatDateToISO(Date.now()),
		};
		let savedMessage = {};

		addNewMessage({
		variables: {
			conversationId: newMessage.conversationId,
			senderId: newMessage.senderId,
			message: newMessage.message,
			imageUrls: newMessage.imageUrls,
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
				imageUrls: msg.imageUrls,
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
		// The DOM value is cleared above, but nothing re-fires onChange for an imperative clear -
		// without this the Send button would stay enabled (or the helper text stay styled as "has
		// text") after a message that just went out.
		setHasText(false);
		// Cleared on send, not before - the images just sent shouldn't linger as if still pending,
		// and clearing regardless of the mutation's outcome matches the text field's own behavior
		// above (no rollback-on-failure exists for that either today).
		setPendingImageUrls([]);
		setUploadError(null);

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
						{uploadError && <div className="ibChatBoxUploadError">{uploadError}</div>}
						<div className="ibChatBoxInputRow">
							<input
								ref={fileInputRef}
								type="file"
								accept={ACCEPTED_IMAGE_TYPES}
								multiple
								hidden
								onChange={handleFilesSelected}
							/>
							<IconButton
								size="small"
								className="ibChatBoxAttachButton"
								onClick={handleAttachClick}
								disabled={isInputDisabled || uploadingImages || pendingImageUrls.length >= MAX_IMAGES_PER_MESSAGE}
								aria-label="Attach image"
							>
								{uploadingImages ? <CircularProgress size={18} /> : <ImageIcon fontSize="small" />}
							</IconButton>
							{/* Thumbnails now render INSIDE this bordered wrapper, directly above the
							    text field, rather than in their own separate strip elsewhere on the
							    page - a queued image with no visible connection to "the thing you're
							    about to send" read as already-sent-and-lost when it wasn't sent at
							    all. ibChatBox.css strips the TextField's own outlined border inside
							    this wrapper so the two visually merge into one box. */}
							<div className="ibChatBoxComposeArea">
								{pendingImageUrls.length > 0 && (
									<div className="ibChatBoxPendingImages">
										{pendingImageUrls.map((url) => (
											<div key={url} className="ibChatBoxPendingImage">
												<img src={url} alt="Attachment preview" />
												<IconButton
													size="small"
													className="ibChatBoxRemovePendingImage"
													onClick={() => handleRemovePendingImage(url)}
													aria-label="Remove image"
												>
													<CloseIcon fontSize="inherit" />
												</IconButton>
											</div>
										))}
									</div>
								)}
								<IBMultilineInput
									id="addMessage"
									variant="outlined"
									inputRef={messageRef}
									disabled={isInputDisabled}
									className="chatMessageInput"
									helperText={
										pendingImageUrls.length > 0
											? "Press Enter or tap Send to send the image above"
											: "Type a message or attach an image, then press Enter or tap Send"
									}
									onChange={(e) => setHasText(!!e.target.value?.trim())}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleSaveMessage(e, e.target.value);
										}
									}}
								/>
							</div>
							{/* The only way to actually send used to be this exact Enter keydown above -
							    fine for a typed reply, but there was no discoverable way to send an
							    image-only message at all: nothing on screen said "press enter to send
							    the picture you just attached." An uploaded-but-never-sent image looked
							    like it had gone out (a thumbnail appeared) and then quietly vanished on
							    refresh, because nothing had actually been sent. A visible Send button
							    is the fix; Enter still works for anyone already used to it. */}
							<IconButton
								size="small"
								className="ibChatBoxSendButton"
								onClick={handleSaveMessage}
								disabled={isInputDisabled || uploadingImages || (!hasText && pendingImageUrls.length === 0)}
								aria-label="Send message"
							>
								<SendIcon fontSize="small" />
							</IconButton>
						</div>
					</div>
				</div>
			</div>
		);
	}
	return <div>wha happened</div>;
};

export default IBChatBox;
