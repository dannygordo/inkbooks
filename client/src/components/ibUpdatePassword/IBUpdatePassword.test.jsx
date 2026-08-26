// IBUpdatePassword.jsx tests. UserService exports CHANGE_PASSWORD_MUTATION directly, so the mocks
// below match the real document rather than a hand-copied one (same convention as
// SearchService.test.js/UpdateEventDialog.test.jsx). See the component's own header comment: the
// old public/"forgot password" mode was a full account-takeover vulnerability and is gone -
// changing a password now always requires an authenticated session and the current password, so
// every mock here goes through changePassword with both.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import IBUpdatePassword from "./IBUpdatePassword";
import { AuthContext } from "../../context/auth";
import UserService from "../../services/UserService";

const UPDATED_USER = {
	__typename: "User",
	id: "user-1",
	email: "gordo@example.com",
	firstName: "Gordo",
	lastName: "Baratheon",
	avatar: null,
	role: "artist",
	accessToken: "tok-new",
	userType: "artist",
	tagColor: null,
	userInfo: {
		__typename: "Artist",
		id: "artist-1",
		firstName: "Gordo",
		lastName: "Baratheon",
		email: "gordo@example.com",
		avatar: null,
	},
};

function changePasswordMock(currentPassword, newPassword, { data, error, delay } = {}) {
	const base = {
		request: {
			query: UserService.CHANGE_PASSWORD_MUTATION,
			variables: { currentPassword, newPassword },
		},
		...(delay !== undefined ? { delay } : {}),
	};
	return error ? { ...base, error } : { ...base, result: { data: { changePassword: data ?? UPDATED_USER } } };
}

function renderComponent({ mocks = [], updateCurrentUser = vi.fn(), setAlert = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ updateCurrentUser, setAlert }}>
				<IBUpdatePassword />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { updateCurrentUser, setAlert };
}

async function fillAndSubmit(user, { current = "oldpass123", next = "newpass123", confirm = "newpass123" } = {}) {
	if (current !== undefined) {
		await user.type(screen.getByLabelText(/current password/i, { selector: "input" }), current);
	}
	await user.type(screen.getByLabelText(/^new password/i, { selector: "input" }), next);
	await user.type(screen.getByLabelText(/confirm new password/i, { selector: "input" }), confirm);
	await user.click(screen.getByRole("button", { name: /update password/i }));
}

describe("IBUpdatePassword", () => {
	it("renders the three password fields and the submit button", () => {
		renderComponent();
		expect(screen.getByLabelText(/current password/i, { selector: "input" })).toBeInTheDocument();
		expect(screen.getByLabelText(/^new password/i, { selector: "input" })).toBeInTheDocument();
		expect(screen.getByLabelText(/confirm new password/i, { selector: "input" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument();
	});

	it("submits the mutation with the typed passwords and updates the current user on success", async () => {
		const user = userEvent.setup();
		const { updateCurrentUser, setAlert } = renderComponent({
			mocks: [changePasswordMock("oldpass123", "newpass123")],
		});

		await fillAndSubmit(user);

		await waitFor(() => expect(updateCurrentUser).toHaveBeenCalledWith(UPDATED_USER));
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: "success",
				message: "Password updated successfully",
			}),
		);
	});

	it("shows an error alert and does not update the user when the mutation fails", async () => {
		const user = userEvent.setup();
		const { updateCurrentUser, setAlert } = renderComponent({
			mocks: [changePasswordMock("oldpass123", "newpass123", { error: new Error("Incorrect current password") })],
		});

		await fillAndSubmit(user);

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({ isAlert: true, severity: "error" }),
			),
		);
		expect(updateCurrentUser).not.toHaveBeenCalled();
	});

	it("shows a validation error and never calls the mutation when the new passwords don't match", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderComponent({ mocks: [] });

		await fillAndSubmit(user, { next: "newpass123", confirm: "somethingElse" });

		expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ isAlert: true, message: "Invalid data" }));
		expect(screen.getByText(/passwords must match/i)).toBeInTheDocument();
	});

	it("shows a validation error when the new password is blank", async () => {
		const user = userEvent.setup();
		renderComponent({ mocks: [] });

		// Leave "New Password" empty, only fill confirm - doPasswordsMatch's empty-password branch.
		await user.type(screen.getByLabelText(/confirm new password/i, { selector: "input" }), "somepass");
		await user.click(screen.getByRole("button", { name: /update password/i }));

		expect(screen.getByText(/password must not be empty/i)).toBeInTheDocument();
	});

	it("shows a loading spinner while the mutation is in flight", async () => {
		const user = userEvent.setup();
		// A short delay so the loading state is actually observable - without one, MockedProvider
		// can resolve before the assertion below runs (same convention as
		// ArchiveControl.test.jsx's "Restoring..."/"Archiving..." in-flight tests).
		renderComponent({ mocks: [changePasswordMock("oldpass123", "newpass123", { delay: 300 })] });

		await user.type(screen.getByLabelText(/current password/i, { selector: "input" }), "oldpass123");
		await user.type(screen.getByLabelText(/^new password/i, { selector: "input" }), "newpass123");
		await user.type(screen.getByLabelText(/confirm new password/i, { selector: "input" }), "newpass123");
		await user.click(screen.getByRole("button", { name: /update password/i }));

		expect(await screen.findByRole("progressbar")).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
	});
});
