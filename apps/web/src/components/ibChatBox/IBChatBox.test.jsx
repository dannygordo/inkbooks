// IBChatBox.jsx tests. The thread pane: message list + scroll-to-bottom, image attach/upload
// (a raw authenticated fetch to /message-uploads, not GraphQL - see the component's own header
// comment), compose/send (CREATE_MESSAGE_MUTATION + a socket emit to the recipients), and a
// socket listener that appends an incoming message and refetches the unread badges.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import IBChatBox from "./IBChatBox";
import { AuthContext } from "../../context/auth";
import MessengerService from "../../services/MessengerService";
import { CacheService } from "../../services/CacheService";

// Deterministic stand-in for bson's ObjectID - see Project.test.jsx's own comment on why the
// whole module is replaced rather than exercised for real (a real ObjectID's internal shape can't
// be reconstructed by hand, and it isn't part of CREATE_MESSAGE_MUTATION's variables anyway - it
// only ever backs the local optimistic message built before the server responds).
vi.mock("bson", () => ({
	ObjectID: function () {
		return { value: "optimistic-id" };
	},
}));

// useSocket is mocked at the module boundary rather than rendered through a real SocketProvider
// (which would need "socket.io-client" mocked too, same as SocketProvider.test.jsx) - this lets
// each test both emit into the component (simulating a server push) and assert on what the
// component itself emits out.
const { mockSocket, socketHandlers } = vi.hoisted(() => {
	const handlers = {};
	return {
		socketHandlers: handlers,
		mockSocket: {
			on: vi.fn((event, cb) => {
				handlers[event] = cb;
			}),
			off: vi.fn(),
			emit: vi.fn(),
		},
	};
});

vi.mock("../../context/SocketProvider", () => ({
	useSocket: () => mockSocket,
}));

const USER = {
	id: "user-1",
	firstName: "Ash",
	lastName: "Ketchum",
	avatar: "https://cdn.example.com/ash.png",
};

function conversation(overrides = {}) {
	return {
		id: "convo-1",
		members: ["user-1", "user-2"],
		...overrides,
	};
}

function message(overrides = {}) {
	return {
		id: "msg-1",
		senderId: "user-2",
		message: "Hey there",
		imageUrls: [],
		createdAt: "2026-08-20T12:00:00.000Z",
		updatedAt: "2026-08-20T12:00:00.000Z",
		user: { firstName: "Misty", lastName: "Waterflower", avatar: null },
		...overrides,
	};
}

function createMessageMock(variables, response) {
	return {
		request: { query: MessengerService.CREATE_MESSAGE_MUTATION, variables },
		result: { data: { createMessage: response } },
	};
}

function renderChatBox({
	widget = false,
	conversationData = conversation(),
	messages = [],
	setActiveMessages = vi.fn(),
	isInputDisabled = false,
	loadingMessages = false,
	mocks = [],
	user = USER,
} = {}) {
	const utils = render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user }}>
				<IBChatBox
					widget={widget}
					conversation={conversationData}
					setActiveMessages={setActiveMessages}
					messages={messages}
					isInputDisabled={isInputDisabled}
					loadingMessages={loadingMessages}
				/>
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { ...utils, setActiveMessages };
}

