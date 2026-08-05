import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@apollo/client";
import { useSearchParams } from "react-router-dom";
import IBChatBox from "../../components/ibChatBox/IBChatBox";
import IBChatOnline from "../../components/ibChatOnline/IBChatOnline";
import IBConversation from "../../components/ibConversation/IBConversation";
import IBPageLoader from "../../components/ibPageLoader/IBPageLoader";
import IBMultilineInput from "../../components/inputs/IBMultilineInput";
import { useAuth } from "../../context/auth";
import MessengerService from "../../services/MessengerService";
import "./messenger.css";

const Messenger = () => {
	const { user } = useAuth();
	const { loading, data } = MessengerService.fetchConversationsByMemberId(user.id);
	const [searchParams, setSearchParams] = useSearchParams();

	// The ID is the state, not the conversation object.
	//
	// This used to hold the whole object, set once and never refreshed. Every later refetch - a new
	// message arriving, unread counts changing - updated the list while the open thread went on
	// showing the copy captured when it was first clicked. Holding the id and looking the object up
	// each render means the open conversation is always the current one.
	const [activeConversationId, setActiveConversationId] = useState(null);
	const [activeMessages, setActiveMessages] = useState([]);

	const [markConversationRead] = useMutation(MessengerService.MARK_CONVERSATION_READ, {
		// The sidebar badge is a separate query on a component that isn't re-rendered by this
		// mutation, so it has to be told. By operation name - see the same reasoning in
		// AppointmentService.CALENDAR_REFETCH_QUERIES, where naming variables instead is what made
		// the calendar stop refreshing.
		refetchQueries: ["GetUnreadMessageCount", "GetConversationsByMemberId"],
	});

	const conversations = useMemo(
		() => (data ? data.getConversationsByMemberId : []),
		[data],
	);

	// ?conversation=<id> is what the "new message" email links to, so an artist lands on the thread
	// rather than on whichever one happens to sort first.
	const requestedId = searchParams.get("conversation");

	// Selection happens in an effect, not during render. The previous version called
	// setActiveConversation() in the middle of the render body, which React warns about and which
	// re-enters render before the first one has finished.
	useEffect(() => {
		if (conversations.length === 0) {
			return;
		}
		const stillExists = conversations.some((c) => c.id === activeConversationId);
		if (stillExists) {
			return;
		}
		const requested = requestedId && conversations.find((c) => c.id === requestedId);
		setActiveConversationId(requested ? requested.id : conversations[0].id);
	}, [conversations, activeConversationId, requestedId]);

	const activeConversation = useMemo(
		() => conversations.find((c) => c.id === activeConversationId) || {},
		[conversations, activeConversationId],
	);

	// Whatever thread is open is read, by definition of being open.
	//
	// Keyed on the id plus the unread count so it fires again when a message arrives in the thread
	// you're already looking at - otherwise the first message of a conversation you have open would
	// sit there counted as unread until you clicked away and back.
	const activeUnread = activeConversation.unreadCount || 0;
	useEffect(() => {
		if (!activeConversationId || activeUnread === 0) {
			return;
		}
		markConversationRead({ variables: { conversationId: activeConversationId } }).catch(() => {
			// Deliberately swallowed. Failing to mark read leaves a badge up, which is a wrong
			// number rather than lost data, and an error toast over a notification count would be
			// louder than the problem.
		});
	}, [activeConversationId, activeUnread, markConversationRead]);

	// Follows the messages of whichever conversation is open, including across refetches.
	useEffect(() => {
		setActiveMessages(activeConversation.messages || []);
	}, [activeConversation]);

	const handleConversationClick = (conversation) => {
		setActiveConversationId(conversation.id);
		// Keeps the URL honest, so a reload or a back button returns to the same thread - and so
		// the deep-link effect above doesn't fight the click by re-selecting the emailed one.
		setSearchParams({ conversation: conversation.id }, { replace: true });
	};

	if (loading && !data) {
		return <IBPageLoader />;
	}

	if (!data) {
		return <div>Oops</div>;
	}

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
						{conversations.map((conversation) => (
							<IBConversation
								// The key was `${Date.now()}${conversation.id}`, which is a new key
								// on every render - so React threw away and rebuilt every row each
								// time, losing any state or animation in them for no benefit. A
								// conversation's id is already stable and unique.
								key={conversation.id}
								conversation={conversation}
								activeConversation={handleConversationClick}
								isActive={conversation.id === activeConversationId}
							/>
						))}
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
};

export default Messenger;
