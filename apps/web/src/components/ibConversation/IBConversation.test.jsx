// IBConversation.jsx tests. One row in the conversation list: the other member's avatar (with an
// unread badge), their name, an active/unread class on the row, and an optional overflow menu for
// "Mark as unread" (only offered when onMarkUnread is supplied, and hidden once already unread or
// on the currently-open row - see the component's own comments on both).
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBConversation from "./IBConversation";
import { AuthContext } from "../../context/auth";

const VIEWER = { id: "user-1" };

function conversation(overrides = {}) {
	return {
		id: "convo-1",
		membersInfo: [
			{ id: "user-1", firstName: "Ash", lastName: "Ketchum", avatar: null },
			{ id: "user-2", firstName: "Misty", lastName: "Waterflower", avatar: "https://cdn.example.com/misty.png" },
		],
		unreadCount: 0,
		...overrides,
	};
}

function renderRow({
	conversationData = conversation(),
	activeConversation = vi.fn(),
	isActive = false,
	onMarkUnread,
	user = VIEWER,
} = {}) {
	return render(
		<AuthContext.Provider value={{ user }}>
			<IBConversation
				conversation={conversationData}
				activeConversation={activeConversation}
				isActive={isActive}
				onMarkUnread={onMarkUnread}
			/>
		</AuthContext.Provider>,
	);
}

describe("no other member", () => {
	// Every conversation this component gets handed should have exactly one other member besides
	// the viewer, but a filter that finds none (a bad/empty membersInfo) has to degrade instead of
	// throwing.
	it("renders a not-found message instead of crashing", () => {
		renderRow({ conversationData: conversation({ membersInfo: [{ id: "user-1", firstName: "Ash", lastName: "Ketchum" }] }) });

		expect(screen.getByText("No Conversations Found")).toBeInTheDocument();
	});
});

describe("rendering the other member", () => {
	it("shows their name and avatar", () => {
		renderRow();

		expect(screen.getByText("Misty Waterflower")).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Misty Waterflower" })).toHaveAttribute(
			"src",
			"https://cdn.example.com/misty.png",
		);
	});

	it("adds the active class when isActive is true", () => {
		const { container } = renderRow({ isActive: true });
		expect(container.querySelector(".ibConversation")).toHaveClass("ibConversationActive");
	});

	it("omits the active class when isActive is false", () => {
		const { container } = renderRow({ isActive: false });
		expect(container.querySelector(".ibConversation")).not.toHaveClass("ibConversationActive");
	});

	it("adds the unread class and shows the badge count when unreadCount is greater than zero", () => {
		const { container } = renderRow({ conversationData: conversation({ unreadCount: 3 }) });

		expect(container.querySelector(".ibConversation")).toHaveClass("ibConversationUnread");
		expect(screen.getByText("3")).toBeInTheDocument();
	});

	it("omits the unread class when unreadCount is zero", () => {
		const { container } = renderRow({ conversationData: conversation({ unreadCount: 0 }) });
		expect(container.querySelector(".ibConversation")).not.toHaveClass("ibConversationUnread");
	});
});

describe("clicking the row", () => {
	it("opens the conversation via activeConversation", async () => {
		const user = userEvent.setup();
		const activeConversation = vi.fn();
		renderRow({ activeConversation });

		await user.click(screen.getByText("Misty Waterflower"));

		expect(activeConversation).toHaveBeenCalledWith(conversation());
	});
});

describe("the overflow menu", () => {
	it("is not rendered at all when onMarkUnread is not supplied", () => {
		renderRow({ onMarkUnread: undefined });

		expect(screen.queryByRole("button", { name: "Conversation options" })).not.toBeInTheDocument();
	});

	it("offers Mark as unread for an unopened, already-read conversation", async () => {
		const user = userEvent.setup();
		const onMarkUnread = vi.fn();
		renderRow({ onMarkUnread, isActive: false, conversationData: conversation({ unreadCount: 0 }) });

		await user.click(screen.getByRole("button", { name: "Conversation options" }));

		expect(await screen.findByRole("menuitem", { name: "Mark as unread" })).toBeInTheDocument();
	});

	it("hides Mark as unread when the conversation is already unread", async () => {
		const user = userEvent.setup();
		const onMarkUnread = vi.fn();
		renderRow({ onMarkUnread, isActive: false, conversationData: conversation({ unreadCount: 2 }) });

		await user.click(screen.getByRole("button", { name: "Conversation options" }));

		expect(screen.queryByRole("menuitem", { name: "Mark as unread" })).not.toBeInTheDocument();
	});

	it("hides Mark as unread on the currently-open conversation even if unread", async () => {
		const user = userEvent.setup();
		const onMarkUnread = vi.fn();
		renderRow({ onMarkUnread, isActive: true, conversationData: conversation({ unreadCount: 0 }) });

		await user.click(screen.getByRole("button", { name: "Conversation options" }));

		expect(screen.queryByRole("menuitem", { name: "Mark as unread" })).not.toBeInTheDocument();
	});

	it("calls onMarkUnread with the conversation and closes the menu, without opening the row", async () => {
		const user = userEvent.setup();
		const onMarkUnread = vi.fn();
		const activeConversation = vi.fn();
		renderRow({ onMarkUnread, activeConversation, isActive: false });

		await user.click(screen.getByRole("button", { name: "Conversation options" }));
		await user.click(await screen.findByRole("menuitem", { name: "Mark as unread" }));

		expect(onMarkUnread).toHaveBeenCalledWith(conversation());
		// Opening the menu (stopPropagation) and clicking the menu item must not also trigger the
		// row's own onClick - see the component's own comment on why openMenu stops propagation.
		expect(activeConversation).not.toHaveBeenCalled();
	});
});
