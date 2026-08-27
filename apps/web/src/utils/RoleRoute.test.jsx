// Tests for RoleRoute - AuthRoute plus a minimum-role requirement and an allowIf escape hatch.
// Rendered via a real <Routes>/<Route> tree inside a MemoryRouter, same reasoning as
// AuthRoute.test.jsx: RoleRoute reads useLocation and useParams off the matched route, and its
// entire job is choosing what the router does next (redirect to /login, redirect home, or render).
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RoleRoute from "./RoleRoute";
import { AuthContext } from "../context/auth";
import { ROLES } from "../constants/auth";
import { ROUTE_CONSTANTS } from "../constants";

function renderAt(path, { user, minRole, allowIf, initializing } = {}) {
	return render(
		<AuthContext.Provider value={{ user, initializing }}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/login" element={<div>Login Page</div>} />
					<Route path={ROUTE_CONSTANTS.HOME} element={<div>Home Page</div>} />
					<Route
						path="/artist/:artistId"
						element={
							<RoleRoute minRole={minRole} allowIf={allowIf}>
								<div>Protected Content</div>
							</RoleRoute>
						}
					/>
				</Routes>
			</MemoryRouter>
		</AuthContext.Provider>,
	);
}

describe("RoleRoute", () => {
	it("redirects to /login when there is no user, before any role check runs", () => {
		renderAt("/artist/artist-1", { user: null, minRole: ROLES.SHOP_STAFF });

		expect(screen.getByText("Login Page")).toBeInTheDocument();
		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
	});

	it("renders the children for a user at exactly the minimum role", () => {
		const user = { id: "u1", role: ROLES.SHOP_STAFF };
		renderAt("/artist/artist-1", { user, minRole: ROLES.SHOP_STAFF });

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
	});

	it("renders the children for a user more privileged than the minimum role", () => {
		const user = { id: "u1", role: ROLES.SHOP_ADMIN };
		renderAt("/artist/artist-1", { user, minRole: ROLES.SHOP_STAFF });

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
	});

	// Home, not /login - the user IS authenticated, they're just not privileged enough. Called out
	// explicitly in RoleRoute's own comment as deliberate: sending them to /login would read as a
	// session bug.
	it("redirects home (not to /login) when the user is authenticated but under-privileged", () => {
		const user = { id: "u1", role: ROLES.CLIENT };
		renderAt("/artist/artist-1", { user, minRole: ROLES.SHOP_STAFF });

		expect(screen.getByText("Home Page")).toBeInTheDocument();
		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
		expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
	});

	it("skips the role requirement entirely when allowIf returns true", () => {
		const user = { id: "u1", role: ROLES.CLIENT }; // far under-privileged
		renderAt("/artist/artist-1", {
			user,
			minRole: ROLES.SHOP_STAFF,
			allowIf: () => true,
		});

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
	});

	it("still applies the role requirement when allowIf returns false", () => {
		const user = { id: "u1", role: ROLES.CLIENT };
		renderAt("/artist/artist-1", {
			user,
			minRole: ROLES.SHOP_STAFF,
			allowIf: () => false,
		});

		expect(screen.getByText("Home Page")).toBeInTheDocument();
	});

	// The real-world allowIf shape this app uses (see App.jsx's isOwnArtistPage): an under-
	// privileged artist keeps access to their OWN /artist/:artistId page. This exercises that
	// allowIf actually receives the matched route's params, not just the user.
	it("passes the matched route's params to allowIf, allowing access to one's own resource", () => {
		const user = { id: "u1", role: ROLES.ARTIST, userInfo: { id: "artist-1" } };
		const isOwnArtistPage = (u, params) =>
			Boolean(params?.artistId) && String(u?.userInfo?.id) === String(params.artistId);

		renderAt("/artist/artist-1", {
			user,
			minRole: ROLES.SHOP_STAFF,
			allowIf: isOwnArtistPage,
		});

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
	});

	it("denies the same under-privileged user a DIFFERENT artist's page via the same allowIf", () => {
		const user = { id: "u1", role: ROLES.ARTIST, userInfo: { id: "artist-1" } };
		const isOwnArtistPage = (u, params) =>
			Boolean(params?.artistId) && String(u?.userInfo?.id) === String(params.artistId);

		renderAt("/artist/someone-else", {
			user,
			minRole: ROLES.SHOP_STAFF,
			allowIf: isOwnArtistPage,
		});

		expect(screen.getByText("Home Page")).toBeInTheDocument();
		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
	});
});

describe("RoleRoute while the stored session is still being checked", () => {
	// RoleRoute is used standalone in App.jsx (e.g. /artists, /expenses), not nested inside
	// AuthRoute, so it needs this same gate independently - see the equivalent tests in
	// AuthRoute.test.jsx for the full reasoning.
	it("renders nothing - not the login redirect, not the content - while initializing", () => {
		renderAt("/artist/artist-1", { user: null, minRole: ROLES.SHOP_STAFF, initializing: true });

		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
		expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
		expect(screen.queryByText("Home Page")).not.toBeInTheDocument();
	});

	it("still waits even for an already-sufficiently-privileged user", () => {
		const user = { id: "u1", role: ROLES.SHOP_ADMIN };
		renderAt("/artist/artist-1", { user, minRole: ROLES.SHOP_STAFF, initializing: true });

		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
	});

	it("proceeds to the normal role check once initializing is false", () => {
		const user = { id: "u1", role: ROLES.SHOP_ADMIN };
		renderAt("/artist/artist-1", { user, minRole: ROLES.SHOP_STAFF, initializing: false });

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
	});
});
