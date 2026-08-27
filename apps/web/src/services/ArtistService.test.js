// ArtistService.js tests. Same convention as ClientService.test.js: a "Service" file here is an
// IIFE exporting a mix of React-hook factories wrapping useQuery/useMutation/useLazyQuery around a
// gql document, and raw gql documents meant to be passed directly to useMutation/useQuery by a
// calling component - there is almost no pure logic to unit-test in isolation, so every export
// below is exercised through a tiny throwaway harness component rendered under MockedProvider.
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline, and this file
// stays a .js to match its sibling ArtistService.js.
//
// ArtistService is a NAMED export only (no default export) - see FormsPanel.test.jsx / Artist.jsx
// / Artists.jsx, all of which import it the same way.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useMutation } from "@apollo/client";
import { print } from "graphql";
import { ArtistService } from "./ArtistService";

// _fetchArtist builds FETCH_ARTIST_QUERY inside the hook function and never exports it - there is
// no ArtistService.FETCH_ARTIST_QUERY to import. Reconstructed here verbatim from ArtistService.js
// (the exact same copy FormsPanel.test.jsx already keeps for the same reason) - MockedProvider
// matches a request by the document's printed text plus variables, not by reference identity, so
// this still fails loudly if the real query in ArtistService.js ever drifts from what's copied
// here.
const FETCH_ARTIST_QUERY_FOR_TESTS = gql`
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

// ---- generic harnesses -----------------------------------------------------------------------

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

function artistRecord(overrides = {}) {
	return {
		__typename: "Artist",
		id: "artist-1",
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
		userId: "artist-1",
		status: "active",
		...overrides,
	};
}

// ---- fetchArtist --------------------------------------------------------------------------------

describe("ArtistService.fetchArtist", () => {
	it("resolves with the full artist record", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistService.fetchArtist("artist-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_ARTIST_QUERY_FOR_TESTS, variables: { artistId: "artist-1" } },
							result: { data: { getArtist: artistRecord() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Renee");
		expect(result).toHaveTextContent("renee-tattoo");
	});

	// skip defaults to !artistId (per the file's own comment: a null/undefined artistId means "no
	// artist to look up yet" for callers like RatesPanel/BookingLinkPanel/FormsPanel that render
	// for a non-artist user too). Registering zero mocks and seeing no error is the proof no
	// request fired.
	it("skips the query by default when artistId is falsy", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ArtistService.fetchArtist(null) });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The `options` second argument is spread AFTER the default `skip: !artistId`, so a caller can
	// override skip explicitly (or pass any other useQuery option) even with a truthy artistId.
	it("lets a caller-supplied options.skip override the default skip", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistService.fetchArtist("artist-1", { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The reverse: options.skip: false forces the query to fire even though artistId itself is
	// falsy - FormsPanel.jsx-style callers rely on being able to pass their own gate.
	it("fires anyway when options.skip explicitly overrides the default skip to false", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistService.fetchArtist(null, { skip: false }),
			});
		}
		// Zero mocks: reaching an error (not a quiet skip) proves the request was actually attempted
		// with a null artistId.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- fetchArtistsByShop / FETCH_ARTISTS_BY_SHOP ------------------------------------------------

describe("ArtistService.fetchArtistsByShop", () => {
	it("resolves with the shop's artist roster", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistService.fetchArtistsByShop("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ArtistService.FETCH_ARTISTS_BY_SHOP, variables: { shopId: "shop-1" } },
							result: {
								data: {
									getArtistsByShop: [
										{
											__typename: "Artist",
											id: "artist-1",
											user: {
												__typename: "User",
												firstName: "Renee",
												lastName: "Wolf",
												id: "user-1",
												tagColor: "#ff0000",
											},
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

		expect(await screen.findByTestId("result")).toHaveTextContent("Renee");
	});

	// skip: !shopId - an independent artist with no shop connection has no roster to fetch. Without
	// this, per the file's own comment, ibCalendar/Sidebar.jsx crashed reading user.userInfo.shop.id
	// before this even ran.
	it("skips the query entirely when shopId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistService.fetchArtistsByShop(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- fetchArtists -------------------------------------------------------------------------------

describe("ArtistService.fetchArtists", () => {
	const FETCH_ARTISTS_QUERY_FOR_TESTS = gql`
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

	it("resolves with a page of artists using its default arguments", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ArtistService.fetchArtists() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_ARTISTS_QUERY_FOR_TESTS,
								// Defaults: includeArchived = false, page = undefined (no page arg passed).
								variables: { includeArchived: false, page: undefined },
							},
							result: {
								data: {
									getArtists: {
										__typename: "ArtistPage",
										items: [
											{
												__typename: "Artist",
												id: "artist-1",
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
												hourlyRate: null,
												shopId: null,
												userId: "user-1",
												status: null,
												user: { __typename: "User", avatar: null },
											},
										],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 1,
											hasMore: false,
											limit: 25,
											offset: 0,
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Renee");
	});

	it("passes includeArchived and page through as variables", async () => {
		const page = { limit: 10, offset: 20 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ArtistService.fetchArtists(true, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_ARTISTS_QUERY_FOR_TESTS,
								variables: { includeArchived: true, page },
							},
							result: {
								data: {
									getArtists: {
										__typename: "ArtistPage",
										items: [],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 0,
											hasMore: false,
											limit: 10,
											offset: 20,
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		// Reaching a resolved (non-error) result at all IS the assertion that the variables the mock
		// demanded were what was sent - MockedProvider throws loudly on any mismatch.
		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});
});

// ---- updateArtist (ignores its own argument, like ClientService.updateClient) -------------------

describe("ArtistService.updateArtist", () => {
	const UPDATE_ARTIST_MUTATION_FOR_TESTS = gql`
		mutation ($artist: ArtistInput) {
			updateArtist(artist: $artist) {
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
			}
		}
	`;

	// SURPRISE, matching ClientService's own _updateClient: despite taking an `artist` parameter,
	// _updateArtist's body never reads it - it just builds and returns the UPDATE_ARTIST_MUTATION
	// document unconditionally.
	it("ignores its argument - the same document comes back regardless of what's passed", () => {
		const docA = ArtistService.updateArtist({ id: "a" });
		const docB = ArtistService.updateArtist(undefined);
		expect(print(docA)).toEqual(print(docB));
		expect(print(docA)).toEqual(print(UPDATE_ARTIST_MUTATION_FOR_TESTS));
	});

	it("is a usable mutation document when handed to useMutation directly, as real callers would", async () => {
		const user = userEvent.setup();
		const artist = { id: "artist-1", firstName: "Renee Updated" };
		const document = ArtistService.updateArtist(artist);

		function Harness() {
			return React.createElement(MutationHarness, { document, variables: { artist } });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UPDATE_ARTIST_MUTATION_FOR_TESTS, variables: { artist } },
							result: {
								data: {
									updateArtist: artistRecord({ firstName: "Renee Updated" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Renee Updated");
	});
});

// ---- UPDATE_ARTIST_RATE_SETTINGS_MUTATION --------------------------------------------------------

describe("ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION", () => {
	it("updates the artist's own rate settings", async () => {
		const user = userEvent.setup();
		const variables = { hourlyRate: 15000, flatRate: null, billingType: "hourly" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistService.UPDATE_ARTIST_RATE_SETTINGS_MUTATION,
								variables,
							},
							result: {
								data: {
									updateArtistRateSettings: {
										__typename: "Artist",
										id: "artist-1",
										hourlyRate: 15000,
										flatRate: null,
										billingType: "hourly",
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
		expect(await screen.findByTestId("result")).toHaveTextContent('"hourlyRate":15000');
	});
});

// ---- ARCHIVE_ARTIST_MUTATION / UNARCHIVE_ARTIST_MUTATION -----------------------------------------

describe("ArtistService.ARCHIVE_ARTIST_MUTATION", () => {
	it("archives an artist by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistService.ARCHIVE_ARTIST_MUTATION,
				variables: { artistId: "artist-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistService.ARCHIVE_ARTIST_MUTATION,
								variables: { artistId: "artist-1" },
							},
							result: {
								data: { archiveArtist: { __typename: "Artist", id: "artist-1", status: 1 } },
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":1');
	});
});

describe("ArtistService.UNARCHIVE_ARTIST_MUTATION", () => {
	it("unarchives an artist by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistService.UNARCHIVE_ARTIST_MUTATION,
				variables: { artistId: "artist-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistService.UNARCHIVE_ARTIST_MUTATION,
								variables: { artistId: "artist-1" },
							},
							result: {
								data: { unarchiveArtist: { __typename: "Artist", id: "artist-1", status: null } },
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":null');
	});
});

// ---- useCheckBookingSlug / CHECK_BOOKING_SLUG ----------------------------------------------------

describe("ArtistService.useCheckBookingSlug", () => {
	function LazyHarness({ slug }) {
		const [checkSlug, { data, called }] = ArtistService.useCheckBookingSlug();
		return React.createElement(
			"div",
			null,
			React.createElement(
				"button",
				{ onClick: () => checkSlug({ variables: { slug } }) },
				"check",
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
				React.createElement(LazyHarness, { slug: "renee-tattoo" }),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires CHECK_BOOKING_SLUG with the given slug once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistService.CHECK_BOOKING_SLUG,
								variables: { slug: "renee-tattoo" },
							},
							result: {
								data: {
									checkBookingSlugAvailable: {
										__typename: "BookingSlugAvailability",
										slug: "renee-tattoo",
										available: true,
										reason: null,
									},
								},
							},
						},
					],
				},
				React.createElement(LazyHarness, { slug: "renee-tattoo" }),
			),
		);

		await user.click(screen.getByRole("button", { name: "check" }));

		expect(await screen.findByTestId("result")).toHaveTextContent('"available":true');
	});

	// fetchPolicy: "network-only" - a stale cached "taken" from a previous check is a worse answer
	// than a fresh network round trip while the artist is actively typing. Confirmed by asking the
	// same lazy-query instance to hit the network again for the same slug and getting the SECOND
	// mock's (different) answer rather than a cached copy of the first.
	it("always asks the network again rather than serving a cached result for a repeated slug", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistService.CHECK_BOOKING_SLUG,
								variables: { slug: "renee-tattoo" },
							},
							result: {
								data: {
									checkBookingSlugAvailable: {
										__typename: "BookingSlugAvailability",
										slug: "renee-tattoo",
										available: true,
										reason: null,
									},
								},
							},
						},
						{
							request: {
								query: ArtistService.CHECK_BOOKING_SLUG,
								variables: { slug: "renee-tattoo" },
							},
							result: {
								data: {
									checkBookingSlugAvailable: {
										__typename: "BookingSlugAvailability",
										slug: "renee-tattoo",
										available: false,
										reason: "That link is taken.",
									},
								},
							},
						},
					],
				},
				React.createElement(LazyHarness, { slug: "renee-tattoo" }),
			),
		);

		await user.click(screen.getByRole("button", { name: "check" }));
		expect(await screen.findByTestId("result")).toHaveTextContent('"available":true');

		await user.click(screen.getByRole("button", { name: "check" }));
		await waitFor(() => {
			expect(screen.getByTestId("result")).toHaveTextContent('"available":false');
		});
	});
});

// ---- UPDATE_MY_BOOKING_SLUG_MUTATION --------------------------------------------------------------

describe("ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION", () => {
	it("updates the current artist's own booking slug", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
				variables: { slug: "new-handle" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ArtistService.UPDATE_MY_BOOKING_SLUG_MUTATION,
								variables: { slug: "new-handle" },
							},
							result: {
								data: {
									updateMyBookingSlug: {
										__typename: "Artist",
										id: "artist-1",
										bookingSlug: "new-handle",
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
		expect(await screen.findByTestId("result")).toHaveTextContent("new-handle");
	});
});
