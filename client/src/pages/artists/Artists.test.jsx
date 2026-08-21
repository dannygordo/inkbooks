// Artists.jsx tests. The list page pairs with ArtistService.js (see ArtistService.test.js) -
// fetchArtists() builds its FETCH_ARTISTS_QUERY inline and never exports it, so it's reconstructed
// here verbatim from ArtistService.js, the same technique ArtistService.test.js and
// FormsPanel.test.jsx already use: MockedProvider matches a request by the document's printed
// shape plus variables, not by reference identity, so a same-shape copy still fails loudly (an
// Apollo "no matching mock" error) if the real query in ArtistService.js ever drifts from what's
// copied here.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import Artists from "./Artists";
import { AuthContext } from "../../context/auth";
import { ROLES, ARTIST_STATUS } from "../../constants";
import UtilsService from "../../services/UtilsService";

const FETCH_ARTISTS_QUERY = gql`
	query GetArtists($includeArchived: Boolean, $page: PageInput) {
		getArtists(includeArchived: $includeArchived, page: $page) {
			items {
				id
				firstName
				lastName
				email
				title
				phone
				address
				city
				state
				zip
				instagram
				facebook
				avatar
				startDate
				hourlyRate
				shopId
				userId
				status
				user {
					avatar
				}
			}
			pageInfo {
				totalCount
				hasMore
				limit
				offset
			}
		}
	}
`;

function artistItem(overrides = {}) {
	return {
		__typename: "Artist",
		id: "artist-1",
		firstName: "Renee",
		lastName: "Wolf",
		email: "renee@example.com",
		title: "Tattoo Artist",
		phone: "5555550123",
		address: null,
		city: null,
		state: null,
		zip: null,
		instagram: "renee.ink",
		facebook: null,
		avatar: null,
		startDate: null,
		hourlyRate: null,
		shopId: null,
		userId: "user-1",
		status: ARTIST_STATUS.ACTIVE,
		user: { __typename: "User", avatar: null },
		...overrides,
	};
}

function artistsMock({ includeArchived = false, page = { limit: 50, offset: 0 }, items = [artistItem()], pageInfoOverrides = {} } = {}) {
	const totalCount = pageInfoOverrides.totalCount ?? items.length;
	return {
		request: { query: FETCH_ARTISTS_QUERY, variables: { includeArchived, page } },
		result: {
			data: {
				getArtists: {
					__typename: "ArtistPage",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount,
						hasMore: false,
						limit: page.limit,
						offset: page.offset,
						...pageInfoOverrides,
					},
				},
			},
		},
	};
}

const SHOP_ADMIN_USER = { role: ROLES.SHOP_ADMIN, id: "admin-1" };
const ARTIST_USER = { role: ROLES.ARTIST, id: "artist-viewer" };

function renderArtists({ user = SHOP_ADMIN_USER, mocks = [], routes } = {}) {
	const setModal = vi.fn();
	const authValue = { user, setModal, modal: { isOpen: false, title: "", content: "" } };

	if (routes) {
		render(
			<MemoryRouter initialEntries={["/artists"]}>
				<MockedProvider mocks={mocks}>
					<AuthContext.Provider value={authValue}>
						<Routes>
							<Route path="/artists" element={<Artists />} />
							{routes}
						</Routes>
					</AuthContext.Provider>
				</MockedProvider>
			</MemoryRouter>,
		);
	} else {
		render(
			<MemoryRouter>
				<MockedProvider mocks={mocks}>
					<AuthContext.Provider value={authValue}>
						<Artists />
					</AuthContext.Provider>
				</MockedProvider>
			</MemoryRouter>,
		);
	}
	return { setModal };
}

