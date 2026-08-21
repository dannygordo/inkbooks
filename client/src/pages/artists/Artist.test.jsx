// Artist.jsx tests (the shop's management view into one artist, as opposed to Home.jsx's view of
// an artist's own numbers - see this file's own header comment).
//
// FETCH_ARTIST_QUERY is built inside ArtistService._fetchArtist and never exported, so it's
// reconstructed here verbatim from ArtistService.js - the same copy FormsPanel.test.jsx and
// ArtistService.test.js already keep for the same reason. MockedProvider matches a request by the
// document's printed shape plus variables, not by reference identity, so this still fails loudly
// with Apollo's "no matching mock" error if the real query ever drifts from what's copied here.
// updateArtist/ARCHIVE_ARTIST_MUTATION/UNARCHIVE_ARTIST_MUTATION, by contrast, come straight from
// the real ArtistService export, since those ARE exported directly.
//
// This page also mounts ArtistPerformancePanel and ShopCutRatePanel, each of which fires several
// of its OWN queries (analytics, appointments, shop-cut rates, booth rent) the instant it mounts -
// none of which are Artist.jsx's own concern to test here. Rather than reconstructing that entire
// dependency tree's queries, the artist fixture below has no shop (shopId: null), which keeps most
// of them skipped, and console.error is silenced for every test in this file the same way
// ArtistService.test.js silences it around an expected-but-irrelevant Apollo "no matching mock"
// error - those panels render their own empty states instead of crashing, which is all this file
// needs from them.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import Artist from "./Artist";
import { AuthContext } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import { ROLES, ARTIST_STATUS } from "../../constants";

const FETCH_ARTIST_QUERY = gql`
	query ($artistId: ID!) {
		getArtist(artistId: $artistId) {
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
			endDate
			hourlyRate
			flatRate
			billingType
			bookingSlug
			shopId
			userId
			status
		}
	}
`;

function artistRecord(overrides = {}) {
	return {
		__typename: "Artist",
		id: "artist-1",
		firstName: "Renee",
		lastName: "Wolf",
		email: "renee@example.com",
		title: "Tattoo Artist",
		phone: "5555550123",
		address: "123 Main St",
		city: "Austin",
		state: "TX",
		zip: "78701",
		instagram: "renee.ink",
		facebook: "renee.wolf.tattoo",
		avatar: null,
		startDate: "2024-01-15",
		endDate: null,
		hourlyRate: null,
		flatRate: null,
		billingType: null,
		bookingSlug: "renee-tattoo",
		shopId: null,
		userId: "user-1",
		status: ARTIST_STATUS.ACTIVE,
		...overrides,
	};
}

function fetchArtistMock(artistId, artist) {
	return {
		request: { query: FETCH_ARTIST_QUERY, variables: { artistId } },
		result: { data: { getArtist: artist } },
	};
}

// The exact fields buildIdentityPayload sends, echoing artistRecord()'s defaults - used as the
// baseline for the mutation-variable mocks below, with only what a given test changes overridden.
function identityPayload(artist, overrides = {}) {
	return {
		id: artist.id,
		firstName: artist.firstName,
		lastName: artist.lastName,
		email: artist.email,
		phone: artist.phone,
		title: artist.title,
		address: artist.address,
		city: artist.city,
		state: artist.state,
		zip: artist.zip,
		startDate: artist.startDate,
		instagram: artist.instagram,
		facebook: artist.facebook,
		...overrides,
	};
}

const SHOP_ADMIN_VIEWER = { id: "admin-1", role: ROLES.SHOP_ADMIN };
const OTHER_STAFF_VIEWER = { id: "staff-1", role: ROLES.SHOP_STAFF };