beforeEach(() => {
	localStorage.clear();
	CacheService.setItem("token", JSON.stringify({ accessToken: "test-access-token" }));
	mockSocket.on.mockClear();
	mockSocket.off.mockClear();
	mockSocket.emit.mockClear();
	global.fetch = vi.fn();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("no conversation", () => {
	it("renders the fallback instead of crashing", () => {
		render(
			<MockedProvider mocks={[]}>
				<AuthContext.Provider value={{ user: USER }}>
					<IBChatBox
						widget={false}
						conversation={null}
						setActiveMessages={vi.fn()}
						messages={[]}
					/>
				</AuthContext.Provider>
			</MockedProvider>,
		);

		expect(screen.getByText("wha happened")).toBeInTheDocument();
	});
});

describe("message list", () => {
	it("renders each message and marks the viewer's own message differently from someone else's", () => {
		const { container } = renderChatBox({
			messages: [
				message({ id: "msg-1", senderId: "user-2", message: "Hey there" }),
				message({ id: "msg-2", senderId: "user-1", message: "Hey back", user: USER }),
			],
		});

		expect(screen.getByText("Hey there")).toBeInTheDocument();
		expect(screen.getByText("Hey back")).toBeInTheDocument();
		const bubbles = container.querySelectorAll(".ibMessage");
		expect(bubbles[0]).not.toHaveClass("own");
		expect(bubbles[1]).toHaveClass("own");
	});

	it("shows a loading line only while messages are empty and still loading", () => {
		const { rerender } = renderChatBox({ messages: [], loadingMessages: true });
		expect(screen.getByText("Loading conversation...")).toBeInTheDocument();

		rerender(
			<MockedProvider mocks={[]}>
				<AuthContext.Provider value={{ user: USER }}>
					<IBChatBox
						widget={false}
						conversation={conversation()}
						setActiveMessages={vi.fn()}
						messages={[message()]}
						loadingMessages={true}
					/>
				</AuthContext.Provider>
			</MockedProvider>,
		);
		expect(screen.queryByText("Loading conversation...")).not.toBeInTheDocument();
	});
});

describe("disabled input", () => {
	it("disables the text field, attach button and send button", () => {
		renderChatBox({ isInputDisabled: true });

		expect(screen.getByRole("textbox")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Attach image" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
	});
});

describe("send button enablement", () => {
	it("stays disabled with no text and no pending images, then enables once text is typed", async () => {
		const user = userEvent.setup();
		renderChatBox();

		const sendButton = screen.getByRole("button", { name: "Send message" });
		expect(sendButton).toBeDisabled();

		await user.type(screen.getByRole("textbox"), "Hello");
		expect(sendButton).not.toBeDisabled();
	});
});

describe("sending a text message", () => {
	it("fires the mutation, appends the returned message, and emits it to the other recipients", async () => {
		const user = userEvent.setup();
		const setActiveMessages = vi.fn();
		const mock = createMessageMock(
			{
				conversationId: "convo-1",
				senderId: "user-1",
				message: "On my way",
				imageUrls: [],
			},
			{
				id: "msg-new",
				conversationId: "convo-1",
				senderId: "user-1",
				message: "On my way",
				imageUrls: [],
				createdAt: "2026-08-26T00:00:00.000Z",
				updatedAt: "2026-08-26T00:00:00.000Z",
			},
		);
		renderChatBox({ setActiveMessages, mocks: [mock] });

		await user.type(screen.getByRole("textbox"), "On my way");
		await user.click(screen.getByRole("button", { name: "Send message" }));

		await waitFor(() => expect(setActiveMessages).toHaveBeenCalled());
		const lastCallList = setActiveMessages.mock.calls[setActiveMessages.mock.calls.length - 1][0];
		expect(lastCallList[lastCallList.length - 1]).toEqual(
			expect.objectContaining({ id: "msg-new", message: "On my way", senderId: "user-1" }),
		);

		expect(mockSocket.emit).toHaveBeenCalledWith(
			"send-message",
			expect.objectContaining({
				recipients: ["user-2"],
				savedMessage: expect.objectContaining({ id: "msg-new", message: "On my way" }),
			}),
		);

		// The field clears and the Send button goes back to disabled once the send completes.
		expect(screen.getByRole("textbox")).toHaveValue("");
	});

	it("also sends on Enter in the text field", async () => {
		const user = userEvent.setup();
		const setActiveMessages = vi.fn();
		const mock = createMessageMock(
			{
				conversationId: "convo-1",
				senderId: "user-1",
				message: "Enter works too",
				imageUrls: [],
			},
			{
				id: "msg-enter",
				conversationId: "convo-1",
				senderId: "user-1",
				message: "Enter works too",
				imageUrls: [],
				createdAt: "2026-08-26T00:00:00.000Z",
				updatedAt: "2026-08-26T00:00:00.000Z",
			},
		);
		renderChatBox({ setActiveMessages, mocks: [mock] });

		await user.type(screen.getByRole("textbox"), "Enter works too{Enter}");

		await waitFor(() => expect(setActiveMessages).toHaveBeenCalled());
	});

	it("does not send on an empty box with no pending images", async () => {
		const user = userEvent.setup();
		const setActiveMessages = vi.fn();
		renderChatBox({ setActiveMessages, mocks: [] });

		await user.type(screen.getByRole("textbox"), "{Enter}");

		expect(setActiveMessages).not.toHaveBeenCalled();
	});
});

describe("attaching images", () => {
	function pngFile(name = "photo.png") {
		return new File(["fake-bytes"], name, { type: "image/png" });
	}

	function hiddenFileInput(container) {
		return container.querySelector('input[type="file"]');
	}

	it("clicking the attach button opens the hidden file picker", async () => {
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
		const user = userEvent.setup();
		renderChatBox();

		await user.click(screen.getByRole("button", { name: "Attach image" }));

		expect(clickSpy).toHaveBeenCalled();
	});

	it("uploads a selected image with the bearer token and shows a thumbnail", async () => {
		global.fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ urls: ["https://cdn.example.com/uploaded.png"] }),
		});
		const user = userEvent.setup();
		const { container } = renderChatBox();

		await user.upload(hiddenFileInput(container), pngFile());

		await waitFor(() =>
			expect(screen.getByAltText("Attachment preview")).toHaveAttribute(
				"src",
				"https://cdn.example.com/uploaded.png",
			),
		);
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("message-uploads"),
			expect.objectContaining({
				method: "POST",
				headers: { Authorization: "Bearer test-access-token" },
			}),
		);
		// With an image pending but no text, Send is enabled and the helper text changes to match.
		expect(screen.getByRole("button", { name: "Send message" })).not.toBeDisabled();
		expect(
			screen.getByText("Press Enter or tap Send to send the image above"),
		).toBeInTheDocument();
	});

	it("shows the server's error message when the upload response isn't ok", async () => {
		global.fetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "File too large" }),
		});
		const user = userEvent.setup();
		const { container } = renderChatBox();

		await user.upload(hiddenFileInput(container), pngFile());

		expect(await screen.findByText("File too large")).toBeInTheDocument();
	});

	it("shows a generic error when the upload request itself fails", async () => {
		global.fetch.mockRejectedValueOnce(new Error("network down"));
		const user = userEvent.setup();
		const { container } = renderChatBox();

		await user.upload(hiddenFileInput(container), pngFile());

		expect(
			await screen.findByText("Upload failed. Check your connection and try again."),
		).toBeInTheDocument();
	});

	it("rejects selecting more than five images without ever calling fetch", async () => {
		const user = userEvent.setup();
		const { container } = renderChatBox();

		const files = Array.from({ length: 6 }, (_, i) => pngFile(`photo-${i}.png`));
		await user.upload(hiddenFileInput(container), files);

		expect(
			await screen.findByText("You can attach at most 5 images per message."),
		).toBeInTheDocument();
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("removes a pending image when its own remove button is clicked", async () => {
		global.fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ urls: ["https://cdn.example.com/uploaded.png"] }),
		});
		const user = userEvent.setup();
		const { container } = renderChatBox();

		await user.upload(hiddenFileInput(container), pngFile());
		await screen.findByAltText("Attachment preview");

		await user.click(screen.getByRole("button", { name: "Remove image" }));

		expect(screen.queryByAltText("Attachment preview")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
	});
});

describe("receiving a message over the socket", () => {
	it("registers a receive-message listener and appends what it delivers", async () => {
		const setActiveMessages = vi.fn();
		renderChatBox({
			setActiveMessages,
			messages: [message({ id: "msg-1", message: "Hey there" })],
		});

		expect(mockSocket.on).toHaveBeenCalledWith("receive-message", expect.any(Function));

		const incoming = { message: message({ id: "msg-2", message: "Live push" }) };
		socketHandlers["receive-message"](incoming);

		expect(setActiveMessages).toHaveBeenCalledWith([
			expect.objectContaining({ id: "msg-1" }),
			expect.objectContaining({ id: "msg-2", message: "Live push" }),
		]);
	});
});