describe("Artists loading and empty states", () => {
	it("shows the page loader while the artists query is in flight", () => {
		renderArtists({ mocks: [artistsMock()] });
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	it("shows the empty message when the shop has no artists", async () => {
		renderArtists({ mocks: [artistsMock({ items: [] })] });
		expect(await screen.findByText("No artists at this shop yet.")).toBeInTheDocument();
	});
});

describe("Artists populated list", () => {
	it("renders each artist's row with its declared columns", async () => {
		const formattedPhone = UtilsService.formatPhone("5555550123");
		renderArtists({
			mocks: [
				artistsMock({
					items: [
						artistItem({
							id: "artist-1",
							firstName: "Renee",
							lastName: "Wolf",
							title: "Tattoo Artist",
							email: "renee@example.com",
							phone: "5555550123",
							instagram: "renee.ink",
							facebook: "renee.wolf.tattoo",
						}),
					],
				}),
			],
		});

		expect(await screen.findByText("Renee Wolf")).toBeInTheDocument();
		expect(screen.getByText("Tattoo Artist")).toBeInTheDocument();
		expect(screen.getByText("renee@example.com")).toBeInTheDocument();
		expect(screen.getByText(formattedPhone)).toBeInTheDocument();
		expect(screen.getByText("renee.ink")).toBeInTheDocument();
		expect(screen.getByText("renee.wolf.tattoo")).toBeInTheDocument();
		// Active artists carry no "Archived" tag.
		expect(screen.queryByText("Archived")).not.toBeInTheDocument();
	});

	it("labels an archived artist's row without hiding it, once the toggle is on", async () => {
		renderArtists({
			mocks: [
				artistsMock({ items: [] }),
				artistsMock({
					includeArchived: true,
					items: [artistItem({ id: "artist-2", firstName: "Old", lastName: "Timer", status: ARTIST_STATUS.ARCHIVED })],
				}),
			],
		});

		await screen.findByText("No artists at this shop yet.");
		const user = userEvent.setup();
		await user.click(screen.getByRole("checkbox", { name: "Show archived" }));

		expect(await screen.findByText("Old Timer")).toBeInTheDocument();
		expect(screen.getByText("Archived")).toBeInTheDocument();
	});
});

describe("Artists paging and filtering interactions", () => {
	it("resets to the first page when the archived filter is toggled after paging forward", async () => {
		const user = userEvent.setup();
		renderArtists({
			mocks: [
				artistsMock({
					page: { limit: 50, offset: 0 },
					items: [artistItem({ id: "artist-1", firstName: "Page", lastName: "One" })],
					pageInfoOverrides: { totalCount: 120, hasMore: true },
				}),
				artistsMock({
					page: { limit: 50, offset: 50 },
					items: [artistItem({ id: "artist-2", firstName: "Page", lastName: "Two" })],
					pageInfoOverrides: { totalCount: 120, hasMore: true, offset: 50 },
				}),
				artistsMock({
					includeArchived: true,
					page: { limit: 50, offset: 0 },
					items: [artistItem({ id: "artist-3", firstName: "Back", lastName: "ToStart" })],
				}),
			],
		});

		await screen.findByText("Page One");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await screen.findByText("Page Two");

		await user.click(screen.getByRole("checkbox", { name: "Show archived" }));

		// Reaching the third mock's data at all (rather than an Apollo "no matching mock" error)
		// IS the assertion that toggling the filter re-requested offset 0, not offset 50.
		expect(await screen.findByText("Back ToStart")).toBeInTheDocument();
	});

	it("changes the page size and resets to the first page", async () => {
		const user = userEvent.setup();
		renderArtists({
			mocks: [
				artistsMock({ page: { limit: 50, offset: 0 } }),
				artistsMock({
					page: { limit: 10, offset: 0 },
					items: [artistItem({ id: "artist-9", firstName: "Smaller", lastName: "Page" })],
				}),
			],
		});

		await screen.findByText("Renee Wolf");
		const sizeSelect = screen.getByLabelText("Show");
		await user.selectOptions(sizeSelect, "10");

		expect(await screen.findByText("Smaller Page")).toBeInTheDocument();
	});

	it("navigates to the artist's detail page when a row is clicked", async () => {
		const user = userEvent.setup();
		renderArtists({
			mocks: [artistsMock({ items: [artistItem({ id: "artist-42", firstName: "Jamie", lastName: "Fox" })] })],
			routes: <Route path="/artist/artist-42" element={<div>Artist Detail Screen</div>} />,
		});

		await user.click(await screen.findByText("Jamie Fox"));
		expect(await screen.findByText("Artist Detail Screen")).toBeInTheDocument();
	});
});

describe("Artists role-based access to Add Artist", () => {
	it("shows Add Artist for a shop admin", async () => {
		renderArtists({ user: SHOP_ADMIN_USER, mocks: [artistsMock({ items: [] })] });
		expect(await screen.findByRole("heading", { name: "Artists" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add Artist" })).toBeInTheDocument();
	});

	it("hides Add Artist for a plain artist", async () => {
		renderArtists({ user: ARTIST_USER, mocks: [artistsMock({ items: [] })] });
		await screen.findByRole("heading", { name: "Artists" });
		expect(screen.queryByRole("button", { name: "Add Artist" })).not.toBeInTheDocument();
	});
});
