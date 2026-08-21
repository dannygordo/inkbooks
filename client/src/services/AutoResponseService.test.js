// AutoResponseService.js tests. Same convention as ClientService.test.js and
// AppointmentService.test.js (read either file's own header first): a "Service" file here is an
// IIFE exporting a mix of React-hook factories wrapping useQuery/useMutation around a gql
// document, plus raw gql documents meant to be handed directly to a caller's own useMutation -
// there is almost no pure logic to unit-test in isolation, so every export is exercised through a
// tiny throwaway harness component rendered under MockedProvider, built from the REAL exported gql
// document (never a hand-copied query string, since every one of this service's documents IS
// exported here - unlike ClientService/AppointmentService there is no internal-only query to
// reconstruct).
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling
// AutoResponseService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation, useQuery } from "@apollo/client";
import AutoResponseService from "./AutoResponseService";

// ---- generic harnesses (same shape as ClientService.test.js / AppointmentService.test.js) ------

function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// Deliberately generic: these tests only need to know THAT a request errored (e.g. no
		// mock matched, proving a network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

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

function fatAutoResponse(overrides = {}) {
	return {
		__typename: "AutoResponse",
		id: "ar-1",
		shopId: "shop-1",
		artistUserId: null,
		name: "Session complete thank-you",
		trigger: "SESSION_COMPLETED",
		enabled: true,
		emailEnabled: true,
		smsEnabled: false,
		emailSubjectTemplate: "Thanks for coming in, {{clientFirstName}}!",
		emailBodyTemplate: "It was great working on your piece today.",
		smsTemplate: null,
		active: true,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- getAutoResponses / FETCH_AUTO_RESPONSES ---------------------------------------------------

describe("AutoResponseService.getAutoResponses", () => {
	it("resolves with a shop's auto-responses, defaulting includeInactive to false", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AutoResponseService.getAutoResponses({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AutoResponseService.FETCH_AUTO_RESPONSES,
								variables: { shopId: "shop-1", artistUserId: undefined, includeInactive: false },
							},
							result: { data: { getAutoResponses: [fatAutoResponse()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Session complete thank-you");
	});

	it("passes includeInactive through when explicitly requested", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AutoResponseService.getAutoResponses({ shopId: "shop-1" }, true),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AutoResponseService.FETCH_AUTO_RESPONSES,
								variables: { shopId: "shop-1", artistUserId: undefined, includeInactive: true },
							},
							result: {
								data: {
									getAutoResponses: [fatAutoResponse({ id: "ar-2", enabled: false, active: false })],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"active":false');
	});

	// UNLIKE ExpenseService.js's exactly-one-scope model, a shop-connected artist queries BOTH
	// scopes at once here - see the service's own header comment and
	// components/settings/AutoResponsesPanel.jsx. Both shopId and artistUserId must be able to
	// reach the query's variables together, not just one or the other.
	it("queries both shopId and artistUserId at once for a shop-connected artist", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AutoResponseService.getAutoResponses({ shopId: "shop-1", artistUserId: "user-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AutoResponseService.FETCH_AUTO_RESPONSES,
								variables: { shopId: "shop-1", artistUserId: "user-1", includeInactive: false },
							},
							result: {
								data: {
									getAutoResponses: [
										fatAutoResponse({ id: "ar-1", shopId: "shop-1", artistUserId: null }),
										fatAutoResponse({ id: "ar-3", shopId: null, artistUserId: "user-1", name: "My own reminder" }),
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
		expect(result).toHaveTextContent("ar-1");
		expect(result).toHaveTextContent("My own reminder");
	});

	// skip: !scope?.shopId && !scope?.artistUserId - neither scope means there is nothing to look
	// up (no shop, no independent-artist identity yet), so this must never fire against the server.
	it("skips the query when the scope has neither shopId nor artistUserId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AutoResponseService.getAutoResponses({}),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	it("also skips when called with no scope at all", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AutoResponseService.getAutoResponses(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The third `options` argument has to actually reach useQuery, the same convention
	// ClientService.getClientFlagTypes's own test locks in for its own options passthrough - and,
	// per the implementation, an option here can override even the skip this hook computes itself.
	it("honors an option passed through in the third argument, including overriding its own skip", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => AutoResponseService.getAutoResponses({ shopId: "shop-1" }, false, { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => expect(screen.queryByTestId("error")).not.toBeInTheDocument());
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

describe("AutoResponseService.FETCH_AUTO_RESPONSES (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same
	// document _getAutoResponses runs internally - mirroring ClientService.test.js's own
	// FETCH_CLIENT_DASHBOARD (raw document) section.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(AutoResponseService.FETCH_AUTO_RESPONSES, {
						variables: { shopId: undefined, artistUserId: "user-1", includeInactive: false },
					}),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: AutoResponseService.FETCH_AUTO_RESPONSES,
								variables: { shopId: undefined, artistUserId: "user-1", includeInactive: false },
							},
							result: {
								data: {
									getAutoResponses: [fatAutoResponse({ shopId: null, artistUserId: "user-1" })],
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("ar-1");
	});
});

// ---- CREATE_AUTO_RESPONSE -----------------------------------------------------------------------

describe("AutoResponseService.CREATE_AUTO_RESPONSE", () => {
	it("creates a new auto-response and returns the full row", async () => {
		const user = userEvent.setup();
		const input = {
			shopId: "shop-1",
			name: "Session complete thank-you",
			trigger: "SESSION_COMPLETED",
			emailEnabled: true,
			emailSubjectTemplate: "Thanks for coming in, {{clientFirstName}}!",
			emailBodyTemplate: "It was great working on your piece today.",
		};
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AutoResponseService.CREATE_AUTO_RESPONSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AutoResponseService.CREATE_AUTO_RESPONSE, variables: { input } },
							result: { data: { createAutoResponse: fatAutoResponse() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Session complete thank-you");
	});
});

// ---- UPDATE_AUTO_RESPONSE -----------------------------------------------------------------------

describe("AutoResponseService.UPDATE_AUTO_RESPONSE", () => {
	it("updates an existing auto-response and returns the saved row", async () => {
		const user = userEvent.setup();
		const input = { id: "ar-1", enabled: false };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AutoResponseService.UPDATE_AUTO_RESPONSE,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AutoResponseService.UPDATE_AUTO_RESPONSE, variables: { input } },
							result: { data: { updateAutoResponse: fatAutoResponse({ enabled: false }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"enabled":false');
	});
});

// ---- ARCHIVE_AUTO_RESPONSE ----------------------------------------------------------------------

describe("AutoResponseService.ARCHIVE_AUTO_RESPONSE", () => {
	it("archives an auto-response by id and returns the row with active:false", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AutoResponseService.ARCHIVE_AUTO_RESPONSE,
				variables: { autoResponseId: "ar-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AutoResponseService.ARCHIVE_AUTO_RESPONSE, variables: { autoResponseId: "ar-1" } },
							result: { data: { archiveAutoResponse: fatAutoResponse({ active: false, enabled: false }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"active":false');
	});
});

// ---- SEND_AUTO_RESPONSE_NOW ---------------------------------------------------------------------

describe("AutoResponseService.SEND_AUTO_RESPONSE_NOW", () => {
	// Not wrapped as a hook - used directly from both the Settings panel and
	// SendAutoResponseButton.jsx, each owning its own alert/loading handling, per the service's own
	// comment. Confirmed here the same way ClientService.updateClient's raw document is: usable
	// directly via useMutation, exactly as those two callers use it.
	it("sends a template immediately for a given client, with an optional appointmentId", async () => {
		const user = userEvent.setup();
		const variables = { autoResponseId: "ar-1", clientId: "client-1", appointmentId: "appt-1" };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AutoResponseService.SEND_AUTO_RESPONSE_NOW,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AutoResponseService.SEND_AUTO_RESPONSE_NOW, variables },
							result: { data: { sendAutoResponseNow: "Sent" } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Sent");
	});

	it("also works with no appointmentId, for a hand-sent message unrelated to any session", async () => {
		const user = userEvent.setup();
		const variables = { autoResponseId: "ar-1", clientId: "client-1", appointmentId: undefined };
		function Harness() {
			return React.createElement(MutationHarness, {
				document: AutoResponseService.SEND_AUTO_RESPONSE_NOW,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: AutoResponseService.SEND_AUTO_RESPONSE_NOW, variables },
							result: { data: { sendAutoResponseNow: "Sent" } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("Sent");
	});
});
