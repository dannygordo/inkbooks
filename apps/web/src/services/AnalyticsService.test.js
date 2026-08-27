// AnalyticsService.js tests. Same convention as ClientService.test.js: a "Service" file here is
// an IIFE exporting hook-factory functions wrapping useQuery around a gql document, plus the raw
// documents themselves - there's essentially no pure logic to unit-test in isolation, so every
// export is exercised through a tiny throwaway harness component rendered under MockedProvider.
//
// Written with React.createElement rather than JSX: this codebase's .js files (as opposed to
// .jsx) cannot contain literal JSX at all under this project's Vite/oxc pipeline, and this file
// stays a .js to match its sibling AnalyticsService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import AnalyticsService from "./AnalyticsService";

// ---- generic harness --------------------------------------------------------------------------

// Renders whatever a query-returning hook function produces. `hookFn` is called with no args and
// must itself close over any variables it needs.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// These tests only need to know THAT a request errored (e.g. no mock matched, proving a
		// network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

function shopAnalyticsPayload(overrides = {}) {
	return {
		__typename: "Analytics",
		start: "2026-08-01T00:00:00.000Z",
		end: "2026-08-31T23:59:59.999Z",
		revenueCents: 500000,
		subtotalCents: 480000,
		taxCents: 15000,
		feeCents: 5000,
		tipsCents: 50000,
		averageTipCents: 2500,
		tippedCount: 20,
		shopCutEarnedCents: 100000,
		shopCutOutstandingCents: 10000,
		shopCutAwaitingConfirmationCents: 2000,
		depositsCollectedCents: 30000,
		depositsAppliedCents: 20000,
		depositsOutstandingCents: 10000,
		expensesCents: 4000,
		otherIncomeCents: 0,
		netCents: 496000,
		completedSessionCount: 40,
		consultCount: 5,
		appointmentCount: 45,
		upcomingCount: 8,
		activeProjectCount: 12,
		newProjectCount: 3,
		totalClientCount: 60,
		newClientCount: 4,
		artistCount: 3,
		artists: [
			{
				__typename: "ArtistAnalytics",
				userId: "user-1",
				artistId: "artist-1",
				revenueCents: 200000,
				tipsCents: 20000,
				shopCutEarnedCents: 40000,
				shopCutOutstandingCents: 4000,
				shopCutAwaitingConfirmationCents: 1000,
				completedSessionCount: 15,
				consultCount: 2,
				appointmentCount: 17,
				user: {
					__typename: "User",
					id: "user-1",
					firstName: "Renee",
					lastName: "Wolf",
					avatar: null,
					tagColor: "#ff0000",
				},
			},
		],
		...overrides,
	};
}

function artistAnalyticsPayload(overrides = {}) {
	return {
		__typename: "Analytics",
		start: "2026-08-01T00:00:00.000Z",
		end: "2026-08-31T23:59:59.999Z",
		revenueCents: 200000,
		subtotalCents: 190000,
		taxCents: 8000,
		feeCents: 2000,
		tipsCents: 20000,
		averageTipCents: 2000,
		tippedCount: 10,
		shopCutEarnedCents: 40000,
		shopCutOutstandingCents: 4000,
		shopCutAwaitingConfirmationCents: 1000,
		depositsCollectedCents: 10000,
		depositsAppliedCents: 8000,
		depositsOutstandingCents: 2000,
		expensesCents: 1000,
		otherIncomeCents: 0,
		netCents: 199000,
		completedSessionCount: 15,
		consultCount: 2,
		appointmentCount: 17,
		upcomingCount: 3,
		activeProjectCount: 5,
		newProjectCount: 1,
		totalClientCount: 20,
		newClientCount: 2,
		artistCount: 1,
		...overrides,
	};
}

// ---- getShopAnalytics ---------------------------------------------------------------------------

describe("AnalyticsService.getShopAnalytics", () => {
	const range = { start: "2026-08-01T00:00:00.000Z", end: "2026-08-31T23:59:59.999Z" };

	it("resolves with the shop analytics payload, including the per-artist breakdown", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getShopAnalytics("shop-1", range),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AnalyticsService.FETCH_SHOP_ANALYTICS,
								variables: { shopId: "shop-1", start: range.start, end: range.end },
							},
							result: { data: { getShopAnalytics: shopAnalyticsPayload() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Renee");
		expect(result).toHaveTextContent("500000");
	});

	// Money fields are nullable and come back null for a caller below Shop Admin - per the file's
	// own header comment, that split happens server-side, so the client just has to render nulls
	// without choking on them.
	it("renders null money fields as-is (the split is the server's decision, not the client's)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getShopAnalytics("shop-1", range),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AnalyticsService.FETCH_SHOP_ANALYTICS,
								variables: { shopId: "shop-1", start: range.start, end: range.end },
							},
							result: {
								data: {
									getShopAnalytics: shopAnalyticsPayload({
										revenueCents: null,
										shopCutEarnedCents: null,
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"revenueCents":null');
		expect(result).toHaveTextContent('"shopCutEarnedCents":null');
	});

	// skip: !shopId || !range - no shopId at all must never fire a request.
	it("skips the query when shopId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getShopAnalytics(null, range),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// skip: !shopId || !range - no range at all (e.g. before the caller has picked a date range)
	// must also never fire a request.
	it("skips the query when range is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getShopAnalytics("shop-1", undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// range?.start / range?.end - an object missing one edge is still a truthy `range`, so the
	// query fires, just with an undefined boundary on that side.
	it("still fires with undefined start/end when range is present but missing them", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getShopAnalytics("shop-1", {}),
			});
		}
		// Zero mocks registered: reaching an error (rather than a quiet skip) proves the query was
		// actually attempted with shopId: "shop-1", start: undefined, end: undefined.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- getArtistAnalytics -------------------------------------------------------------------------

describe("AnalyticsService.getArtistAnalytics", () => {
	const range = { start: "2026-08-01T00:00:00.000Z", end: "2026-08-31T23:59:59.999Z" };

	it("resolves with the artist's own analytics payload", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getArtistAnalytics("user-1", range),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AnalyticsService.FETCH_ARTIST_ANALYTICS,
								variables: { userId: "user-1", start: range.start, end: range.end },
							},
							result: { data: { getArtistAnalytics: artistAnalyticsPayload() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"completedSessionCount":15');
	});

	// Same shape of money-field querying does NOT include the per-artist `artists` breakdown that
	// the shop query has - an artist's own analytics has no roster to break down.
	it("does not select an artists breakdown field (unlike FETCH_SHOP_ANALYTICS)", async () => {
		const { print } = await import("graphql");
		const printed = print(AnalyticsService.FETCH_ARTIST_ANALYTICS);
		expect(printed).not.toContain("artists {");
	});

	// skip: !userId || !range
	it("skips the query when userId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getArtistAnalytics(undefined, range),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// skip: !userId || !range
	it("skips the query when range is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AnalyticsService.getArtistAnalytics("user-1", null),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});
