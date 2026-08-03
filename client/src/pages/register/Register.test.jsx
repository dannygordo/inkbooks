// Register.jsx tests. Same AuthContext.Provider-injection approach as Login.test.jsx. Also
// covers the client-side password-mismatch guard (setCustomValidity) and the important regression
// note from Register.jsx's own comment: role/userType are sent in the mutation variables purely
// for GraphQL schema completeness - the server (resolvers/users.js's register()) hardcodes both
// server-side regardless of what's sent, which is the actual security boundary (see
// server/test/integration/auth.test.js's matching regression test). This test only confirms the
// client still sends role: 30 / userType: 'client' as before, not that this is what makes the app
// secure.
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
import Register from "./Register";
import { AuthContext } from "../../context/auth";

const REGISTER_USER = gql`
	mutation register(
		$username: String!
		$email: String!
		$firstName: String!
		$lastName: String!
		$avatar: String
		$password: String!
		$confirmPassword: String!
		$role: Int!
		$userType: String!
	) {
		register(
			registerInput: {
				email: $email
				firstName: $firstName
				lastName: $lastName
				avatar: $avatar
				username: $username
				password: $password
				confirmPassword: $confirmPassword
				role: $role
				userType: $userType
			}
		) {
			id
			email
			firstName
			lastName
			avatar
			username
			role
			accessToken
			firebaseToken
			userType
			tagColor
		}
	}
`;

function renderRegister({ mocks = [] } = {}) {
	const contextValue = { login: vi.fn() };
	render(
		<MemoryRouter>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={contextValue}>
					<Register />
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return contextValue;
}

async function fillForm(user, overrides = {}) {
	const values = {
		username: "newartist",
		firstName: "Jon",
		lastName: "Snow",
		avatar: "",
		email: "jon@example.com",
		password: "longenoughpassword",
		confirmPassword: "longenoughpassword",
		...overrides,
	};
	if (values.username) await user.type(screen.getByPlaceholderText("Username"), values.username);
	if (values.firstName) await user.type(screen.getByPlaceholderText("First Name"), values.firstName);
	if (values.lastName) await user.type(screen.getByPlaceholderText("Last Name"), values.lastName);
	if (values.avatar) await user.type(screen.getByPlaceholderText("Avatar"), values.avatar);
	if (values.email) await user.type(screen.getByPlaceholderText("Email"), values.email);
	if (values.password) await user.type(screen.getByPlaceholderText("Password"), values.password);
	if (values.confirmPassword) {
		await user.type(screen.getByPlaceholderText("Confirm Password"), values.confirmPassword);
	}
}

describe("Register", () => {
	it("renders all the expected inputs", () => {
		renderRegister();
		[
			"Username",
			"First Name",
			"Last Name",
			"Avatar",
			"Email",
			"Password",
			"Confirm Password",
		].forEach((placeholder) => {
			expect(screen.getByPlaceholderText(placeholder)).toBeInTheDocument();
		});
	});

	it("blocks submission client-side when confirmPassword does not match password", async () => {
		const user = userEvent.setup();
		const contextValue = renderRegister({ mocks: [] });

		await fillForm(user, { password: "longenoughpassword", confirmPassword: "somethingElse" });
		await user.click(screen.getByText("Sign Up"));

		// No matching mock exists for this scenario - if the mismatch guard failed to stop
		// submission, MockedProvider would throw on an unmatched request and this test would fail
		// for that reason instead. The more direct assertion: context.login should never fire.
		expect(contextValue.login).not.toHaveBeenCalled();
		expect(screen.getByPlaceholderText("Confirm Password")).toBeInvalid();
	});

	it("on successful registration: sends role 30/userType client and calls context.login()", async () => {
		const user = userEvent.setup();
		// __typename required on the mock's result object now that MockedProvider's default
		// addTypename: true is in effect - it has to match the actual GraphQL type register()
		// resolves to (User, per server/graphql/typeDefs.js) or Apollo's cache normalization won't
		// recognize this as a match for the query.
		const returnedUser = {
			__typename: "User",
			id: "u2",
			email: "jon@example.com",
			firstName: "Jon",
			lastName: "Snow",
			avatar: "",
			username: "newartist",
			role: 30,
			accessToken: "real-jwt",
			firebaseToken: null,
			userType: "client",
			// Was "#fff" - register() now always assigns a real default itself (purple, since a
			// self-registered account has no shop) rather than echoing back whatever the client
			// sent (see resolvers/users.js's register() and utils/tag-color.js). The client no
			// longer sends a tagColor at all - see the mutation variables below.
			tagColor: "#8E24AA",
		};
		const mocks = [
			{
				request: {
					query: REGISTER_USER,
					variables: {
						username: "newartist",
						email: "jon@example.com",
						firstName: "Jon",
						lastName: "Snow",
						avatar: "",
						password: "longenoughpassword",
						confirmPassword: "longenoughpassword",
						role: 30,
						userType: "client",
					},
				},
				result: { data: { register: returnedUser } },
			},
		];
		const contextValue = renderRegister({ mocks });

		await fillForm(user);
		await user.click(screen.getByText("Sign Up"));

		await waitFor(() => expect(contextValue.login).toHaveBeenCalledWith(returnedUser));
	});

	it("on a validation error from the server: renders the field errors returned in extensions.errors", async () => {
		const user = userEvent.setup();
		const graphQLError = new Error("Errors");
		graphQLError.extensions = { errors: { password: "Password must be at least 8 characters" } };
		const mocks = [
			{
				request: {
					query: REGISTER_USER,
					variables: {
						username: "newartist",
						email: "jon@example.com",
						firstName: "Jon",
						lastName: "Snow",
						avatar: "",
						password: "short1",
						confirmPassword: "short1",
						role: 30,
						userType: "client",
					},
				},
				result: { errors: [graphQLError] },
			},
		];
		renderRegister({ mocks });

		await fillForm(user, { password: "short1", confirmPassword: "short1" });
		await user.click(screen.getByText("Sign Up"));

		await waitFor(() =>
			expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument(),
		);
	});
});
