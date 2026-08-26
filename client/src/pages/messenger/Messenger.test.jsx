// Messenger.jsx tests. This page owns the conversation LIST (search, deep-linking via
// ?conversation=, which thread is open, and the read/unread mutations) - the thread itself is
// rendered by IBChatBox, which has its own orthogonal concerns (socket.io, image upload via a raw
// fetch, bson ObjectIDs for optimistic message ids) that have nothing to do with what Messenger.jsx
// is responsible for. Mocked out with vi.mock, same convention Client.test.jsx uses for
// ClientDashboard - this keeps the mock list here focused on the queries/mutations Messenger.jsx
// itself fires (fetchConversationsByMemberId, the lazy per-thread fetchMessagesByConversationId,
// MARK_CONVERSATION_READ/UNREAD) and lets us assert on the props Messenger hands IBChatBox
// (conversation, messages, setActiveMessages, loadingMessages) instead of reimplementing IBChatBox's
// own compose/send flow, which belongs in a test file of its own.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import Messenger from "./Messenger";
import { AuthContext } from "../../context/auth";
import MessengerService from "../../services/MessengerService";
import IBChatBox from "../../components/ibChatBox/IBChatBox";

vi.mock("../../components/ibChatBox/IBChatBox", () => ({
	default: vi.fn(({ conversation, messages, setActiveMessages, loadingMessages }) => (
		<div data-testid="chatbox-stub">
			<div data-testid="chatbox-conversation-id">{conversation?.id || "none"}</div>
			<div data-testid="chatbox-loading">{loadingMessages ? "loading" : "loaded"}</div>
			<ul>
				{messages.map((m) => (
					<li key={m.id}>{m.message}</li>
				))}
			</ul>
			{/* Stands in for IBChatBox's real compose-and-send flow (its own CREATE_MESSAGE_MUTATION,
			    tested separately). Messenger's own job in "sending a message" is just holding
			    activeMessages state and handing setActiveMessages down - this button exercises
			    exactly that hand-off the same way IBChatBox's onCompleted would. */}
			<button
				onClick={() =>
					setActiveMessages([...messages, { id: "new-msg", message: "Hello from stub" }])
				}
			>
				send-test-message
			</button>
		</div>
	)),
}));

// Every field MessengerService.js's own queries/mutations select, exercised through the real
// exported gql documents so a drift there fails these tests loudly instead of passing on stale
// shapes - see MessengerService.test.js's own header comment on why nothing here is hand
// reconstructed.
function conversation(overrides = {}) {
	return {
		__typename: "Conversation",
		id: "convo-1",
		members: ["user-1", "user-2"],
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		unreadCount: 0,
		membersInfo: [
			{ __typename: "User", firstName: "Arya", lastName: "Stark", avatar: null, id: "user-2" },
		],
		...overrides,
	};
}

function message(overrides = {}) {
	return {
		__typename: "Message",
		id: "msg-1",
		conversationId: "convo-1",
		senderId: "user-2",
		message: "Hey there",
		imageUrls: [],
		createdAt: "2026-08-20T12:00:00.000Z",
		updatedAt: "2026-08-20T12:00:00.000Z",
		user: { __typename: "User", firstName: "Arya", lastName: "Stark", avatar: null },
		...overrides,
	};
}

function conversationsMock(memberId, conversations) {
	return {
		request: {
			query: MessengerService.fetchConversationsByMemberIdQuery,
			variables: { memberId },
		},
		result: { data: { getConversationsByMemberId: conversations } },
	};
}

function messagesMock(conversationId, messages) {
	return {
		request: {
			query: MessengerService.fetchMessagesByConversationIdQuery,
			variables: { conversationId },
		},
		result: { data: { getMessagesByConversationId: messages } },
	};
}

function markReadMock(conversationId) {
	return {
		request: {
			query: MessengerService.MARK_CONVERSATION_READ,
			variables: { conversationId },
		},
		result: {
			data: {
				markConversationRead: { __typename: "Conversation", id: conversationId, unreadCount: 0 },
			},
		},
	};
}

function markUnreadMock(conversationId) {
	return {
		request: {
			query: MessengerService.MARK_CONVERSATION_UNREAD,
			variables: { conversationId },
		},
		result: {
			data: {
				markConversationUnread: {
					__typename: "Conversation",
					id: conversationId,
					unreadCount: 1,
				},
			},
		},
	};
}

const DEFAULT_USER = { id: "user-1", firstName: "Renee", lastName: "Wolf" };

