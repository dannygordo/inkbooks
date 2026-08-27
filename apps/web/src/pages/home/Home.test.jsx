// Home.jsx tests. One route, three dashboards, picked by who's looking (see Home.jsx's own header
// comment) - the whole job of this component is (1) always greeting the signed-in user by first
// name and (2) picking exactly one of ArtistPerformancePanel/ClientDashboard/ShopAnalyticsPanel
// (or none at all, for a user type Home doesn't cover) based on user.userType, wiring each one's
// props correctly. None of those three panels have their own dedicated test file (unlike
// AppointmentsList/IBCalendar, which do - see Appointments.test.jsx's own comment on that
// distinction), so they're mocked out here with prop-capturing spies: what's under test is Home's
// own routing/prop-wiring logic, not what each panel does with what it's given.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx and
// pages/appointments/Appointments.test.jsx: under Vitest, @vitejs/plugin-react compiles JSX with
// the classic runtime, so any component file rendered by a test needs React in scope itself or it
// throws "React is not defined" at render time. Home.jsx already has this (see its own imports);
// this test file needs its own copy for the same reason.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./Home";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants/auth";

const { artistPanelSpy, clientDashboardSpy, shopAnalyticsSpy } = vi.hoisted(() => ({
	artistPanelSpy: vi.fn(() => null),
	clientDashboardSpy: vi.fn(() => null),
	shopAnalyticsSpy: vi.fn(() => null),
}));

vi.mock("../../components/artistDashboard/ArtistPerformancePanel", () => ({
	default: artistPanelSpy,
}));
vi.mock("../../components/clientDashboard/ClientDashboard", () => ({
	default: clientDashboardSpy,
}));
vi.mock("../../components/analytics/ShopAnalyticsPanel", () => ({
	default: shopAnalyticsSpy,
}));

function renderHome(user) {
	render(
		<AuthContext.Provider value={{ user }}>
			<Home />
		</AuthContext.Provider>,
	);
}

// Last-called props, since each spy is a single mock shared across the whole file (cleared in
// beforeEach) rather than re-mocked per test.
function lastProps(spy) {
	return spy.mock.calls[spy.mock.calls.length - 1][0];
}

describe("Home", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("greets the signed-in user by first name regardless of user type", () => {
		renderHome({ id: "u1", firstName: "Renee", userType: "artist" });
		expect(screen.getByRole("heading", { name: "Welcome, Renee" })).toBeInTheDocument();
	});

	describe("an artist", () => {
		it("renders ArtistPerformancePanel for their own id, and no other dashboard", () => {
			renderHome({
				id: "artist-1",
				firstName: "Gendry",
				userType: "artist",
				role: ROLES.ARTIST,
			});

			expect(artistPanelSpy).toHaveBeenCalledTimes(1);
			expect(lastProps(artistPanelSpy)).toEqual(
				expect.objectContaining({ artistUserId: "artist-1", isSelf: true }),
			);
			expect(clientDashboardSpy).not.toHaveBeenCalled();
			expect(shopAnalyticsSpy).not.toHaveBeenCalled();
		});
	});

	describe("a client", () => {
		// user.id is the User document's own id; user.userInfo.id is the CLIENT document's _id (see
		// Home.jsx's own comment on why login() sets userInfo.id = userInfo._id and every
		// client-scoped query keys off THAT, not user.id). Deliberately different here so a
		// regression that passed user.id instead would fail this assertion rather than pass by
		// coincidence.
		it("renders ClientDashboard keyed off userInfo.id, not user.id", () => {
			renderHome({
				id: "user-doc-1",
				firstName: "Arya",
				userType: "client",
				role: ROLES.CLIENT,
				userInfo: { id: "client-doc-1" },
			});

			expect(clientDashboardSpy).toHaveBeenCalledTimes(1);
			expect(lastProps(clientDashboardSpy)).toEqual(
				expect.objectContaining({ clientId: "client-doc-1", isSelf: true }),
			);
			expect(artistPanelSpy).not.toHaveBeenCalled();
			expect(shopAnalyticsSpy).not.toHaveBeenCalled();
		});

		it("does not crash and passes an undefined clientId when userInfo is missing", () => {
			renderHome({ id: "user-doc-2", firstName: "Sansa", userType: "client" });

			expect(screen.getByRole("heading", { name: "Welcome, Sansa" })).toBeInTheDocument();
			expect(lastProps(clientDashboardSpy)).toEqual(
				expect.objectContaining({ clientId: undefined, isSelf: true }),
			);
		});
	});

	describe("staff", () => {
		it("shows money to a Shop Admin (role <= SHOP_ADMIN)", () => {
			renderHome({
				id: "staff-1",
				firstName: "Ned",
				userType: "staff",
				role: ROLES.SHOP_ADMIN,
				userInfo: { shop: { id: "shop-1" } },
			});

			expect(shopAnalyticsSpy).toHaveBeenCalledTimes(1);
			expect(lastProps(shopAnalyticsSpy)).toEqual(
				expect.objectContaining({ shopId: "shop-1", canSeeMoney: true }),
			);
			expect(artistPanelSpy).not.toHaveBeenCalled();
			expect(clientDashboardSpy).not.toHaveBeenCalled();
		});

		it("hides money from plain Shop Staff (role above SHOP_ADMIN)", () => {
			renderHome({
				id: "staff-2",
				firstName: "Jon",
				userType: "staff",
				role: ROLES.SHOP_STAFF,
				userInfo: { shop: { id: "shop-1" } },
			});

			expect(lastProps(shopAnalyticsSpy)).toEqual(
				expect.objectContaining({ shopId: "shop-1", canSeeMoney: false }),
			);
		});

		it("passes an undefined shopId rather than crashing when userInfo has no shop", () => {
			renderHome({
				id: "staff-3",
				firstName: "Bran",
				userType: "staff",
				role: ROLES.SHOP_STAFF,
				userInfo: {},
			});

			expect(lastProps(shopAnalyticsSpy)).toEqual(
				expect.objectContaining({ shopId: undefined }),
			);
		});
	});

	// Previously the case every non-artist, non-client login saw: nothing below the greeting at
	// all (see Home.jsx's own header comment - "Staff and Shop Admin logins saw nothing but the
	// greeting until now"). Any userType this component doesn't recognise should still degrade to
	// just the greeting, not throw.
	it("renders only the greeting for a user type Home does not cover", () => {
		renderHome({ id: "x-1", firstName: "Unknown", userType: "something_else" });

		expect(screen.getByRole("heading", { name: "Welcome, Unknown" })).toBeInTheDocument();
		expect(artistPanelSpy).not.toHaveBeenCalled();
		expect(clientDashboardSpy).not.toHaveBeenCalled();
		expect(shopAnalyticsSpy).not.toHaveBeenCalled();
	});
});
