// Projects.jsx tests. This is a thin list page: it pages through ProjectService.fetchProjects,
// maps each project into the row shape EntityList expects, and hands EntityListPager the raw
// pageInfo. Convention follows components/settings/FormsPanel.test.jsx - MockedProvider built
// from a real (reconstructed) gql document, MemoryRouter for the navigate()/Link machinery
// EntityList/EntityListPager depend on, and AuthContext.Provider since IBPageActionBar reads
// useAuth internally.
//
// FETCH_PROJECTS_QUERY is built INSIDE ProjectService.fetchProjects and never exported (see that
// file), so it's reconstructed here field-for-field exactly the way
// services/ProjectService.test.js does for its own harness tests - MockedProvider matches a
// request by the document's printed shape and variables, not by reference identity, so a
// same-shape copy targets the same operation and still fails loudly (an Apollo "no matching
// mock" error) the moment the real query drifts from this copy.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import Projects from "./Projects";
import { AuthContext } from "../../context/auth";

const FETCH_PROJECTS_QUERY_FOR_TESTS = gql`
	query GetProjects($page: PageInput) {
		getProjects(page: $page) {
			items {
				id
				title
				description
				placement
				size
				palette
				artistId
				artist {
					firstName
					lastName
					email
					avatar
					id
				}
				clientId
				client {
					firstName
					lastName
					email
					avatar
					id
				}
				referenceImages {
					url
					avatar
					title
					uploadedByDisplayName
					tags
					updatedAt
					createdAt
				}
				bodyImages {
					url
					avatar
					title
					uploadedByDisplayName
					tags
					updatedAt
					createdAt
				}
				designImages {
					url
					avatar
					uploadedByDisplayName
					tags
					updatedAt
					createdAt
				}
				materialsUsed
				notes {
					author
					note
					createdAt
					updatedAt
				}
				tags
				status
				depositCollectedCents
				depositAvailableCents
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

function project(overrides = {}) {
	return {
		__typename: "Project",
		id: "project-1",
		title: "Half sleeve - koi",
		description: "Full color koi half sleeve, right arm",
		placement: "Right arm",
		size: "Large",
		palette: "color",
		artistId: "artist-1",
		artist: {
			__typename: "Artist",
			firstName: "Gendry",
			lastName: "Baratheon",
			email: "gendry@example.com",
			avatar: null,
			id: "artist-1",
		},
		clientId: "client-1",
		client: {
			__typename: "Client",
			firstName: "Arya",
			lastName: "Stark",
			email: "arya@example.com",
			avatar: null,
			id: "client-1",
		},
		referenceImages: [],
		bodyImages: [],
		designImages: [],
		materialsUsed: null,
		notes: [],
		tags: [],
		status: "in_progress",
		depositCollectedCents: 0,
		depositAvailableCents: 0,
		...overrides,
	};
}

function pageMock({ page, items, pageInfo }) {
	return {
		request: { query: FETCH_PROJECTS_QUERY_FOR_TESTS, variables: { page } },
		result: {
			data: {
				getProjects: {
					__typename: "ProjectPage",
					items,
					pageInfo: { __typename: "PageInfo", ...pageInfo },
				},
			},
		},
	};
}

const NO_ONE = { user: null, setAlert: () => {}, modal: { isOpen: false }, setModal: () => {} };

function renderProjects({ mocks }) {
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={NO_ONE}>
					<Projects />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
}

describe("Projects", () => {
	it("shows the page loader while the first page is in flight", () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [],
					pageInfo: { totalCount: 0, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		// IBPageLoader renders MUI's CircularProgress with this text as its accessible content.
		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});

	it("fetches the first page at the initial page size (50) and offset (0)", async () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project()],
					pageInfo: { totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		// Reaching the row (rather than Apollo's "no matching mock" error) IS the assertion that
		// Projects requested { limit: 50, offset: 0 } on first render.
		expect(await screen.findByText("Half sleeve - koi")).toBeInTheDocument();
	});

	it("renders artist, client, status and deposit columns for each project row", async () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project({ depositCollectedCents: 5000 })],
					pageInfo: { totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		await screen.findByText("Half sleeve - koi");
		expect(screen.getByText("Full color koi half sleeve, right arm")).toBeInTheDocument();
		expect(screen.getByText("Gendry Baratheon")).toBeInTheDocument();
		expect(screen.getByText("Arya Stark")).toBeInTheDocument();
		// Reads depositCollectedCents (integer cents) via formatCents - not the deprecated
		// whole-dollar depositAmount field, which is exactly the bug this column's own comment in
		// Projects.jsx documents having just been fixed.
		expect(screen.getByText("$50.00")).toBeInTheDocument();
	});

	// UtilsService.prettyConstantsListValue(APP_SETTINGS_CONSTANTS.PROJECT_STATUS, project.status)
	// is what the status column actually calls. PROJECT_STATUS entries are keyed `value`/`label`
	// (lowercase) and prettyConstantsListValue only ever matches `item.VALUE`/`item.LABEL`
	// (uppercase) - so for every real status string this returns "" today, and EntityList renders
	// the empty-value placeholder ("—") for the whole column regardless of the actual status. This
	// documents that real, current behavior rather than the label a reader might expect to see.
	it("renders an em dash in the status column, since prettyConstantsListValue never matches a lowercase status", async () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project({ status: "in_progress" })],
					pageInfo: { totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		await screen.findByText("Half sleeve - koi");
		const statusCell = screen.getByText("—", { selector: '[data-label="Status"]' });
		expect(statusCell).toBeInTheDocument();
	});

	it("shows the deposit column blank when nothing was collected", async () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project({ depositCollectedCents: 0 })],
					pageInfo: { totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		await screen.findByText("Half sleeve - koi");
		const depositCell = screen.getByText("—", { selector: '[data-label="Deposit"]' });
		expect(depositCell).toBeInTheDocument();
	});

	// Artists.jsx's own fix - Project.artist/Project.client are optional-chained so a project
	// missing either relation renders a row with a gap instead of crashing the whole page, which
	// is what happened before (see Projects.jsx's header comment).
	it("renders a row with blank artist/client cells rather than crashing when a relation is missing", async () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project({ artist: null, client: null, artistId: null, clientId: null })],
					pageInfo: { totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		expect(await screen.findByText("Half sleeve - koi")).toBeInTheDocument();
		expect(screen.getByText("—", { selector: '[data-label="Artist"]' })).toBeInTheDocument();
		expect(screen.getByText("—", { selector: '[data-label="Client"]' })).toBeInTheDocument();
	});

	it("shows the empty message and no pager when there are no projects at all", async () => {
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [],
					pageInfo: { totalCount: 0, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("requests the next page at the current offset when Next is clicked", async () => {
		const user = userEvent.setup();
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project()],
					pageInfo: { totalCount: 60, hasMore: true, limit: 50, offset: 0 },
				}),
				pageMock({
					page: { limit: 50, offset: 50 },
					items: [project({ id: "project-2", title: "Sleeve - dragon" })],
					pageInfo: { totalCount: 60, hasMore: false, limit: 50, offset: 50 },
				}),
			],
		});

		await screen.findByText("Half sleeve - koi");
		await user.click(screen.getByRole("button", { name: "Next" }));

		// Reaching the second page's row (rather than an unmatched-mock error) proves onChange
		// pushed the new offset into state and Projects re-requested with { limit: 50, offset: 50 }.
		expect(await screen.findByText("Sleeve - dragon")).toBeInTheDocument();
	});

	it("changing the page size resets the offset back to 0 and re-fetches at the new limit", async () => {
		const user = userEvent.setup();
		renderProjects({
			mocks: [
				pageMock({
					page: { limit: 50, offset: 0 },
					items: [project()],
					pageInfo: { totalCount: 60, hasMore: true, limit: 50, offset: 0 },
				}),
				pageMock({
					page: { limit: 50, offset: 50 },
					items: [project({ id: "project-2", title: "Sleeve - dragon" })],
					pageInfo: { totalCount: 60, hasMore: false, limit: 50, offset: 50 },
				}),
				// After moving to offset 50, switching page size must go back to offset 0 - not
				// stay at 50 with the new limit.
				pageMock({
					page: { limit: 10, offset: 0 },
					items: [project({ id: "project-3", title: "Forearm - script" })],
					pageInfo: { totalCount: 60, hasMore: true, limit: 10, offset: 0 },
				}),
			],
		});

		await screen.findByText("Half sleeve - koi");
		await user.click(screen.getByRole("button", { name: "Next" }));
		await screen.findByText("Sleeve - dragon");

		await user.selectOptions(screen.getByRole("combobox"), "10");

		expect(await screen.findByText("Forearm - script")).toBeInTheDocument();
	});
});
