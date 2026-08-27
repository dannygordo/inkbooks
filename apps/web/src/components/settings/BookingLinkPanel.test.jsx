// BookingLinkPanel.jsx tests. The artist's own public booking page - see the component's own
// header comment on why this needed to exist at all (before it, the only URL was /book/<Mongo
// ObjectId>, which nobody could hand to a client, and nothing displayed it). Same
// uncontrolled-with-local-edits shape as FormsPanel's "Your link" section, which this predates and
// mirrors closely - see FormsPanel.test.jsx's own "saving the booking slug" block for the model
// this file follows.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import BookingLinkPanel from "./BookingLinkPanel";
import { AuthContext } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import { bookingUrl } from "../../utils/bookingSlug";

// ArtistService.fetchArtist builds its gql document INSIDE the hook function and never exports it
// (unlike CHECK_BOOKING_SLUG and UPDATE_MY_BOOKING_SLUG_MUTATION below, which the service exports
// directly) - there is no `ArtistService.FETCH_ARTIST_QUERY` to import. Reconstructed here
// verbatim from ArtistService.js's _fetchArtist, the same copy FormsPanel.test.jsx uses for the
// same reason - see that file's own comment on what happens if the two selection sets drift.
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

// BookingSlugField's own debounced availability check - not exercised unless a test both changes
// the field's value AND lets 350ms of real time pass, but supplied wherever that could plausibly
// happen so a stray debounce firing resolves cleanly rather than logging an unmatched-mock
// warning unrelated to what the test checks. Same convention as FormsPanel.test.jsx.
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

const ARTIST_USER = {
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-1" },
};

const NON_ARTIST_USER = {
	userType: "user",
	role: 10,
	userInfo: null,
};

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<BookingLinkPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("no artist to look up", () => {
	// artistUserInfoId is null, so fetchArtist's own skip (!artistId) must fire - no mock is
	// supplied, and MockedProvider would surface an unmatched-request error if the query ran anyway
	// with a null $artistId (ID!).
	it("renders the card without ever querying getArtist", async () => {
		renderPanel({ user: NON_ARTIST_USER, mocks: [] });

		expect(await screen.findByText("Booking link", { selector: "h1" })).toBeInTheDocument();
		expect(screen.getByLabelText(/Booking link/)).toHaveValue("");
	});
});

describe("before a link has ever been set", () => {
	it("shows an empty field and no Copy link button", async () => {
		renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1", { bookingSlug: "" })],
		});

		await screen.findByText("Booking link", { selector: "h1" });
		expect(screen.getByLabelText(/Booking link/)).toHaveValue("");
		expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
	});

	it("keeps Save link disabled until something is typed", async () => {
		renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1", { bookingSlug: "" })],
		});

		expect(await screen.findByRole("button", { name: "Save link" })).toBeDisabled();
	});
});

describe("with an existing link", () => {
	it("shows the current slug and offers Copy link", async () => {
		renderPanel({ user: ARTIST_USER, mocks: [artistMock("artist-1")] });

		expect(await screen.findByLabelText(/Booking link/)).toHaveValue("renee-tattoo");
		expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
	});

	it("disables Save link until the field actually changes", async () => {
		renderPanel({ user: ARTIST_USER, mocks: [artistMock("artist-1")] });

		await screen.findByLabelText(/Booking link/);
		expect(screen.getByRole("button", { name: "Save link" })).toBeDisabled();
	});

	it("enables Save link once the field diverges from the current slug", async () => {
		const user = userEvent.setup();
		renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1"), slugAvailableMock("new-handle")],
		});

		const field = await screen.findByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "new-handle");

		expect(screen.getByRole("button", { name: "Save link" })).not.toBeDisabled();
	});

	// slugChanged compares trimmed/lowercased values against currentSlug - retyping the exact same
	// handle (even with different case or padding) must not read as a change.
	it("treats a re-typed identical slug (different case) as unchanged", async () => {
		const user = userEvent.setup();
		renderPanel({ user: ARTIST_USER, mocks: [artistMock("artist-1")] });

		const field = await screen.findByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "RENEE-TATTOO");

		expect(screen.getByRole("button", { name: "Save link" })).toBeDisabled();
	});
});

