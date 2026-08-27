// PasswordService.js tests. This file mixes raw gql documents (INSPECT_TOKEN,
// REQUEST_PASSWORD_RESET, SET_PASSWORD_WITH_TOKEN - all exported directly) with hook-factory
// wrappers around each of them (useInspectToken, useRequestPasswordReset,
// useSetPasswordWithToken) - so every export is exercised through the same
// throwaway-harness-under-MockedProvider convention ClientService.test.js established, built from
// the REAL exported gql documents rather than hand-copied query text since PasswordService.js
// exports all three documents directly.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling PasswordService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useQuery, useMutation } from "@apollo/client";
import PasswordService from "./PasswordService";

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query-returning hook function produces - same shape as
// ClientService.test.js's QueryHarness.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders a button that fires a mutation obtained from a hook-factory (useRequestPasswordReset,
// useSetPasswordWithToken) with fixed variables, and the onCompleted-style data once it lands.
// Unlike ClientService.test.js's MutationHarness (which calls useMutation on a raw document
// itself), PasswordService's mutations are already wrapped by a hook factory, so this harness
// takes that hook function directly and reads the tuple it returns.
function HookMutationHarness({ hookFn, variables }) {
	const [mutate, { data }] = hookFn();
	return React.createElement(
		"div",
		null,
		React.createElement("button", { onClick: () => mutate({ variables }) }, "go"),
		data && React.createElement("div", { "data-testid": "result" }, JSON.stringify(data)),
	);
}

async function clickGo(user) {
	await user.click(screen.getByRole("button", { name: "go" }));
}

// ---- INSPECT_TOKEN / useInspectToken -----------------------------------------------------------

describe("PasswordService.useInspectToken", () => {
	it("resolves with the token's validity, purpose, and first name", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => PasswordService.useInspectToken("token-123"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: PasswordService.INSPECT_TOKEN, variables: { token: "token-123" } },
							result: {
								data: {
									inspectPasswordToken: {
										__typename: "InspectPasswordTokenResult",
										valid: true,
										purpose: "invite",
										firstName: "Arya",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Arya");
		expect(result).toHaveTextContent("invite");
	});

	it("reports an invalid token without throwing", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => PasswordService.useInspectToken("expired-token"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: PasswordService.INSPECT_TOKEN,
								variables: { token: "expired-token" },
							},
							result: {
								data: {
									inspectPasswordToken: {
										__typename: "InspectPasswordTokenResult",
										valid: false,
										purpose: null,
										firstName: null,
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"valid":false');
	});

	// skip: !token - a dead/missing link must never fire a request, per the source file's own
	// comment about checking "before the form renders so a dead link says so up front".
	it("skips the query entirely when token is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => PasswordService.useInspectToken(""),
			});
		}
		// Zero mocks registered: a real request would blow up with "no matching mock" and surface
		// as an error, which the assertion below rules out.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("also skips when token is undefined (the default-less argument omitted entirely)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => PasswordService.useInspectToken(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("PasswordService.INSPECT_TOKEN (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery - this is the
	// exact document _useInspectToken itself runs internally, matching how ClientService.test.js
	// checks FETCH_CLIENT_DASHBOARD standalone.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(PasswordService.INSPECT_TOKEN, { variables: { token: "token-123" } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: PasswordService.INSPECT_TOKEN, variables: { token: "token-123" } },
							result: {
								data: {
									inspectPasswordToken: {
										__typename: "InspectPasswordTokenResult",
										valid: true,
										purpose: "reset",
										firstName: "Gendry",
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Gendry");
	});
});

// ---- REQUEST_PASSWORD_RESET / useRequestPasswordReset -------------------------------------------

describe("PasswordService.useRequestPasswordReset", () => {
	it("sends the email and resolves with the mutation's boolean result", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(HookMutationHarness, {
				hookFn: PasswordService.useRequestPasswordReset,
				variables: { email: "arya@example.com" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: PasswordService.REQUEST_PASSWORD_RESET,
								variables: { email: "arya@example.com" },
							},
							result: { data: { requestPasswordReset: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"requestPasswordReset":true');
	});
});

describe("PasswordService.REQUEST_PASSWORD_RESET (raw document)", () => {
	it("is a usable mutation document when handed to useMutation directly", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(HookMutationHarness, {
				hookFn: () => useMutation(PasswordService.REQUEST_PASSWORD_RESET),
				variables: { email: "nobody@example.com" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: PasswordService.REQUEST_PASSWORD_RESET,
								variables: { email: "nobody@example.com" },
							},
							// requestPasswordReset intentionally answers the same way whether or not the
							// email has an account (see server/graphql/resolvers/passwords.js convention of
							// not leaking account existence) - true either way is the expected shape here.
							result: { data: { requestPasswordReset: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"requestPasswordReset":true');
	});
});

// ---- SET_PASSWORD_WITH_TOKEN / useSetPasswordWithToken -------------------------------------------

describe("PasswordService.useSetPasswordWithToken", () => {
	it("sends the token and new password and resolves with the mutation's boolean result", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(HookMutationHarness, {
				hookFn: PasswordService.useSetPasswordWithToken,
				variables: { token: "token-123", newPassword: "correct horse battery staple" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: PasswordService.SET_PASSWORD_WITH_TOKEN,
								variables: { token: "token-123", newPassword: "correct horse battery staple" },
							},
							result: { data: { setPasswordWithToken: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"setPasswordWithToken":true');
	});

	it("surfaces a failed/expired-token result as data:false rather than throwing", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(HookMutationHarness, {
				hookFn: PasswordService.useSetPasswordWithToken,
				variables: { token: "expired-token", newPassword: "correct horse battery staple" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: PasswordService.SET_PASSWORD_WITH_TOKEN,
								variables: { token: "expired-token", newPassword: "correct horse battery staple" },
							},
							result: { data: { setPasswordWithToken: false } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"setPasswordWithToken":false');
	});
});

describe("PasswordService.SET_PASSWORD_WITH_TOKEN (raw document)", () => {
	it("propagates a GraphQL error (e.g. an already-used token) as an error, not a silent success", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const user = userEvent.setup();
		function ErrorHarness() {
			const [mutate, { error }] = PasswordService.useSetPasswordWithToken();
			return React.createElement(
				"div",
				null,
				React.createElement(
					"button",
					{
						onClick: () =>
							mutate({
								variables: { token: "already-used", newPassword: "correct horse battery staple" },
							}).catch(() => {}),
					},
					"go",
				),
				error && React.createElement("div", { "data-testid": "error" }, "ERROR"),
			);
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: PasswordService.SET_PASSWORD_WITH_TOKEN,
								variables: { token: "already-used", newPassword: "correct horse battery staple" },
							},
							error: new Error("Token already used"),
						},
					],
				},
				React.createElement(ErrorHarness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});
