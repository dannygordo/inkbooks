// Tests for AuthRoute - the plain "is anyone logged in" route guard. Rendered via a real
// <Routes>/<Route> tree inside a MemoryRouter (per this codebase's convention - see
// UpdateEventDialog.test.jsx) rather than rendering AuthRoute in isolation, because AuthRoute's
// whole job is choosing what the router does next: redirect to /login vs. render the matched
// route's children. A MemoryRouter is required for useLocation/Navigate to work at all - AuthRoute
// throws outright without one.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import AuthRoute from "./AuthRoute";
import { AuthContext } from "../context/auth";

// Reads back the state AuthRoute attaches to its redirect, so the "send them back after login"
// behaviour described in AuthRoute's own comment is actually verified, not just assumed from
// reading the source.
function LoginProbe() {
	const location = useLocation();
	const from = location.state?.from?.pathname ?? "none";
	return <div>Login Page (from: {from})</div>;
}

function renderAt(path, { user, initializing } = {}) {
	return render(
		<AuthContext.Provider value={{ user, initializing }}>
			<MemoryRouter initialEntries={[path]}>
				<Routes>
					<Route path="/login" element={<LoginProbe />} />
					<Route
						path="/protected/:id"
						element={
							<AuthRoute>
								<div>Protected Content</div>
							</AuthRoute>
						}
					/>
				</Routes>
			</MemoryRouter>
		</AuthContext.Provider>,
	);
}

describe("AuthRoute", () => {
	it("redirects to /login when there is no user", () => {
		renderAt("/protected/42", { user: null });

		expect(screen.getByText(/login page/i)).toBeInTheDocument();
		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
	});

	it("renders the children when there is a user", () => {
		renderAt("/protected/42", { user: { id: "user-1" } });

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
		expect(screen.queryByText(/login page/i)).not.toBeInTheDocument();
	});

	it("preserves the page the user was trying to reach in the redirect's location state", () => {
		renderAt("/protected/42", { user: null });

		expect(screen.getByText("Login Page (from: /protected/42)")).toBeInTheDocument();
	});

	it("treats undefined the same as no user", () => {
		renderAt("/protected/42", {});

		expect(screen.getByText(/login page/i)).toBeInTheDocument();
	});
});

describe("AuthRoute while the stored session is still being checked", () => {
	// AuthProvider's own session check (context/auth.jsx) is async now - `user` reads null for one
	// render even for someone who IS signed in, simply because that check hasn't resolved yet. If
	// AuthRoute redirected on that render, an already-authenticated person would get bounced to
	// /login on every hard refresh, immediately before AuthProvider restored them. `initializing`
	// is how AuthRoute tells "still checking" apart from "checked, and nobody's signed in" - it
	// must render neither the protected content nor the redirect until that resolves.
	it("renders neither the protected content nor the login redirect while initializing", () => {
		renderAt("/protected/42", { user: null, initializing: true });

		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
		expect(screen.queryByText(/login page/i)).not.toBeInTheDocument();
	});

	it("still waits even if a stale user value happens to be set", () => {
		// Defensive: initializing is meant to be checked before user is trusted either way, not
		// only when user is null.
		renderAt("/protected/42", { user: { id: "user-1" }, initializing: true });

		expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
		expect(screen.queryByText(/login page/i)).not.toBeInTheDocument();
	});

	it("proceeds to the normal redirect/render logic once initializing is false", () => {
		renderAt("/protected/42", { user: { id: "user-1" }, initializing: false });

		expect(screen.getByText("Protected Content")).toBeInTheDocument();
	});
});
