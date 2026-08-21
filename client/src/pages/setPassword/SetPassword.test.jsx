// SetPassword.jsx tests. Where an invite link and a reset link both land - see the source file's
// own header comment on why the token is checked before the form ever renders, and why a
// successful submit navigates to /login instead of logging anyone in directly. Rendered inside
// REAL ROUTES (not <SetPassword /> in isolation), for two reasons: useParams needs a matched
// route to read :token from at all, and the post-success navigation to /login needs somewhere to
// land, matching the technique Register.test.jsx uses for its own navigation test.
//
// Explicit React import - Vitest's transform for *test* files falls back to the classic runtime
// (React.createElement in scope, not auto-imported) without this. See the matching note in
// pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import SetPassword from "./SetPassword";
import PasswordService from "../../services/PasswordService";

// THE REAL DOCUMENTS, imported from PasswordService rather than hand-copied - see
// PasswordService.test.js's own header comment on why a copy is the wrong call here. Matching a
// request to a mock is done by comparing the printed document, so a copy that drifts by one field
// would silently stop matching and fail the test with a network error rather than a component bug.

function renderSetPassword({ token = "token-123", mocks = [] } = {}) {
	render(
		<MemoryRouter initialEntries={[`/set-password/${token}`]}>
			<MockedProvider mocks={mocks}>
				<Routes>
					<Route path="/set-password/:token" element={<SetPassword />} />
					<Route path="/login" element={<div>login page stand-in</div>} />
					<Route path="/resetPassword" element={<div>reset page stand-in</div>} />
				</Routes>
			</MockedProvider>
		</MemoryRouter>,
	);
}

function inspectMock(token, status, { delay } = {}) {
	return {
		request: { query: PasswordService.INSPECT_TOKEN, variables: { token } },
		result: {
			data: {
				inspectPasswordToken: {
					__typename: "InspectPasswordTokenResult",
					valid: false,
					purpose: null,
					firstName: null,
					...status,
				},
			},
		},
		delay,
	};
}

function setPasswordMock(token, newPassword, { data, error } = {}) {
	const request = {
		query: PasswordService.SET_PASSWORD_WITH_TOKEN,
		variables: { token, newPassword },
	};
	if (error) {
		return { request, error };
	}
	return { request, result: { data: { setPasswordWithToken: true, ...data } } };
}

const VALID_INVITE = { valid: true, purpose: "invite", firstName: "Arya" };
const VALID_RESET = { valid: true, purpose: "reset", firstName: "Gendry" };

describe("SetPassword - checking the token", () => {
	it("shows a loading spinner while the token is being checked, before any form appears", () => {
		renderSetPassword({
			mocks: [inspectMock("token-123", VALID_RESET, { delay: 60 * 1000 })],
		});

		expect(screen.getByRole("progressbar")).toBeInTheDocument();
		expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
	});

	it("shows a single not-valid message for an invalid, expired, or already-used token", async () => {
		// The server doesn't distinguish those cases, deliberately, and neither does this page - see
		// the source file's own comment on why. Not asserting error text, since the whole point is
		// there IS only one message no matter which of those reasons is behind it.
		renderSetPassword({
			mocks: [inspectMock("token-123", { valid: false, purpose: null, firstName: null })],
		});

		expect(await screen.findByText("This link isn't valid")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "request a reset" })).toHaveAttribute(
			"href",
			"/resetPassword",
		);
		expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
	});

	it("never renders the password form for an invalid token even though data has arrived", async () => {
		renderSetPassword({
			mocks: [inspectMock("token-123", { valid: false, purpose: null, firstName: null })],
		});

		await screen.findByText("This link isn't valid");
		expect(screen.queryByRole("button", { name: "Set password" })).not.toBeInTheDocument();
	});
});

describe("SetPassword - valid token, invite vs reset copy", () => {
	it("welcomes an invite by first name", async () => {
		renderSetPassword({ mocks: [inspectMock("token-123", VALID_INVITE)] });

		expect(await screen.findByText("Welcome to InkBooks")).toBeInTheDocument();
		expect(
			screen.getByText(/Hi Arya - choose a password to finish setting up your account\./),
		).toBeInTheDocument();
	});

	it("treats a reset token as picking a new password, not a welcome", async () => {
		renderSetPassword({ mocks: [inspectMock("token-123", VALID_RESET)] });

		expect(await screen.findByText("Choose a new password")).toBeInTheDocument();
		expect(screen.getByText(/Hi Gendry - pick a new password below\./)).toBeInTheDocument();
	});

	it("falls back to a generic greeting when the token carries no first name", async () => {
		renderSetPassword({
			mocks: [inspectMock("token-123", { valid: true, purpose: "reset", firstName: null })],
		});

		expect(await screen.findByText(/Hi there - pick a new password below\./)).toBeInTheDocument();
	});
});

