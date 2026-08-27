// SystemMessageTemplateService.js tests. Same IIFE-of-hook-factories shape as
// ResponseTimeSettingsService.js and AutoResponseService.js - one query wrapped as a hook factory
// (getSystemMessageTemplates, scoped by shopId/artistUserId with a skip guard and a spread
// `options` pass-through) plus two raw exported gql documents for a caller's own useMutation
// (update and reset), the same pattern components/settings/SystemMessageTemplatesPanel.jsx
// actually uses. Every export is exercised through the same tiny harness-under-MockedProvider
// pattern ClientService.test.js establishes, built from the REAL exported gql documents (all are
// exported directly here, so nothing needs reconstructing by hand).
//
// UNLIKE ResponseTimeSettingsService's singleton, getSystemMessageTemplates resolves to a LIST -
// only override rows that actually exist in the database, per this file's own header comment ("A
// FIXED LIST OF 7 KEYS... every key always exists conceptually... this renders one row per key
// regardless of whether an override row exists yet" - see SystemMessageTemplatesPanel.jsx). An
// empty array is therefore a perfectly normal "no overrides yet" result, not an error state.
//
// RESET_SYSTEM_MESSAGE_TEMPLATE resolves to a bare Boolean (no selection set) - same shape as
// AutoResponseService's SEND_AUTO_RESPONSE_NOW, and for the same reason: nothing to select on a
// scalar payload.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment - this
// codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this project's
// Vite/oxc pipeline, and this file stays a .js to match its sibling SystemMessageTemplateService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation, useQuery } from "@apollo/client";
import { print } from "graphql";
import SystemMessageTemplateService from "./SystemMessageTemplateService";

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