describe("saving the booking slug", () => {
	it("sends the trimmed, lowercased slug and alerts success", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
				variables: { slug: "new-handle" },
			},
			result: {
				data: { updateMyBookingSlug: { __typename: "Artist", id: "artist-1", bookingSlug: "new-handle" } },
			},
		};
		const { setAlert } = renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1"), slugAvailableMock("new-handle"), updateMock],
		});

		const field = await screen.findByLabelText(/Booking link/);
		// Deliberately mixed case and padded with spaces - reaching the success alert (rather than
		// an Apollo "no matching mock" error) IS the assertion that " New-Handle " became
		// "new-handle" on the wire.
		await user.clear(field);
		await user.type(field, " New-Handle ");
		await user.click(screen.getByRole("button", { name: "Save link" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Booking link saved.",
				}),
			),
		);
	});

	it("shows Saving... while the mutation is in flight and disables the button", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
				variables: { slug: "new-handle" },
			},
			result: {
				data: { updateMyBookingSlug: { __typename: "Artist", id: "artist-1", bookingSlug: "new-handle" } },
			},
			// Long enough that this test's assertion runs well before it resolves - the codebase's
			// own established convention for an in-flight assertion that never awaits the
			// after-state (see e.g. ShopCutRatePanel.test.jsx's/ProjectSessionsList.test.jsx's own
			// "Saving..."/"Saving..." in-flight tests). The previous `delay: 20` raced the real
			// clock against user.click's own async overhead and MockedProvider's microtask
			// scheduling - occasionally the mutation had already resolved (and "Save link" was
			// back) by the time `findByRole("Saving...")` got its first poll, failing
			// intermittently rather than deterministically.
			delay: 60 * 1000,
		};
		renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1"), slugAvailableMock("new-handle"), updateMock],
		});

		const field = await screen.findByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "new-handle");
		await user.click(screen.getByRole("button", { name: "Save link" }));

		expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
	});

	it("alerts the server's bookingSlug validation message when the save fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
				variables: { slug: "taken" },
			},
			error: new Error("That link is already taken."),
		};
		const { setAlert } = renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1"), slugAvailableMock("taken", false), failingMock],
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

describe("copying the booking link", () => {
	let writeText;

	// Installs the clipboard mock - pulled out of a shared beforeEach (and called from each test
	// below, always AFTER userEvent.setup()) because of a real ordering trap: userEvent.setup()
	// itself unconditionally overwrites navigator.clipboard with its OWN internal stub (see
	// node_modules/@testing-library/user-event/dist/esm/utils/dataTransfer/Clipboard.js -
	// setupMain() calls attachClipboardStubToView(view) on every setup() call, no way to opt out).
	// A beforeEach that defines navigator.clipboard BEFORE the test body's userEvent.setup() runs
	// gets silently clobbered the moment setup() executes - writeText then never gets called at
	// all (calls stay at the clipboard stub's own no-op-ish internal implementation, which still
	// resolves successfully), which is exactly the "0 calls, but the click still succeeded" failure
	// this test used to produce. FormsPanel.test.jsx's own copy test avoids this by calling
	// userEvent.setup() first and only defining navigator.clipboard afterward - same fix here.
	function mockClipboard() {
		writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
	}

	afterEach(() => {
		delete navigator.clipboard;
	});

	it("copies the current slug's full booking URL and shows Copied", async () => {
		const user = userEvent.setup();
		mockClipboard();
		renderPanel({ user: ARTIST_USER, mocks: [artistMock("artist-1")] });

		// The "Copy link" button is gated on currentSlug from the artist query (see
		// BookingLinkPanel.jsx's `{currentSlug && (...)}`), unlike the field's own label, which is
		// present from the very first render regardless of loading state - waiting on the button
		// itself, not just the label, is what actually guarantees the query has resolved before we
		// click it (see FormsPanel.test.jsx's analogous copy test for the same reasoning).
		const copyButton = await screen.findByRole("button", { name: "Copy link" });
		await user.click(copyButton);

		expect(writeText).toHaveBeenCalledWith(bookingUrl("renee-tattoo"));
		expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
	});

	it("reverts the label back to Copy link if the clipboard write fails", async () => {
		const user = userEvent.setup();
		mockClipboard();
		writeText.mockRejectedValue(new Error("denied"));
		renderPanel({ user: ARTIST_USER, mocks: [artistMock("artist-1")] });

		const copyButton = await screen.findByRole("button", { name: "Copy link" });
		await user.click(copyButton);

		await waitFor(() => expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument());
		expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
	});

	// Copies the CURRENT saved slug, not whatever is sitting unsaved in the field - the button
	// hands out a link that already works, not a draft.
	it("still copies the saved slug even with an unsaved edit in the field", async () => {
		const user = userEvent.setup();
		mockClipboard();
		renderPanel({
			user: ARTIST_USER,
			mocks: [artistMock("artist-1"), slugAvailableMock("draft-handle")],
		});

		const field = await screen.findByLabelText(/Booking link/);
		await user.clear(field);
		await user.type(field, "draft-handle");
		await user.click(await screen.findByRole("button", { name: "Copy link" }));

		expect(writeText).toHaveBeenCalledWith(bookingUrl("renee-tattoo"));
	});
});