function renderArtist({ artistId = "artist-1", user = SHOP_ADMIN_VIEWER, mocks = [], setAlert = vi.fn(), updateCurrentUser = vi.fn() } = {}) {
	render(
		<MemoryRouter initialEntries={[`/artist/${artistId}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={{ user, setAlert, updateCurrentUser }}>
					<Routes>
						<Route path="/artist/:artistId" element={<Artist />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert, updateCurrentUser };
}

// See this file's header comment: the performance/rate panels fire their own queries on mount,
// none of which are mocked here, and Apollo surfaces each as a console.error. Silenced the same
// way ArtistService.test.js silences an expected-but-irrelevant one.
let consoleErrorSpy;
beforeEach(() => {
	consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	consoleErrorSpy.mockRestore();
});

describe("Artist loading and not-found states", () => {
	it("shows the page loader while fetching", () => {
		renderArtist({ mocks: [fetchArtistMock("artist-1", artistRecord())] });
		expect(screen.getByRole("progressbar")).toBeInTheDocument();
	});

	it("shows a not-found message when the artist doesn't exist", async () => {
		renderArtist({ mocks: [fetchArtistMock("artist-1", null)] });
		expect(await screen.findByText("This artist does not exist")).toBeInTheDocument();
	});
});

describe("Artist populated identity fields", () => {
	it("renders the artist's header and identity fields from the query", async () => {
		renderArtist({ mocks: [fetchArtistMock("artist-1", artistRecord())] });

		expect(await screen.findByRole("heading", { name: "Renee Wolf" })).toBeInTheDocument();
		expect(screen.getByDisplayValue("Renee")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Wolf")).toBeInTheDocument();
		expect(screen.getByDisplayValue("renee@example.com")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Austin")).toBeInTheDocument();
	});
});

describe("Artist identity edit permissions", () => {
	it("lets the artist themselves edit, regardless of role", async () => {
		const selfViewer = { id: "user-1", role: ROLES.ARTIST };
		renderArtist({ user: selfViewer, mocks: [fetchArtistMock("artist-1", artistRecord())] });

		const firstNameInput = await screen.findByDisplayValue("Renee");
		expect(firstNameInput).not.toBeDisabled();
		expect(screen.queryByText(/Only Renee or a shop admin/)).not.toBeInTheDocument();
	});

	it("lets a shop admin edit another artist's identity", async () => {
		renderArtist({ user: SHOP_ADMIN_VIEWER, mocks: [fetchArtistMock("artist-1", artistRecord())] });

		const firstNameInput = await screen.findByDisplayValue("Renee");
		expect(firstNameInput).not.toBeDisabled();
	});

	it("disables identity fields and shows a hint for anyone else", async () => {
		renderArtist({ user: OTHER_STAFF_VIEWER, mocks: [fetchArtistMock("artist-1", artistRecord())] });

		const firstNameInput = await screen.findByDisplayValue("Renee");
		expect(firstNameInput).toBeDisabled();
		expect(
			screen.getByText("Only Renee or a shop admin can edit these details."),
		).toBeInTheDocument();
	});
});

describe("Artist identity autosave on blur", () => {
	it("saves a changed field on blur and shows the saved state", async () => {
		const user = userEvent.setup();
		const artist = artistRecord();
		const updateMock = {
			request: {
				query: ArtistService.updateArtist(),
				variables: { artist: identityPayload(artist, { firstName: "Renee Updated" }) },
			},
			result: { data: { updateArtist: { ...artistRecord({ firstName: "Renee Updated" }) } } },
		};
		renderArtist({
			user: SHOP_ADMIN_VIEWER,
			mocks: [fetchArtistMock("artist-1", artist), updateMock],
		});

		const firstNameInput = await screen.findByDisplayValue("Renee");
		await user.clear(firstNameInput);
		await user.type(firstNameInput, "Renee Updated");
		await user.tab();

		expect(await screen.findByText("All changes saved")).toBeInTheDocument();
	});

	it("does not re-save on a blur that didn't change anything", async () => {
		const user = userEvent.setup();
		const artist = artistRecord();
		renderArtist({
			user: SHOP_ADMIN_VIEWER,
			// No mutation mock supplied at all - if handleIdentityFieldBlur fired a request anyway,
			// MockedProvider would surface an unmatched-mock error rather than the field quietly
			// staying in its initial "idle" state.
			mocks: [fetchArtistMock("artist-1", artist)],
		});

		const firstNameInput = await screen.findByDisplayValue("Renee");
		await user.click(firstNameInput);
		await user.tab();

		await waitFor(() => {
			expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
			expect(screen.queryByText("All changes saved")).not.toBeInTheDocument();
		});
	});

	it("shows an error and leaves the field re-saveable when the mutation fails", async () => {
		const user = userEvent.setup();
		const artist = artistRecord();
		const failingMock = {
			request: {
				query: ArtistService.updateArtist(),
				variables: { artist: identityPayload(artist, { firstName: "Broken" }) },
			},
			error: new Error("Network down"),
		};
		const { setAlert } = renderArtist({
			user: SHOP_ADMIN_VIEWER,
			mocks: [fetchArtistMock("artist-1", artist), failingMock],
		});

		const firstNameInput = await screen.findByDisplayValue("Renee");
		await user.clear(firstNameInput);
		await user.type(firstNameInput, "Broken");
		await user.tab();

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Couldn't save: Network down",
				}),
			),
		);
		expect(await screen.findByText("Couldn't save - try again")).toBeInTheDocument();
	});

	it("updates the viewer's own cached identity when editing their own name", async () => {
		const user = userEvent.setup();
		const artist = artistRecord();
		const selfViewer = { id: "user-1", role: ROLES.ARTIST, firstName: "Renee", lastName: "Wolf" };
		const updateMock = {
			request: {
				query: ArtistService.updateArtist(),
				variables: { artist: identityPayload(artist, { lastName: "Wolfe" }) },
			},
			result: { data: { updateArtist: { ...artistRecord({ lastName: "Wolfe" }) } } },
		};
		const { updateCurrentUser } = renderArtist({
			user: selfViewer,
			mocks: [fetchArtistMock("artist-1", artist), updateMock],
		});

		const lastNameInput = await screen.findByDisplayValue("Wolf");
		await user.clear(lastNameInput);
		await user.type(lastNameInput, "Wolfe");
		await user.tab();

		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({ id: "user-1", firstName: "Renee", lastName: "Wolfe" }),
			),
		);
	});

	it("does NOT update the viewer's cached identity when a shop admin edits someone else", async () => {
		const user = userEvent.setup();
		const artist = artistRecord();
		const updateMock = {
			request: {
				query: ArtistService.updateArtist(),
				variables: { artist: identityPayload(artist, { lastName: "Wolfe" }) },
			},
			result: { data: { updateArtist: { ...artistRecord({ lastName: "Wolfe" }) } } },
		};
		const { updateCurrentUser } = renderArtist({
			user: SHOP_ADMIN_VIEWER,
			mocks: [fetchArtistMock("artist-1", artist), updateMock],
		});

		const lastNameInput = await screen.findByDisplayValue("Wolf");
		await user.clear(lastNameInput);
		await user.type(lastNameInput, "Wolfe");
		await user.tab();

		await screen.findByText("All changes saved");
		expect(updateCurrentUser).not.toHaveBeenCalled();
	});
});

describe("Artist archive control", () => {
	it("archives the artist from the header and refetches to reflect the new status", async () => {
		const user = userEvent.setup();
		const artist = artistRecord();
		const archiveMock = {
			request: { query: ArtistService.ARCHIVE_ARTIST_MUTATION, variables: { artistId: "artist-1" } },
			result: { data: { archiveArtist: { __typename: "Artist", id: "artist-1", status: ARTIST_STATUS.ARCHIVED } } },
		};
		const { setAlert } = renderArtist({
			user: SHOP_ADMIN_VIEWER,
			mocks: [
				fetchArtistMock("artist-1", artist),
				archiveMock,
				fetchArtistMock("artist-1", artistRecord({ status: ARTIST_STATUS.ARCHIVED })),
			],
		});

		await screen.findByRole("heading", { name: "Renee Wolf" });
		await user.click(screen.getByRole("button", { name: "Archive" }));

		const dialog = screen.getByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: "Archive" }));

		expect(await screen.findByText("Archived")).toBeInTheDocument();
		expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ severity: "success", message: "Renee Wolf archived." }),
			),
		);
	});

	it("does not render archive controls for someone below shop admin", async () => {
		renderArtist({
			user: OTHER_STAFF_VIEWER,
			mocks: [fetchArtistMock("artist-1", artistRecord())],
		});

		await screen.findByRole("heading", { name: "Renee Wolf" });
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
	});

	it("offers Restore, not Archive, for an already-archived artist", async () => {
		renderArtist({
			user: SHOP_ADMIN_VIEWER,
			mocks: [fetchArtistMock("artist-1", artistRecord({ status: ARTIST_STATUS.ARCHIVED }))],
		});

		await screen.findByRole("heading", { name: "Renee Wolf" });
		expect(screen.getByText("Archived")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
	});
});
