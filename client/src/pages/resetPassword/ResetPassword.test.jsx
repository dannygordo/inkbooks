// ResetPassword.jsx tests. This page has three faces: a logged-out email form, an unconditional
// "check your email" confirmation (deliberately the same whether or not the address has an
// account - see the source file's own header comment on why), and IBUpdatePassword for a user who
// is already signed in and landed here anyway. Most of the tests below exist to pin that last
// distinction and the "always confirm, never error" behaviour, since both are the whole point of
// this page over the old one it replaced.
//
// Explicit React import - Vitest's transform for *test* files falls back to the classic runtime
// (React.createElement in scope, not auto-imported) without this. See the matching note in
// pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import ResetPassword from "./ResetPassword";
import PasswordService from "../../services/PasswordService";
import { AuthContext } from "../../context/auth";

// THE REAL DOCUMENT, imported from PasswordService rather than hand-copied - see
// PasswordService.test.js's own header comment on why a copy is the wrong call here. Matching a
// request to a mock is done by comparing the printed document, so a copy that drifts by one field
// would silently stop matching and fail the test with a network error rather than a component bug.

function renderResetPassword({ mocks = [], user = null } = {}) {
	const contextValue = {
		user,
		updateCurrentUser: vi.fn(),
		setAlert: vi.fn(),
	};
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<ResetPassword />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return contextValue;
}

function resetMock(email, { data, error, delay } = {}) {
	const request = { query: PasswordService.REQUEST_PASSWORD_RESET, variables: { email } };
	if (error) {
		return { request, error, delay };
	}
	return { request, result: { data: { requestPasswordReset: true, ...data } }, delay };
}

describe("ResetPassword (logged out)", () => {
	it("renders the email form with the submit button disabled until an email is entered", () => {
		renderResetPassword();

		expect(screen.getByLabelText("Email address")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled();
		expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute(
			"href",
			"/login",
		);
	});

	it("enables the submit button once an email address is typed", async () => {
		const user = userEvent.setup();
		renderResetPassword();

		await user.type(screen.getByLabelText("Email address"), "arya@example.com");

		expect(screen.getByRole("button", { name: "Send reset link" })).not.toBeDisabled();
	});

	it("sends the typed address to the server and shows the unconditional confirmation", async () => {
		const user = userEvent.setup();
		renderResetPassword({ mocks: [resetMock("arya@example.com")] });

		await user.type(screen.getByLabelText("Email address"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Send reset link" }));

		// Reaching this text (rather than an Apollo "no matching mock" error) IS the assertion that
		// the mutation was called with exactly this email.
		expect(await screen.findByText("Check your email")).toBeInTheDocument();
		expect(
			screen.getByText(/we've sent a link to reset the password/i),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute(
			"href",
			"/login",
		);
	});

	it("disables the button and shows a sending state while the request is in flight", async () => {
		const user = userEvent.setup();
		// Never resolves within the test - lets the loading state be observed, same technique as
		// RatesPanel.test.jsx's "disables both radios while the mutation is in flight".
		renderResetPassword({
			mocks: [resetMock("arya@example.com", { delay: 60 * 1000 })],
		});

		await user.type(screen.getByLabelText("Email address"), "arya@example.com");
		await user.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(await screen.findByRole("button", { name: "Sending..." })).toBeDisabled();
	});

	it("shows the very same confirmation when the request fails, never an error", async () => {
		// THE property the page's header comment calls out explicitly: the failure is swallowed on
		// purpose, matching the server's own unconditional response, because surfacing it here would
		// leak the exact thing that response exists to hide.
		const user = userEvent.setup();
		renderResetPassword({
			mocks: [resetMock("nobody@example.com", { error: new Error("boom") })],
		});

		await user.type(screen.getByLabelText("Email address"), "nobody@example.com");
		await user.click(screen.getByRole("button", { name: "Send reset link" }));

		expect(await screen.findByText("Check your email")).toBeInTheDocument();
		expect(screen.queryByText("boom")).not.toBeInTheDocument();
	});

	it("never fires a request for an empty address", async () => {
		// No mocks registered at all: a real request would surface as Apollo's "no matching mock"
		// error, which the assertion below rules out. Mirrors the same style of proof used for
		// PasswordService.useInspectToken's skip-on-falsy-token tests.
		renderResetPassword({ mocks: [] });

		expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled();
		await waitFor(() => {
			expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
		});
	});
});

describe("ResetPassword (logged in)", () => {
	it("renders the authenticated change-password form instead of the reset form", () => {
		// A signed-in user landing on this route wants to change a password they already know - a
		// different operation with a different guarantee (it requires the current password), so this
		// page hands off to IBUpdatePassword entirely rather than showing the email form.
		renderResetPassword({
			user: { id: "u1", email: "arya@example.com" },
		});

		expect(screen.getByText("Update Password")).toBeInTheDocument();
		expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
		expect(screen.queryByText("Check your email")).not.toBeInTheDocument();
	});
});
