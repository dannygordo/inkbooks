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

function renderAt(path, { user } = {}) {
	return render(
		<AuthContext.Provider value={{ user }}>
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
