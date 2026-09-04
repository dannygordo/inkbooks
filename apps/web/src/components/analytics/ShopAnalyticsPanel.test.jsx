// ShopAnalyticsPanel.jsx tests. Sibling of ArtistPerformancePanel.jsx, tested the same way for the
// same reason: AnalyticsService is mocked directly rather than hand-built as MockedProvider GraphQL
// mocks, since this component's own job is labelling/gating/laying out what getShopAnalytics
// returns, not the query document itself (already covered by AnalyticsService's own generated
// hook). DateRangePicker has its own test file and is stubbed to a single button, same convention
// ArtistPerformancePanel.test.jsx uses.
//
// THE rule this file exists to pin: canSeeMoney is the ONLY thing gating the Money/Deposits
// sections and the per-artist table's money columns - Staff never sees a currency figure here,
// full stop, regardless of what the (possibly still-null, server-enforced) money fields on the
// aggregate actually contain.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ShopAnalyticsPanel from "./ShopAnalyticsPanel";
import AnalyticsService from "../../services/AnalyticsService";

vi.mock("../../services/AnalyticsService", async (importOriginal) => {
	const actual = await importOriginal();
	const overridden = { ...actual.default, getShopAnalytics: vi.fn() };
	return { ...actual, default: overridden, AnalyticsService: overridden };
});

// Fixed "Last month" range on click, same stub ArtistPerformancePanel.test.jsx uses - this file
// only needs to see that DateRangePicker is on screen with the current range's label, not exercise
// its own preset logic.
vi.mock("./DateRangePicker", () => ({
	default: ({ value, onChange }) => (
		<button
			onClick={() =>
				onChange({
					key: "last_month",
					label: "Last month",
					start: new Date("2026-07-01T00:00:00.000Z"),
					end: new Date("2026-08-01T00:00:00.000Z"),
				})
			}
		>
			range: {value?.label}
		</button>
	),
}));

function shopAnalytics(overrides = {}) {
	return {
		revenueCents: 900000,
		tipsCents: 40000,
		averageTipCents: 8000,
		tippedCount: 5,
		shopCutEarnedCents: 80000,
		shopCutOutstandingCents: 20000,
		shopCutAwaitingConfirmationCents: 0,
		depositsCollectedCents: 30000,
		depositsAppliedCents: 15000,
		depositsOutstandingCents: 8000,
		completedSessionCount: 12,
		consultCount: 3,
		appointmentCount: 15,
		upcomingCount: 4,
		activeProjectCount: 6,
		newProjectCount: 2,
		totalClientCount: 20,
		newClientCount: 3,
		artistCount: 4,
		artists: [],
		...overrides,
	};
}

function setupHook({ data = shopAnalytics(), loading = false, error = undefined } = {}) {
	AnalyticsService.getShopAnalytics.mockReturnValue({
		data: data ? { getShopAnalytics: data } : undefined,
		loading,
		error,
	});
}

