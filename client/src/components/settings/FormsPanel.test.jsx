// FormsPanel.jsx tests. Two independently-gated sections live in this one component (see its own
// header comment) - "Your link" + the URL list (any ARTIST, shop-affiliated or not) and "Manage
// Forms" (shop_admin-or-better, OR an independent artist with no shop at all). Most of the tests
// below are organised around that gate, since getting it wrong either hides a section someone
// needs or shows a management on-ramp to someone the server would refuse.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { gql } from "@apollo/client";
import FormsPanel from "./FormsPanel";
import { AuthContext } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import { formUrl } from "../../utils/bookingSlug";

// ArtistService.fetchArtist and FormService.getMyFormLinks (unlike CHECK_BOOKING_SLUG and
// UPDATE_MY_BOOKING_SLUG_MUTATION below, which the services export directly) build their gql
// documents INSIDE the hook function and never export them - there is no
// `ArtistService.FETCH_ARTIST_QUERY` or `FormService.GET_MY_FORM_LINKS` to import. Reconstructed
// here verbatim from ArtistService.js's _fetchArtist and FormService.js's _GET_MY_FORM_LINKS -
// MockedProvider matches a mock to a call by the query's parsed shape and variables, not object
// identity, so a same-shape document written here targets the same operation. If either service
// file's selection set drifts from this copy, the mock stops matching and the affected test fails
// with Apollo's "no matching mock" error rather than passing on stale data - drift is loud, not
// silent.
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

const GET_MY_FORM_LINKS = gql`
	query GetMyFormLinks {
		getMyFormLinks {
			title
			slug
		}
	}
`;

function artistMock(artistId, overrides = {}) {
	return {
		request: { query: FETCH_ARTIST_QUERY, variables: { artistId } },
		result: {
			data: {
				getArtist: {
					__typename: "Artist",
					id: artistId,
					firstName: "Renee",
					lastName: "Wolf",
					email: "renee@example.com",
					title: null,
					phone: null,
					address: null,
					city: null,
					state: null,
					zip: null,
					instagram: null,
					facebook: null,
					avatar: null,
					startDate: null,
					endDate: null,
					hourlyRate: null,
					flatRate: null,
					billingType: null,
					bookingSlug: "renee-tattoo",
					shopId: null,
					userId: artistId,
					status: "active",
					...overrides,
				},
			},
		},
	};
}

function formLinksMock(links) {
	return {
		request: { query: GET_MY_FORM_LINKS },
		result: {
			data: {
				getMyFormLinks: links.map((link) => ({ __typename: "FormLinkSummary", ...link })),
			},
		},
	};
}

// The artist's own slug availability check (BookingSlugField's debounced query) - not exercised
// unless a test both changes the slug field's value AND lets 350ms of real time pass, but supplied
// wherever that could plausibly happen so a stray debounce firing resolves cleanly instead of
// logging an unmatched-mock warning that has nothing to do with what the test is checking.
function slugAvailableMock(slug, available = true) {
	return {
		request: { query: ArtistService.CHECK_BOOKING_SLUG, variables: { slug } },
		result: {
			data: {
				checkBookingSlugAvailable: {
					__typename: "BookingSlugAvailability",
					slug,
					available,
					reason: available ? null : "That link is taken.",
				},
			},
		},
	};
}

const INDEPENDENT_ARTIST = {
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-1" },
};

const SHOP_ARTIST = {
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-2", shop: { id: "shop-1" } },
};

const SHOP_ADMIN_NON_ARTIST = {
	userType: "user",
	role: 10,
	userInfo: null,
};

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={{ user, setAlert }}>
					<FormsPanel />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { setAlert };
}

describe("an independent artist (no shop)", () => {
	// hasShop is false, so canManageForms is true regardless of role - matching an independent
	// artist's own authority over their own forms.
	it("shows both Your link and Manage Forms", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [artistMock("artist-1"), formLinksMock([])],
		});

		expect(await screen.findByText("Your link")).toBeInTheDocument();
		// "Manage Forms" appears twice (the section heading and the button inside it), so the
		// heading is asserted by role rather than by getByText, which would throw on the ambiguity.
		expect(screen.getByRole("heading", { name: "Manage Forms" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Manage Forms" })).toHaveAttribute(
			"href",
			"/forms",
		);
	});

	it("renders each published form link with its correct public URL", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1"),
				formLinksMock([
					{ title: "Booking Request", slug: "booking_request" },
					{ title: "Consent Form", slug: "consent" },
				]),
			],
		});

		expect(await screen.findByText("Booking Request")).toBeInTheDocument();
		expect(screen.getByText("Consent Form")).toBeInTheDocument();
		// formUrl(formSlug, ownerHandle) - the same join FormsPanel itself calls, so this checks
		// that FormsPanel passed it the right two arguments rather than re-deriving the URL logic.
		expect(screen.getByText(formUrl("booking_request", "renee-tattoo"))).toBeInTheDocument();
		expect(screen.getByText(formUrl("consent", "renee-tattoo"))).toBeInTheDocument();
	});

	it("tells the artist to publish a form when their link exists but the list is empty", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [artistMock("artist-1"), formLinksMock([])],
		});

		expect(
			await screen.findByText(/No published forms have a link yet/),
		).toBeInTheDocument();
	});

	// currentSlug is what every form URL is built from - showing the list (empty-state message
	// included) before an artist has ever set a link would show URLs that don't work yet.
	it("shows no form-links section at all until a link is set", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { bookingSlug: "" }),
				formLinksMock([{ title: "Booking Request", slug: "booking_request" }]),
			],
		});

		await screen.findByText("Your link");
		expect(screen.queryByText("Booking Request")).not.toBeInTheDocument();
		expect(screen.queryByText(/No published forms have a link yet/)).not.toBeInTheDocument();
	});
});

