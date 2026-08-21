// NotificationService.js tests. Same IIFE-of-hook-factories shape as ClientService.js and
// MessengerService.js, except every document here (GET_INBOX, MARK_READ, MARK_DONE, GET_SETTINGS,
// UPDATE_SETTINGS) is exported directly, so every mock below uses the real document straight off
// NotificationService itself - nothing needs hand-reconstructing for MockedProvider.
//
// Two of the exports (useSettings, useUpdateSettings) are inline arrow functions
// (`() => useQuery(_GET_SETTINGS)` / `() => useMutation(_UPDATE_SETTINGS)`) rather than named
// `_foo` hook factories, and neither accepts any arguments or options - they're exercised the same
// way as fetchClient-style hooks, just with no variables to pass.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling NotificationService.js.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { useMutation } from "@apollo/client";
import { print } from "graphql";
import NotificationService from "./NotificationService";

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

// Renders a button that fires a mutation document (via a caller's own useMutation, e.g. MARK_READ)
// with fixed variables, and the onCompleted payload once it lands.
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

// Renders a button that fires a mutation *hook-factory* export (e.g. useUpdateSettings, which
// hardcodes `useMutation(_UPDATE_SETTINGS)` with no options of its own) with fixed variables, and
// shows the mutation tuple's own `data` once it lands - there's no onCompleted to hook into here
// since the export itself doesn't accept one.
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

// ---- useInbox / GET_INBOX -----------------------------------------------------------------------

describe("NotificationService.useInbox", () => {
	function inboxPayload(overrides = {}) {
		return {
			__typename: "Inbox",
			unreadCount: 2,
			items: [
				{
					__typename: "NotificationItem",
					key: "notif-1",
					type: "money",
					category: "payment",
					subjectType: "Appointment",
					subjectId: "appt-1",
					title: "Payment received",
					body: "Arya Stark paid $250.00",
					amountCents: 25000,
					createdAt: "2026-08-20T00:00:00.000Z",
					readAt: null,
					doneAt: null,
					isCondition: false,
				},
			],
			...overrides,
		};
	}

	it("defaults includeRead to true when called with no arguments", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => NotificationService.useInbox() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: NotificationService.GET_INBOX, variables: { includeRead: true } },
							result: { data: { getInbox: inboxPayload() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Payment received");
		expect(result).toHaveTextContent('"unreadCount":2');
	});

	it("passes includeRead through as a variable when given explicitly", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => NotificationService.useInbox(false),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: NotificationService.GET_INBOX, variables: { includeRead: false } },
							result: { data: { getInbox: inboxPayload({ unreadCount: 0, items: [] }) } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		// Reaching a resolved (non-error) result at all IS the assertion that includeRead:false was
		// what was sent - MockedProvider throws loudly on any variable mismatch.
		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	// Both stored notifications and derived conditions come back merged in the same `items` list -
	// per the file's own comment, `isCondition` and a string `key` (rather than always an id) are
	// how a caller tells them apart. Locks in that the query still selects both.
	it("selects isCondition, so stored notifications and derived conditions stay distinguishable", () => {
		const printed = print(NotificationService.GET_INBOX);
		expect(printed).toContain("isCondition");
		expect(printed).toContain("key");
	});
});

// ---- MARK_READ / MARK_DONE -----------------------------------------------------------------------

describe("NotificationService.MARK_READ", () => {
	it("marks the given notification ids read", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: NotificationService.MARK_READ,
				variables: { notificationIds: ["notif-1", "notif-2"] },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: NotificationService.MARK_READ,
								variables: { notificationIds: ["notif-1", "notif-2"] },
							},
							result: { data: { markNotificationsRead: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"markNotificationsRead":true');
	});

	// notificationIds is `[ID!]` (nullable list) here versus `[ID!]!` (required list) on MARK_DONE
	// below - both still accept a plain array of ids as their variable, so this is really about
	// each document's own field/type name rather than any difference in how a caller invokes it.
	it("accepts an empty array of ids", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: NotificationService.MARK_READ,
				variables: { notificationIds: [] },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: NotificationService.MARK_READ, variables: { notificationIds: [] } },
							result: { data: { markNotificationsRead: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toBeInTheDocument();
	});
});

describe("NotificationService.MARK_DONE", () => {
	it("marks the given notification ids done", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: NotificationService.MARK_DONE,
				variables: { notificationIds: ["notif-1"] },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: NotificationService.MARK_DONE,
								variables: { notificationIds: ["notif-1"] },
							},
							result: { data: { markNotificationsDone: true } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"markNotificationsDone":true');
	});
});

