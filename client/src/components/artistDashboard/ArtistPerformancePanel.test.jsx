// ArtistPerformancePanel.jsx tests. This component fans out into EIGHT query hooks (an
// artist-scoped and a shop-scoped variant of analytics, upcoming appointments, completed
// appointments and payout candidates - see the component's own header comment on why: hooks can't
// be called conditionally, so "ask the shop-wide question instead" is expressed by always calling
// both and letting each one's own `skip` decide which side actually fires). Rather than hand-
// building eight sets of MockedProvider GraphQL mocks, AppointmentService/AnalyticsService are
// mocked directly (same approach AppointmentsList.test.jsx already takes for this exact
// component's sibling queries) - this component's own job is combining/labelling/gating what those
// hooks return, not the query documents themselves. ShopCutPayoutList is mocked out too: it has its
// own full test file (ShopCutPayoutList.test.jsx) and this file only needs to confirm it's handed
// the right props, the same "don't exercise somebody else's test" pattern IBPageActionBar.test.jsx
// uses for the wizard components it opens.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ArtistPerformancePanel from "./ArtistPerformancePanel";
import ShopCutPayoutList from "./ShopCutPayoutList";
import { AuthContext } from "../../context/auth";
import { AppointmentService } from "../../services/AppointmentService";
import AnalyticsService from "../../services/AnalyticsService";
import { ROLES } from "../../constants/auth";

vi.mock("../../services/AppointmentService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		AppointmentService: {
			...actual.AppointmentService,
			getUpcomingAppointments: vi.fn(),
			getCompletedAppointments: vi.fn(),
			getUpcomingAppointmentsForShop: vi.fn(),
			getCompletedAppointmentsForShop: vi.fn(),
			getShopCutPayoutCandidates: vi.fn(),
			getShopCutPayoutCandidatesByShop: vi.fn(),
		},
	};
});

vi.mock("../../services/AnalyticsService", async (importOriginal) => {
	const actual = await importOriginal();
	const overridden = {
		...actual.default,
		getArtistAnalytics: vi.fn(),
		getShopAnalytics: vi.fn(),
	};
	return { ...actual, default: overridden, AnalyticsService: overridden };
});

// Real query documents/apollo cache add nothing here - this file only needs to see what props it
// receives (appointments/onChanged/showArtist/viewerId), same convention IBPageActionBar.test.jsx
// uses for the wizard components it mocks out.
vi.mock("./ShopCutPayoutList", () => ({
	default: vi.fn(({ appointments, onChanged, showArtist, viewerId }) => (
		<div data-testid="shop-cut-payout-list">
			<span data-testid="payout-count">{appointments?.length ?? 0}</span>
			<span data-testid="payout-show-artist">{String(showArtist)}</span>
			<span data-testid="payout-viewer-id">{viewerId}</span>
			<button onClick={onChanged}>trigger onChanged</button>
		</div>
	)),
}));

