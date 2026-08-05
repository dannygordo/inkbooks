// Login.jsx tests. Uses AuthContext.Provider directly (not the real AuthProvider) so this test
// doesn't need to touch Firebase at all - Login only calls context.login()/context.setAlert(),
// both of which are trivially mockable this way, matching the same "context is just an injected
// dependency" approach used for the Apollo mutation via MockedProvider.
// Explicit React import - the app itself relies on @vitejs/plugin-react's automatic JSX runtime,
// but Vitest's transform for *test* files falls back to the classic runtime (React.createElement
// in scope, not auto-imported) without this - see the matching note in context/auth.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import Login from "./Login";
import { AuthContext } from "../../context/auth";

// Mirrors Login.jsx's own LOGIN_USER document closely enough for MockedProvider's request
// matching (Apollo matches on query + variables, not the exact gql template identity) - only the
// fields this test actually asserts on need to be present in the mock's result.
const LOGIN_USER = gql`
	mutation login($email: String!, $password: String!) {
		login(email: $email, password: $password) {
			id
			email
			firstName
			lastName
			avatar
			role
			accessToken
			firebaseToken
			userType
			tagColor
			userInfo {
				... on Artist {
					avatar
					id
					firstName
					lastName
					hourlyRate
					shop {
						id
						name
						website
					}
				}
				... on Client {
					avatar
					id
					firstName
					lastName
				}
				... on Staff {
					avatar
					id
					firstName
					lastName
					title
					shop {
						id
						name
						website
					}
				}
			}
		}
	}
`;

function renderLogin({ mocks, contextOverrides = {} } = {}) {
	const contextValue = {
		login: vi.fn(),
		setAlert: vi.fn(),
		...contextOverrides,
	};
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Login />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return contextValue;
}

describe("Login", () => {
	it("renders email/password inputs and a submit button", () => {
		renderLogin({ mocks: [] });
		expect(screen.getByPlaceholderText("email")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("password")).toBeInTheDocument();
		expect(screen.getByText("Login In")).toBeInTheDocument();
	});

	it("on successful login: calls context.login() with the returned user and navigates home", async () => {
		const user = userEvent.setup();
		// __typename required on the mock's result object now that MockedProvider's default
		// addTypename: true is in effect (see the note at the top of this file) - it has to match
		// the actual GraphQL type login() resolves to (User, per server/graphql/typeDefs.js) or
		// Apollo's cache normalization won't recognize this as a match for the query.
		const returnedUser = {
			__typename: "User",
			id: "u1",
			email: "gordo@example.com",
			firstName: "Gordo",
			lastName: "Test",
			avatar: "",
			role: 30,
			accessToken: "real-jwt-here",
			firebaseToken: null,
			userType: "client",
			tagColor: "#fff",
			userInfo: null,
		};
		const mocks = [
			{
				request: { query: LOGIN_USER, variables: { email: "gordo@example.com", password: "hunter2" } },
				result: { data: { login: returnedUser } },
			},
		];
		const contextValue = renderLogin({ mocks });

		await user.type(screen.getByPlaceholderText("email"), "gordo@example.com");
		await user.type(screen.getByPlaceholderText("password"), "hunter2");
		await user.click(screen.getByText("Login In"));

		await waitFor(() => expect(contextValue.login).toHaveBeenCalledWith(returnedUser));
	});

	it("on a failed login: surfaces the GraphQL error via context.setAlert(), not a thrown exception", async () => {
		const user = userEvent.setup();
		const mocks = [
			{
				request: { query: LOGIN_USER, variables: { email: "wrong@example.com", password: "wrongpass" } },
				error: new Error("Invalid email or password"),
			},
		];
		const contextValue = renderLogin({ mocks });

		await user.type(screen.getByPlaceholderText("email"), "wrong@example.com");
		await user.type(screen.getByPlaceholderText("password"), "wrongpass");
		await user.click(screen.getByText("Login In"));

		await waitFor(() => expect(contextValue.setAlert).toHaveBeenCalled());
		expect(contextValue.login).not.toHaveBeenCalled();
		const alertArg = contextValue.setAlert.mock.calls[0][0];
		expect(alertArg.isAlert).toBe(true);
		expect(alertArg.severity).toBe("error");
	});
});