// ---- useSettings / GET_SETTINGS -------------------------------------------------------------------

describe("NotificationService.useSettings", () => {
	it("resolves with the caller's notification settings, taking no arguments/variables", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => NotificationService.useSettings(),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: NotificationService.GET_SETTINGS, variables: {} },
							result: {
								data: {
									getNotificationSettings: {
										__typename: "NotificationSettings",
										prefs: {
											__typename: "NotificationPrefs",
											moneyEmail: true,
											scheduleEmail: true,
											rosterEmail: false,
											messageEmail: true,
										},
										moneyMode: "immediate",
										scheduleMode: "digest",
										rosterMode: "off",
										messageMode: "immediate",
										timezone: "America/Chicago",
										digestHour: 8,
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
		expect(result).toHaveTextContent("America/Chicago");
		expect(result).toHaveTextContent('"digestHour":8');
	});
});

// ---- useUpdateSettings / UPDATE_SETTINGS -----------------------------------------------------------

describe("NotificationService.UPDATE_SETTINGS", () => {
	it("is a usable mutation document when handed to a caller's own useMutation", async () => {
		const user = userEvent.setup();
		const variables = {
			prefs: { moneyEmail: false, scheduleEmail: true, rosterEmail: true, messageEmail: true },
			timezone: "America/New_York",
			digestHour: 9,
		};

		function Harness() {
			return React.createElement(MutationHarness, {
				document: NotificationService.UPDATE_SETTINGS,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: NotificationService.UPDATE_SETTINGS, variables },
							result: {
								data: {
									updateNotificationSettings: {
										__typename: "NotificationSettings",
										prefs: { __typename: "NotificationPrefs", ...variables.prefs },
										moneyMode: "immediate",
										scheduleMode: "digest",
										rosterMode: "digest",
										messageMode: "immediate",
										timezone: "America/New_York",
										digestHour: 9,
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
		expect(result).toHaveTextContent("America/New_York");
		expect(result).toHaveTextContent('"digestHour":9');
	});
});

describe("NotificationService.useUpdateSettings", () => {
	// Exercises the hook-factory export itself (`() => useMutation(_UPDATE_SETTINGS)`) rather than
	// handing the raw UPDATE_SETTINGS document to a caller-owned useMutation, the way
	// NotificationSettingsPanel.jsx actually calls it.
	it("returns a working mutate function bound to UPDATE_SETTINGS", async () => {
		const user = userEvent.setup();
		const variables = {
			prefs: { moneyEmail: true, scheduleEmail: false, rosterEmail: false, messageEmail: false },
			timezone: "UTC",
			digestHour: 6,
		};

		function Harness() {
			return React.createElement(HookMutationHarness, {
				hookFn: NotificationService.useUpdateSettings,
				variables,
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: NotificationService.UPDATE_SETTINGS, variables },
							result: {
								data: {
									updateNotificationSettings: {
										__typename: "NotificationSettings",
										prefs: { __typename: "NotificationPrefs", ...variables.prefs },
										moneyMode: "immediate",
										scheduleMode: "off",
										rosterMode: "off",
										messageMode: "off",
										timezone: "UTC",
										digestHour: 6,
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
		expect(await screen.findByTestId("result")).toHaveTextContent('"timezone":"UTC"');
	});
});
