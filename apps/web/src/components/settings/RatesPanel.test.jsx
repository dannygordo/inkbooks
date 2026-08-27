// RatesPanel.jsx tests. Two independently-gated cards live in this one component: "Rates" (always
// shown - what THIS artist charges) and "Which Rate Applies" (only for a shop-connected artist -
// whether the shop's rate or the artist's own rate governs a session at that shop). Most of the
// tests below are organised around that gate, plus the hydration/uncontrolled-input subtleties the
// component's own header comment calls out.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import RatesPanel from "./RatesPanel";
import { AuthContext } from "../../context/auth";
import { ArtistService } from "../../services/ArtistService";
import ArtistShopConnectionService from "../../services/ArtistShopConnectionService";

// ArtistService.fetchArtist builds its gql document INSIDE the hook function and never exports it
// (there is no `ArtistService.FETCH_ARTIST_QUERY`), so it's reconstructed here verbatim from
// ArtistService.js's _fetchArtist - see FormsPanel.test.jsx's identical note. MockedProvider
// matches a mock to a call by the query's parsed shape and variables, not object identity, so a
// same-shape document written here targets the same operation; if the service's selection set
// drifts from this copy, the affected test fails loudly (Apollo's "no matching mock" error)
// instead of passing on stale data.
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
					hourlyRate: 150,
					flatRate: null,
					billingType: "hourly",
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

// ArtistShopConnectionService, like ArtistService above, keeps its query document private inside
// the hook function - only fetchArtistShopConnections itself is exported, not a
// FETCH_ARTIST_SHOP_CONNECTIONS constant - so this is reconstructed verbatim from the service's
// own _FETCH_ARTIST_SHOP_CONNECTIONS for the same reason as FETCH_ARTIST_QUERY above.
const FETCH_ARTIST_SHOP_CONNECTIONS = gql`
	query GetArtistShopConnections($artistId: ID!) {
		getArtistShopConnections(artistId: $artistId) {
			id
			artistId
			shopId
			status
			rateSource
		}
	}
`;

function connectionsMock(userId, connections) {
	return {
		request: {
			query: FETCH_ARTIST_SHOP_CONNECTIONS,
			variables: { artistId: userId },
		},
		result: {
			data: {
				getArtistShopConnections: connections.map((c) => ({
					__typename: "ArtistShopConnection",
					...c,
				})),
			},
		},
	};
}

const INDEPENDENT_ARTIST = {
	id: "artist-1",
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-1" },
};

const SHOP_ARTIST = {
	id: "artist-2",
	userType: "artist",
	role: 20,
	userInfo: { id: "artist-2", shop: { id: "shop-1" } },
};

function renderPanel({ user, mocks = [], setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<RatesPanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert };
}

describe("an independent artist (no shop)", () => {
	it("shows the Rates card but not Which Rate Applies", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [artistMock("artist-1"), connectionsMock("artist-1", [])],
		});

		expect(await screen.findByRole("heading", { name: "Rates" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "Which Rate Applies" })).not.toBeInTheDocument();
	});

	it("pre-fills the hourly and flat rate fields from the artist record", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: 175, flatRate: 900 }),
				connectionsMock("artist-1", []),
			],
		});

		expect(await screen.findByLabelText("Hourly Rate ($)")).toHaveValue(175);
		expect(screen.getByLabelText("Flat Rate ($)")).toHaveValue(900);
	});

	it("leaves the rate fields blank when the artist has none set yet", async () => {
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: null, flatRate: null }),
				connectionsMock("artist-1", []),
			],
		});

		expect(await screen.findByLabelText("Hourly Rate ($)")).toHaveValue(null);
		expect(screen.getByLabelText("Flat Rate ($)")).toHaveValue(null);
	});
});

