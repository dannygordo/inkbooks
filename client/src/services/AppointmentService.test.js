// AppointmentService.js tests. Same convention as ClientService.test.js (read that file's own
// header first) and demonstrated for this exact service by
// components/ibCalendar/UpdateEventDialog.test.jsx: a "Service" file here is an IIFE exporting a
// mix of React-hook factories wrapping useQuery/useMutation/useLazyQuery around a gql document,
// plus raw gql documents meant to be handed directly to a caller's own useMutation/useQuery -
// there is almost no pure logic to unit-test in isolation, so every export is exercised through a
// tiny throwaway harness component rendered under MockedProvider. Mocks are built from the REAL
// exported gql document whenever one is exported directly (AppointmentService exports far more of
// its documents raw than ClientService does, specifically so components AND this test file don't
// have to hand-copy them - see the service's own comment on FETCH_APPOINTMENT); the handful that
// are only used internally (the two shop-cut-payout-candidates queries, the pending-confirmations
// query, and the by-project query) are reconstructed field-for-field below, noting as
// ClientService.test.js does that MockedProvider matches a request by the document's printed text
// plus variables, not by reference identity - so a hand copy here still fails loudly if the real
// query in AppointmentService.js ever drifts from what's copied.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling
// AppointmentService.js.
//
// AppointmentService is a large file (30+ exports) covering calendar queries (shop-wide and
// per-artist), the artist/shop performance-dashboard queries (upcoming/completed/payout
// candidates), full CRUD + shop-cut-ledger mutations, session-timer mutations, the in-project
// session list, the consult detail query, and the charge-quote lazy query. Every export in the
// service's final return object gets at least one test below - see the section header comments,
// each named after the export(s) it covers.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useQuery, useMutation } from "@apollo/client";
import { getOperationName } from "@apollo/client/utilities";
import { AppointmentService } from "./AppointmentService";

// ---- generic harnesses (same shape as ClientService.test.js) -----------------------------------

// Renders whatever a query/lazy-query-returning hook function produces. `hookFn` is called with
// no args and must itself close over any variables it needs - this lets one harness cover every
// query-shaped export without repeating the loading/error/data plumbing each time.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// Deliberately generic: these tests only need to know THAT a request errored (e.g. no
		// mock matched, proving a network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once
// it lands.
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

// ---- shared fixtures --------------------------------------------------------------------------
//
// MockedProvider hands back exactly whatever object is put in a mock's `result.data` - it is not
// filtered down to a query's own selection set - so one "fat" fixture covering the union of every
// Appointment-shaped query's fields can be reused everywhere below without breaking any single
// query's matching (matching only ever depends on the request half of a mock). Individual tests
// still only assert on the handful of fields that particular query actually cares about.

function fatUser(overrides = {}) {
	return {
		__typename: "User",
		id: "user-1",
		tagColor: "#112233",
		firstName: "Gendry",
		lastName: "Baratheon",
		avatar: null,
		...overrides,
	};
}

function fatClient(overrides = {}) {
	return {
		__typename: "Client",
		id: "client-1",
		firstName: "Arya",
		lastName: "Stark",
		email: "arya@example.com",
		phone: "555-0100",
		user: { __typename: "User", id: "user-2", firstName: "Arya", lastName: "Stark", avatar: null },
		...overrides,
	};
}

function fatProject(overrides = {}) {
	return {
		__typename: "Project",
		id: "project-1",
		title: "Half sleeve - koi",
		status: "in_progress",
		depositCollectedCents: 5000,
		designImages: [{ __typename: "DesignImage", url: "https://example.com/design.png" }],
		client: fatClient(),
		...overrides,
	};
}

function fatBookingRequestRef(overrides = {}) {
	return {
		__typename: "BookingRequest",
		id: "br-1",
		client: { __typename: "Client", id: "client-1", firstName: "Arya", lastName: "Stark" },
		...overrides,
	};
}

function fatAppointment(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "appt-1",
		projectId: "project-1",
		userId: "user-1",
		bookingRequestId: null,
		project: fatProject(),
		bookingRequest: null,
		shopId: "shop-1",
		isPersonal: false,
		user: fatUser(),
		title: "Sleeve session 2",
		description: "Continuing the sleeve piece",
		appointmentType: "session",
		appointmentDate: "2026-08-01T12:00:00.000Z",
		durationMinutes: 120,
		appointmentEnd: "2026-08-01T14:00:00.000Z",
		appointmentStatus: "scheduled",
		totalCents: 24000,
		subtotalCents: 20000,
		taxCents: 1500,
		feeCents: 0,
		tipCents: 2500,
		shopCutStatus: "none",
		shopCutCents: 0,
		shopCutPercentApplied: 10,
		shopCutPaymentMethod: null,
		shopCutSquareInvoiceId: null,
		shopCutMarkedPaidAt: null,
		shopCutConfirmedAt: null,
		depositCents: 0,
		depositStatus: null,
		depositCreditCents: 0,
		depositCreditFromAppointmentId: null,
		timerStatus: "stopped",
		timerStartedAt: null,
		accumulatedSeconds: 0,
		sessionNotes: null,
		adjustments: [],
		...overrides,
	};
}