// DateRangePicker has its own test file - stubbed to a single button that fires a fixed "Last
// month" range, just enough to exercise this component's own range-change reset/re-query wiring.
vi.mock("../analytics/DateRangePicker", () => ({
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

function appt(overrides = {}) {
	return {
		id: "appt-1",
		title: null,
		appointmentDate: "2026-08-10T14:00:00.000Z",
		appointmentStatus: "scheduled",
		appointmentType: "session",
		totalCents: 40000,
		tipCents: 0,
		shopId: "shop-1",
		projectId: "proj-1",
		bookingRequestId: null,
		user: { id: "artist-1", firstName: "Sam", lastName: "Artist", tagColor: "#c69818" },
		project: {
			id: "proj-1",
			title: "Full Sleeve",
			client: { id: "client-1", user: { id: "cu-1", firstName: "Robin", lastName: "Client" } },
		},
		bookingRequest: null,
		...overrides,
	};
}

function artistAnalytics(overrides = {}) {
	return {
		revenueCents: 500000,
		tipsCents: 10000,
		averageTipCents: 5000,
		tippedCount: 2,
		depositsCollectedCents: 20000,
		// Deliberately NOT the same cents value as averageTipCents above (or anything else in this
		// fixture) - StatCard renders each as a plain formatted string with no distinguishing
		// wrapper, so two cards sharing a dollar value would make screen.getByText(...) ambiguous.
		depositsOutstandingCents: 7500,
		shopCutOutstandingCents: 15000,
		expensesCents: 3000,
		otherIncomeCents: 1000,
		netCents: 400000,
		completedSessionCount: 4,
		activeProjectCount: 2,
		...overrides,
	};
}

function shopAnalytics(overrides = {}) {
	return {
		revenueCents: 900000,
		shopCutEarnedCents: 80000,
		shopCutOutstandingCents: 20000,
		shopCutAwaitingConfirmationCents: 5000,
		depositsCollectedCents: 30000,
		depositsOutstandingCents: 8000,
		expensesCents: 10000,
		otherIncomeCents: 2000,
		netCents: 850000,
		artists: [],
		...overrides,
	};
}

const ARTIST_ID = "artist-1";

function independentViewer(overrides = {}) {
	return { id: ARTIST_ID, role: ROLES.ARTIST, userInfo: {}, ...overrides };
}

function shopAdminViewer(overrides = {}) {
	return {
		id: ARTIST_ID,
		role: ROLES.SHOP_ADMIN,
		userInfo: { shop: { id: "shop-1" } },
		...overrides,
	};
}

// Wires up every one of the eight hooks at once, so each test only states the parts it cares
// about. `undefined` (skip) is the correct return shape for whichever half - artist or shop - the
// panel isn't asking about for the current render, mirroring each real hook's own `skip: !id`.
function setupHooks({
	analytics = artistAnalytics(),
	analyticsLoading = false,
	shopAnalyticsData = null,
	shopAnalyticsLoading = false,
	upcoming = [],
	upcomingPageInfo = { totalCount: 0, hasMore: false, limit: 5, offset: 0 },
	upcomingLoading = false,
	completed = [],
	completedPageInfo = { totalCount: 0, hasMore: false, limit: 5, offset: 0 },
	completedLoading = false,
	shopUpcoming = [],
	shopUpcomingPageInfo = { totalCount: 0, hasMore: false, limit: 5, offset: 0 },
	shopCompleted = [],
	shopCompletedPageInfo = { totalCount: 0, hasMore: false, limit: 5, offset: 0 },
	payoutCandidates = [],
	shopPayoutCandidates = [],
	refetchArtistPayouts = vi.fn(),
	refetchShopPayouts = vi.fn(),
} = {}) {
	AnalyticsService.getArtistAnalytics.mockImplementation((userId) =>
		userId
			? { data: { getArtistAnalytics: analytics }, loading: analyticsLoading }
			: { data: undefined, loading: false },
	);
	AnalyticsService.getShopAnalytics.mockImplementation((shopId) =>
		shopId
			? { data: { getShopAnalytics: shopAnalyticsData }, loading: shopAnalyticsLoading }
			: { data: undefined, loading: false },
	);
	AppointmentService.getUpcomingAppointments.mockImplementation((userId) =>
		userId
			? {
					data: { getAppointmentsByArtist: { items: upcoming, pageInfo: upcomingPageInfo } },
					loading: upcomingLoading,
			  }
			: { data: undefined, loading: false },
	);
	AppointmentService.getCompletedAppointments.mockImplementation((userId) =>
		userId
			? {
					data: { getAppointmentsByArtist: { items: completed, pageInfo: completedPageInfo } },
					loading: completedLoading,
			  }
			: { data: undefined, loading: false },
	);
	AppointmentService.getUpcomingAppointmentsForShop.mockImplementation((shopId) =>
		shopId
			? {
					data: { getAppointmentsByShop: { items: shopUpcoming, pageInfo: shopUpcomingPageInfo } },
					loading: false,
			  }
			: { data: undefined, loading: false },
	);
	AppointmentService.getCompletedAppointmentsForShop.mockImplementation((shopId) =>
		shopId
			? {
					data: {
						getAppointmentsByShop: { items: shopCompleted, pageInfo: shopCompletedPageInfo },
					},
					loading: false,
			  }
			: { data: undefined, loading: false },
	);
	AppointmentService.getShopCutPayoutCandidates.mockImplementation((userId) =>
		userId
			? { data: { getShopCutPayoutCandidates: payoutCandidates }, refetch: refetchArtistPayouts }
			: { data: undefined, refetch: refetchArtistPayouts },
	);
	AppointmentService.getShopCutPayoutCandidatesByShop.mockImplementation((shopId) =>
		shopId
			? {
					data: { getShopCutPayoutCandidatesByShop: shopPayoutCandidates },
					refetch: refetchShopPayouts,
			  }
			: { data: undefined, refetch: refetchShopPayouts },
	);
	return { refetchArtistPayouts, refetchShopPayouts };
}

function renderPanel({ artistUserId = ARTIST_ID, isSelf = false, viewer = independentViewer() } = {}) {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<AuthContext.Provider value={{ user: viewer }}>
				<ArtistPerformancePanel artistUserId={artistUserId} isSelf={isSelf} />
			</AuthContext.Provider>
			<Routes>
				<Route path="/project/*" element={<div data-testid="navigated-project" />} />
				<Route path="/consult/*" element={<div data-testid="navigated-consult" />} />
			</Routes>
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("loading", () => {
	it("shows a page loader while the upcoming/completed queries are in flight with no data yet", () => {
		// The loading gate is `(upcomingLoading && !upcomingData) || (completedLoading &&
		// !completedData)` - genuinely undefined data, not just an empty-items object, matching
		// Apollo's own shape on a query's very first render before any response has landed.
		// setupHooks' defaults always hand back a (possibly empty) data object once an id is
		// truthy, so this one test bypasses it and wires the mocks directly instead.
		AppointmentService.getUpcomingAppointments.mockReturnValue({ data: undefined, loading: true });
		AppointmentService.getCompletedAppointments.mockReturnValue({ data: undefined, loading: true });
		AppointmentService.getUpcomingAppointmentsForShop.mockReturnValue({ data: undefined, loading: false });
		AppointmentService.getCompletedAppointmentsForShop.mockReturnValue({ data: undefined, loading: false });
		AnalyticsService.getArtistAnalytics.mockReturnValue({ data: undefined, loading: true });
		AnalyticsService.getShopAnalytics.mockReturnValue({ data: undefined, loading: false });
		AppointmentService.getShopCutPayoutCandidates.mockReturnValue({ data: undefined, refetch: vi.fn() });
		AppointmentService.getShopCutPayoutCandidatesByShop.mockReturnValue({ data: undefined, refetch: vi.fn() });

		renderPanel({ isSelf: true });

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByText("Your Upcoming Appointments")).not.toBeInTheDocument();
	});
});

describe("an artist's own dashboard (isSelf, no shop -> never shopWide)", () => {
	it("shows the artist-scoped stat cards with formatted money", () => {
		setupHooks({ analytics: artistAnalytics() });
		renderPanel({ isSelf: true, viewer: independentViewer() });

		expect(screen.getByText("Revenue")).toBeInTheDocument();
		expect(screen.getByText("$5,000.00")).toBeInTheDocument();
		expect(screen.getByText("Tips")).toBeInTheDocument();
		expect(screen.getByText("$100.00")).toBeInTheDocument();
		expect(screen.getByText("Average tip")).toBeInTheDocument();
		expect(screen.getByText("$50.00")).toBeInTheDocument();
		expect(screen.getByText("across 2 tipped appointments")).toBeInTheDocument();
		expect(screen.getByText("Sessions completed")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
		expect(screen.getByText("Active projects")).toBeInTheDocument();
	});

	it("labels the lists 'Your Upcoming Appointments' / 'Your Completed Sessions'", () => {
		setupHooks();
		renderPanel({ isSelf: true });

		expect(screen.getByText("Your Upcoming Appointments")).toBeInTheDocument();
		expect(screen.getByText("Your Completed Sessions")).toBeInTheDocument();
	});

	it("renders no Artist Totals table (shopWide is false)", () => {
		setupHooks();
		renderPanel({ isSelf: true });

		expect(screen.queryByText("Artist Totals")).not.toBeInTheDocument();
	});

	it("renders the Shop Cut Payouts section, wired with showArtist=false and the viewer's id", () => {
		setupHooks({ payoutCandidates: [appt({ id: "p1" }), appt({ id: "p2" })] });
		renderPanel({ isSelf: true, viewer: independentViewer({ id: "viewer-9" }) });

		expect(screen.getByText("Shop Cut Payouts")).toBeInTheDocument();
		expect(screen.getByTestId("payout-count")).toHaveTextContent("2");
		expect(screen.getByTestId("payout-show-artist")).toHaveTextContent("false");
		expect(screen.getByTestId("payout-viewer-id")).toHaveTextContent("viewer-9");
	});

	it("calls the artist payout refetch when ShopCutPayoutList's onChanged fires", async () => {
		const user = userEvent.setup();
		const { refetchArtistPayouts } = setupHooks();
		renderPanel({ isSelf: true });

		await user.click(screen.getByText("trigger onChanged"));

		expect(refetchArtistPayouts).toHaveBeenCalledTimes(1);
	});
});

describe("a shop admin/staff looking at ONE other artist (isSelf=false) never goes shopWide", () => {
	it("uses the plain (non-'Your', non-'Shop') section titles even when the viewer has a shop", () => {
		setupHooks();
		renderPanel({ isSelf: false, viewer: shopAdminViewer() });

		expect(screen.getByText("Upcoming Appointments")).toBeInTheDocument();
		expect(screen.getByText("Completed Sessions")).toBeInTheDocument();
		expect(screen.queryByText("Shop Upcoming Appointments")).not.toBeInTheDocument();
		expect(screen.queryByText("Your Upcoming Appointments")).not.toBeInTheDocument();
	});

	it("renders no Shop Cut Payouts section at all", () => {
		setupHooks();
		renderPanel({ isSelf: false, viewer: shopAdminViewer() });

		expect(screen.queryByText("Shop Cut Payouts")).not.toBeInTheDocument();
	});

	it("renders no Artist Totals table", () => {
		setupHooks({ shopAnalyticsData: shopAnalytics({ artists: [{ userId: "a1", revenueCents: 1 }] }) });
		renderPanel({ isSelf: false, viewer: shopAdminViewer() });

		expect(screen.queryByText("Artist Totals")).not.toBeInTheDocument();
	});
});

describe("a shop admin's own shop-wide dashboard (isSelf, has a shop, role <= SHOP_ADMIN)", () => {
	it("shows the shop-scoped stat cards, not the artist-scoped ones", () => {
		setupHooks({ shopAnalyticsData: shopAnalytics() });
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });

		expect(screen.getByText("Total Revenue")).toBeInTheDocument();
		expect(screen.getByText("$9,000.00")).toBeInTheDocument();
		expect(screen.getByText("Shop Total")).toBeInTheDocument();
		expect(screen.getByText("$800.00")).toBeInTheDocument();
		expect(screen.getByText("Shop cut owed")).toBeInTheDocument();
		expect(screen.getByText("Shop cut awaiting confirmation")).toBeInTheDocument();
		expect(screen.queryByText("Tips")).not.toBeInTheDocument();
		expect(screen.queryByText("Sessions completed")).not.toBeInTheDocument();
	});

	it("labels the lists 'Shop Upcoming Appointments' / 'Shop Completed Sessions'", () => {
		setupHooks({ shopAnalyticsData: shopAnalytics() });
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });

		expect(screen.getByText("Shop Upcoming Appointments")).toBeInTheDocument();
		expect(screen.getByText("Shop Completed Sessions")).toBeInTheDocument();
	});

	it("wires ShopCutPayoutList with showArtist=true", () => {
		setupHooks({ shopAnalyticsData: shopAnalytics() });
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });

		expect(screen.getByTestId("payout-show-artist")).toHaveTextContent("true");
	});

	it("hides the Artist Totals table when there are no artists on the aggregate", () => {
		setupHooks({ shopAnalyticsData: shopAnalytics({ artists: [] }) });
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });

		expect(screen.queryByText("Artist Totals")).not.toBeInTheDocument();
	});

	it("renders one Artist Totals row per artist, with take-home = revenue minus the FULL assessed cut", () => {
		setupHooks({
			shopAnalyticsData: shopAnalytics({
				artists: [
					{
						userId: "a1",
						revenueCents: 100000,
						shopCutEarnedCents: 20000,
						shopCutOutstandingCents: 10000,
						shopCutAwaitingConfirmationCents: 5000,
						user: { id: "a1", firstName: "Jordan", lastName: "Ink", tagColor: "#122152" },
					},
				],
			}),
		});
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });

		expect(screen.getByText("Artist Totals")).toBeInTheDocument();
		expect(screen.getByText("Jordan Ink")).toBeInTheDocument();
		// Shop cut column: 20000 + 10000 + 5000 = 35000 -> $350.00
		expect(screen.getByText("$350.00")).toBeInTheDocument();
		// Take-home: 100000 - 35000 = 65000 -> $650.00
		expect(screen.getByText("$650.00")).toBeInTheDocument();
	});

	it("falls back to 'Unknown artist' when a totals row has no user record", () => {
		setupHooks({
			shopAnalyticsData: shopAnalytics({
				artists: [{ userId: "a1", revenueCents: 100000, user: null }],
			}),
		});
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });

		expect(screen.getByText("Unknown artist")).toBeInTheDocument();
	});
});