describe("a shop-connected artist", () => {
	it("also shows the Which Rate Applies card", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				artistMock("artist-2"),
				connectionsMock("artist-2", [
					{ id: "conn-1", artistId: "artist-2", shopId: "shop-1", status: "active", rateSource: "shop" },
				]),
			],
		});

		expect(await screen.findByRole("heading", { name: "Which Rate Applies" })).toBeInTheDocument();
	});

	it("hydrates the radio selection from the active connection's rateSource", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				artistMock("artist-2"),
				connectionsMock("artist-2", [
					{ id: "conn-1", artistId: "artist-2", shopId: "shop-1", status: "active", rateSource: "own" },
				]),
			],
		});

		const ownRadio = await screen.findByRole("radio", { name: "Use my own rate" });
		const shopRadio = screen.getByRole("radio", { name: "Use the shop's rate" });
		// The radio group renders as soon as shopId is available from `user` - well before the
		// connections query resolves - so the elements exist immediately at "shop" selected. Wait
		// for the hydration effect to actually flip the checked state, not just for the radios to
		// exist.
		await waitFor(() => expect(ownRadio).toBeChecked());
		expect(shopRadio).not.toBeChecked();
	});

	// Only an ACTIVE connection matching this artist's own shopId should hydrate the radio - a
	// stale/inactive row, or one for a different shop, must not override the "shop" default.
	it("ignores a connection that is not active", async () => {
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				artistMock("artist-2"),
				connectionsMock("artist-2", [
					{ id: "conn-1", artistId: "artist-2", shopId: "shop-1", status: "ended", rateSource: "own" },
				]),
			],
		});

		const shopRadio = await screen.findByRole("radio", { name: "Use the shop's rate" });
		expect(shopRadio).toBeChecked();
	});

	it("switches the rate source and alerts success", async () => {
		const user = userEvent.setup();
		const setRateSourceMock = {
			request: {
				query: ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
				variables: { artistId: "artist-2", shopId: "shop-1", rateSource: "own" },
			},
			result: {
				data: {
					setArtistShopRateSource: {
						__typename: "ArtistShopConnection",
						id: "conn-1",
						artistId: "artist-2",
						shopId: "shop-1",
						rateSource: "own",
					},
				},
			},
		};
		const { setAlert } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				artistMock("artist-2"),
				connectionsMock("artist-2", [
					{ id: "conn-1", artistId: "artist-2", shopId: "shop-1", status: "active", rateSource: "shop" },
				]),
				setRateSourceMock,
			],
		});

		await user.click(await screen.findByRole("radio", { name: "Use my own rate" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Rate source updated.",
				}),
			),
		);
	});

	it("alerts the server's error message when switching the rate source fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
				variables: { artistId: "artist-2", shopId: "shop-1", rateSource: "own" },
			},
			error: new Error("Could not update rate source."),
		};
		const { setAlert } = renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				artistMock("artist-2"),
				connectionsMock("artist-2", [
					{ id: "conn-1", artistId: "artist-2", shopId: "shop-1", status: "active", rateSource: "shop" },
				]),
				failingMock,
			],
		});

		await user.click(await screen.findByRole("radio", { name: "Use my own rate" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not update rate source.",
				}),
			),
		);
	});

	it("disables both radios while the mutation is in flight", async () => {
		const user = userEvent.setup();
		// Never resolves within the test - lets the loading state be observed.
		const pendingMock = {
			request: {
				query: ArtistShopConnectionService.SET_ARTIST_SHOP_RATE_SOURCE_MUTATION,
				variables: { artistId: "artist-2", shopId: "shop-1", rateSource: "own" },
			},
			delay: 60 * 1000,
			result: { data: { setArtistShopRateSource: null } },
		};
		renderPanel({
			user: SHOP_ARTIST,
			mocks: [
				artistMock("artist-2"),
				connectionsMock("artist-2", [
					{ id: "conn-1", artistId: "artist-2", shopId: "shop-1", status: "active", rateSource: "shop" },
				]),
				pendingMock,
			],
		});

		await user.click(await screen.findByRole("radio", { name: "Use my own rate" }));

		expect(screen.getByRole("radio", { name: "Use my own rate" })).toBeDisabled();
		expect(screen.getByRole("radio", { name: "Use the shop's rate" })).toBeDisabled();
	});
});

