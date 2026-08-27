// MessengerService.js tests. Like ClientService.js, this is an IIFE exporting a mix of
// hook-factory functions wrapping useQuery/useLazyQuery/useMutation around a gql document, plus
// the underlying gql documents themselves - but unlike ClientService.js, EVERY query and mutation
// document here is separately exported (the "...Query" keys for queries, the mutations by their
// own names), so nothing needs to be hand-reconstructed for MockedProvider the way ClientService's
// unexported FETCH_CLIENT_QUERY did. Every mock below uses the real document straight off
// MessengerService itself.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling MessengerService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useQuery, useMutation } from "@apollo/client";
import { print } from "graphql";
import MessengerService from "./MessengerService";

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query/lazy-query-returning hook function produces. `hookFn` is called with
// no args and must itself close over any variables it needs - same pattern as ClientService's
// QueryHarness.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// These tests only need to know THAT a request errored (e.g. no mock matched, proving a
		// network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once
// it lands.
function MutationHarness({ document, variables }) {
	const [result, setResult] = React.useState(null);
	const [mutate] = useMutation(document, { onCompleted: setResult });
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

// ---- fetchProjectConversation / fetchProjectConversationQuery ---------------------------------

describe("MessengerService.fetchProjectConversation", () => {
	it("resolves with the project's conversation, including nested message senders", async () => {
		const conversation = {
			__typename: "Conversation",
			id: "convo-1",
			members: ["artist-1", "client-1"],
			messages: [
				{
					__typename: "Message",
					id: "msg-1",
					conversationId: "convo-1",
					senderId: "artist-1",
					message: "See you Friday",
					imageUrls: [],
					createdAt: "2026-08-01T00:00:00.000Z",
					updatedAt: "2026-08-01T00:00:00.000Z",
					user: {
						__typename: "User",
						firstName: "Gendry",
						lastName: "Baratheon",
						avatar: null,
						userInfo: { __typename: "UserInfo", firstName: "Gendry", lastName: "Baratheon", avatar: null },
					},
				},
			],
			createdAt: "2026-07-01T00:00:00.000Z",
			updatedAt: "2026-08-01T00:00:00.000Z",
		};

		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => MessengerService.fetchProjectConversation("artist-1", "client-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.fetchProjectConversationQuery,
								variables: { artistId: "artist-1", clientId: "client-1" },
							},
							result: { data: { getProjectConversation: conversation } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("See you Friday");
		expect(result).toHaveTextContent("Gendry");
	});
});

describe("MessengerService.fetchProjectConversationQuery (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same shape
	// a calling component reaching for the raw document (rather than the wrapped hook) would use -
	// this is the exact document _fetchProjectConversation itself runs internally.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(MessengerService.fetchProjectConversationQuery, {
						variables: { artistId: "artist-1", clientId: "client-1" },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.fetchProjectConversationQuery,
								variables: { artistId: "artist-1", clientId: "client-1" },
							},
							result: {
								data: {
									getProjectConversation: {
										__typename: "Conversation",
										id: "convo-1",
										members: ["artist-1", "client-1"],
										messages: [],
										createdAt: "2026-07-01T00:00:00.000Z",
										updatedAt: "2026-07-01T00:00:00.000Z",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("convo-1");
	});
});

// ---- fetchShopConversations / fetchShopConversationsQuery --------------------------------------

describe("MessengerService.fetchShopConversations", () => {
	it("resolves with the shop's conversations and their membersInfo", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => MessengerService.fetchShopConversations("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.fetchShopConversationsQuery,
								variables: { shopId: "shop-1" },
							},
							result: {
								data: {
									getConversationsByShopId: [
										{
											__typename: "Conversation",
											id: "convo-1",
											members: ["artist-1", "artist-2"],
											messages: [],
											membersInfo: [
												{ __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null },
											],
										},
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Gendry");
	});
});

// ---- fetchConversationsByMemberId / fetchConversationsByMemberIdQuery --------------------------

describe("MessengerService.fetchConversationsByMemberId", () => {
	// This is the "no message bodies on the list" query per the file's own comment - it selects
	// unreadCount and membersInfo but never `messages`. Locking that in guards against silently
	// reintroducing the expensive full-history fetch the comment describes.
	it("does not select the messages field", () => {
		const printed = print(MessengerService.fetchConversationsByMemberIdQuery);
		expect(printed).not.toContain("messages");
		expect(printed).toContain("unreadCount");
	});

	it("resolves with the member's conversations, each carrying its own unreadCount", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => MessengerService.fetchConversationsByMemberId("user-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.fetchConversationsByMemberIdQuery,
								variables: { memberId: "user-1" },
							},
							result: {
								data: {
									getConversationsByMemberId: [
										{
											__typename: "Conversation",
											id: "convo-1",
											members: ["user-1", "user-2"],
											createdAt: "2026-08-01T00:00:00.000Z",
											updatedAt: "2026-08-01T00:00:00.000Z",
											unreadCount: 3,
											membersInfo: [
												{ __typename: "User", firstName: "Arya", lastName: "Stark", avatar: null, id: "user-2" },
											],
										},
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"unreadCount":3');
		expect(result).toHaveTextContent("Arya");
	});
});

// ---- fetchMessagesByConversationId (lazy) / fetchMessagesByConversationIdQuery ------------------

describe("MessengerService.fetchMessagesByConversationId", () => {
	function LazyHarness({ conversationId }) {
		const [fetchMessages, { data, called }] = MessengerService.fetchMessagesByConversationId();
		return React.createElement(
			"div",
			null,
			React.createElement(
				"button",
				{ onClick: () => fetchMessages({ variables: { conversationId } }) },
				"go",
			),
			React.createElement("div", { "data-testid": "called" }, called ? "called" : "not-called"),
			data && React.createElement("div", { "data-testid": "result" }, JSON.stringify(data)),
		);
	}

	it("does not fire until the trigger is called", async () => {
		render(
			React.createElement(
				MockedProvider,
				{ mocks: [] },
				React.createElement(LazyHarness, { conversationId: "convo-1" }),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires the messages query for the given conversation once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.fetchMessagesByConversationIdQuery,
								variables: { conversationId: "convo-1" },
							},
							result: {
								data: {
									getMessagesByConversationId: [
										{
											__typename: "Message",
											id: "msg-1",
											conversationId: "convo-1",
											senderId: "artist-1",
											message: "Running 10 min late",
											imageUrls: [],
											createdAt: "2026-08-01T00:00:00.000Z",
											updatedAt: "2026-08-01T00:00:00.000Z",
											user: { __typename: "User", firstName: "Gendry", lastName: "Baratheon", avatar: null },
										},
									],
								},
							},
						},
					],
				},
				React.createElement(LazyHarness, { conversationId: "convo-1" }),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Running 10 min late");
	});
});

// ---- CREATE_MESSAGE_MUTATION --------------------------------------------------------------------

describe("MessengerService.CREATE_MESSAGE_MUTATION", () => {
	it("creates a message and the new row flows back", async () => {
		const user = userEvent.setup();
		const variables = {
			conversationId: "convo-1",
			senderId: "artist-1",
			message: "On my way",
			imageUrls: [],
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: MessengerService.CREATE_MESSAGE_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: MessengerService.CREATE_MESSAGE_MUTATION, variables },
							result: {
								data: {
									createMessage: {
										__typename: "Message",
										id: "msg-2",
										conversationId: "convo-1",
										senderId: "artist-1",
										message: "On my way",
										imageUrls: [],
										createdAt: "2026-08-21T00:00:00.000Z",
										updatedAt: "2026-08-21T00:00:00.000Z",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("On my way");
	});
});

// ---- useUnreadMessageCount / GET_UNREAD_MESSAGE_COUNT -------------------------------------------

describe("MessengerService.useUnreadMessageCount", () => {
	it("resolves with the caller's unread count, taking no arguments/variables", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => MessengerService.useUnreadMessageCount(),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: MessengerService.GET_UNREAD_MESSAGE_COUNT, variables: {} },
							result: { data: { getUnreadMessageCount: 4 } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"getUnreadMessageCount":4');
	});
});

// ---- MARK_CONVERSATION_READ / MARK_CONVERSATION_UNREAD ------------------------------------------

describe("MessengerService.MARK_CONVERSATION_READ", () => {
	it("marks a conversation read and its unreadCount resets", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: MessengerService.MARK_CONVERSATION_READ,
				variables: { conversationId: "convo-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.MARK_CONVERSATION_READ,
								variables: { conversationId: "convo-1" },
							},
							result: {
								data: {
									markConversationRead: { __typename: "Conversation", id: "convo-1", unreadCount: 0 },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"unreadCount":0');
	});
});

describe("MessengerService.MARK_CONVERSATION_UNREAD", () => {
	it("marks a conversation unread and its unreadCount reflects that", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: MessengerService.MARK_CONVERSATION_UNREAD,
				variables: { conversationId: "convo-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: MessengerService.MARK_CONVERSATION_UNREAD,
								variables: { conversationId: "convo-1" },
							},
							result: {
								data: {
									markConversationUnread: { __typename: "Conversation", id: "convo-1", unreadCount: 1 },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"unreadCount":1');
	});
});