function renderPanel({ shopId = "shop-1", canSeeMoney = true } = {}) {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<ShopAnalyticsPanel shopId={shopId} canSeeMoney={canSeeMoney} />
			<Routes>
				<Route path="/artist/*" element={<div data-testid="navigated-artist" />} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

it("shows a message and no query at all when there is no shopId", () => {
	renderPanel({ shopId: null });

	expect(
		screen.getByText("You aren't connected to a shop yet, so there are no shop-wide figures to show."),
	).toBeInTheDocument();
	expect(AnalyticsService.getShopAnalytics).not.toHaveBeenCalled();
});

it("shows a page loader while loading with nothing cached yet", () => {
	setupHook({ data: null, loading: true });
	renderPanel();

	expect(screen.getByRole("progressbar")).toBeInTheDocument();
});

it("keeps showing the previous figures while a new range loads, instead of blanking to a loader", () => {
	setupHook({ data: shopAnalytics({ revenueCents: 100000 }), loading: true });
	renderPanel();

	expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
	expect(screen.getByText("$1,000.00")).toBeInTheDocument();
});

it("shows the query's error message instead of the figures", () => {
	setupHook({ data: null, error: { message: "network down" } });
	renderPanel();

	expect(screen.getByText("Couldn't load shop analytics: network down")).toBeInTheDocument();
});

describe("canSeeMoney = true (Shop Admin or better)", () => {
	it("shows the Money and Deposits sections with formatted figures", () => {
		setupHook({ data: shopAnalytics({ revenueCents: 900000, tipsCents: 40000 }) });
		renderPanel({ canSeeMoney: true });

		expect(screen.getByText("Money")).toBeInTheDocument();
		expect(screen.getByText("Revenue")).toBeInTheDocument();
		expect(screen.getByText("$9,000.00")).toBeInTheDocument();
		expect(screen.getByText("Tips")).toBeInTheDocument();
		expect(screen.getByText("$400.00")).toBeInTheDocument();
		expect(screen.getByText("Deposits")).toBeInTheDocument();
		expect(screen.getByText("already included in revenue")).toBeInTheDocument();
	});

	it("marks 'Awaiting your confirmation' as needing review only when it is above zero", () => {
		setupHook({ data: shopAnalytics({ shopCutAwaitingConfirmationCents: 5000 }) });
		renderPanel({ canSeeMoney: true });

		expect(screen.getByText("needs review")).toBeInTheDocument();
	});

	it("shows the money columns on the per-artist table", () => {
		setupHook({
			data: shopAnalytics({
				artists: [
					{
						userId: "a1",
						artistId: "artistdoc-1",
						revenueCents: 100000,
						tipsCents: 5000,
						shopCutOutstandingCents: 10000,
						completedSessionCount: 3,
						user: { id: "a1", firstName: "Jordan", lastName: "Ink", tagColor: "#122152" },
					},
				],
			}),
		});
		renderPanel({ canSeeMoney: true });

		expect(screen.getByText("By artist")).toBeInTheDocument();
		expect(screen.getByText("Jordan Ink")).toBeInTheDocument();
		expect(screen.getByText("Revenue")).toBeInTheDocument();
		expect(screen.getByText("Tips")).toBeInTheDocument();
		expect(screen.getByText("Cut owed")).toBeInTheDocument();
		expect(screen.getByText("$1,000.00")).toBeInTheDocument();
	});
});

describe("canSeeMoney = false (Staff)", () => {
	it("renders no Money or Deposits section at all", () => {
		setupHook({ data: shopAnalytics() });
		renderPanel({ canSeeMoney: false });

		expect(screen.queryByText("Money")).not.toBeInTheDocument();
		expect(screen.queryByText("Deposits")).not.toBeInTheDocument();
		expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
	});

	it("still shows the money-free Activity and Clients sections", () => {
		setupHook({ data: shopAnalytics({ completedSessionCount: 12, totalClientCount: 20 }) });
		renderPanel({ canSeeMoney: false });

		expect(screen.getByText("Activity")).toBeInTheDocument();
		expect(screen.getByText("Sessions completed")).toBeInTheDocument();
		expect(screen.getByText("12")).toBeInTheDocument();
		expect(screen.getByText("Clients")).toBeInTheDocument();
		expect(screen.getByText("20")).toBeInTheDocument();
	});

	// The whole reason ShopAnalyticsPanel builds this table itself rather than reusing StatCard's
	// null-as-em-dash rule for a hidden money column: a row of dashes is still a row, and a table
	// with a "Revenue" header full of dashes reads as "the data failed to load", not "you can't see
	// this". Dropping the columns entirely is the only version of this that doesn't look broken.
	it("drops the money columns from the per-artist table entirely, not just their values", () => {
		setupHook({
			data: shopAnalytics({
				artists: [
					{
						userId: "a1",
						revenueCents: 100000,
						completedSessionCount: 3,
						user: { id: "a1", firstName: "Jordan", lastName: "Ink", tagColor: "#122152" },
					},
				],
			}),
		});
		renderPanel({ canSeeMoney: false });

		expect(screen.getByText("By artist")).toBeInTheDocument();
		expect(screen.getByText("Jordan Ink")).toBeInTheDocument();
		expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
		expect(screen.queryByText("Cut owed")).not.toBeInTheDocument();
	});
});

describe("per-artist table", () => {
	it("shows 'No artist activity in this range.' when the artists array is empty", () => {
		setupHook({ data: shopAnalytics({ artists: [] }) });
		renderPanel();

		expect(screen.getByText("No artist activity in this range.")).toBeInTheDocument();
	});

	it("falls back to 'Unknown artist' when a row has no user record", () => {
		setupHook({ data: shopAnalytics({ artists: [{ userId: "a1", user: null }] }) });
		renderPanel();

		expect(screen.getByText("Unknown artist")).toBeInTheDocument();
	});

	it("navigates to the artist's page when a row WITH an artistId is clicked", async () => {
		const user = userEvent.setup();
		setupHook({
			data: shopAnalytics({
				artists: [
					{
						userId: "a1",
						artistId: "artistdoc-9",
						user: { id: "a1", firstName: "Jordan", lastName: "Ink", tagColor: "#122152" },
					},
				],
			}),
		});
		renderPanel();

		await user.click(screen.getByText("Jordan Ink"));

		expect(await screen.findByTestId("navigated-artist")).toBeInTheDocument();
	});

	// artistId is the Artist DOCUMENT's id, resolved server-side, distinct from the User id these
	// rows are keyed by (see the component's own comment) - a row missing it must not be clickable
	// at all, rather than linking to a route keyed by the wrong id that would 404.
	it("is not clickable when a row has no artistId", async () => {
		const user = userEvent.setup();
		setupHook({
			data: shopAnalytics({
				artists: [{ userId: "a1", artistId: null, user: { id: "a1", firstName: "Jordan", lastName: "Ink" } }],
			}),
		});
		renderPanel();

		await user.click(screen.getByText("Jordan Ink"));

		expect(screen.queryByTestId("navigated-artist")).not.toBeInTheDocument();
	});
});

describe("changing the date range", () => {
	it("re-queries getShopAnalytics with the new range once a preset is picked", async () => {
		const user = userEvent.setup();
		setupHook();
		renderPanel();

		await user.click(screen.getByText(/range: This month/));

		const lastCall =
			AnalyticsService.getShopAnalytics.mock.calls[AnalyticsService.getShopAnalytics.mock.calls.length - 1];
		expect(lastCall[1]).toEqual(expect.objectContaining({ key: "last_month", label: "Last month" }));
	});
});