describe("saving rates", () => {
	it("sends edited hourly/flat rate values and billing type, then alerts success", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
				variables: { hourlyRate: 200, flatRate: 900, billingType: "hourly" },
			},
			result: {
				data: {
					updateArtistRateSettings: {
						__typename: "Artist",
						id: "artist-1",
						hourlyRate: 200,
						flatRate: 900,
						billingType: "hourly",
					},
				},
			},
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: 150, flatRate: 900 }),
				connectionsMock("artist-1", []),
				updateMock,
			],
		});

		const hourlyField = await screen.findByLabelText("Hourly Rate ($)");
		await user.clear(hourlyField);
		await user.type(hourlyField, "200");
		await user.click(screen.getByRole("button", { name: "Save Rates" }));

		// MockedProvider matches on variables, so reaching the success alert IS the assertion that
		// the edited hourly rate (200) went out alongside the UNEDITED flat rate (900, straight off
		// the query result) rather than losing it.
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "success",
					message: "Rate settings saved.",
				}),
			),
		);
	});

	it("sends null for a rate cleared down to an empty string", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
				variables: { hourlyRate: null, flatRate: null, billingType: "hourly" },
			},
			result: {
				data: {
					updateArtistRateSettings: {
						__typename: "Artist",
						id: "artist-1",
						hourlyRate: null,
						flatRate: null,
						billingType: "hourly",
					},
				},
			},
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: 150, flatRate: null }),
				connectionsMock("artist-1", []),
				updateMock,
			],
		});

		const hourlyField = await screen.findByLabelText("Hourly Rate ($)");
		await waitFor(() => expect(hourlyField).toHaveValue(150));
		// Neither userEvent.clear() nor fireEvent.change() reliably empties this field. clear()
		// fails because it's uncontrolled (IBInput passes defaultValue, not value) and its starting
		// value only arrives once the artist query resolves, well after mount - user-event's own
		// internal value tracking is seeded at that first, still-empty mount and never notices the
		// DOM's own defaultValue-driven jump to 150, so clear() no-ops against its stale bookkeeping.
		// fireEvent.change() bypasses that tracking by setting the DOM value directly and dispatching
		// a synthetic event, which works for other fields in this codebase (see
		// RecurringExpensesPanel.test.jsx's type="date" inputs) but was confirmed NOT to reach this
		// particular MUI number TextField's onChange either. Real keystrokes (End, then one Backspace
		// per existing character) go through user-event's normal typing path instead - the same path
		// user.type() already relies on everywhere else in this suite - rather than either of the
		// two bulk-value-replacement shortcuts above.
		await user.click(hourlyField);
		await user.keyboard("{End}" + "{Backspace}".repeat(hourlyField.value.length));
		await waitFor(() => expect(hourlyField).toHaveValue(null));
		await user.click(screen.getByRole("button", { name: "Save Rates" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success" }),
			),
		);
	});

	it("shows Saving... and disables the button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const pendingMock = {
			request: {
				query: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
				variables: { hourlyRate: 150, flatRate: null, billingType: "hourly" },
			},
			delay: 60 * 1000,
			result: { data: { updateArtistRateSettings: null } },
		};
		renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: 150, flatRate: null }),
				connectionsMock("artist-1", []),
				pendingMock,
			],
		});

		await screen.findByLabelText("Hourly Rate ($)");
		await user.click(screen.getByRole("button", { name: "Save Rates" }));

		expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
	});

	it("alerts the server's error message when saving fails", async () => {
		const user = userEvent.setup();
		const failingMock = {
			request: {
				query: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
				variables: { hourlyRate: 150, flatRate: null, billingType: "hourly" },
			},
			error: new Error("Could not save rate settings."),
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: 150, flatRate: null }),
				connectionsMock("artist-1", []),
				failingMock,
			],
		});

		await screen.findByLabelText("Hourly Rate ($)");
		await user.click(screen.getByRole("button", { name: "Save Rates" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not save rate settings.",
				}),
			),
		);
	});

	it("changing the billing type selection is reflected before saving", async () => {
		const user = userEvent.setup();
		const updateMock = {
			request: {
				query: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
				variables: { hourlyRate: 150, flatRate: null, billingType: "flat_rate" },
			},
			result: {
				data: {
					updateArtistRateSettings: {
						__typename: "Artist",
						id: "artist-1",
						hourlyRate: 150,
						flatRate: null,
						billingType: "flat_rate",
					},
				},
			},
		};
		const { setAlert } = renderPanel({
			user: INDEPENDENT_ARTIST,
			mocks: [
				artistMock("artist-1", { hourlyRate: 150, flatRate: null, billingType: "hourly" }),
				connectionsMock("artist-1", []),
				updateMock,
			],
		});

		await screen.findByLabelText("Hourly Rate ($)");
		await user.click(screen.getByRole("combobox", { name: "Billing Type" }));
		await user.click(await screen.findByRole("option", { name: "Flat Rate" }));
		await user.click(screen.getByRole("button", { name: "Save Rates" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "success" }),
			),
		);
	});
});
