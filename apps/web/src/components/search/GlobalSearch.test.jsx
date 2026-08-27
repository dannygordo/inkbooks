// GlobalSearch.jsx tests. SearchService exports SEARCH directly, so mocks below match the real
// document rather than a hand-copied one - same convention as SearchService.test.js and
// pages/search/Search.test.jsx (Search.jsx runs the same debounced-lazy-query shape this
// component does, just on a full page instead of an app-bar dropdown).
//
// Real timers throughout, not vi.useFakeTimers() - userEvent.type()'s own keystroke-by-keystroke
// dispatch doesn't compose cleanly with fake timers here, and the debounce is only 300ms, well
// inside findBy's default 1000ms polling window.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import SearchService from "../../services/SearchService";
import GlobalSearch from "./GlobalSearch";

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

function searchMock(query, result) {
	return {
		request: { query: SearchService.SEARCH, variables: { query } },
		result: { data: { search: result } },
	};
}

function LocationStub() {
	const location = useLocation();
	return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderSearch({ mocks = [] } = {}) {
	return render(
		<MockedProvider mocks={mocks}>
			<MemoryRouter initialEntries={["/"]}>
				<GlobalSearch />
				<Routes>
					<Route path="*" element={<LocationStub />} />
				</Routes>
			</MemoryRouter>
		</MockedProvider>,
	);
}

const CLIENT = {
	__typename: "Client",
	id: "client-1",
	avatar: null,
	firstName: "Arya",
	lastName: "Stark",
	email: "arya@example.com",
	phone: "555-0100",
	city: null,
	state: null,
};

describe("GlobalSearch", () => {
	it("does not run a query below the two-character minimum", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "a");

		// Nothing registered any mock, so if the component fired a query MockedProvider would
		// reject it - waiting a beat and finding no dropdown at all confirms it never tried.
		await new Promise((r) => setTimeout(r, 350));
		expect(screen.queryByText(/no results for/i)).not.toBeInTheDocument();
	});

	it("runs a debounced search once at least two characters are typed and shows grouped results", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ar", searchResult({ clients: [CLIENT] }))] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "ar");

		expect(await screen.findByText("Clients")).toBeInTheDocument();
		expect(screen.getByText("Arya Stark")).toBeInTheDocument();
		expect(screen.getByText("arya@example.com")).toBeInTheDocument();
	});

	it("shows a loading spinner while the debounced query is in flight", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ar", searchResult({ clients: [CLIENT] }))] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "ar");

		await waitFor(() => expect(document.querySelector(".globalSearchLoading")).toBeInTheDocument());
		await waitFor(() => expect(document.querySelector(".globalSearchLoading")).not.toBeInTheDocument());
	});

	it("shows an empty state when the search returns nothing in any group", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("zz", searchResult())] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "zz");

		expect(await screen.findByText(/no results for .zz./i)).toBeInTheDocument();
	});

	it("renders projects, messages, and images sections when present", async () => {
		const result = searchResult({
			projects: [
				{
					__typename: "Project",
					id: "project-1",
					title: "Half sleeve - koi",
					description: null,
					status: "in_progress",
					artist: null,
					client: null,
				},
			],
			messages: [
				{
					__typename: "Message",
					id: "msg-1",
					conversationId: "conv-1",
					message: "See you Tuesday for the touch up session",
					senderId: "user-1",
					user: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon", avatar: null },
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
					assignedProjectId: null,
					createdAt: "2026-01-01T00:00:00.000Z",
				},
			],
		});
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ko", result)] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "ko");

		expect(await screen.findByText("Half sleeve - koi")).toBeInTheDocument();
		expect(screen.getByText("Projects")).toBeInTheDocument();
		expect(screen.getByText("Messages")).toBeInTheDocument();
		expect(screen.getByText(/see you tuesday/i)).toBeInTheDocument();
		expect(screen.getByText("Shared Images")).toBeInTheDocument();
		expect(screen.getByText("Not yet filed to a project")).toBeInTheDocument();
	});

	it("clicking a client result navigates to that client and clears/closes the box", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ar", searchResult({ clients: [CLIENT] }))] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "ar");
		await user.click(await screen.findByText("Arya Stark"));

		expect(await screen.findByTestId("location")).toHaveTextContent("/client/client-1");
		expect(screen.getByPlaceholderText(/search clients, projects/i)).toHaveValue("");
	});

	it("pressing Enter goes to the full results page without clearing the input", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ar", searchResult({ clients: [CLIENT] }))] });

		const input = screen.getByPlaceholderText(/search clients, projects/i);
		await user.click(input);
		await user.type(input, "ar");
		await screen.findByText("Arya Stark");
		await user.keyboard("{Enter}");

		expect(await screen.findByTestId("location")).toHaveTextContent("/search?q=ar");
		expect(input).toHaveValue("ar");
	});

	it("clicking See all results navigates to the results page for the current query", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ar", searchResult({ clients: [CLIENT] }))] });

		await user.click(screen.getByPlaceholderText(/search clients, projects/i));
		await user.type(screen.getByPlaceholderText(/search clients, projects/i), "ar");
		await user.click(await screen.findByText(/see all results/i));

		expect(await screen.findByTestId("location")).toHaveTextContent("/search?q=ar");
	});

	it("Escape closes the dropdown", async () => {
		const user = userEvent.setup();
		renderSearch({ mocks: [searchMock("ar", searchResult({ clients: [CLIENT] }))] });

		const input = screen.getByPlaceholderText(/search clients, projects/i);
		await user.click(input);
		await user.type(input, "ar");
		await screen.findByText("Arya Stark");

		await user.keyboard("{Escape}");

		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
	});

	it("clears the box on blur to an unrelated element", async () => {
		const user = userEvent.setup();
		render(
			<MockedProvider mocks={[searchMock("ar", searchResult({ clients: [CLIENT] }))]}>
				<MemoryRouter initialEntries={["/"]}>
					<GlobalSearch />
					<button>outside</button>
				</MemoryRouter>
			</MockedProvider>,
		);

		const input = screen.getByPlaceholderText(/search clients, projects/i);
		await user.click(input);
		await user.type(input, "ar");
		await screen.findByText("Arya Stark");

		await user.click(screen.getByText("outside"));

		expect(input).toHaveValue("");
		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
	});
});