describe("SetPassword - client-side validation", () => {
	it("rejects a too-short password without ever calling the server", async () => {
		// No mutation mock registered at all - a real request would surface as Apollo's "no matching
		// mock" error, which the absence of that error (and the presence of the validation message
		// instead) is the proof this never left the browser.
		const user = userEvent.setup();
		renderSetPassword({ mocks: [inspectMock("token-123", VALID_RESET)] });

		await screen.findByText("Choose a new password");
		await user.type(screen.getByLabelText("New password"), "short1");
		await user.type(screen.getByLabelText("Confirm password"), "short1");
		await user.click(screen.getByRole("button", { name: "Set password" }));

		expect(
			await screen.findByText("Password must be at least 8 characters."),
		).toBeInTheDocument();
	});

	it("rejects mismatched passwords without ever calling the server", async () => {
		const user = userEvent.setup();
		renderSetPassword({ mocks: [inspectMock("token-123", VALID_RESET)] });

		await screen.findByText("Choose a new password");
		await user.type(screen.getByLabelText("New password"), "longenoughpassword");
		await user.type(screen.getByLabelText("Confirm password"), "differentpassword");
		await user.click(screen.getByRole("button", { name: "Set password" }));

		expect(
			await screen.findByText("Those two passwords don't match."),
		).toBeInTheDocument();
	});
});

describe("SetPassword - submitting", () => {
	it("disables the button and shows a saving state while the mutation is in flight", async () => {
		const user = userEvent.setup();
		const pendingMock = {
			request: {
				query: PasswordService.SET_PASSWORD_WITH_TOKEN,
				variables: { token: "token-123", newPassword: "longenoughpassword" },
			},
			delay: 60 * 1000,
			result: { data: { setPasswordWithToken: true } },
		};
		renderSetPassword({ mocks: [inspectMock("token-123", VALID_RESET), pendingMock] });

		await screen.findByText("Choose a new password");
		await user.type(screen.getByLabelText("New password"), "longenoughpassword");
		await user.type(screen.getByLabelText("Confirm password"), "longenoughpassword");
		await user.click(screen.getByRole("button", { name: "Set password" }));

		expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
	});

	it("redeems the token, shows success, and navigates to login on click - not automatically", async () => {
		// THE property called out in the source file's own comment: setting a password is not proof
		// of intent to start a session, so success lands on a confirmation with an explicit button
		// rather than auto-navigating, and navigating goes to /login rather than logging anyone in.
		const user = userEvent.setup();
		renderSetPassword({
			mocks: [
				inspectMock("token-123", VALID_INVITE),
				setPasswordMock("token-123", "longenoughpassword"),
			],
		});

		await screen.findByText("Welcome to InkBooks");
		await user.type(screen.getByLabelText("New password"), "longenoughpassword");
		await user.type(screen.getByLabelText("Confirm password"), "longenoughpassword");
		await user.click(screen.getByRole("button", { name: "Set password" }));

		expect(await screen.findByText("Password set")).toBeInTheDocument();
		expect(screen.queryByText("login page stand-in")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Go to login" }));

		expect(await screen.findByText("login page stand-in")).toBeInTheDocument();
	});

	it("shows the server's error message when redeeming the token fails, instead of throwing", async () => {
		const user = userEvent.setup();
		renderSetPassword({
			mocks: [
				inspectMock("token-123", VALID_RESET),
				setPasswordMock("token-123", "longenoughpassword", {
					error: new Error("That link has already been used."),
				}),
			],
		});

		await screen.findByText("Choose a new password");
		await user.type(screen.getByLabelText("New password"), "longenoughpassword");
		await user.type(screen.getByLabelText("Confirm password"), "longenoughpassword");
		await user.click(screen.getByRole("button", { name: "Set password" }));

		expect(
			await screen.findByText("That link has already been used."),
		).toBeInTheDocument();
		// Stays on the form rather than showing success - the whole point of surfacing the error.
		expect(screen.queryByText("Password set")).not.toBeInTheDocument();
	});
});
