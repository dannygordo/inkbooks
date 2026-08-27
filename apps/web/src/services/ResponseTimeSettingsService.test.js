// ResponseTimeSettingsService.js tests. Same IIFE-of-hook-factories shape as AutoResponseService.js
// and SystemMessageTemplateService.js - one query wrapped as a hook factory (getResponseTimeSettings,
// scoped by shopId/artistUserId with a skip guard and a spread `options` pass-through) plus two raw
// exported gql documents (the query itself, and a mutation meant for a caller's own useMutation, the
// same pattern components/settings/ResponseTimePanel.jsx actually uses). Every export is exercised
// through the same tiny harness-under-MockedProvider pattern ClientService.test.js establishes,
// built from the REAL exported gql documents (both are exported directly here, so nothing needs
// reconstructing by hand).
//
// UNLIKE the list-shaped services (ClientService's getClients, AutoResponseService's
// getAutoResponses), getResponseTimeSettings is a SINGLETON per owner per this file's own header
// comment - getResponseTimeSettings resolves to one object (real or server-defaulted), never an
// array, and that object's shopCeiling sub-object is read-only info from the OTHER scope's row (see
// ResponseTimePanel.jsx), not something this service itself writes.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment - this
// codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this project's
// Vite/oxc pipeline, and this file stays a .js to match its sibling ResponseTimeSettingsService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation, useQuery } from "@apollo/client";
import { print } from "graphql";
import ResponseTimeSettingsService from "./ResponseTimeSettingsService";

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query-returning hook function produces. `hookFn` is called with no args and
// must itself close over any variables it needs - same pattern as ClientService.test.js's
// QueryHarness.
function QueryHarness({ hookFn }) {
	const { loading, error, data } = hookFn();
	if (loading) {
		return React.createElement("div", null, "loading");
	}
	if (error) {
		// Deliberately generic: these tests only need to know THAT a request errored (e.g. no mock
		// matched, proving a network call was actually attempted), not the message text.
		return React.createElement("div", { "data-testid": "error" }, "ERROR");
	}
	return React.createElement("div", { "data-testid": "result" }, JSON.stringify(data ?? null));
}

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once it
// lands - same pattern as ClientService.test.js's MutationHarness.
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

