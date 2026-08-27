// AppearancePanel.jsx tests. Saved to the account (User.themePreference), not the browser - see
// the component's own header comment and ThemeModeProvider.jsx for why. No query backs this panel;
// only UPDATE_USER_MUTATION, fired with a minimal { id, email, role, themePreference } payload.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import AppearancePanel from "./AppearancePanel";
import { AuthContext } from "../../context/auth";
import UserService from "../../services/UserService";

const BASE_USER = {
	id: "user-1",
	email: "renee@example.com",
	role: 20,
	themePreference: null,
};

function updateThemeMock(themePreference, { error, delay } = {}) {
	const request = {
		query: UserService.UPDATE_USER_MUTATION,
		variables: {
			user: {
				id: BASE_USER.id,
				email: BASE_USER.email,
				role: BASE_USER.role,
				themePreference,
			},
		},
	};
	if (error) {
		return { request, error, ...(delay != null ? { delay } : {}) };
	}
	return {
		request,
		...(delay != null ? { delay } : {}),
		result: {
			data: {
				updateUser: {
					__typename: "User",
					id: BASE_USER.id,
					email: BASE_USER.email,
					firstName: "Renee",
					lastName: "Wolf",
					avatar: null,
					role: BASE_USER.role,
					accessToken: "token",
					userType: "artist",
					tagColor: null,
					themePreference,
					userInfo: null,
				},
			},
		},
	};
}

function renderPanel({ user, mocks = [], setAlert = vi.fn(), updateCurrentUser = vi.fn() } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert, updateCurrentUser }}>
				<AppearancePanel />
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, updateCurrentUser };
}

describe("initial selection", () => {
	it("defaults to Match device when the user has no saved preference", () => {
		renderPanel({ user: { ...BASE_USER, themePreference: null } });

		expect(screen.getByText("Match device")).toBeInTheDocument();
	});

	it("shows the user's saved preference when one exists", () => {
		renderPanel({ user: { ...BASE_USER, themePreference: "dark" } });

		expect(screen.getByText("Dark")).toBeInTheDocument();
	});

	it("lists all three options in the dropdown", async () => {
		const user = userEvent.setup();
		renderPanel({ user: { ...BASE_USER, themePreference: "system" } });

		await user.click(screen.getByRole("combobox"));

		expect(screen.getByRole("option", { name: "Match device" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Light" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Dark" })).toBeInTheDocument();
	});
});

describe("changing the theme", () => {
	it("sends the minimal user payload and updates the account on success", async () => {
		const user = userEvent.setup();
		const { updateCurrentUser } = renderPanel({
			user: { ...BASE_USER, themePreference: "system" },
			mocks: [updateThemeMock("dark")],
		});

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: "Dark" }));

		await waitFor(() =>
			expect(updateCurrentUser).toHaveBeenCalledWith(
				expect.objectContaining({ themePreference: "dark" }),
			),
		);
	});

	it("does not send firstName, lastName, or avatar - only the fields the mutation needs", async () => {
		// The mock above already pins the exact variables shape via MockedProvider - reaching the
		// success path (updateCurrentUser being called) IS the assertion that AppearancePanel sent
		// exactly { id, email, role, themePreference } and nothing else, since any extra or missing
		// field would leave the request unmatched and the mutation would hang/error instead.
		const user = userEvent.setup();
		const { updateCurrentUser } = renderPanel({
			user: { ...BASE_USER, themePreference: "light" },
			mocks: [updateThemeMock("system")],
		});

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: "Match device" }));

		await waitFor(() => expect(updateCurrentUser).toHaveBeenCalledTimes(1));
	});

	it("disables the select while the mutation is in flight", async () => {
		const user = userEvent.setup();
		// A real delay on the mock, so the "saving" window is wide enough to observe rather than
		// racing MockedProvider's near-instant default resolution.
		renderPanel({
			user: { ...BASE_USER, themePreference: "system" },
			mocks: [updateThemeMock("dark", { delay: 50 })],
		});

		await user.click(screen.getByRole("combobox"));
		const selecting = user.click(screen.getByRole("option", { name: "Dark" }));

		// MUI marks a disabled Select's combobox with aria-disabled rather than the native
		// `disabled` attribute.
		await waitFor(() =>
			expect(screen.getByRole("combobox")).toHaveAttribute("aria-disabled", "true"),
		);

		await selecting;
		await waitFor(() =>
			expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-disabled", "true"),
		);
	});

	it("alerts the server's error message and leaves the account preference unchanged when the save fails", async () => {
		const user = userEvent.setup();
		const { setAlert, updateCurrentUser } = renderPanel({
			user: { ...BASE_USER, themePreference: "system" },
			mocks: [updateThemeMock("dark", { error: new Error("Could not save your preference.") })],
		});

		await user.click(screen.getByRole("combobox"));
		await user.click(screen.getByRole("option", { name: "Dark" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
					message: "Could not save your preference.",
				}),
			),
		);
		expect(updateCurrentUser).not.toHaveBeenCalled();
	});
});