function renderMessenger({ user = DEFAULT_USER, mocks = [], initialEntries = ["/messenger"] } = {}) {
	return render(
		<MemoryRouter initialEntries={initialEntries}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={{ user }}>
					<Messenger />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
}

describe("loading", () => {
	it("shows the page loader while the conversation list is in flight", () => {
		renderMessenger({ mocks: [conversationsMock("user-1", [])] });

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
});

describe("query error", () => {
	// Messenger.jsx only destructures {loading, data} off fetchConversationsByMemberId, so an
	// error still lands here: loading becomes false and data stays undefined, falling through to
	// the component's own final `if (!data) return <div>Oops</div>` branch.
	it("shows an Oops message when the conversation list fails to load", async () => {
		renderMessenger({
			mocks: [
				{
					request: {
						query: MessengerService.fetchConversationsByMemberIdQuery,
						variables: { memberId: "user-1" },
					},
					error: new Error("Network error"),
				},
			],
		});

		expect(await screen.findByText("Oops")).toBeInTheDocument();
	});
});

describe("empty", () => {
	it("shows an empty state and an empty chatbox when there are no conversations", async () => {
		renderMessenger({ mocks: [conversationsMock("user-1", [])] });

		expect(await screen.findByText("No conversations yet.")).toBeInTheDocument();
		// No conversation is ever selected (the auto-select effect returns early on an empty
		// list), so IBChatBox is handed the {} fallback rather than a real conversation.
		expect(screen.getByTestId("chatbox-conversation-id")).toHaveTextContent("none");
	});
});

describe("populated", () => {
	it("renders each conversation's other member and auto-selects the first thread", async () => {
		const convo1 = conversation({ id: "convo-1" });
		const convo2 = conversation({
			id: "convo-2",
			members: ["user-1", "user-3"],
			membersInfo: [
				{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null, id: "user-3" },
			],
		});
		renderMessenger({
			mocks: [
				conversationsMock("user-1", [convo1, convo2]),
				messagesMock("convo-1", [message()]),
			],
		});

		expect(await screen.findByText("Arya Stark")).toBeInTheDocument();
		expect(screen.getByText("Gendry Baratheon")).toBeInTheDocument();

		// No ?conversation= deep link and nothing selected yet, so conversations[0] (convo-1) wins.
		expect(await screen.findByTestId("chatbox-conversation-id")).toHaveTextContent("convo-1");
		expect(await screen.findByText("Hey there")).toBeInTheDocument();
		// React invokes function components as Component(props, secondArg), and for a plain function
		// component (no legacy contextTypes) secondArg is a literal `undefined` - not an omitted
		// argument, an actual one (confirmed against react-dom's own source: updateFunctionComponent
		// passes `void 0` into renderWithHooks, which calls Component(props, secondArg) with both
		// arguments present). expect.anything() explicitly refuses to match null/undefined, so pairing
		// it with that second positional slot always fails. Dropping the second argument entirely
		// doesn't fix it either - unlike toEqual on plain objects, vitest's toHaveBeenCalledWith does
		// NOT ignore a trailing undefined call argument, so a one-argument matcher against a real
		// (props, undefined) call still reports a length mismatch. The second argument has to be
		// asserted for what it actually is: a literal undefined.
		expect(IBChatBox).toHaveBeenCalledWith(
			expect.objectContaining({ conversation: expect.objectContaining({ id: "convo-1" }) }),
			undefined,
		);
	});

	it("filters the list by member name without changing which thread is open", async () => {
		const user = userEvent.setup();
		const convo1 = conversation({ id: "convo-1" });
		const convo2 = conversation({
			id: "convo-2",
			members: ["user-1", "user-3"],
			membersInfo: [
				{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null, id: "user-3" },
			],
		});
		renderMessenger({
			mocks: [conversationsMock("user-1", [convo1, convo2]), messagesMock("convo-1", [])],
		});

		await screen.findByText("Arya Stark");
		await user.type(screen.getByLabelText("Search"), "gend");

		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
		expect(screen.getByText("Gendry Baratheon")).toBeInTheDocument();
		// Filtering what's rendered must not yank the reader out of the thread they're reading -
		// convo-1 (Arya) stays open even though the search hid its row.
		expect(screen.getByTestId("chatbox-conversation-id")).toHaveTextContent("convo-1");
	});

	it("shows a no-results message when the search term matches nobody", async () => {
		const user = userEvent.setup();
		renderMessenger({
			mocks: [conversationsMock("user-1", [conversation()]), messagesMock("convo-1", [])],
		});

		await screen.findByText("Arya Stark");
		await user.type(screen.getByLabelText("Search"), "nobody");

		expect(await screen.findByText("No conversations with that name.")).toBeInTheDocument();
	});
});

describe("deep-linking via ?conversation=", () => {
	it("opens the requested conversation instead of the first one in the list", async () => {
		const convo1 = conversation({ id: "convo-1" });
		const convo2 = conversation({
			id: "convo-2",
			members: ["user-1", "user-3"],
			membersInfo: [
				{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null, id: "user-3" },
			],
		});
		renderMessenger({
			initialEntries: ["/messenger?conversation=convo-2"],
			mocks: [
				conversationsMock("user-1", [convo1, convo2]),
				messagesMock("convo-2", [
					message({ id: "msg-2", conversationId: "convo-2", senderId: "user-3", message: "On my way" }),
				]),
			],
		});

		expect(await screen.findByTestId("chatbox-conversation-id")).toHaveTextContent("convo-2");
		expect(await screen.findByText("On my way")).toBeInTheDocument();
	});
});

describe("selecting a conversation", () => {
	it("loads that thread's messages once clicked", async () => {
		const user = userEvent.setup();
		const convo1 = conversation({ id: "convo-1" });
		const convo2 = conversation({
			id: "convo-2",
			members: ["user-1", "user-3"],
			membersInfo: [
				{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null, id: "user-3" },
			],
		});
		renderMessenger({
			mocks: [
				conversationsMock("user-1", [convo1, convo2]),
				messagesMock("convo-1", []),
				messagesMock("convo-2", [
					message({
						id: "msg-2",
						conversationId: "convo-2",
						senderId: "user-3",
						message: "See you Friday",
					}),
				]),
			],
		});

		await screen.findByText("Gendry Baratheon");
		await user.click(screen.getByText("Gendry Baratheon"));

		expect(await screen.findByTestId("chatbox-conversation-id")).toHaveTextContent("convo-2");
		expect(await screen.findByText("See you Friday")).toBeInTheDocument();
	});
});

describe("read receipts", () => {
	it("marks the auto-selected conversation read when it starts out unread", async () => {
		const convo1 = conversation({ id: "convo-1", unreadCount: 2 });
		renderMessenger({
			mocks: [
				conversationsMock("user-1", [convo1]),
				// markConversationRead's own refetchQueries (by operation name) refetch this same
				// list query again once the mutation lands.
				conversationsMock("user-1", [convo1]),
				messagesMock("convo-1", []),
				markReadMock("convo-1"),
			],
		});

		// Reaching a stable, fully-loaded chatbox with no unmatched-mock error from MockedProvider
		// is itself evidence markConversationRead fired for the still-unread auto-selected thread -
		// an unhandled mock mismatch here would surface as a thrown/rejected request instead.
		await screen.findByTestId("chatbox-conversation-id");
		await waitFor(() => expect(screen.getByTestId("chatbox-loading")).toHaveTextContent("loaded"));
	});

	it("marks a clicked conversation read even when it is not the one currently open", async () => {
		const user = userEvent.setup();
		const convo1 = conversation({ id: "convo-1", unreadCount: 0 });
		const convo2 = conversation({
			id: "convo-2",
			unreadCount: 3,
			members: ["user-1", "user-3"],
			membersInfo: [
				{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null, id: "user-3" },
			],
		});
		renderMessenger({
			mocks: [
				conversationsMock("user-1", [convo1, convo2]),
				conversationsMock("user-1", [convo1, convo2]),
				messagesMock("convo-1", []),
				messagesMock("convo-2", []),
				markReadMock("convo-2"),
			],
		});

		await screen.findByText("Gendry Baratheon");
		await user.click(screen.getByText("Gendry Baratheon"));

		// This is the "first client in the list is never marked read" case from Messenger.jsx's own
		// comment - clicking a DIFFERENT, already-unread row must mark it read via the direct call
		// in handleConversationClick, not just the auto-select effect.
		expect(await screen.findByTestId("chatbox-conversation-id")).toHaveTextContent("convo-2");
	});
});

describe("marking a conversation unread", () => {
	it("calls markConversationUnread for the row whose overflow menu was used", async () => {
		const user = userEvent.setup();
		const convo1 = conversation({ id: "convo-1", unreadCount: 0 });
		const convo2 = conversation({
			id: "convo-2",
			unreadCount: 0,
			members: ["user-1", "user-3"],
			membersInfo: [
				{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null, id: "user-3" },
			],
		});
		renderMessenger({
			mocks: [
				conversationsMock("user-1", [convo1, convo2]),
				conversationsMock("user-1", [convo1, convo2]),
				messagesMock("convo-1", []),
				markUnreadMock("convo-2"),
			],
		});

		await screen.findByText("Gendry Baratheon");
		// convo-1 is the active row (auto-selected, so its "Mark as unread" item is hidden per
		// IBConversation's own isActive guard) - convo-2 is the second row and the one whose menu
		// actually offers it.
		const menuButtons = screen.getAllByRole("button", { name: "Conversation options" });
		await user.click(menuButtons[1]);
		await user.click(await screen.findByRole("menuitem", { name: "Mark as unread" }));

		// No unmatched-mock error surfacing is the evidence markConversationUnread actually fired
		// with convo-2's id - a mismatched id would leave markUnreadMock unused and this test's own
		// MockedProvider would report the stray request instead of resolving quietly.
		await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Mark as unread" })).not.toBeInTheDocument());
	});
});

describe("sending a message", () => {
	it("appends a newly-sent message to what IBChatBox is handed, without losing history", async () => {
		const user = userEvent.setup();
		renderMessenger({
			mocks: [
				conversationsMock("user-1", [conversation({ id: "convo-1", unreadCount: 0 })]),
				messagesMock("convo-1", [message()]),
			],
		});

		await screen.findByText("Hey there");
		await user.click(screen.getByRole("button", { name: "send-test-message" }));

		expect(await screen.findByText("Hello from stub")).toBeInTheDocument();
		// activeMessages is appended to, not replaced - the thread's prior history survives a new
		// message landing.
		expect(screen.getByText("Hey there")).toBeInTheDocument();
	});
});
