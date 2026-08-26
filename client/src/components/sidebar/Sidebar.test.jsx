// Sidebar.jsx tests. This component is mostly a big role-gated switchboard over MUI Drawer/AppBar
// markup - see its own header comments on isShopAdminOrBetter/isStaffOrBetter/isClient/
// isArtistUser/hasAuditAuthority for what each nav item is actually gated on. These tests focus on
// that gating, the two badge counts, and that a click actually navigates - not the MUI drawer
// open/close animation itself (untestable through jsdom's lack of real layout/CSS) and not
// GlobalSearch/NotificationBell's own behavior, which belongs in their own future test files (both
// pull in their own GraphQL - SearchService/NotificationService - that has nothing to do with what
// Sidebar itself is responsible for; mocked out the same way AppointmentsList.test.jsx mocks
// DateRangePicker/CreateEventButton for the identical reason).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./Sidebar";
import { AuthContext } from "../../context/auth";
import { ROLES, roleLabel } from "../../constants/auth";
import MessengerService from "../../services/MessengerService";
import { usePendingBookingRequestCount } from "../../services/BookingRequestService";

vi.mock("../search/GlobalSearch", () => ({ default: () => null }));
vi.mock("../notifications/NotificationBell", () => ({ default: () => null }));

vi.mock("../../services/MessengerService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		default: { ...actual.default, useUnreadMessageCount: vi.fn() },
	};
});

vi.mock("../../services/BookingRequestService", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, usePendingBookingRequestCount: vi.fn() };
});

const AVATAR = "https://example.com/avatar.png";

function baseUser(overrides = {}) {
	return {
		id: "user-1",
		firstName: "Sam",
		lastName: "Artist",
		avatar: AVATAR,
		role: ROLES.ARTIST,
		userType: "artist",
		userInfo: {},
		...overrides,
	};
}

function renderSidebar({ user, logout = vi.fn(), probes = [] } = {}) {
	render(
		<MemoryRouter initialEntries={["/"]}>
			<AuthContext.Provider value={{ user, logout }}>
				<Sidebar />
			</AuthContext.Provider>
			<Routes>
				{probes.map((path) => (
					<Route key={path} path={`/${path}`} element={<div data-testid={`navigated-${path}`}>{path}</div>} />
				))}
			</Routes>
		</MemoryRouter>,
	);
	return { logout };
}

beforeEach(() => {
	vi.clearAllMocks();
	MessengerService.useUnreadMessageCount.mockReturnValue({
		data: { getUnreadMessageCount: 0 },
	});
	usePendingBookingRequestCount.mockReturnValue({
		data: { getPendingBookingRequestCount: 0 },
	});
});

