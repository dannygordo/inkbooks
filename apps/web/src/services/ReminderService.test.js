// ReminderService.js tests. This file's internal variable and IIFE are both named
// RemindersService (plural), but it's imported elsewhere - and here - as ReminderService (singular)
// to match the filename, exactly like every other Service import in this codebase.
//
// Only four exports exist and both documents (GET_SETTINGS, UPDATE_SETTINGS) are exported
// directly, so every mock below uses the real document straight off ReminderService itself -
// nothing needs hand-reconstructing for MockedProvider. useSettings/useUpdateSettings are inline
// arrow functions (`() => useQuery(_GET_SETTINGS)` / `() => useMutation(_UPDATE_SETTINGS)`) that
// take no arguments or options at all - there is no id anywhere in this file, per its own header
// comment: reminder settings are always the caller's own row.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling ReminderService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import { print } from "graphql";
import ReminderService from "./ReminderService";

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query-returning hook function produces. `hookFn` is called with no args and
// must itself close over any variables it needs - same pattern as ClientService's QueryHarness.
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

// Renders a button that fires a mutation *hook-factory* export (useUpdateSettings, which
// hardcodes `useMutation(_UPDATE_SETTINGS)` with no options of its own) with fixed variables, and
// shows the mutation tuple's own `data` once it lands.
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

function reminderSettings(overrides = {}) {
	return {
		__typename: "ReminderSettings",
		emailEnabled: true,
		smsEnabled: false,
		rules: [
			{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: true },
			{ __typename: "ReminderRule", id: "rule-2", offsetMinutes: 60, enabled: true },
		],
		emailSubjectTemplate: "Your appointment is coming up",
		emailBodyTemplate: "See you soon, {{clientFirstName}}!",
		smsTemplate: "Reminder: your appointment is at {{appointmentTime}}",
		...overrides,
	};
}

// ---- useSettings / GET_SETTINGS -------------------------------------------------------------------

describe("ReminderService.useSettings", () => {
	it("resolves with the caller's reminder settings, taking no arguments/variables", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ReminderService.useSettings() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ReminderService.GET_SETTINGS, variables: {} },
							result: { data: { getReminderSettings: reminderSettings() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Your appointment is coming up");
		expect(result).toHaveTextContent('"offsetMinutes":1440');
	});

	it("propagates a network error (e.g. no matching mock) rather than hanging silently", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ReminderService.useSettings() });
		}
		// Zero mocks registered: since useSettings takes no arguments there is no variable
		// mismatch to cause this - it proves the hook still fires a real request unconditionally,
		// the same way ClientService's argument-less fetchClient does with no skip guard.
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
	});
});

describe("ReminderService.GET_SETTINGS (raw document field shape)", () => {
	// GET_SETTINGS and UPDATE_SETTINGS both interpolate the same _REMINDER_SETTINGS_FIELDS string,
	// so this locks in that both the read and write sides of a reminder rule select id,
	// offsetMinutes AND enabled (not just id) - a `rules` selection missing `enabled` would let a
	// disabled rule silently look identical to an enabled one wherever this query's data is read.
	it("selects id, offsetMinutes, and enabled on each rule", () => {
		const printed = print(ReminderService.GET_SETTINGS);
		expect(printed).toContain("offsetMinutes");
		expect(printed).toContain("enabled");
		expect(printed).toContain("emailSubjectTemplate");
		expect(printed).toContain("smsTemplate");
	});
});

// ---- UPDATE_SETTINGS (raw document, for a caller's own useMutation) ------------------------------

describe("ReminderService.UPDATE_SETTINGS", () => {
	// GET_SETTINGS and UPDATE_SETTINGS both interpolate the same _REMINDER_SETTINGS_FIELDS string
	// into their selection set - this checks the same field names show up on both sides rather than
	// asserting exact document equality (the surrounding operation/argument text legitimately
	// differs between a query and a mutation).
	it("shares its field selection with GET_SETTINGS via _REMINDER_SETTINGS_FIELDS", () => {
		const getPrinted = print(ReminderService.GET_SETTINGS);
		const updatePrinted = print(ReminderService.UPDATE_SETTINGS);
		for (const field of [
			"emailEnabled",
			"smsEnabled",
			"offsetMinutes",
			"emailSubjectTemplate",
			"emailBodyTemplate",
			"smsTemplate",
		]) {
			expect(getPrinted).toContain(field);
			expect(updatePrinted).toContain(field);
		}
	});

	it("updates reminder settings and the saved row flows back", async () => {
		const user = userEvent.setup();
		const variables = {
			emailEnabled: false,
			smsEnabled: true,
			rules: [{ id: "rule-1", offsetMinutes: 30, enabled: true }],
			emailSubjectTemplate: "Heads up: your appointment",
			emailBodyTemplate: "See you soon!",
			smsTemplate: "Reminder: {{appointmentTime}}",
		};

		function Harness() {
			const [mutate] = useMutation(ReminderService.UPDATE_SETTINGS);
			const [result, setResult] = React.useState(null);
			return React.createElement(
				"div",
				null,
				React.createElement(
					"button",
					{
						onClick: () =>
							mutate({ variables }).then(({ data }) => setResult(data)),
					},
					"go",
				),
				result && React.createElement("div", { "data-testid": "result" }, JSON.stringify(result)),
			);
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ReminderService.UPDATE_SETTINGS, variables },
							result: {
								data: {
									updateReminderSettings: reminderSettings({
										emailEnabled: false,
										smsEnabled: true,
										rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 30, enabled: true }],
										emailSubjectTemplate: "Heads up: your appointment",
										emailBodyTemplate: "See you soon!",
										smsTemplate: "Reminder: {{appointmentTime}}",
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
		expect(result).toHaveTextContent("Heads up: your appointment");
		expect(result).toHaveTextContent('"offsetMinutes":30');
	});
});

// ---- useUpdateSettings ---------------------------------------------------------------------------

describe("ReminderService.useUpdateSettings", () => {
	// Exercises the hook-factory export itself (`() => useMutation(_UPDATE_SETTINGS)`) rather than
	// handing the raw UPDATE_SETTINGS document to a caller-owned useMutation, the way
	// RemindersPanel.jsx actually calls it.
	it("returns a working mutate function bound to UPDATE_SETTINGS", async () => {
		const user = userEvent.setup();
		const variables = {
			emailEnabled: true,
			smsEnabled: true,
			rules: [{ id: "rule-1", offsetMinutes: 1440, enabled: false }],
			emailSubjectTemplate: "Your appointment is coming up",
			emailBodyTemplate: "See you soon, {{clientFirstName}}!",
			smsTemplate: "Reminder: your appointment is at {{appointmentTime}}",
		};

		function Harness() {
			return React.createElement(HookMutationHarness, {
				hookFn: ReminderService.useUpdateSettings,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ReminderService.UPDATE_SETTINGS, variables },
							result: {
								data: {
									updateReminderSettings: reminderSettings({
										rules: [{ __typename: "ReminderRule", id: "rule-1", offsetMinutes: 1440, enabled: false }],
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
		expect(result).toHaveTextContent('"enabled":false');
	});
});
