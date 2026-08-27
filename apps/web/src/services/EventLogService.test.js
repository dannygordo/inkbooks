// EventLogService.js tests. A "Service" file here is an IIFE exporting a mix of React-hook
// factories wrapping useQuery/useMutation/useLazyQuery around a gql document, and raw gql
// documents meant to be passed directly to useMutation/useQuery by a calling component - there is
// almost no pure logic to unit-test in isolation, so the one export below is exercised through a
// tiny throwaway harness component rendered under MockedProvider, the same convention
// ClientService.test.js already established for this codebase.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline, and this file stays a .js to match its sibling EventLogService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import EventLogService from "./EventLogService";

// _FETCH_EVENT_LOGS isn't exported by EventLogService (it has no raw-document exports at all,
// unlike ExpenseService/FormService), so it's reconstructed here field-for-field from the real
// source in EventLogService.js purely so MockedProvider has a document to match against -
// MockedProvider compares a request by the document's printed text plus variables, not by
// reference identity, so this still fails loudly if the real query in EventLogService.js ever
// drifts from what's copied here.
const FETCH_EVENT_LOGS_FOR_TESTS = gql`
	query GetEventLogs($filter: EventLogFilter, $page: PageInput) {
		getEventLogs(filter: $filter, page: $page) {
			items {
				id
				entityType
				entityId
				action
				actorName
				summary
				changes {
					field
					from
					to
				}
				createdAt
			}
			pageInfo {
				totalCount
				hasMore
				limit
				offset
			}
		}
	}
`;

// Renders whatever a query-returning hook function produces. `hookFn` is called with no args and
// must itself close over any variables it needs - this lets one harness cover every query-shaped
// export without repeating the loading/error/data plumbing each time.
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

function eventLogPage(overrides = {}) {
	return {
		__typename: "EventLogPage",
		items: [
			{
				__typename: "EventLog",
				id: "log-1",
				entityType: "Client",
				entityId: "client-1",
				action: "updated",
				actorName: "Gendry Baratheon",
				summary: "Updated client contact info",
				changes: [
					{ __typename: "EventLogChange", field: "phone", from: "555-0100", to: "555-0199" },
				],
				createdAt: "2026-08-21T00:00:00.000Z",
			},
		],
		pageInfo: { __typename: "PageInfo", totalCount: 1, hasMore: false, limit: 25, offset: 0 },
		...overrides,
	};
}

// ---- fetchEventLogs -----------------------------------------------------------------------------

describe("EventLogService.fetchEventLogs", () => {
	it("resolves with a page of event logs filtered by entityType", async () => {
		const page = { limit: 25, offset: 0 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => EventLogService.fetchEventLogs("Client", page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_EVENT_LOGS_FOR_TESTS,
								variables: { filter: { entityType: "Client" }, page },
							},
							result: { data: { getEventLogs: eventLogPage() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Updated client contact info");
		expect(result).toHaveTextContent("Gendry Baratheon");
		expect(result).toHaveTextContent("555-0199");
	});

	// entityType/page are the only filters exposed today per EventLogService.js's own comment - a
	// falsy entityType must map to `filter: undefined` entirely (not `{entityType: undefined}` or
	// `{entityType: ""}`), since EventLogFilter also has shopId/actorUserId/from/to fields the
	// resolver otherwise has to tolerate as absent.
	it("omits the filter (sends filter: undefined) when entityType is falsy, with page also defaulting to undefined", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => EventLogService.fetchEventLogs(undefined, undefined),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_EVENT_LOGS_FOR_TESTS,
								variables: { filter: undefined, page: undefined },
							},
							result: {
								data: {
									getEventLogs: {
										__typename: "EventLogPage",
										items: [],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 0,
											hasMore: false,
											limit: 25,
											offset: 0,
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

		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	// Same falsy-mapping rule applies to an empty string, not just undefined/null.
	it("also omits the filter when entityType is an empty string", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => EventLogService.fetchEventLogs("", { limit: 10, offset: 0 }),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_EVENT_LOGS_FOR_TESTS,
								variables: { filter: undefined, page: { limit: 10, offset: 0 } },
							},
							result: { data: { getEventLogs: eventLogPage() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Updated client contact info");
	});

	// fetchEventLogs has no `skip` guard at all - unlike ExpenseService/IncomeService's scoped
	// hooks, it fires unconditionally even with no filter/page. Registering zero mocks and
	// observing the query still error out (rather than sitting quietly with loading:false/
	// data:undefined the way a skipped query would) is the proof that a real request was
	// attempted.
	it("still fires the query even when called with no arguments at all", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => EventLogService.fetchEventLogs() });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});

	// The `changes` sub-list (field/from/to) is part of the real selection set - confirms it's not
	// silently dropped from what's requested.
	it("selects the changes.field/from/to sub-fields on each item", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => EventLogService.fetchEventLogs("Appointment", undefined),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_EVENT_LOGS_FOR_TESTS,
								variables: { filter: { entityType: "Appointment" }, page: undefined },
							},
							result: {
								data: {
									getEventLogs: eventLogPage({
										items: [
											{
												__typename: "EventLog",
												id: "log-2",
												entityType: "Appointment",
												entityId: "appt-1",
												action: "created",
												actorName: "System",
												summary: "Appointment booked",
												changes: [
													{
														__typename: "EventLogChange",
														field: "appointmentStatus",
														from: null,
														to: "booked",
													},
												],
												createdAt: "2026-08-20T00:00:00.000Z",
											},
										],
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
		expect(result).toHaveTextContent("appointmentStatus");
		expect(result).toHaveTextContent("booked");
	});
});