describe("the signed-in identity header", () => {
	it("shows the user's name, role and shop name", () => {
		renderSidebar({
			user: baseUser({
				role: ROLES.SHOP_ADMIN,
				userInfo: { shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
			}),
		});

		expect(screen.getByText("Sam Artist")).toBeInTheDocument();
		expect(
			screen.getByText(`${roleLabel(ROLES.SHOP_ADMIN)} · Iron Anchor Tattoo`),
		).toBeInTheDocument();
	});

	it("omits the shop name entirely for an independent artist with no shop", () => {
		renderSidebar({ user: baseUser({ userInfo: {} }) });

		expect(screen.getByText("Sam Artist")).toBeInTheDocument();
		expect(screen.getByText(roleLabel(ROLES.ARTIST))).toBeInTheDocument();
	});
});

describe("nav visibility for a client", () => {
	const CLIENT_USER = baseUser({
		role: ROLES.CLIENT,
		userType: "client",
		userInfo: {},
	});

	it("shows the always-visible items plus a client-only Settings entry", () => {
		renderSidebar({ user: CLIENT_USER });

		expect(screen.getByText("Dashboard")).toBeInTheDocument();
		expect(screen.getByText("Appointments")).toBeInTheDocument();
		expect(screen.getByText("Projects")).toBeInTheDocument();
		expect(screen.getByText("Messenger")).toBeInTheDocument();
		expect(screen.getByText("Settings")).toBeInTheDocument();
	});

	it("hides every staff/admin/artist-only item, including the whole shops/booking group", () => {
		renderSidebar({ user: CLIENT_USER });

		expect(screen.queryByText("Artists")).not.toBeInTheDocument();
		expect(screen.queryByText("Staff")).not.toBeInTheDocument();
		expect(screen.queryByText("Clients")).not.toBeInTheDocument();
		expect(screen.queryByText("Shops")).not.toBeInTheDocument();
		expect(screen.queryByText("Booking Requests")).not.toBeInTheDocument();
		expect(screen.queryByText("Shop Cut Confirmations")).not.toBeInTheDocument();
		expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
		expect(screen.queryByText("Income")).not.toBeInTheDocument();
		expect(screen.queryByText("Forms")).not.toBeInTheDocument();
	});

	it("navigates to /my-settings, not /settings, when Settings is clicked", async () => {
		const user = userEvent.setup();
		renderSidebar({ user: CLIENT_USER, probes: ["my-settings"] });

		await user.click(screen.getByText("Settings"));

		expect(await screen.findByTestId("navigated-my-settings")).toBeInTheDocument();
	});
});

describe("nav visibility for an independent artist (no shop)", () => {
	const INDEPENDENT_ARTIST = baseUser({ userInfo: {} });

	it("shows Clients, Booking Requests, Expenses/Income, Forms and Settings", () => {
		renderSidebar({ user: INDEPENDENT_ARTIST });

		expect(screen.getByText("Clients")).toBeInTheDocument();
		expect(screen.getByText("Booking Requests")).toBeInTheDocument();
		expect(screen.getByText("Expenses")).toBeInTheDocument();
		expect(screen.getByText("Income")).toBeInTheDocument();
		// hasAuditAuthority: isShopAdminOrBetter (false) || !hasShop (true) -> true
		expect(screen.getByText("Forms")).toBeInTheDocument();
		expect(screen.getByText("Settings")).toBeInTheDocument();
	});

	it("hides Artists, Staff, Shops and Shop Cut Confirmations (not staff-or-better / not shop-admin-or-better)", () => {
		renderSidebar({ user: INDEPENDENT_ARTIST });

		expect(screen.queryByText("Artists")).not.toBeInTheDocument();
		expect(screen.queryByText("Staff")).not.toBeInTheDocument();
		expect(screen.queryByText("Shops")).not.toBeInTheDocument();
		expect(screen.queryByText("Shop Cut Confirmations")).not.toBeInTheDocument();
	});
});

describe("nav visibility for a shop-connected artist who is also shop admin", () => {
	const SHOP_ADMIN_ARTIST = baseUser({
		role: ROLES.SHOP_ADMIN,
		userInfo: { shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
	});

	it("shows the full staff/admin/artist item set", () => {
		renderSidebar({ user: SHOP_ADMIN_ARTIST });

		expect(screen.getByText("Artists")).toBeInTheDocument();
		expect(screen.getByText("Staff")).toBeInTheDocument();
		expect(screen.getByText("Clients")).toBeInTheDocument();
		expect(screen.getByText("Shops")).toBeInTheDocument();
		expect(screen.getByText("Booking Requests")).toBeInTheDocument();
		expect(screen.getByText("Shop Cut Confirmations")).toBeInTheDocument();
		expect(screen.getByText("Expenses")).toBeInTheDocument();
		expect(screen.getByText("Income")).toBeInTheDocument();
		// hasAuditAuthority: isShopAdminOrBetter is true regardless of hasShop.
		expect(screen.getByText("Forms")).toBeInTheDocument();
		expect(screen.getByText("Settings")).toBeInTheDocument();
	});
});

describe("nav visibility for shop staff (front desk, not shop admin, not an artist)", () => {
	const STAFF_USER = baseUser({
		role: ROLES.SHOP_STAFF,
		userType: "staff",
		userInfo: { shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
	});

	it("shows Artists/Staff/Clients/Booking Requests but no Shops or Shop Cut Confirmations", () => {
		renderSidebar({ user: STAFF_USER });

		expect(screen.getByText("Artists")).toBeInTheDocument();
		expect(screen.getByText("Staff")).toBeInTheDocument();
		expect(screen.getByText("Clients")).toBeInTheDocument();
		expect(screen.getByText("Booking Requests")).toBeInTheDocument();
		expect(screen.queryByText("Shops")).not.toBeInTheDocument();
		expect(screen.queryByText("Shop Cut Confirmations")).not.toBeInTheDocument();
	});

	it("shows no Settings entry at all - not isArtistUser, not isClient", () => {
		renderSidebar({ user: STAFF_USER });

		expect(screen.queryByText("Settings")).not.toBeInTheDocument();
	});

	it("hides Expenses/Income (not isArtistUser) and Forms (shop-connected, not shop-admin-or-better)", () => {
		renderSidebar({ user: STAFF_USER });

		expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
		expect(screen.queryByText("Income")).not.toBeInTheDocument();
		expect(screen.queryByText("Forms")).not.toBeInTheDocument();
	});
});

describe("badges", () => {
	it("shows the unread message count on Messenger", () => {
		MessengerService.useUnreadMessageCount.mockReturnValue({
			data: { getUnreadMessageCount: 5 },
		});
		renderSidebar({ user: baseUser() });

		expect(screen.getByText("5")).toBeInTheDocument();
	});

	it("shows the pending booking request count on Booking Requests", () => {
		usePendingBookingRequestCount.mockReturnValue({
			data: { getPendingBookingRequestCount: 3 },
		});
		renderSidebar({ user: baseUser({ userInfo: {} }) });

		expect(screen.getByText("3")).toBeInTheDocument();
	});
});

describe("navigation", () => {
	it("navigates to /dashboard when Dashboard is clicked", async () => {
		const user = userEvent.setup();
		renderSidebar({ user: baseUser(), probes: ["dashboard"] });

		await user.click(screen.getByText("Dashboard"));

		expect(await screen.findByTestId("navigated-dashboard")).toBeInTheDocument();
	});

	it("navigates to /shops when Shops is clicked, for a shop admin", async () => {
		const user = userEvent.setup();
		renderSidebar({
			user: baseUser({
				role: ROLES.SHOP_ADMIN,
				userInfo: { shop: { id: "shop-1", name: "Iron Anchor Tattoo" } },
			}),
			probes: ["shops"],
		});

		await user.click(screen.getByText("Shops"));

		expect(await screen.findByTestId("navigated-shops")).toBeInTheDocument();
	});
});

describe("logging out", () => {
	it("calls logout when Logout is chosen from the account menu", async () => {
		const user = userEvent.setup();
		const { logout } = renderSidebar({ user: baseUser() });

		// Two IBAvatars render the same name (the app-bar account button and the drawer's own
		// identity header) - the app-bar one is the first in document order and the one whose
		// IconButton opens the account menu (onClick={handleClick}).
		const avatarImages = screen.getAllByRole("img", { name: "Sam Artist" });
		await user.click(avatarImages[0].closest("button"));

		await user.click(await screen.findByText("Logout"));

		expect(logout).toHaveBeenCalledTimes(1);
	});
});
