// AccountService.js tests. Unlike ClientService.js, EVERY export here is a raw gql mutation
// document - there are no hook-factory wrappers at all (no useMutation/useQuery calls inside this
// file), so there's nothing to test beyond "is this a usable mutation document that a calling
// component's own useMutation can fire, and does the right data flow back". Each document is
// exercised through the same tiny MutationHarness pattern ClientService.test.js uses for its own
// raw documents (UPDATE_CLIENT_NOTES, ARCHIVE_CLIENT_MUTATION, etc).
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling AccountService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import AccountService from "./AccountService";

// ---- generic harness --------------------------------------------------------------------------

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once
// it lands - same pattern as ClientService.test.js's MutationHarness.
function MutationHarness({ document, variables }) {
	const [result, setResult] = React.useState(null);
	const [mutate] = useMutation(document, { onCompleted: setResult });
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

// ---- CREATE_ARTIST_ACCOUNT ----------------------------------------------------------------------

describe("AccountService.CREATE_ARTIST_ACCOUNT", () => {
	it("creates an artist account and returns the invite link alongside the artist", async () => {
		const user = userEvent.setup();
		const input = {
			firstName: "Gendry",
			lastName: "Baratheon",
			email: "gendry@example.com",
			title: "Apprentice",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: AccountService.CREATE_ARTIST_ACCOUNT,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AccountService.CREATE_ARTIST_ACCOUNT, variables: { input } },
							result: {
								data: {
									createArtistAccount: {
										__typename: "CreateArtistAccountPayload",
										inviteLink: "https://inkbooks.example.com/invite/artist-token-1",
										artist: {
											__typename: "Artist",
											id: "artist-1",
											firstName: "Gendry",
											lastName: "Baratheon",
											email: "gendry@example.com",
											title: "Apprentice",
											userId: "user-1",
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("https://inkbooks.example.com/invite/artist-token-1");
		expect(result).toHaveTextContent("Gendry");
	});
});

// ---- CREATE_STAFF_ACCOUNT -----------------------------------------------------------------------

describe("AccountService.CREATE_STAFF_ACCOUNT", () => {
	it("creates a staff account and returns the invite link alongside the staff record", async () => {
		const user = userEvent.setup();
		const input = {
			firstName: "Podrick",
			lastName: "Payne",
			email: "pod@example.com",
			title: "Front desk",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: AccountService.CREATE_STAFF_ACCOUNT,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AccountService.CREATE_STAFF_ACCOUNT, variables: { input } },
							result: {
								data: {
									createStaffAccount: {
										__typename: "CreateStaffAccountPayload",
										inviteLink: "https://inkbooks.example.com/invite/staff-token-1",
										staff: {
											__typename: "Staff",
											id: "staff-1",
											firstName: "Podrick",
											lastName: "Payne",
											email: "pod@example.com",
											title: "Front desk",
											userId: "user-2",
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("https://inkbooks.example.com/invite/staff-token-1");
		expect(result).toHaveTextContent("Front desk");
	});
});

// ---- CREATE_CLIENT_ACCOUNT ----------------------------------------------------------------------

describe("AccountService.CREATE_CLIENT_ACCOUNT", () => {
	it("creates a brand new client account (isNewAccount: true)", async () => {
		const user = userEvent.setup();
		const input = {
			firstName: "Arya",
			lastName: "Stark",
			email: "arya@example.com",
			phone: "555-0100",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: AccountService.CREATE_CLIENT_ACCOUNT,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AccountService.CREATE_CLIENT_ACCOUNT, variables: { input } },
							result: {
								data: {
									createClientAccount: {
										__typename: "CreateClientAccountPayload",
										isNewAccount: true,
										client: {
											__typename: "Client",
											id: "client-1",
											firstName: "Arya",
											lastName: "Stark",
											email: "arya@example.com",
											phone: "555-0100",
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"isNewAccount":true');
		expect(result).toHaveTextContent("Arya");
	});

	// isNewAccount is selected specifically so the wizard can distinguish "created" from "matched
	// an existing account by email" (see the source file's own comment on this field) - a mock that
	// answers false here is what a repeat email submission looks like.
	it("reports an existing account (isNewAccount: false) without erroring", async () => {
		const user = userEvent.setup();
		const input = {
			firstName: "Arya",
			lastName: "Stark",
			email: "arya@example.com",
			phone: "555-0100",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: AccountService.CREATE_CLIENT_ACCOUNT,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AccountService.CREATE_CLIENT_ACCOUNT, variables: { input } },
							result: {
								data: {
									createClientAccount: {
										__typename: "CreateClientAccountPayload",
										isNewAccount: false,
										client: {
											__typename: "Client",
											id: "client-1",
											firstName: "Arya",
											lastName: "Stark",
											email: "arya@example.com",
											phone: "555-0100",
										},
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"isNewAccount":false');
	});
});