describe("AppointmentRow rendering", () => {
	it("shows the project title, client name, mapped status label and formatted date/time", () => {
		const row = appt({
			appointmentDate: "2026-08-10T14:00:00.000Z",
			appointmentStatus: "no_show",
		});
		setupHooks({ upcoming: [row] });
		renderPanel({ isSelf: true });

		expect(screen.getByText("Full Sleeve")).toBeInTheDocument();
		expect(screen.getByText("Robin Client")).toBeInTheDocument();
		expect(screen.getByText("No-show")).toBeInTheDocument();
		expect(
			screen.getByText(
				new Date("2026-08-10T14:00:00.000Z").toLocaleString(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
					hour: "numeric",
					minute: "2-digit",
				}),
			),
		).toBeInTheDocument();
	});

	it("falls back through appt.title then '(untitled appointment)' when there is no project", () => {
		setupHooks({
			upcoming: [appt({ id: "a1", title: "Walk-in", project: null, projectId: null })],
		});
		renderPanel({ isSelf: true });
		expect(screen.getByText("Walk-in")).toBeInTheDocument();
	});

	it("renders '(untitled appointment)' when neither a project title nor a title exists", () => {
		setupHooks({ upcoming: [appt({ title: null, project: null, projectId: null })] });
		renderPanel({ isSelf: true });
		expect(screen.getByText("(untitled appointment)")).toBeInTheDocument();
	});

	it("falls back to the booking request's client name when there is no project", () => {
		setupHooks({
			upcoming: [
				appt({
					project: null,
					projectId: null,
					bookingRequest: { id: "br1", client: { id: "c1", firstName: "Alex", lastName: "Guest" } },
				}),
			],
		});
		renderPanel({ isSelf: true });
		expect(screen.getByText("Alex Guest")).toBeInTheDocument();
	});

	it("shows earnings, including the tip, only in the completed list", () => {
		setupHooks({
			completed: [appt({ id: "c1", appointmentStatus: "completed", totalCents: 30000, tipCents: 5000 })],
		});
		renderPanel({ isSelf: true });

		expect(screen.getByText("$300.00 ($50.00 tip)")).toBeInTheDocument();
	});

	it("omits the tip suffix when tipCents is 0", () => {
		setupHooks({
			completed: [appt({ id: "c1", appointmentStatus: "completed", totalCents: 30000, tipCents: 0 })],
		});
		renderPanel({ isSelf: true });

		expect(screen.getByText("$300.00")).toBeInTheDocument();
	});

	it("shows the appointment type chip", () => {
		setupHooks({ upcoming: [appt({ appointmentType: "consult" })] });
		renderPanel({ isSelf: true });
		expect(screen.getByText("Consult")).toBeInTheDocument();
	});

	it("shows an artist column only in shopWide mode", () => {
		setupHooks({ shopAnalyticsData: shopAnalytics(), shopUpcoming: [appt()] });
		renderPanel({ isSelf: true, viewer: shopAdminViewer() });
		expect(screen.getByText("Sam Artist")).toBeInTheDocument();
	});

	it("navigates to the project when a session row (with a projectId) is clicked", async () => {
		const user = userEvent.setup();
		setupHooks({ upcoming: [appt({ projectId: "proj-42" })] });
		renderPanel({ isSelf: true });

		await user.click(screen.getByText("Full Sleeve"));

		expect(await screen.findByTestId("navigated-project")).toBeInTheDocument();
	});

	it("navigates to the consult when a consult row (with a bookingRequestId, no project) is clicked", async () => {
		const user = userEvent.setup();
		setupHooks({
			upcoming: [
				appt({
					id: "consult-1",
					appointmentType: "consult",
					projectId: null,
					project: null,
					bookingRequestId: "br-1",
					bookingRequest: { id: "br-1", client: { id: "c1", firstName: "Alex", lastName: "Guest" } },
					// title left null: with no project, the row's title falls back to
					// "(untitled appointment)" - kept distinct from the client-name span below
					// ("Alex Guest"), which would otherwise collide as the same text if this row's
					// own title were also "Alex Guest".
					title: null,
				}),
			],
		});
		renderPanel({ isSelf: true });

		expect(screen.getByText("Alex Guest")).toBeInTheDocument();
		await user.click(screen.getByText("(untitled appointment)"));

		expect(await screen.findByTestId("navigated-consult")).toBeInTheDocument();
	});

	it("is not clickable when there is neither a projectId nor a consult bookingRequestId", async () => {
		const user = userEvent.setup();
		setupHooks({
			upcoming: [appt({ projectId: null, project: null, bookingRequestId: null, title: "Stray" })],
		});
		renderPanel({ isSelf: true });

		await user.click(screen.getByText("Stray"));

		expect(screen.queryByTestId("navigated-project")).not.toBeInTheDocument();
		expect(screen.queryByTestId("navigated-consult")).not.toBeInTheDocument();
	});
});