function settings(overrides = {}) {
	return {
		__typename: "ResponseTimeSettings",
		id: "rts-1",
		shopId: null,
		artistUserId: "user-1",
		initialThresholdMinutes: 480,
		repeatIntervalMinutes: 180,
		shopCeiling: null,
		setByUserId: "user-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- getResponseTimeSettings --------------------------------------------------------------------

describe("ResponseTimeSettingsService.getResponseTimeSettings", () => {
	it("resolves with an artist-scoped settings row (real or server-defaulted)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ResponseTimeSettingsService.getResponseTimeSettings({ artistUserId: "user-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
								variables: { artistUserId: "user-1" },
							},
							result: { data: { getResponseTimeSettings: settings() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"initialThresholdMinutes":480');
		expect(result).toHaveTextContent('"repeatIntervalMinutes":180');
	});

	it("resolves with a shop-scoped settings row, including a shopCeiling of null (shops have no ceiling above them)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ResponseTimeSettingsService.getResponseTimeSettings({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
								variables: { shopId: "shop-1" },
							},
							result: {
								data: {
									getResponseTimeSettings: settings({
										id: "rts-2",
										shopId: "shop-1",
										artistUserId: null,
										initialThresholdMinutes: 600,
										repeatIntervalMinutes: 240,
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"initialThresholdMinutes":600');
		expect(result).toHaveTextContent('"shopCeiling":null');
	});

	// The variables sent are `{ ...scope }` verbatim - passing BOTH shopId and artistUserId at once
	// (an artist reading their own ceiling from the shop side, or any caller passing an over-wide
	// scope) must still reach the query as both keys, not silently drop one.
	it("spreads a scope with both keys through to variables unchanged", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					ResponseTimeSettingsService.getResponseTimeSettings({
						shopId: "shop-1",
						artistUserId: "user-1",
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
								query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
								variables: { shopId: "shop-1", artistUserId: "user-1" },
							},
							result: { data: { getResponseTimeSettings: settings({ shopId: "shop-1" }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("rts-1");
	});

	// resolves with the row's own shopCeiling sub-object - the piece ResponseTimePanel.jsx renders
	// as the read-only cap on an artist's own card (see that component's exceedsCeiling check).
	it("resolves with a populated shopCeiling on a shop-connected artist's own row", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ResponseTimeSettingsService.getResponseTimeSettings({ artistUserId: "user-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
								variables: { artistUserId: "user-1" },
							},
							result: {
								data: {
									getResponseTimeSettings: settings({
										shopCeiling: {
											__typename: "ResponseTimeCeiling",
											initialThresholdMinutes: 600,
											repeatIntervalMinutes: 240,
										},
									}),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent('"shopCeiling":{"__typename":"ResponseTimeCeiling","initialThresholdMinutes":600,"repeatIntervalMinutes":240}');
	});

	// skip: !scope?.shopId && !scope?.artistUserId - both halves missing must never fire a request.
	it("skips the query when the scope has neither shopId nor artistUserId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ResponseTimeSettingsService.getResponseTimeSettings({}),
			});
		}
		// Zero mocks registered: if this fired a real request it would blow up with "no matching
		// mock" and surface as an error, which the assertion below rules out.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// scope itself may be undefined (`scope?.shopId` optional-chains safely) - a caller that hasn't
	// resolved a scope yet must not crash or fire a request either.
	it("skips the query when scope itself is undefined", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ResponseTimeSettingsService.getResponseTimeSettings(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The second `options` argument is spread in AFTER the built-in defaults (variables, skip,
	// fetchPolicy), so a caller-supplied `skip` must be able to override the built-in guard even
	// when the scope itself looks fetchable - the exact shape a consumer temporarily disabling the
	// query while some other precondition isn't ready would rely on.
	it("honors a caller-supplied skip option even when the scope alone would not skip", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					ResponseTimeSettingsService.getResponseTimeSettings(
						{ artistUserId: "user-1" },
						{ skip: true },
					),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The second `options` argument is spread in too - a caller passing its own onCompleted (or any
	// other useQuery option) alongside a fetchable scope must have it actually reach useQuery.
	it("passes other options (e.g. onCompleted) through to useQuery alongside a fetchable scope", async () => {
		const onCompleted = vi.fn();
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					ResponseTimeSettingsService.getResponseTimeSettings({ artistUserId: "user-1" }, { onCompleted }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
								variables: { artistUserId: "user-1" },
							},
							result: { data: { getResponseTimeSettings: settings() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await screen.findByTestId("result");
		await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
	});
});

describe("ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same way a
	// calling component reaching for the raw document (rather than the wrapped hook) would use it -
	// this is the exact document _getResponseTimeSettings itself runs internally.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS, {
						variables: { artistUserId: "user-1" },
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
								query: ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS,
								variables: { artistUserId: "user-1" },
							},
							result: { data: { getResponseTimeSettings: settings() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("rts-1");
	});
});

// ---- UPDATE_RESPONSE_TIME_SETTINGS -----------------------------------------------------------

describe("ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS", () => {
	it("updates an artist's own settings (no shopId in the input) and the saved row flows back", async () => {
		const user = userEvent.setup();
		const input = { initialThresholdMinutes: 240, repeatIntervalMinutes: 60 };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
								variables: { input },
							},
							result: {
								data: {
									updateResponseTimeSettings: settings({
										initialThresholdMinutes: 240,
										repeatIntervalMinutes: 60,
									}),
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
		expect(result).toHaveTextContent('"initialThresholdMinutes":240');
		expect(result).toHaveTextContent('"repeatIntervalMinutes":60');
	});

	// ResponseTimePanel.jsx's handleSave conditionally includes shopId in the input only when
	// scope.shopId is set (a shop admin managing the shop's own row) - confirms that shape works too.
	it("updates a shop's settings when shopId is included in the input", async () => {
		const user = userEvent.setup();
		const input = { shopId: "shop-1", initialThresholdMinutes: 600, repeatIntervalMinutes: 240 };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS,
								variables: { input },
							},
							result: {
								data: {
									updateResponseTimeSettings: settings({
										shopId: "shop-1",
										artistUserId: null,
										initialThresholdMinutes: 600,
										repeatIntervalMinutes: 240,
									}),
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
		expect(result).toHaveTextContent('"shopId":"shop-1"');
		expect(result).toHaveTextContent('"initialThresholdMinutes":600');
	});
});

// ---- field selection shape ----------------------------------------------------------------------

describe("ResponseTimeSettingsService field selection", () => {
	// Locks in that the shared _RESPONSE_TIME_SETTINGS_FIELDS fragment string is spliced into both
	// the query and the mutation identically, including the nested shopCeiling sub-selection - a
	// save that returned less than the query does would leave ResponseTimePanel.jsx's post-save
	// state (and its ceiling check) silently stale.
	it("selects the same fields, including the nested shopCeiling, on both documents", () => {
		const queryPrinted = print(ResponseTimeSettingsService.FETCH_RESPONSE_TIME_SETTINGS);
		const mutationPrinted = print(ResponseTimeSettingsService.UPDATE_RESPONSE_TIME_SETTINGS);
		for (const field of [
			"initialThresholdMinutes",
			"repeatIntervalMinutes",
			"shopCeiling",
			"setByUserId",
			"shopId",
			"artistUserId",
		]) {
			expect(queryPrinted).toContain(field);
			expect(mutationPrinted).toContain(field);
		}
		// shopCeiling itself is nested (has its own initialThresholdMinutes/repeatIntervalMinutes),
		// not a bare scalar selection - a bare "shopCeiling" with no braces would be rejected by the
		// server the same way StaffService.js's own comment describes for a bare "user" selection.
		expect(queryPrinted).toMatch(/shopCeiling\s*\{\s*initialThresholdMinutes/);
	});
});
