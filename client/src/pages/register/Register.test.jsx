// Register.jsx tests - public signup as a shop or an independent artist.
//
// This file used to test a client-signup form that sent `role: 30` and `userType: 'client'` in its
// variables, with a long comment explaining that the server ignored both. That whole arrangement is
// gone: clients aren't self-registerable (they get an account the moment they submit a booking
// request), and RegisterAccountInput has no role or userType fields at all - so the guarantee is
// structural now rather than something a test has to describe in prose.
//
// What's worth testing here is the SHAPE of the form: the choice comes first, the two paths ask for
// different things, and neither sends anything about permissions.
//
// Explicit React import - under Vitest, @vitejs/plugin-react compiles JSX with the classic runtime.
// See scripts/check-react-in-tested-components.mjs.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import Register from "./Register";
import { AuthContext } from "../../context/auth";

// Must match Register.jsx's document exactly, or MockedProvider won't pair a request with a result.
const REGISTER_ACCOUNT = gql`
	mutation RegisterAccount($input: RegisterAccountInput!) {
		registerAccount(input: $input) {
			id
			email
			firstName
			lastName
			role
			userType
			accessToken
			firebaseToken
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

async function chooseArtist(user) {
	await user.click(screen.getByText("I'm an independent artist"));
}

async function chooseShop(user) {
	await user.click(screen.getByText("I run a shop"));
}

async function fillCommonFields(user, overrides = {}) {
	const values = {
		firstName: "Jon",
		lastName: "Snow",
		email: "jon@example.com",
		password: "longenoughpassword",
		confirmPassword: "longenoughpassword",
		...overrides,
	};
	await user.type(screen.getByPlaceholderText("First name"), values.firstName);
	await user.type(screen.getByPlaceholderText("Last name"), values.lastName);
	await user.type(screen.getByPlaceholderText("Email"), values.email);
	await user.type(screen.getByPlaceholderText("Password"), values.password);
	await user.type(screen.getByPlaceholderText("Confirm password"), values.confirmPassword);
	return values;
}

const RETURNED_USER = {
	__typename: "User",
	id: "u2",
	email: "jon@example.com",
	firstName: "Jon",
	lastName: "Snow",
	role: 20,
	userType: "artist",
	accessToken: "real-jwt",
	firebaseToken: null,
	tagColor: "#8E24AA",
};

describe("Register", () => {
	it("asks what kind of account first, before any fields", () => {
		renderRegister();

		expect(screen.getByText("I run a shop")).toBeInTheDocument();
		expect(screen.getByText("I'm an independent artist")).toBeInTheDocument();
		// No form yet. Showing the fields and the choice together invites someone to fill the
		// fields in and then discover the choice changes what is being asked of them.
		expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
	});

	it("asks a shop for its name, and an artist not to bother", async () => {
		// The reason the choice comes first: the two paths genuinely differ. Also covers Change,
		// because picking the wrong card shouldn't mean reloading the page.
		const user = userEvent.setup();
		renderRegister();

		await chooseShop(user);
		expect(screen.getByPlaceholderText("Shop name")).toBeInTheDocument();

		await user.click(screen.getByText("Change"));
		await chooseArtist(user);
		expect(screen.queryByPlaceholderText("Shop name")).not.toBeInTheDocument();
	});

	it("sends accountType artist and no shopName at all", async () => {
		const user = userEvent.setup();
		const mocks = [
			{
				request: {
					query: REGISTER_ACCOUNT,
					variables: {
						input: {
							accountType: "artist",
							firstName: "Jon",
							lastName: "Snow",
							email: "jon@example.com",
							password: "longenoughpassword",
							confirmPassword: "longenoughpassword",
							// No shopName key. MockedProvider matches variables deeply, so this is a
							// real assertion: sending `shopName: ""` would fail to match.
						},
					},
				},
				result: { data: { registerAccount: RETURNED_USER } },
			},
		];
		const contextValue = renderRegister({ mocks });

		await chooseArtist(user);
		await fillCommonFields(user);
		await user.click(screen.getByText("Create account"));

		await waitFor(() => expect(contextValue.login).toHaveBeenCalledWith(RETURNED_USER));
	});

	it("sends accountType shop with the shop name", async () => {
		const user = userEvent.setup();
		const shopUser = { ...RETURNED_USER, role: 10 };
		const mocks = [
			{
				request: {
					query: REGISTER_ACCOUNT,
					variables: {
						input: {
							accountType: "shop",
							firstName: "Jon",
							lastName: "Snow",
							email: "jon@example.com",
							password: "longenoughpassword",
							confirmPassword: "longenoughpassword",
							shopName: "Copper Wolf",
						},
					},
				},
				result: { data: { registerAccount: shopUser } },
			},
		];
		const contextValue = renderRegister({ mocks });

		await chooseShop(user);
		await user.type(screen.getByPlaceholderText("Shop name"), "Copper Wolf");
		await fillCommonFields(user);
		await user.click(screen.getByText("Create account"));

		await waitFor(() => expect(contextValue.login).toHaveBeenCalledWith(shopUser));
	});

	it("renders the field errors the server returns, rather than failing silently", async () => {
		// A failed signup that renders nothing is indistinguishable from a dead button.
		const user = userEvent.setup();
		const graphQLError = new Error("Email is already taken");
		graphQLError.extensions = {
			errors: { email: "An account already exists for that email address." },
		};
		const mocks = [
			{
				request: {
					query: REGISTER_ACCOUNT,
					variables: {
						input: {
							accountType: "artist",
							firstName: "Jon",
							lastName: "Snow",
							email: "taken@example.com",
							password: "longenoughpassword",
							confirmPassword: "longenoughpassword",
						},
					},
				},
				result: { errors: [graphQLError] },
			},
		];
		renderRegister({ mocks });

		await chooseArtist(user);
		await fillCommonFields(user, { email: "taken@example.com" });
		await user.click(screen.getByText("Create account"));

		await waitFor(() =>
			expect(
				screen.getByText("An account already exists for that email address."),
			).toBeInTheDocument(),
		);
	});
});
