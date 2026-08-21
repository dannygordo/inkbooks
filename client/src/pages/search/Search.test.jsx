// Search.jsx tests. Focused on the one thing this page's state model is easy to get wrong: `?q=`
// is the input of record, and it has to keep driving the box after mount, not only at it.
// SearchService exports SEARCH directly, so the mocks below match the real document rather than a
// hand-copied one (same as SearchService.test.js).
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import SearchService from "../../services/SearchService";
import Search from "./Search";

const RESULTS_LIMIT = 25;

function searchMock(query, clients) {
	return {
		request: { query: SearchService.SEARCH, variables: { query, limit: RESULTS_LIMIT } },
		result: {
			data: {
				search: {
					__typename: "SearchResults",
					clients: clients.map((c) => ({
						__typename: "Client",
						avatar: null,
						email: `${c.firstName.toLowerCase()}@example.com`,
						phone: null,
						city: null,
						state: null,
						...c,
					})),
					projects: [],
					messages: [],
					images: [],
				},
			},
		},
	};
}

// Stands in for the app bar's GlobalSearch: navigates to /search?q=… from OUTSIDE this page while
// the page itself stays mounted, which is exactly what the real one does (goToResultsPage) and
// exactly the case a mount-only useState(searchParams.get("q")) misses.
function HeaderSearchStub({ to }) {
	const navigate = useNavigate();
	return (
		<button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(to)}`)}>
			header search
		</button>
	);
}

function renderSearch({ initialQuery, headerQuery, mocks }) {
	return render(
		<MockedProvider mocks={mocks}>
			<MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(initialQuery)}`]}>
				<Routes>
					<Route
						path="/search"
						element={
							<>
								<HeaderSearchStub to={headerQuery} />
								<Search />
							</>
						}
					/>
				</Routes>
			</MemoryRouter>
		</MockedProvider>
	);
}

describe("Search page", () => {
	it("runs the query in ?q= on arrival, without waiting out the debounce", async () => {
		renderSearch({
			initialQuery: "animal",
			headerQuery: "dragon",
			mocks: [searchMock("animal", [{ id: "c1", firstName: "Ann", lastName: "Animalson" }])],
		});

		expect(screen.getByPlaceholderText(/Search clients, projects/i)).toHaveValue("animal");
		expect(await screen.findByText("Ann Animalson")).toBeInTheDocument();
	});

	it("re-searches when ?q= changes from the app bar while the page is already open", async () => {
		const user = userEvent.setup();
		renderSearch({
			initialQuery: "animal",
			headerQuery: "dragon",
			mocks: [
				searchMock("animal", [{ id: "c1", firstName: "Ann", lastName: "Animalson" }]),
				searchMock("dragon", [{ id: "c2", firstName: "Drew", lastName: "Dragonetti" }]),
			],
		});

		expect(await screen.findByText("Ann Animalson")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /header search/i }));

		// The box follows the URL...
		await waitFor(() =>
			expect(screen.getByPlaceholderText(/Search clients, projects/i)).toHaveValue("dragon")
		);
		// ...and so do the results, which is the whole bug: same route, so this component is
		// re-rendered rather than remounted, and the old term used to survive both.
		expect(await screen.findByText("Drew Dragonetti")).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByText("Ann Animalson")).not.toBeInTheDocument());
	});
});
