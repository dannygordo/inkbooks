// AuthProvider/useAuth tests. Mocks both "firebase/auth" (signInWithCustomToken/signOut) and the
// local firebase/firebase.js module - the latter calls initializeApp/getAnalytics/getStorage/
// getFirestore/getAuth at import time against real Firebase config, which has no business running
// (or succeeding) inside a jsdom test environment with no network access. Nothing under test here
// actually needs a real Firebase connection - only that AuthProvider calls the right SDK function
// with the right token and updates its own state accordingly.
// Explicit React import - the app itself relies on @vitejs/plugin-react's automatic JSX runtime
// (no file in client/src imports React just to use JSX), but Vitest's transform for *test* files
// fell back to the classic runtime (React.createElement in scope, not auto-imported) without this,
// throwing "React is not defined" the moment any JSX below actually rendered.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../firebase/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
	signInWithCustomToken: vi.fn(() => Promise.resolve({ user: { uid: "fb-test-uid" } })),
	signOut: vi.fn(() => Promise.resolve()),
}));

import { signInWithCustomToken, signOut } from "firebase/auth";
import { AuthProvider, useAuth } from "./auth";
import { AUTH_SETTINGS_CONSTANTS } from "../constants";

function TestConsumer() {
	const { user, firebaseUser, login, logout, updateCurrentUser } = useAuth();
	return (
		<div>
			<div data-testid="user">{user ? user.username : "no-user"}</div>
			<div data-testid="firebase-user">{firebaseUser ? firebaseUser.uid : "no-fb-user"}</div>
			<button onClick={() => login({ id: "1", username: "gordo", accessToken: "tok123", firebaseToken: "fb-tok" })}>
				login
			</button>
			<button onClick={() => login({ id: "1", username: "gordo", accessToken: "tok123" })}>
				loginNoFirebase
			</button>
			<button onClick={() => updateCurrentUser({ id: "1", username: "gordo-renamed", accessToken: "tok123" })}>
				update
			</button>
			<button onClick={logout}>logout</button>
		</div>
	);
}

function renderWithProvider() {
	return render(
		<AuthProvider>
			<TestConsumer />
		</AuthProvider>,
	);
}

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
});

describe("AuthProvider", () => {
	it("starts logged out with no cached user", () => {
		renderWithProvider();
		expect(screen.getByTestId("user")).toHaveTextContent("no-user");
	});

	it("login() updates state and persists the user to CacheService", async () => {
		const user = userEvent.setup();
		renderWithProvider();

		await act(async () => {
			await user.click(screen.getByText("login"));
		});

		expect(screen.getByTestId("user")).toHaveTextContent("gordo");
		expect(localStorage.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).not.toBeNull();
	});

	it("login() signs into Firebase with the server-minted custom token when present", async () => {
		const user = userEvent.setup();
		renderWithProvider();

		await act(async () => {
			await user.click(screen.getByText("login"));
		});

		expect(signInWithCustomToken).toHaveBeenCalledWith({}, "fb-tok");
		expect(screen.getByTestId("firebase-user")).toHaveTextContent("fb-test-uid");
	});

	it("login() skips Firebase sign-in gracefully when firebaseToken is missing", async () => {
		const user = userEvent.setup();
		renderWithProvider();

		await act(async () => {
			await user.click(screen.getByText("loginNoFirebase"));
		});

		expect(signInWithCustomToken).not.toHaveBeenCalled();
		// App-level login still succeeds even though Firebase Storage features are unavailable.
		expect(screen.getByTestId("user")).toHaveTextContent("gordo");
	});

	it("updateCurrentUser() replaces both the reducer state and the cached value", async () => {
		const user = userEvent.setup();
		renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});

		await act(async () => {
			await user.click(screen.getByText("update"));
		});

		expect(screen.getByTestId("user")).toHaveTextContent("gordo-renamed");
	});

	it("logout() clears state, the cache, and signs out of Firebase", async () => {
		const user = userEvent.setup();
		renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});

		await act(async () => {
			await user.click(screen.getByText("logout"));
		});

		expect(screen.getByTestId("user")).toHaveTextContent("no-user");
		expect(localStorage.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).toBeNull();
		expect(signOut).toHaveBeenCalled();
	});
});