function pageInfo(overrides = {}) {
	return {
		__typename: "PageInfo",
		totalCount: 1,
		hasMore: false,
		limit: 200,
		offset: 0,
		...overrides,
	};
}

// ---- CALENDAR_REFETCH_QUERIES ------------------------------------------------------------------

describe("AppointmentService.CALENDAR_REFETCH_QUERIES", () => {
	// Built off the real exported documents (never hardcoded operation-name strings) so a rename of
	// any one of the three calendar-drawing queries fails this test rather than silently drifting -
	// matching the service's own comment on why this list is built "read off the documents rather
	// than written as literals".
	it("lists exactly the three calendar-drawing queries' operation names", () => {
		const expected = [
			AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
			AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST,
			AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
		].map(getOperationName);

		expect(AppointmentService.CALENDAR_REFETCH_QUERIES).toHaveLength(3);
		expect(AppointmentService.CALENDAR_REFETCH_QUERIES).toEqual(expected);
	});
});

// ---- getAppointmentsByShop / FETCH_APPOINTMENTS_BY_SHOP ----------------------------------------

describe("AppointmentService.getAppointmentsByShop", () => {
	const range = { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" };

	it("resolves with a shop's appointments, defaulting page to a 200-item window", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByShop("shop-1", range),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
								variables: { shopId: "shop-1", filter: range, page: { limit: 200 } },
							},
							result: {
								data: {
									getAppointmentsByShop: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo() },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});

	it("passes an explicit page through instead of the 200-item default", async () => {
		const page = { limit: 25, offset: 50 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByShop("shop-1", range, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
								variables: { shopId: "shop-1", filter: range, page },
							},
							result: {
								data: {
									getAppointmentsByShop: { __typename: "AppointmentPage", items: [], pageInfo: pageInfo({ limit: 25, offset: 50 }) },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	// skip: !shopId || !range - an independent artist with no shop connection, or a caller with no
	// range yet, must never fire this against the server (see the service's own comment on why).
	it("skips the query when shopId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByShop(null, range),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("skips the query when range is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByShop("shop-1", undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AppointmentService.FETCH_APPOINTMENTS_BY_SHOP (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery - the same
	// document getUpcomingAppointmentsForShop/getCompletedAppointmentsForShop reuse internally
	// below, and the one AppointmentsList.jsx runs directly per the service's own comments.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(AppointmentService.FETCH_APPOINTMENTS_BY_SHOP, {
						variables: { shopId: "shop-1", filter: undefined, page: { limit: 200 } },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
								variables: { shopId: "shop-1", filter: undefined, page: { limit: 200 } },
							},
							result: {
								data: {
									getAppointmentsByShop: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo() },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});
});

// ---- getAppointmentsByArtist / FETCH_APPOINTMENTS_BY_ARTIST ------------------------------------

describe("AppointmentService.getAppointmentsByArtist", () => {
	it("resolves with one artist's full appointment history", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByArtist("user-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST,
								variables: { userId: "user-1" },
							},
							result: {
								data: {
									getAppointmentsByArtist: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo() },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});

	it("skips the query when userId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByArtist(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST (raw document)", () => {
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST, {
						variables: { userId: "user-1", filter: undefined, page: undefined },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST,
								variables: { userId: "user-1", filter: undefined, page: undefined },
							},
							result: {
								data: {
									getAppointmentsByArtist: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo() },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});
});

// ---- getUpcomingAppointments / getCompletedAppointments (per-artist dashboard) -----------------

describe("AppointmentService.getUpcomingAppointments", () => {
	it("filters upcomingOnly with default limit/offset when no range is given", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getUpcomingAppointments("user-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST,
								variables: {
									userId: "user-1",
									filter: { upcomingOnly: true },
									page: { limit: 5, offset: 0 },
								},
							},
							result: {
								data: {
									getAppointmentsByArtist: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo({ limit: 5 }) },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});

	// The filter intersects upcomingOnly WITH the given range rather than one overwriting the
	// other - see the service's own comment. rangeToFilterBounds turns {start,end} into {from,to}.
	it("intersects upcomingOnly with a given range, custom limit and offset", async () => {
		const range = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getUpcomingAppointments("user-1", 10, range, 20),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST,
								variables: {
									userId: "user-1",
									filter: {
										upcomingOnly: true,
										from: "2026-08-01T00:00:00.000Z",
										to: "2026-09-01T00:00:00.000Z",
									},
									page: { limit: 10, offset: 20 },
								},
							},
							result: {
								data: {
									getAppointmentsByArtist: { __typename: "AppointmentPage", items: [], pageInfo: pageInfo({ totalCount: 0, limit: 10, offset: 20 }) },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	it("skips the query when userId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getUpcomingAppointments(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AppointmentService.getCompletedAppointments", () => {
	it("filters appointmentStatus: completed with default limit/offset", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getCompletedAppointments("user-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST,
								variables: {
									userId: "user-1",
									filter: { appointmentStatus: "completed" },
									page: { limit: 5, offset: 0 },
								},
							},
							result: {
								data: {
									getAppointmentsByArtist: {
										__typename: "AppointmentPage",
										items: [fatAppointment({ appointmentStatus: "completed" })],
										pageInfo: pageInfo({ limit: 5 }),
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("completed");
	});

	it("skips the query when userId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getCompletedAppointments(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getUpcomingAppointmentsForShop / getCompletedAppointmentsForShop (shop-wide dashboard) ----

describe("AppointmentService.getUpcomingAppointmentsForShop", () => {
	it("reuses FETCH_APPOINTMENTS_BY_SHOP with an upcomingOnly filter", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getUpcomingAppointmentsForShop("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
								variables: {
									shopId: "shop-1",
									filter: { upcomingOnly: true },
									page: { limit: 5, offset: 0 },
								},
							},
							result: {
								data: {
									getAppointmentsByShop: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo({ limit: 5 }) },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});

	it("skips the query when shopId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getUpcomingAppointmentsForShop(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AppointmentService.getCompletedAppointmentsForShop", () => {
	it("reuses FETCH_APPOINTMENTS_BY_SHOP with an appointmentStatus: completed filter", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getCompletedAppointmentsForShop("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_SHOP,
								variables: {
									shopId: "shop-1",
									filter: { appointmentStatus: "completed" },
									page: { limit: 5, offset: 0 },
								},
							},
							result: {
								data: {
									getAppointmentsByShop: {
										__typename: "AppointmentPage",
										items: [fatAppointment({ appointmentStatus: "completed" })],
										pageInfo: pageInfo({ limit: 5 }),
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("completed");
	});

	it("skips the query when shopId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getCompletedAppointmentsForShop(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getShopCutPayoutCandidates / getShopCutPayoutCandidatesByShop -----------------------------
//
// Both queries are internal-only (no FETCH_* export) - reconstructed field-for-field from the
// source below, same as ClientService.test.js does for FETCH_CLIENT_QUERY.

const FETCH_SHOP_CUT_PAYOUT_CANDIDATES_FOR_TESTS = gql`
	query GetShopCutPayoutCandidates($userId: ID!, $filter: AppointmentFilter) {
		getShopCutPayoutCandidates(userId: $userId, filter: $filter) {
			id
			title
			appointmentDate
			durationMinutes
			appointmentEnd
			appointmentStatus
			totalCents
			subtotalCents
			shopId
			shopCutStatus
			shopCutCents
			shopCutPaymentMethod
			shopCutSquareInvoiceId
			userId
			user {
				id
				firstName
				lastName
				tagColor
			}
			projectId
			project {
				id
				title
				status
				client {
					id
					user {
						id
						firstName
						lastName
					}
				}
			}
		}
	}
`;

const FETCH_SHOP_CUT_PAYOUT_CANDIDATES_BY_SHOP_FOR_TESTS = gql`
	query GetShopCutPayoutCandidatesByShop($shopId: ID!, $filter: AppointmentFilter) {
		getShopCutPayoutCandidatesByShop(shopId: $shopId, filter: $filter) {
			id
			title
			appointmentDate
			durationMinutes
			appointmentEnd
			appointmentStatus
			totalCents
			subtotalCents
			shopId
			shopCutStatus
			shopCutCents
			shopCutPaymentMethod
			shopCutSquareInvoiceId
			userId
			user {
				id
				firstName
				lastName
				tagColor
			}
			projectId
			project {
				id
				title
				status
				client {
					id
					user {
						id
						firstName
						lastName
					}
				}
			}
		}
	}
`;

describe("AppointmentService.getShopCutPayoutCandidates", () => {
	// rangeToFilterBounds(undefined) is {} - "debts don't expire" by default, per the service's own
	// comment, rather than the filter key being omitted entirely.
	it("passes an empty filter object when no range is given", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getShopCutPayoutCandidates("user-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_SHOP_CUT_PAYOUT_CANDIDATES_FOR_TESTS,
								variables: { userId: "user-1", filter: {} },
							},
							result: {
								data: {
									getShopCutPayoutCandidates: [
										{
											__typename: "Appointment",
											id: "appt-1",
											title: "Sleeve session 2",
											appointmentDate: "2026-08-01T12:00:00.000Z",
											durationMinutes: 120,
											appointmentEnd: "2026-08-01T14:00:00.000Z",
											appointmentStatus: "completed",
											totalCents: 24000,
											subtotalCents: 20000,
											shopId: "shop-1",
											shopCutStatus: "unpaid",
											shopCutCents: 2000,
											shopCutPaymentMethod: null,
											shopCutSquareInvoiceId: null,
											userId: "user-1",
											user: fatUser(),
											projectId: "project-1",
											project: fatProject(),
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("unpaid");
	});

	it("scopes the filter to a given range", async () => {
		const range = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getShopCutPayoutCandidates("user-1", range),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_SHOP_CUT_PAYOUT_CANDIDATES_FOR_TESTS,
								variables: {
									userId: "user-1",
									filter: { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
								},
							},
							result: { data: { getShopCutPayoutCandidates: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("[]");
	});

	it("skips the query when userId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getShopCutPayoutCandidates(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AppointmentService.getShopCutPayoutCandidatesByShop", () => {
	it("is the shop-scoped counterpart, same selection set, shopId-only server-side", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getShopCutPayoutCandidatesByShop("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_SHOP_CUT_PAYOUT_CANDIDATES_BY_SHOP_FOR_TESTS,
								variables: { shopId: "shop-1", filter: {} },
							},
							result: {
								data: {
									getShopCutPayoutCandidatesByShop: [
										{
											__typename: "Appointment",
											id: "appt-2",
											title: "Full sleeve session",
											appointmentDate: "2026-08-02T12:00:00.000Z",
											durationMinutes: 90,
											appointmentEnd: "2026-08-02T13:30:00.000Z",
											appointmentStatus: "completed",
											totalCents: 30000,
											subtotalCents: 25000,
											shopId: "shop-1",
											shopCutStatus: "unpaid",
											shopCutCents: 2500,
											shopCutPaymentMethod: null,
											shopCutSquareInvoiceId: null,
											userId: "user-2",
											user: fatUser({ id: "user-2", firstName: "Sansa" }),
											projectId: "project-2",
											project: fatProject({ id: "project-2", title: "Direwolf back piece" }),
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Direwolf back piece");
	});

	it("skips the query when shopId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getShopCutPayoutCandidatesByShop(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getAppointmentsByArtistForCalendar / FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR ------------

describe("AppointmentService.getAppointmentsByArtistForCalendar", () => {
	const range = { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" };

	it("resolves with an artist's calendar month, defaulting page to a 200-item window", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByArtistForCalendar("user-1", range),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
								variables: { userId: "user-1", filter: range, page: { limit: 200 } },
							},
							result: {
								data: {
									getAppointmentsByArtist: { __typename: "AppointmentPage", items: [fatAppointment()], pageInfo: pageInfo() },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Sleeve session 2");
	});

	// The "My Calendars" personal-appointments reuse - see the service's own comment: extraFilter is
	// merged into the range filter rather than a fourth document being invented.
	it("merges extraFilter into the range filter, as the personal-calendar reuse does", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					AppointmentService.getAppointmentsByArtistForCalendar("user-1", range, undefined, {
						isPersonal: true,
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
								variables: {
									userId: "user-1",
									filter: { ...range, isPersonal: true },
									page: { limit: 200 },
								},
							},
							result: {
								data: {
									getAppointmentsByArtist: {
										__typename: "AppointmentPage",
										items: [fatAppointment({ isPersonal: true })],
										pageInfo: pageInfo(),
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"isPersonal":true');
	});

	it("passes an explicit page through instead of the 200-item default", async () => {
		const page = { limit: 10, offset: 0 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByArtistForCalendar("user-1", range, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AppointmentService.FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR,
								variables: { userId: "user-1", filter: range, page },
							},
							result: {
								data: {
									getAppointmentsByArtist: { __typename: "AppointmentPage", items: [], pageInfo: pageInfo({ limit: 10 }) },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	it("skips the query when userId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByArtistForCalendar(null, range),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("skips the query when range is missing - an unbounded fetch would defeat the range's purpose", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByArtistForCalendar("user-1", undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- CREATE_APPOINTMENT / UPDATE_APPOINTMENT / DELETE_APPOINTMENT ------------------------------

describe("AppointmentService.CREATE_APPOINTMENT", () => {
	it("creates an appointment from an AppointmentInput and returns the new row", async () => {
		const user = userEvent.setup();
		const appointmentInput = { title: "New consult", appointmentType: "consult", userId: "user-1" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.CREATE_APPOINTMENT,
				variables: { appointmentInput },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.CREATE_APPOINTMENT, variables: { appointmentInput } },
							result: {
								data: {
									createAppointment: {
										__typename: "Appointment",
										projectId: null,
										userId: "user-1",
										project: null,
										shopId: "shop-1",
										isPersonal: false,
										user: fatUser(),
										title: "New consult",
										description: null,
										appointmentType: "consult",
										id: "appt-3",
										appointmentDate: "2026-08-05T12:00:00.000Z",
										durationMinutes: 30,
										appointmentEnd: "2026-08-05T12:30:00.000Z",
										shopCutStatus: "none",
										shopCutCents: 0,
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
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("New consult");
		expect(result).toHaveTextContent("appt-3");
	});
});

describe("AppointmentService.UPDATE_APPOINTMENT", () => {
	it("updates an appointment and returns the saved fields", async () => {
		const user = userEvent.setup();
		const appointmentInput = { id: "appt-1", title: "Sleeve session 2 (rescheduled)" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.UPDATE_APPOINTMENT,
				variables: { appointmentInput },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.UPDATE_APPOINTMENT, variables: { appointmentInput } },
							result: {
								data: {
									updateAppointment: {
										__typename: "Appointment",
										projectId: "project-1",
										project: { __typename: "Project", designImages: [] },
										shopId: "shop-1",
										isPersonal: false,
										user: fatUser(),
										title: "Sleeve session 2 (rescheduled)",
										description: "Continuing the sleeve piece",
										appointmentType: "session",
										id: "appt-1",
										appointmentDate: "2026-08-03T12:00:00.000Z",
										durationMinutes: 120,
										appointmentEnd: "2026-08-03T14:00:00.000Z",
										shopCutStatus: "none",
										shopCutCents: 0,
										shopCutPaymentMethod: null,
										shopCutSquareInvoiceId: null,
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
		expect(await screen.findByTestId("result")).toHaveTextContent("rescheduled");
	});
});

describe("AppointmentService.DELETE_APPOINTMENT", () => {
	// Same mock UpdateEventDialog.test.jsx already registers for its own "clicking DELETE" test -
	// deleteAppointment returns a bare success string, not an object.
	it("deletes an appointment by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.DELETE_APPOINTMENT,
				variables: { appointmentId: "appt-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.DELETE_APPOINTMENT, variables: { appointmentId: "appt-1" } },
							result: { data: { deleteAppointment: "Appointment deleted successfully" } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Appointment deleted successfully");
	});
});

// ---- Shop-cut ledger mutations ------------------------------------------------------------------

describe("AppointmentService.CREATE_SHOP_CUT_INVOICE", () => {
	it("creates a Square invoice for one appointment's shop cut", async () => {
		const user = userEvent.setup();
		const variables = { appointmentId: "appt-1", paymentMethod: "square_invoice" };
		function Harness() {
			return React.createElement(MutationHarness, { document: AppointmentService.CREATE_SHOP_CUT_INVOICE, variables });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.CREATE_SHOP_CUT_INVOICE, variables },
							result: {
								data: {
									createShopCutInvoice: {
										__typename: "CreateShopCutInvoiceResult",
										invoiceUrl: "https://square.example/invoice/1",
										appointment: {
											__typename: "Appointment",
											id: "appt-1",
											shopCutStatus: "invoiced",
											shopCutPaymentMethod: "square_invoice",
											shopCutSquareInvoiceId: "sq-inv-1",
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

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("invoiced");
	});
});

describe("AppointmentService.CREATE_BATCH_SHOP_CUT_INVOICE", () => {
	it("combines several appointments' shop cuts into one invoice", async () => {
		const user = userEvent.setup();
		const variables = { appointmentIds: ["appt-1", "appt-2"], paymentMethod: "square_invoice" };
		function Harness() {
			return React.createElement(MutationHarness, { document: AppointmentService.CREATE_BATCH_SHOP_CUT_INVOICE, variables });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.CREATE_BATCH_SHOP_CUT_INVOICE, variables },
							result: {
								data: {
									createBatchShopCutInvoice: {
										__typename: "CreateBatchShopCutInvoiceResult",
										invoiceUrl: "https://square.example/invoice/2",
										appointments: [
											{ __typename: "Appointment", id: "appt-1", shopCutStatus: "invoiced", shopCutPaymentMethod: "square_invoice", shopCutSquareInvoiceId: "sq-inv-2" },
											{ __typename: "Appointment", id: "appt-2", shopCutStatus: "invoiced", shopCutPaymentMethod: "square_invoice", shopCutSquareInvoiceId: "sq-inv-2" },
										],
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
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("appt-1");
		expect(result).toHaveTextContent("appt-2");
	});
});

describe("AppointmentService.MARK_SHOP_CUT_PAID_MANUALLY", () => {
	it("marks a shop cut as paid by hand, artist-side", async () => {
		const user = userEvent.setup();
		const variables = { appointmentId: "appt-1" };
		function Harness() {
			return React.createElement(MutationHarness, { document: AppointmentService.MARK_SHOP_CUT_PAID_MANUALLY, variables });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.MARK_SHOP_CUT_PAID_MANUALLY, variables },
							result: {
								data: {
									markShopCutPaidManually: {
										__typename: "Appointment",
										id: "appt-1",
										shopCutStatus: "pending_confirmation",
										shopCutPaymentMethod: "cash",
										shopCutMarkedPaidAt: "2026-08-21T00:00:00.000Z",
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
		expect(await screen.findByTestId("result")).toHaveTextContent("pending_confirmation");
	});
});

describe("AppointmentService.CONFIRM_SHOP_CUT_PAID", () => {
	it("confirms a shop cut as paid, shop-side", async () => {
		const user = userEvent.setup();
		const variables = { appointmentId: "appt-1" };
		function Harness() {
			return React.createElement(MutationHarness, { document: AppointmentService.CONFIRM_SHOP_CUT_PAID, variables });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.CONFIRM_SHOP_CUT_PAID, variables },
							result: {
								data: {
									confirmShopCutPaid: {
										__typename: "Appointment",
										id: "appt-1",
										shopCutStatus: "paid",
										shopCutConfirmedAt: "2026-08-21T00:00:00.000Z",
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
		expect(await screen.findByTestId("result")).toHaveTextContent('"shopCutStatus":"paid"');
	});
});

// ---- getPendingShopCutConfirmations / FETCH_PENDING_SHOP_CUT_CONFIRMATIONS (internal-only) -----

const FETCH_PENDING_SHOP_CUT_CONFIRMATIONS_FOR_TESTS = gql`
	query GetPendingShopCutConfirmations($shopId: ID!) {
		getPendingShopCutConfirmations(shopId: $shopId) {
			id
			appointmentDate
			durationMinutes
			appointmentEnd
			title
			shopCutCents
			shopCutMarkedPaidAt
			user {
				id
				firstName
				lastName
				avatar
				tagColor
			}
		}
	}
`;

describe("AppointmentService.getPendingShopCutConfirmations", () => {
	it("resolves with a shop's inbox of manual mark-paid claims across every artist", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getPendingShopCutConfirmations("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_PENDING_SHOP_CUT_CONFIRMATIONS_FOR_TESTS, variables: { shopId: "shop-1" } },
							result: {
								data: {
									getPendingShopCutConfirmations: [
										{
											__typename: "Appointment",
											id: "appt-1",
											appointmentDate: "2026-08-01T12:00:00.000Z",
											durationMinutes: 120,
											appointmentEnd: "2026-08-01T14:00:00.000Z",
											title: "Sleeve session 2",
											shopCutCents: 2000,
											shopCutMarkedPaidAt: "2026-08-02T00:00:00.000Z",
											user: fatUser(),
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Sleeve session 2");
	});

	// Unlike the other hooks in this file, _getPendingShopCutConfirmations has no `skip` guard at
	// all - same as ClientService.fetchClient. Registering zero mocks and observing the query still
	// error out (rather than sitting quietly with loading:false/data:undefined) is the proof a real
	// request was attempted even with a falsy shopId.
	it("still fires the query even when shopId is falsy", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getPendingShopCutConfirmations(""),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- getAppointmentsByProject / FETCH_APPOINTMENTS_BY_PROJECT (internal-only) ------------------

const FETCH_APPOINTMENTS_BY_PROJECT_FOR_TESTS = gql`
	query GetAppointmentsByProject($projectId: ID!) {
		getAppointmentsByProject(projectId: $projectId) {
			id
			projectId
			userId
			shopId
			title
			description
			appointmentType
			appointmentDate
			durationMinutes
			appointmentEnd
			appointmentStatus
			subtotalCents
			taxCents
			feeCents
			tipCents
			totalCents
			shopCutCents
			shopCutStatus
			shopCutPercentApplied
			depositCents
			depositStatus
			depositCreditCents
			depositCreditFromAppointmentId
			timerStatus
			timerStartedAt
			accumulatedSeconds
			sessionNotes
			adjustments {
				id
				amountCents
				reason
				createdAt
				createdBy {
					id
					firstName
					lastName
				}
			}
		}
	}
`;

describe("AppointmentService.getAppointmentsByProject", () => {
	it("resolves with every session-type appointment tied to a project", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByProject("project-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_APPOINTMENTS_BY_PROJECT_FOR_TESTS, variables: { projectId: "project-1" } },
							result: {
								data: {
									getAppointmentsByProject: [
										{
											__typename: "Appointment",
											id: "appt-1",
											projectId: "project-1",
											userId: "user-1",
											shopId: "shop-1",
											title: "Sleeve session 2",
											description: "Continuing the sleeve piece",
											appointmentType: "session",
											appointmentDate: "2026-08-01T12:00:00.000Z",
											durationMinutes: 120,
											appointmentEnd: "2026-08-01T14:00:00.000Z",
											appointmentStatus: "completed",
											subtotalCents: 20000,
											taxCents: 1500,
											feeCents: 0,
											tipCents: 2500,
											totalCents: 24000,
											shopCutCents: 2000,
											shopCutStatus: "unpaid",
											shopCutPercentApplied: 10,
											depositCents: 0,
											depositStatus: null,
											depositCreditCents: 0,
											depositCreditFromAppointmentId: null,
											timerStatus: "stopped",
											timerStartedAt: null,
											accumulatedSeconds: 7200,
											sessionNotes: "Good progress on shading.",
											adjustments: [
												{
													__typename: "Adjustment",
													id: "adj-1",
													amountCents: -500,
													reason: "Comped touch-up",
													createdAt: "2026-08-01T15:00:00.000Z",
													createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
												},
											],
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Good progress on shading.");
		expect(result).toHaveTextContent("Comped touch-up");
	});

	it("skips the query when projectId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointmentsByProject(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- getAppointment / FETCH_APPOINTMENT (consult detail view) ----------------------------------

describe("AppointmentService.getAppointment", () => {
	it("resolves with the appointment plus its booking request, for a consult", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointment("appt-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.FETCH_APPOINTMENT, variables: { appointmentId: "appt-1" } },
							result: {
								data: {
									getAppointment: {
										__typename: "Appointment",
										id: "appt-1",
										title: "Consult - Arya Stark",
										description: null,
										appointmentType: "consult",
										appointmentDate: "2026-08-01T12:00:00.000Z",
										durationMinutes: 30,
										appointmentEnd: "2026-08-01T12:30:00.000Z",
										appointmentStatus: "scheduled",
										projectId: null,
										bookingRequestId: "br-1",
										bookingRequest: {
											__typename: "BookingRequest",
											id: "br-1",
											status: "consult_booked",
											description: "Wolf on the forearm",
											placement: "Forearm",
											size: "Medium",
											budget: "500",
											isCoverUp: false,
											referenceImages: [],
											client: fatClient(),
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Consult - Arya Stark");
		expect(result).toHaveTextContent("Wolf on the forearm");
	});

	it("skips the query when appointmentId is missing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointment(null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// UpdateEventDialog opens for every appointment type but only wants this for a consult - see
	// the service's own comment on why this has to be a `skip` in `options` rather than an `if`
	// around the hook call. A session must skip even though it has a real appointmentId.
	it("honors options.skip even with a valid appointmentId, as UpdateEventDialog does for sessions", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AppointmentService.getAppointment("appt-1", { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AppointmentService.FETCH_APPOINTMENT (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery - the exact use
	// UpdateEventDialog.test.jsx's own consultMock() helper makes of it.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => useQuery(AppointmentService.FETCH_APPOINTMENT, { variables: { appointmentId: "appt-1" } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.FETCH_APPOINTMENT, variables: { appointmentId: "appt-1" } },
							result: {
								data: {
									getAppointment: {
										__typename: "Appointment",
										id: "appt-1",
										title: "Consult - Arya Stark",
										description: null,
										appointmentType: "consult",
										appointmentDate: "2026-08-01T12:00:00.000Z",
										durationMinutes: 30,
										appointmentEnd: "2026-08-01T12:30:00.000Z",
										appointmentStatus: "scheduled",
										projectId: null,
										bookingRequestId: "br-1",
										bookingRequest: fatBookingRequestRef(),
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Consult - Arya Stark");
	});
});

// ---- Session-timer mutations: START/STOP/RESET_SESSION_TIMER ------------------------------------

function timerFields(overrides = {}) {
	return {
		__typename: "Appointment",
		id: "appt-1",
		timerStatus: "running",
		timerStartedAt: "2026-08-21T00:00:00.000Z",
		accumulatedSeconds: 0,
		...overrides,
	};
}

describe("AppointmentService.START_SESSION_TIMER", () => {
	it("starts the session timer and returns the shared timer fields", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.START_SESSION_TIMER,
				variables: { appointmentId: "appt-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.START_SESSION_TIMER, variables: { appointmentId: "appt-1" } },
							result: { data: { startSessionTimer: timerFields() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"timerStatus":"running"');
	});
});

describe("AppointmentService.STOP_SESSION_TIMER", () => {
	it("stops the session timer and returns accumulated seconds", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.STOP_SESSION_TIMER,
				variables: { appointmentId: "appt-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.STOP_SESSION_TIMER, variables: { appointmentId: "appt-1" } },
							result: {
								data: {
									stopSessionTimer: timerFields({ timerStatus: "stopped", timerStartedAt: null, accumulatedSeconds: 1800 }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"accumulatedSeconds":1800');
	});
});

describe("AppointmentService.RESET_SESSION_TIMER", () => {
	it("resets the session timer back to zero", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.RESET_SESSION_TIMER,
				variables: { appointmentId: "appt-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.RESET_SESSION_TIMER, variables: { appointmentId: "appt-1" } },
							result: {
								data: {
									resetSessionTimer: timerFields({ timerStatus: "stopped", timerStartedAt: null, accumulatedSeconds: 0 }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"accumulatedSeconds":0');
	});
});

// ---- UPDATE_SESSION_DETAILS ---------------------------------------------------------------------

describe("AppointmentService.UPDATE_SESSION_DETAILS", () => {
	it("saves the session detail view's narrower field set and returns the recomputed cut", async () => {
		const user = userEvent.setup();
		const appointmentInput = { id: "appt-1", appointmentDate: "2026-08-01T12:00:00.000Z", totalCents: 26000 };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AppointmentService.UPDATE_SESSION_DETAILS,
				variables: { appointmentInput },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.UPDATE_SESSION_DETAILS, variables: { appointmentInput } },
							result: {
								data: {
									updateAppointment: {
										__typename: "Appointment",
										id: "appt-1",
										appointmentDate: "2026-08-01T12:00:00.000Z",
										durationMinutes: 120,
										appointmentEnd: "2026-08-01T14:00:00.000Z",
										subtotalCents: 21000,
										tipCents: 2500,
										totalCents: 26000,
										shopCutCents: 2100,
										shopCutStatus: "unpaid",
										sessionNotes: null,
										appointmentStatus: "completed",
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
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"totalCents":26000');
		expect(result).toHaveTextContent('"shopCutCents":2100');
	});
});

// ---- GET_CHARGE_QUOTE / useChargeQuote -----------------------------------------------------------

describe("AppointmentService.useChargeQuote", () => {
	function ChargeQuoteHarness({ variables }) {
		const [getChargeQuote, { data, called }] = AppointmentService.useChargeQuote();
		return React.createElement(
			"div",
			null,
			React.createElement("button", { onClick: () => getChargeQuote({ variables }) }, "quote"),
			React.createElement("div", { "data-testid": "called" }, called ? "called" : "not-called"),
			data && React.createElement("div", { "data-testid": "result" }, JSON.stringify(data)),
		);
	}

	it("does not fire until triggered", async () => {
		render(
			React.createElement(
				MockedProvider,
				{ mocks: [] },
				React.createElement(ChargeQuoteHarness, { variables: { appointmentId: "appt-1" } }),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires GET_CHARGE_QUOTE with the given variables once triggered, and returns a server-computed quote", async () => {
		const user = userEvent.setup();
		const variables = {
			appointmentId: "appt-1",
			applyFeeOffset: true,
			tipCents: 1000,
			subtotalCentsOverride: null,
		};
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.GET_CHARGE_QUOTE, variables },
							result: {
								data: {
									getChargeQuote: {
										__typename: "ChargeQuote",
										subtotalCents: 20000,
										depositCreditCents: 0,
										netSubtotalCents: 20000,
										feeOffsetCents: 600,
										taxableCents: 20600,
										taxCents: 1545,
										tipCents: 1000,
										totalCents: 23145,
										giftCardCents: 0,
										amountDueCents: 23145,
										source: "square",
										canCharge: true,
									},
								},
							},
						},
					],
				},
				React.createElement(ChargeQuoteHarness, { variables }),
			),
		);

		await user.click(screen.getByRole("button", { name: "quote" }));

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"canCharge":true');
		expect(result).toHaveTextContent('"amountDueCents":23145');
	});
});

// ---- RECORD_ADJUSTMENT ----------------------------------------------------------------------------

describe("AppointmentService.RECORD_ADJUSTMENT", () => {
	it("records a post-hoc adjustment and returns the new row", async () => {
		const user = userEvent.setup();
		const input = { appointmentId: "appt-1", amountCents: -500, reason: "Comped touch-up" };
		function Harness() {
			return React.createElement(MutationHarness, { document: AppointmentService.RECORD_ADJUSTMENT, variables: { input } });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AppointmentService.RECORD_ADJUSTMENT, variables: { input } },
							result: {
								data: {
									recordAdjustment: {
										__typename: "Adjustment",
										id: "adj-1",
										amountCents: -500,
										reason: "Comped touch-up",
										createdAt: "2026-08-21T00:00:00.000Z",
										createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
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
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Comped touch-up");
		expect(result).toHaveTextContent("Gendry");
	});
});
