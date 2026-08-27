// SearchService.js tests. Same convention as ClientService.test.js: the exports here are one raw
// gql document (SEARCH, exported directly - used verbatim below, never a hand-copied query) and
// one hook factory (useSearch) wrapping it in useLazyQuery with fetchPolicy: "network-only" - see
// that file's own comment on why it must be lazy (nothing to search until a keystroke) and why
// network-only specifically (a global search box re-querying the SAME text after data changed
// elsewhere should not silently serve a stale cached page).
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling SearchService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useQuery } from "@apollo/client";
import { print } from "graphql";
import SearchService from "./SearchService";

// ---- generic harness --------------------------------------------------------------------------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

function searchResult(overrides = {}) {
	return {
		__typename: "SearchResults",
		clients: [],
		projects: [],
		messages: [],
		images: [],
		...overrides,
	};
}

// ---- SearchService.SEARCH (raw document) ---------------------------------------------------------

describe("SearchService.SEARCH (raw document)", () => {
	it("works standalone via useQuery, grouping clients/projects/messages/images", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(SearchService.SEARCH, { variables: { query: "arya", limit: 10 } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SearchService.SEARCH, variables: { query: "arya", limit: 10 } },
							result: {
								data: {
									search: searchResult({
										clients: [
											{
												__typename: "Client",
												id: "client-1",
												avatar: null,
												firstName: "Arya",
												lastName: "Stark",
												email: "arya@example.com",
												phone: "555-0100",
												city: "Winterfell",
												state: "North",
											},
										],
										projects: [
											{
												__typename: "Project",
												id: "project-1",
												title: "Half sleeve - koi",
												description: "Full color koi",
												status: "in_progress",
												artist: { __typename: "Artist", id: "artist-1", firstName: "Gendry", lastName: "Baratheon", avatar: null },
												client: { __typename: "Client", id: "client-1", firstName: "Arya", lastName: "Stark" },
											},
										],
										messages: [
											{
												__typename: "Message",
												id: "msg-1",
												conversationId: "conv-1",
												message: "See you Tuesday",
												senderId: "user-artist-1",
												user: { __typename: "User", id: "user-artist-1", firstName: "Gendry", lastName: "Baratheon", avatar: null },
												createdAt: "2026-01-01T00:00:00.000Z",
											},
										],
										images: [
											{
												__typename: "SharedImage",
												id: "img-1",
												url: "https://example.com/img-1.jpg",
												clientId: "client-1",
												tags: ["koi"],
												assignedProjectId: "project-1",
												createdAt: "2026-01-01T00:00:00.000Z",
											},
										],
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Arya");
		expect(result).toHaveTextContent("Half sleeve - koi");
		expect(result).toHaveTextContent("See you Tuesday");
		expect(result).toHaveTextContent("img-1");
	});

	// Locks in the four grouped sections GlobalSearch.jsx's three-section dropdown (plus the fuller
	// /search page) depends on - a regression that dropped one of these would still "work" but
	// silently stop showing a whole section.
	it("selects all four result groups: clients, projects, messages, images", () => {
		const printed = print(SearchService.SEARCH);
		expect(printed).toContain("clients");
		expect(printed).toContain("projects");
		expect(printed).toContain("messages");
		expect(printed).toContain("images");
	});
});

// ---- SearchService.useSearch (lazy query) ----------------------------------------------------

describe("SearchService.useSearch", () => {
	function LazySearchHarness() {
		const [search, { data, error, called }] = SearchService.useSearch();
		return React.createElement(
			"div",
			null,
			React.createElement(
				"button",
				{ onClick: () => search({ variables: { query: "arya", limit: 10 } }) },
				"search",
			),
			React.createElement("div", { "data-testid": "called" }, called ? "called" : "not-called"),
			error && React.createElement("div", { "data-testid": "error" }, "ERROR"),
			data && React.createElement("div", { "data-testid": "result" }, JSON.stringify(data)),
		);
	}

	it("does not fire until the trigger is called", async () => {
		render(
			React.createElement(MockedProvider, { mocks: [] }, React.createElement(LazySearchHarness)),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires SEARCH with the given query and limit once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SearchService.SEARCH, variables: { query: "arya", limit: 10 } },
							result: {
								data: {
									search: searchResult({
										clients: [
											{
												__typename: "Client",
												id: "client-1",
												avatar: null,
												firstName: "Arya",
												lastName: "Stark",
												email: "arya@example.com",
												phone: "555-0100",
												city: "Winterfell",
												state: "North",
											},
										],
									}),
								},
							},
						},
					],
				},
				React.createElement(LazySearchHarness),
			),
		);

		await user.click(screen.getByRole("button", { name: "search" }));

		expect(await screen.findByTestId("result")).toHaveTextContent("Arya");
		expect(screen.getByTestId("called")).toHaveTextContent("called");
	});

	// fetchPolicy: "network-only" is the whole point of this wrapper per SearchService.js's own
	// comment - it must re-hit the network on every trigger rather than quietly resolving from
	// Apollo's cache. Proven here by registering TWO mocks for the identical request and firing the
	// trigger twice: with the default cache-first policy, the second call would resolve instantly
	// from the cache and never touch the second mock, so seeing the second mock's DISTINCT result
	// land is what confirms network-only actually reached useLazyQuery.
	it("re-hits the network on a second identical call instead of serving a cached result", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: SearchService.SEARCH, variables: { query: "arya", limit: 10 } },
							result: {
								data: {
									search: searchResult({
										clients: [{ __typename: "Client", id: "client-1", avatar: null, firstName: "Arya", lastName: "Stark", email: "arya@example.com", phone: "555-0100", city: "Winterfell", state: "North" }],
									}),
								},
							},
						},
						{
							request: { query: SearchService.SEARCH, variables: { query: "arya", limit: 10 } },
							result: {
								data: {
									search: searchResult({
										clients: [{ __typename: "Client", id: "client-1", avatar: null, firstName: "Arya", lastName: "Stark", email: "arya@example.com", phone: "555-0100", city: "Winterfell", state: "North" }],
										// Only present on the SECOND mock's result - seeing this appear after the
										// second click proves the request actually went back out over the network.
										projects: [{ __typename: "Project", id: "project-9", title: "Freshly re-fetched project", description: null, status: "in_progress", artist: null, client: null }],
									}),
								},
							},
						},
					],
				},
				React.createElement(LazySearchHarness),
			),
		);

		await user.click(screen.getByRole("button", { name: "search" }));
		expect(await screen.findByTestId("result")).toHaveTextContent("Arya");
		expect(screen.getByTestId("result")).not.toHaveTextContent("Freshly re-fetched project");

		await user.click(screen.getByRole("button", { name: "search" }));
		await waitFor(() => {
			expect(screen.getByTestId("result")).toHaveTextContent("Freshly re-fetched project");
		});
	});
});
