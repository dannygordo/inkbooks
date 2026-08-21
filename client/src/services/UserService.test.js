// UserService.js tests. Unusual among these Service files: it has two TOP-LEVEL named exports
// (CURRENT_USER_FIELDS, a fragment; GET_CURRENT_USER, a query built from that fragment) alongside
// the usual default-exported object (UPDATE_USER_MUTATION / CHANGE_PASSWORD_MUTATION raw
// documents, plus the getTagColorsByShop hook factory). Every export is exercised through the
// same throwaway-harness-under-MockedProvider convention ClientService.test.js established, built
// from the REAL exported gql documents wherever one is exported directly.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling UserService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useQuery, useMutation } from "@apollo/client";
import { print } from "graphql";
import UserService, { CURRENT_USER_FIELDS, GET_CURRENT_USER } from "./UserService";

// getUserTagColors isn't separately exported by UserService (unlike GET_CURRENT_USER), so it's
// reconstructed here field-for-field from the real source in UserService.js purely so
// MockedProvider has a document to match against - MockedProvider compares a request by the
// document's printed text plus variables, not by reference identity, so this still fails loudly
// if the real query in UserService.js ever drifts from what's copied here.
const FETCH_TAG_COLORS_BY_SHOP_FOR_TESTS = gql`
	query GetUserTagColors($shopId: ID!) {
		getUserTagColors(shopId: $shopId) {
			tagColor
		}
	}
`;

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

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once
// it lands - same shape as ClientService.test.js's MutationHarness, for the two raw documents
// (UPDATE_USER_MUTATION, CHANGE_PASSWORD_MUTATION) that UserService hands callers directly.
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

// ---- CURRENT_USER_FIELDS (fragment) -------------------------------------------------------------

describe("UserService.CURRENT_USER_FIELDS", () => {
	// The fragment's whole reason for existing (per the source file's own extensive comment) is
	// that accessToken/firebaseToken must NEVER be part of it, so a routine refetch of a user
	// through this shared shape can't stomp a live token in Apollo's normalised cache. This locks
	// that design decision in as a test rather than leaving it as a comment someone could
	// contradict later without anything failing.
	it("never selects accessToken or firebaseToken", () => {
		const printed = print(CURRENT_USER_FIELDS);
		expect(printed).not.toContain("accessToken");
		expect(printed).not.toContain("firebaseToken");
	});

	// The fragment exists specifically so every caller selects userInfo the same way (see the
	// source comment about login vs. signup drifting apart before this existed) - lock in that all
	// three userType branches are present.
	it("selects userInfo across all three userType branches (Artist, Client, Staff)", () => {
		const printed = print(CURRENT_USER_FIELDS);
		expect(printed).toContain("... on Artist");
		expect(printed).toContain("... on Client");
		expect(printed).toContain("... on Staff");
		expect(printed).toContain("hourlyRate");
	});
});

// ---- GET_CURRENT_USER -----------------------------------------------------------------------

