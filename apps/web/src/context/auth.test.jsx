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
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../firebase/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({
	signInWithCustomToken: vi.fn(() => Promise.resolve({ user: { uid: "fb-test-uid" } })),
	signOut: vi.fn(() => Promise.resolve()),
}));

import {
	ApolloClient,
	ApolloLink,
	ApolloProvider,
	InMemoryCache,
	gql,
} from "@apollo/client";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { AuthProvider, useAuth } from "./auth";
import { AUTH_SETTINGS_CONSTANTS } from "../constants";

// A minimal, unsigned JWT - jwt-decode (see auth.jsx) only ever base64-decodes and JSON.parses
// the middle segment, it never verifies a signature, so there's no need for a real one here. Same
// technique the server side's own token-expiry tests use for the equivalent reason.
function fakeJwt(payload) {
	const base64url = (obj) =>
		btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `${base64url({ alg: "none", typ: "JWT" })}.${base64url(payload)}.sig`;
}

function TestConsumer() {
	const { user, firebaseUser, login, logout, updateCurrentUser, initializing } = useAuth();
	return (
		<div>
			<div data-testid="user">{user ? user.email : "no-user"}</div>
			<div data-testid="firebase-user">{firebaseUser ? firebaseUser.uid : "no-fb-user"}</div>
			<div data-testid="initializing">{initializing ? "true" : "false"}</div>
			<button onClick={() => login({ id: "1", email: "gordo@example.com", accessToken: "tok123", firebaseToken: "fb-tok" })}>
				login
			</button>
			<button onClick={() => login({ id: "1", email: "gordo@example.com", accessToken: "tok123" })}>
				loginNoFirebase
			</button>
			<button onClick={() => login({ id: "2", email: "admin@example.com", accessToken: "tok456" })}>
				loginAsSomeoneElse
			</button>
			<button onClick={() => updateCurrentUser({ id: "1", email: "renamed@example.com", accessToken: "tok123" })}>
				update
			</button>
			<button onClick={logout}>logout</button>
		</div>
	);
}

// A stand-in for anything the signed-in user's screens have read - a shop's client list is the one
// that actually leaked.
//
// A REAL document against the real schema, paging and all. It could have been any two made-up
// fields, but check-graphql-documents.js validates every document in this repo including this one -
// and it rejected the made-up version, which is the check earning its keep on a test fixture.
const SOMEBODY_ELSES_DATA = gql`
	query GetClients {
		getClients {
			items {
				id
				firstName
			}
		}
	}
`;

/**
 * A REAL InMemoryCache, not MockedProvider's, and returned so tests can look inside it.
 *
 * The leak is a fact about what is sitting in the cache after a session ends, so the assertion has
 * to be about the cache's actual contents. Spying on a clearStore() call would pass just as happily
 * against a version that clears the wrong store, or clears it too late.
 */
function renderWithProvider() {
	const cache = new InMemoryCache();
	const client = new ApolloClient({ cache, link: ApolloLink.empty() });
	const result = render(
		<ApolloProvider client={client}>
			<AuthProvider>
				<TestConsumer />
			</AuthProvider>
		</ApolloProvider>,
	);
	return { ...result, cache };
}

/** Puts one user's data in the cache, the way their screens would have. */
function seedCache(cache) {
	cache.writeQuery({
		query: SOMEBODY_ELSES_DATA,
		data: {
			getClients: {
				__typename: "ClientPage",
				items: [
					{ __typename: "Client", id: "c1", firstName: "ShopAdminsClient" },
				],
			},
		},
	});
	// Guards the guard: if writeQuery silently did nothing, every assertion below would pass by
	// accident.
	expect(Object.keys(cache.extract()).length).toBeGreaterThan(0);
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

	it("login() updates state and persists the user to storage", async () => {
		const user = userEvent.setup();
		renderWithProvider();

		await act(async () => {
			await user.click(screen.getByText("login"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});
		expect(localStorage.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).not.toBeNull();
	});

	it("login() signs into Firebase with the server-minted custom token when present", async () => {
		const user = userEvent.setup();
		renderWithProvider();

		await act(async () => {
			await user.click(screen.getByText("login"));
		});

		await waitFor(() => {
			expect(signInWithCustomToken).toHaveBeenCalledWith({}, "fb-tok");
		});
		expect(screen.getByTestId("firebase-user")).toHaveTextContent("fb-test-uid");
	});

	it("login() skips Firebase sign-in gracefully when firebaseToken is missing", async () => {
		const user = userEvent.setup();
		renderWithProvider();

		await act(async () => {
			await user.click(screen.getByText("loginNoFirebase"));
		});

		// App-level login still succeeds even though Firebase Storage features are unavailable.
		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});
		expect(signInWithCustomToken).not.toHaveBeenCalled();
	});

	it("updateCurrentUser() replaces both the reducer state and the cached value", async () => {
		const user = userEvent.setup();
		renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});
		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});

		await act(async () => {
			await user.click(screen.getByText("update"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("renamed@example.com");
		});
	});

	it("updateCurrentUser() leaves the cached data alone - it is the same person", async () => {
		// The other side of the rule below, and it matters: nobody signed in or out, so wiping here
		// would refetch the whole screen somebody is standing on every time they rename themselves
		// or the signup wizard re-reads their account. The distinction that makes the leak dangerous
		// is "whose session is this", and that is exactly what has not changed here.
		const user = userEvent.setup();
		const { cache } = renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});
		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});
		seedCache(cache);

		await act(async () => {
			await user.click(screen.getByText("update"));
		});

		expect(cache.extract()).not.toEqual({});
	});

	it("logout() clears state, the cache, and signs out of Firebase", async () => {
		const user = userEvent.setup();
		renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});
		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});

		await act(async () => {
			await user.click(screen.getByText("logout"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("no-user");
		});
		expect(localStorage.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).toBeNull();
		expect(signOut).toHaveBeenCalled();
	});
});