describe("a shop-affiliated artist who is not shop admin", () => {
	// hasShop is true and role (20) is not <= 10, so canManageForms is false - a plain
	// shop-connected artist gets their own link but not the shop's management on-ramp, matching
	// the /forms page's own gate.
	it("shows Your link but not Manage Forms", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [artistMock("artist-2"), formLinksMock([])],
		});

		expect(await screen.findByText("Your link")).toBeInTheDocument();
		expect(screen.queryByText("Manage Forms")).not.toBeInTheDocument();
	});
});

describe("a shop admin who is not an artist themselves", () => {
	// isArtist is false (no userInfo at all), so no artist-scoped queries should even fire - no
	// mocks are supplied here, and MockedProvider would surface an unmatched-request error if
	// FormsPanel tried to call fetchArtist/getMyFormLinks anyway.
	it("shows Manage Forms but not Your link", async () => {
		renderPanel({ user: SHOP_ADMIN_NON_ARTIST, mocks: [] });

		// "Manage Forms" is both the heading and the button's own label - see the ambiguity note
		// in the previous describe block.
		expect(await screen.findByRole("heading", { name: "Manage Forms" })).toBeInTheDocument();
		expect(screen.queryByText("Your link")).not.toBeInTheDocument();
	});
});

describe("saving the booking slug", () => {
	it("disables Save until the field actually changes", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [artistMock("artist-1"), formLinksMock([])],
		});

		expect(await screen.findByRole("button", { name: "Save link" })).toBeDisabled();
	});

	it("reflects a typed value in the link preview and enables Save", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1"),
				formLinksMock([]),
				slugAvailableMock("new-handle"),
			],
		});

		const field = await screen.findByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "new-handle");

		expect(screen.getByText("new-handle")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save link" })).not.toBeDisabled();
	});

	it("sends the trimmed, lowercased slug to updateMyBookingSlug and alerts success", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
				variables: { slug: "new-handle" },
			},
			result: { data: { updateMyBookingSlug: { __typename: "Artist", id: "artist-1", bookingSlug: "new-handle" } } },
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1"),
				formLinksMock([]),
				slugAvailableMock("new-handle"),
				updateMock,
			],
		});

		const field = await screen.findByLabelText(/Booking link/);
		// Deliberately mixed case and padded with spaces - handleSaveSlug trims and lowercases
		// before sending, and reaching the success alert (rather than an Apollo "no matching mock"
		// error) IS the assertion that " New-Handle " became "new-handle" on the wire.
		await user.clear(field);
		await user.type(field, " New-Handle ");
		await user.click(screen.getByRole("button", { name: "Save link" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Your link has been saved.",
				}),
			),
		);
	});

	it("alerts the server's error message when the save fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
				variables: { slug: "taken" },
			},
			error: new Error("That link is already taken."),
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [artistMock("artist-1"), formLinksMock([]), slugAvailableMock("taken", false), failingMock],
		});

		const field = await screen.findByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "taken");
		await user.click(screen.getByRole("button", { name: "Save link" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "That link is already taken.",
				}),
			),
		);
	});
});

describe("copying a form link", () => {
	it("copies the exact public URL and shows Copied", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		// jsdom has no clipboard implementation at all; FormsPanel guards with
		// `navigator.clipboard?.writeText(...)`, so without this the click would silently no-op
		// and "Copied" would never appear - not a bug in FormsPanel, just an unimplemented jsdom API.
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});

		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1"),
				formLinksMock([{ title: "Booking Request", slug: "booking_request" }]),
			],
		});

		await screen.findByText("Booking Request");
		await user.click(screen.getByRole("button", { name: "Copy" }));

		expect(writeText).toHaveBeenCalledWith(formUrl("booking_request", "renee-tattoo"));
		expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
	});
});