describe("empty states", () => {
	it("names the active range in the empty message for each list", () => {
		setupHooks({ upcoming: [], completed: [] });
		renderPanel({ isSelf: true });

		expect(screen.getByText("No upcoming appointments in This month.")).toBeInTheDocument();
		expect(screen.getByText("No completed sessions in This month.")).toBeInTheDocument();
	});
});

describe("changing the date range", () => {
	it("re-queries with the new range once a preset is picked", async () => {
		const user = userEvent.setup();
		setupHooks();
		renderPanel({ isSelf: true });

		await user.click(screen.getByText(/range: This month/));

		const lastCall =
			AppointmentService.getUpcomingAppointments.mock.calls[
				AppointmentService.getUpcomingAppointments.mock.calls.length - 1
			];
		// (userId, limit, range, offset) - the range argument should now be the "Last month"
		// range DateRangePicker's stub handed back via onChange.
		expect(lastCall[2]).toEqual(
			expect.objectContaining({ key: "last_month", label: "Last month" }),
		);
		// Offset resets to 0 on a range change - see the component's own effect.
		expect(lastCall[3]).toBe(0);
	});
});

describe("pagination", () => {
	it("passes the incremented offset to getUpcomingAppointments when Next is clicked", async () => {
		const user = userEvent.setup();
		setupHooks({
			upcoming: [appt({ id: "u1" })],
			upcomingPageInfo: { totalCount: 12, hasMore: true, limit: 5, offset: 0 },
		});
		renderPanel({ isSelf: true });

		await user.click(screen.getByRole("button", { name: "Next" }));

		const lastCall =
			AppointmentService.getUpcomingAppointments.mock.calls[
				AppointmentService.getUpcomingAppointments.mock.calls.length - 1
			];
		expect(lastCall[3]).toBe(5);
	});

	it("resets the offset to 0 when the upcoming page size is changed", async () => {
		const user = userEvent.setup();
		setupHooks({
			upcoming: [appt({ id: "u1" })],
			upcomingPageInfo: { totalCount: 12, hasMore: true, limit: 5, offset: 5 },
		});
		renderPanel({ isSelf: true });

		const [sizeSelect] = screen.getAllByRole("combobox");
		await user.selectOptions(sizeSelect, "25");

		const lastCall =
			AppointmentService.getUpcomingAppointments.mock.calls[
				AppointmentService.getUpcomingAppointments.mock.calls.length - 1
			];
		expect(lastCall[1]).toBe(25);
		expect(lastCall[3]).toBe(0);
	});
});