describe("initial session restore", () => {
	// The check used to run synchronously at MODULE load, straight into the reducer's initial
	// state, before React ever rendered - CacheService.getItem was synchronous. It has to be an
	// effect now that TokenStorageService.getItemAsync is async (mirrors expo-secure-store's real,
	// inherently-async API - see that file), which means there is a real render, however brief,
	// before a previously-signed-in user's session comes back. `initializing` exists so the rest of
	// the app (see utils/AuthRoute.jsx) can tell that render apart from "checked - no one's signed
	// in".
	it("starts initializing and flips to false once the storage check completes, with nothing stored", async () => {
		renderWithProvider();

		expect(screen.getByTestId("initializing")).toHaveTextContent("true");

		await waitFor(() => {
			expect(screen.getByTestId("initializing")).toHaveTextContent("false");
		});
		expect(screen.getByTestId("user")).toHaveTextContent("no-user");
	});

	it("restores a previously signed-in user from storage on mount", async () => {
		const storedUser = {
			id: "1",
			email: "gordo@example.com",
			accessToken: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
		};
		// The exact format setSession/TokenStorageService.setItemAsync write - a single
		// JSON.stringify, not CacheService's old double-encoded one (see DECISIONS.md's X5).
		localStorage.setItem(
			AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
			JSON.stringify(storedUser),
		);

		renderWithProvider();

		await waitFor(() => {
			expect(screen.getByTestId("initializing")).toHaveTextContent("false");
		});
		expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
	});

	it("discards an expired token found in storage and does not restore the user", async () => {
		const expiredUser = {
			id: "1",
			email: "gordo@example.com",
			accessToken: fakeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 }),
		};
		localStorage.setItem(
			AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
			JSON.stringify(expiredUser),
		);

		renderWithProvider();

		await waitFor(() => {
			expect(screen.getByTestId("initializing")).toHaveTextContent("false");
		});
		expect(screen.getByTestId("user")).toHaveTextContent("no-user");
		expect(localStorage.getItem(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).toBeNull();
	});
});

describe("one session's data never reaches the next", () => {
	// THE REPORTED BUG, and the worst one in this codebase so far: log in as an artist, log out, log
	// in as a shop admin, log out, log back in as the artist - and the shop admin's CLIENTS were on
	// the artist's screen, for an artist not connected to that shop.
	//
	// There is one InMemoryCache, built at module load in index.jsx, and it lived as long as the
	// browser tab. logout() cleared localStorage and Firebase and never touched it, so every
	// normalised entity and every ROOT_QUERY field the previous session read stayed put. Apollo's
	// default fetchPolicy is cache-first, so a query already answered for those variables is served
	// from memory and never sent - the server's shop-scoping was never consulted, which is why no
	// server-side test could have caught this.

	it("destroys the cache when a session ends", async () => {
		const user = userEvent.setup();
		const { cache } = renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});
		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});
		seedCache(cache);

		await act(async () => {
			await user.click(screen.getByText("logout"));
		});

		expect(cache.extract()).toEqual({});
	});

	it("destroys it on signing in too, not only on signing out", async () => {
		// Logging out is not the only way a session ends, and the wipe cannot depend on the tidy
		// path being taken. A token expiring, a second account signing in over the first, or any
		// sign-in route added later must not be able to inherit the previous user's data - so the
		// rule is "any authentication event discards everything", with no exception to get wrong.
		const user = userEvent.setup();
		const { cache } = renderWithProvider();
		await act(async () => {
			await user.click(screen.getByText("login"));
		});
		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("gordo@example.com");
		});
		seedCache(cache);

		// Straight from one account to another. No logout in between, deliberately.
		await act(async () => {
			await user.click(screen.getByText("loginAsSomeoneElse"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("user")).toHaveTextContent("admin@example.com");
		});
		expect(cache.extract()).toEqual({});
	});
});