describe("UserService.GET_CURRENT_USER", () => {
	it("resolves an Artist session with shop info via the userInfo union", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(GET_CURRENT_USER, { variables: { userId: "user-1" } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_CURRENT_USER, variables: { userId: "user-1" } },
							result: {
								data: {
									getUser: {
										__typename: "User",
										id: "user-1",
										email: "gendry@example.com",
										firstName: "Gendry",
										lastName: "Baratheon",
										avatar: null,
										role: "artist",
										userType: "Artist",
										tagColor: "#ff0000",
										themePreference: "dark",
										userInfo: {
											__typename: "Artist",
											avatar: null,
											id: "artist-1",
											firstName: "Gendry",
											lastName: "Baratheon",
											hourlyRate: 15000,
											shop: { __typename: "Shop", id: "shop-1", name: "Forged Ink", website: null },
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Forged Ink");
		expect(result).toHaveTextContent("15000");
	});

	it("resolves a Client session, whose userInfo branch carries no shop", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(GET_CURRENT_USER, { variables: { userId: "user-2" } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_CURRENT_USER, variables: { userId: "user-2" } },
							result: {
								data: {
									getUser: {
										__typename: "User",
										id: "user-2",
										email: "arya@example.com",
										firstName: "Arya",
										lastName: "Stark",
										avatar: null,
										role: "client",
										userType: "Client",
										tagColor: null,
										themePreference: "light",
										userInfo: {
											__typename: "Client",
											avatar: null,
											id: "client-1",
											firstName: "Arya",
											lastName: "Stark",
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Arya");
		expect(result).toHaveTextContent('"__typename":"Client"');
	});

	it("resolves a Staff session with a title and shop", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(GET_CURRENT_USER, { variables: { userId: "user-3" } }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_CURRENT_USER, variables: { userId: "user-3" } },
							result: {
								data: {
									getUser: {
										__typename: "User",
										id: "user-3",
										email: "pod@example.com",
										firstName: "Podrick",
										lastName: "Payne",
										avatar: null,
										role: "staff",
										userType: "Staff",
										tagColor: null,
										themePreference: "light",
										userInfo: {
											__typename: "Staff",
											avatar: null,
											id: "staff-1",
											firstName: "Podrick",
											lastName: "Payne",
											title: "Front desk",
											shop: { __typename: "Shop", id: "shop-1", name: "Forged Ink", website: null },
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

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Front desk");
	});
});

// ---- UPDATE_USER_MUTATION -----------------------------------------------------------------------

describe("UserService.UPDATE_USER_MUTATION", () => {
	it("updates the user and returns a fresh accessToken plus the updated fields", async () => {
		const user = userEvent.setup();
		const patch = { id: "user-1", firstName: "Gendry Updated" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: UserService.UPDATE_USER_MUTATION,
				variables: { user: patch },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UserService.UPDATE_USER_MUTATION, variables: { user: patch } },
							result: {
								data: {
									updateUser: {
										__typename: "User",
										id: "user-1",
										email: "gendry@example.com",
										firstName: "Gendry Updated",
										lastName: "Baratheon",
										avatar: null,
										role: "artist",
										accessToken: "new-access-token",
										userType: "Artist",
										tagColor: "#ff0000",
										themePreference: "dark",
										userInfo: {
											__typename: "Artist",
											firstName: "Gendry Updated",
											lastName: "Baratheon",
											avatar: null,
											id: "artist-1",
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
		expect(result).toHaveTextContent("Gendry Updated");
		expect(result).toHaveTextContent("new-access-token");
	});

	// Unlike CURRENT_USER_FIELDS, this mutation's own selection set DOES select accessToken - see
	// the source file's comment explaining that distinction (login/signup/update all hand back a
	// fresh token explicitly; only the *shared* fragment used by routine refetches must not).
	it("does select accessToken directly, unlike the shared CURRENT_USER_FIELDS fragment", () => {
		const printed = print(UserService.UPDATE_USER_MUTATION);
		expect(printed).toContain("accessToken");
	});
});

// ---- CHANGE_PASSWORD_MUTATION -------------------------------------------------------------------

describe("UserService.CHANGE_PASSWORD_MUTATION", () => {
	it("sends the current and new password and resolves with the refreshed session", async () => {
		const user = userEvent.setup();
		const variables = { currentPassword: "old-pass", newPassword: "new-pass" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: UserService.CHANGE_PASSWORD_MUTATION,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UserService.CHANGE_PASSWORD_MUTATION, variables },
							result: {
								data: {
									changePassword: {
										__typename: "User",
										id: "user-1",
										email: "gendry@example.com",
										firstName: "Gendry",
										lastName: "Baratheon",
										avatar: null,
										role: "artist",
										accessToken: "rotated-access-token",
										userType: "Artist",
										tagColor: "#ff0000",
										userInfo: {
											__typename: "Artist",
											id: "artist-1",
											firstName: "Gendry",
											lastName: "Baratheon",
											email: "gendry@example.com",
											avatar: null,
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
		expect(result).toHaveTextContent("rotated-access-token");
	});

	it("propagates a rejected current-password as a GraphQL error rather than a silent success", async () => {
		const user = userEvent.setup();
		const variables = { currentPassword: "wrong-pass", newPassword: "new-pass" };

		function ErrorHarness() {
			const [mutate, { error }] = useMutation(UserService.CHANGE_PASSWORD_MUTATION);
			return React.createElement(
				"div",
				null,
				React.createElement("button", { onClick: () => mutate({ variables }).catch(() => {}) }, "go"),
				error && React.createElement("div", { "data-testid": "error" }, "ERROR"),
			);
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UserService.CHANGE_PASSWORD_MUTATION, variables },
							error: new Error("Current password is incorrect"),
						},
					],
				},
				React.createElement(ErrorHarness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("error")).toBeInTheDocument();
	});
});

// ---- getTagColorsByShop -----------------------------------------------------------------------

describe("UserService.getTagColorsByShop", () => {
	it("resolves with the shop's tag colors when given a shopId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => UserService.getTagColorsByShop("shop-1"),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: FETCH_TAG_COLORS_BY_SHOP_FOR_TESTS, variables: { shopId: "shop-1" } },
							result: {
								data: {
									getUserTagColors: [
										{ __typename: "User", tagColor: "#ff0000" },
										{ __typename: "User", tagColor: "#00ff00" },
									],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("#ff0000");
		expect(result).toHaveTextContent("#00ff00");
	});

	// skip: !shopId - per the source file's own comment, a Client (no shop field on that type) or
	// an independent Artist with no shop connection must never fire this query at all, because the
	// schema types shopId as non-null (ID!) and an undefined variable there previously crashed
	// Profile.jsx before this guard existed.
	it("skips the query entirely when shopId is falsy (e.g. a Client or independent Artist)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => UserService.getTagColorsByShop(undefined),
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

	it("also skips when shopId is an empty string", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => UserService.getTagColorsByShop(""),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});