function template(overrides = {}) {
	return {
		__typename: "SystemMessageTemplate",
		id: "tmpl-1",
		shopId: null,
		artistUserId: "user-1",
		key: "NEW_MESSAGE_TO_GUEST",
		emailSubjectTemplate: "You have a new message from {{artistName}}",
		emailBodyTemplate: null,
		extraNoteTemplate: null,
		setByUserId: "user-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

// ---- getSystemMessageTemplates --------------------------------------------------------------

describe("SystemMessageTemplateService.getSystemMessageTemplates", () => {
	it("resolves with an artist-scoped list of override rows", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					SystemMessageTemplateService.getSystemMessageTemplates({ artistUserId: "user-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES,
								variables: { artistUserId: "user-1" },
							},
							result: { data: { getSystemMessageTemplates: [template()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("NEW_MESSAGE_TO_GUEST");
		expect(result).toHaveTextContent("You have a new message");
	});

	it("resolves with an empty list when the owner has no overrides yet (all keys still default)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SystemMessageTemplateService.getSystemMessageTemplates({ shopId: "shop-1" }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES,
								variables: { shopId: "shop-1" },
							},
							result: { data: { getSystemMessageTemplates: [] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent('"getSystemMessageTemplates":[]');
	});

	// The variables sent are `{ ...scope }` verbatim, same as ResponseTimeSettingsService - both
	// keys at once must reach the query unchanged.
	it("spreads a scope with both keys through to variables unchanged", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					SystemMessageTemplateService.getSystemMessageTemplates({
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
								query: SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES,
								variables: { shopId: "shop-1", artistUserId: "user-1" },
							},
							result: { data: { getSystemMessageTemplates: [template({ shopId: "shop-1" })] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("tmpl-1");
	});

	// skip: !scope?.shopId && !scope?.artistUserId - both halves missing must never fire a request.
	it("skips the query when the scope has neither shopId nor artistUserId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => SystemMessageTemplateService.getSystemMessageTemplates({}),
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
				hookFn: () => SystemMessageTemplateService.getSystemMessageTemplates(undefined),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});

	// The second `options` argument is spread in AFTER the built-in defaults, so a caller-supplied
	// `skip` must be able to override the built-in guard even when the scope alone would fetch -
	// SystemMessageTemplatesPanel.jsx doesn't use this today, but ResponseTimeSettingsService's
	// identical shape does get exercised this way by ResponseTimePanel-adjacent code, so this locks
	// the same override behavior in here too.
	it("honors a caller-supplied skip option even when the scope alone would not skip", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					SystemMessageTemplateService.getSystemMessageTemplates(
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

	// The second `options` argument is spread in too - a caller passing its own onCompleted (as
	// SystemMessageTemplatesPanel.jsx's own refetch-after-save flow implies is a normal thing to
	// want here) alongside a fetchable scope must have it actually reach useQuery.
	it("passes other options (e.g. onCompleted) through to useQuery alongside a fetchable scope", async () => {
		const onCompleted = vi.fn();
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					SystemMessageTemplateService.getSystemMessageTemplates(
						{ artistUserId: "user-1" },
						{ onCompleted },
					),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES,
								variables: { artistUserId: "user-1" },
							},
							result: { data: { getSystemMessageTemplates: [template()] } },
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

describe("SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same way a
	// calling component reaching for the raw document (rather than the wrapped hook) would use it -
	// this is the exact document _getSystemMessageTemplates itself runs internally.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES, {
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
								query: SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES,
								variables: { artistUserId: "user-1" },
							},
							result: { data: { getSystemMessageTemplates: [template()] } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("tmpl-1");
	});
});

// ---- UPDATE_SYSTEM_MESSAGE_TEMPLATE ----------------------------------------------------------

describe("SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE", () => {
	it("updates an artist's own template (no shopId in the input) and the saved row flows back", async () => {
		const user = userEvent.setup();
		const input = {
			key: "NEW_MESSAGE_TO_GUEST",
			emailSubjectTemplate: "New wording",
			emailBodyTemplate: null,
			extraNoteTemplate: null,
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
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
								query: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
								variables: { input },
							},
							result: {
								data: {
									updateSystemMessageTemplate: template({ emailSubjectTemplate: "New wording" }),
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("New wording");
	});

	// SystemMessageTemplatesPanel.jsx's handleSave conditionally includes shopId in the input only
	// when scope.shopId is set (a shop admin managing the shop's own template) - confirms that shape
	// works too, including the BOOKING_CONFIRMATION key's narrower extraNoteTemplate-only usage
	// this file's own header comment on KEY_META describes.
	it("updates a shop's template, including the extraNoteTemplate-only BOOKING_CONFIRMATION key", async () => {
		const user = userEvent.setup();
		const input = {
			shopId: "shop-1",
			key: "BOOKING_CONFIRMATION",
			emailSubjectTemplate: null,
			emailBodyTemplate: null,
			extraNoteTemplate: "Please arrive 10 minutes early.",
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
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
								query: SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE,
								variables: { input },
							},
							result: {
								data: {
									updateSystemMessageTemplate: template({
										id: "tmpl-2",
										shopId: "shop-1",
										artistUserId: null,
										key: "BOOKING_CONFIRMATION",
										emailSubjectTemplate: null,
										extraNoteTemplate: "Please arrive 10 minutes early.",
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
		expect(result).toHaveTextContent("Please arrive 10 minutes early.");
		expect(result).toHaveTextContent("BOOKING_CONFIRMATION");
	});
});

// ---- RESET_SYSTEM_MESSAGE_TEMPLATE (bare scalar mutation) --------------------------------------

describe("SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE", () => {
	it("resets an artist's own template by key (no shopId) and resolves to a boolean", async () => {
		const user = userEvent.setup();
		const variables = { key: "NEW_MESSAGE_TO_GUEST" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
								variables,
							},
							result: { data: { resetSystemMessageTemplate: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"resetSystemMessageTemplate":true');
	});

	it("resets a shop's template by key when shopId is included in the variables", async () => {
		const user = userEvent.setup();
		const variables = { shopId: "shop-1", key: "SHOP_CUT_MARKED_PAID" };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE,
								variables,
							},
							result: { data: { resetSystemMessageTemplate: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("true");
	});

	// resetSystemMessageTemplate is a bare Boolean field with no sub-selection at all (unlike every
	// other mutation in this file, which selects a full record) - locks in that the document doesn't
	// try to select fields off a scalar, which would be a GraphQL validation error server-side.
	it("selects no sub-fields on the scalar resetSystemMessageTemplate result", () => {
		const printed = print(SystemMessageTemplateService.RESET_SYSTEM_MESSAGE_TEMPLATE);
		expect(printed).toMatch(/resetSystemMessageTemplate\(shopId:\s*\$shopId,\s*key:\s*\$key\)\s*\}/);
	});
});

// ---- field selection shape ----------------------------------------------------------------------

describe("SystemMessageTemplateService field selection", () => {
	// Locks in that the shared _TEMPLATE_FIELDS fragment string is spliced into both the query and
	// the update mutation identically - a save that returned less than the query does would leave
	// SystemMessageTemplatesPanel.jsx's post-refetch state silently missing a field the row list
	// depends on (e.g. the `key` used to build overridesByKey).
	it("selects the same fields on both the query and UPDATE_SYSTEM_MESSAGE_TEMPLATE", () => {
		const queryPrinted = print(SystemMessageTemplateService.FETCH_SYSTEM_MESSAGE_TEMPLATES);
		const mutationPrinted = print(SystemMessageTemplateService.UPDATE_SYSTEM_MESSAGE_TEMPLATE);
		for (const field of [
			"key",
			"emailSubjectTemplate",
			"emailBodyTemplate",
			"extraNoteTemplate",
			"setByUserId",
			"shopId",
			"artistUserId",
		]) {
			expect(queryPrinted).toContain(field);
			expect(mutationPrinted).toContain(field);
		}
	});
});

// ---- module shape -----------------------------------------------------------------------------

describe("SystemMessageTemplateService module shape", () => {
	it("exposes exactly the four documented exports", () => {
		expect(Object.keys(SystemMessageTemplateService).sort()).toEqual(
			[
				"getSystemMessageTemplates",
				"FETCH_SYSTEM_MESSAGE_TEMPLATES",
				"UPDATE_SYSTEM_MESSAGE_TEMPLATE",
				"RESET_SYSTEM_MESSAGE_TEMPLATE",
			].sort(),
		);
	});
});
