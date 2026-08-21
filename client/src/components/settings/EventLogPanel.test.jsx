// EventLogPanel.jsx tests. The panel is read-only (nothing here writes anything - see the
// component's own header comment) so there is no mutation path to cover; what matters is the
// filter/pagination wiring into EventLogService.fetchEventLogs, the loading/empty/populated
// states, and formatChangeValue's Cents-suffix convention for the change list.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import EventLogPanel from "./EventLogPanel";

// EventLogService.fetchEventLogs builds its gql document INSIDE the service function (there is no
// exported EventLogService.FETCH_EVENT_LOGS) - reconstructed here verbatim from EventLogService.js's
// _FETCH_EVENT_LOGS. MockedProvider matches a mock to a call by the query's parsed shape and
// variables, not object identity, so a same-shape document written here targets the same
// operation. If EventLogService.js's selection set drifts from this copy, the mock stops matching
// and the affected test fails loud (Apollo's "no matching mock" error) rather than passing on
// stale data.
const FETCH_EVENT_LOGS = gql`
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

const DEFAULT_PAGE = { limit: 25, offset: 0 };

function logEntry(overrides = {}) {
	return {
		__typename: "EventLog",
		id: "log-1",
		entityType: "Appointment",
		entityId: "appt-1",
		action: "create",
		actorName: "Renee Wolf",
		summary: "Booked a new appointment",
		changes: [],
		createdAt: "2026-08-01T12:00:00.000Z",
		...overrides,
	};
}

// filter/page match exactly what EventLogPanel's own call builds: `{filter: entityType ?
// {entityType} : undefined, page: {limit: pageSize, offset}}`.
function logsMock({ filter, page = DEFAULT_PAGE, items = [], pageInfo = {}, error } = {}) {
	const request = { query: FETCH_EVENT_LOGS, variables: { filter, page } };
	if (error) {
		return { request, error };
	}
	return {
		request,
		result: {
			data: {
				getEventLogs: {
					__typename: "EventLogPage",
					items,
					pageInfo: {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: page.limit,
						offset: page.offset,
						...pageInfo,
					},
				},
			},
		},
	};
}

function renderPanel({ mocks = [] } = {}) {
	render(
		<MockedProvider mocks={mocks}>
			<EventLogPanel />
		</MockedProvider>,
	);
}

describe("loading", () => {
	it("shows a loading message before the first page arrives", async () => {
		renderPanel({ mocks: [logsMock({ filter: undefined, items: [] })] });

		expect(screen.getByText("Loading…")).toBeInTheDocument();

		// Let the mocked response land so the test doesn't leave a pending act() outside this test.
		await screen.findByText("Nothing here yet.");
	});
});

describe("a request that errors", () => {
	// EventLogPanel destructures only {data, loading} from the hook result - it never reads `error`
	// at all. An errored request therefore settles into the same empty-state branch as a real empty
	// page rather than crashing or showing a dedicated error message - that silent fallback is the
	// actual behaviour worth pinning here.
	it("falls back to the empty-state message rather than crashing", async () => {
		renderPanel({ mocks: [logsMock({ filter: undefined, error: new Error("boom") })] });

		expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
	});
});

describe("an empty log", () => {
	it("says there is nothing yet", async () => {
		renderPanel({ mocks: [logsMock({ filter: undefined, items: [] })] });

		expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
	});
});

describe("a populated log", () => {
	it("renders the actor, summary, and a recognised action label", async () => {
		renderPanel({
			mocks: [
				logsMock({
					filter: undefined,
					items: [logEntry({ action: "create", summary: "Booked a new appointment" })],
				}),
			],
		});

		expect(await screen.findByText("Created")).toBeInTheDocument();
		expect(screen.getByText("Booked a new appointment")).toBeInTheDocument();
		// moment(...).format("MMM D, YYYY [at] h:mm A") - date/actor are checked together via a
		// single regex rather than asserting the hour, which shifts with the runner's timezone.
		expect(screen.getByText(/Renee Wolf · Aug 1, 2026 at/)).toBeInTheDocument();
	});

	it("maps update and delete actions to Changed/Deleted", async () => {
		renderPanel({
			mocks: [
				logsMock({
					filter: undefined,
					items: [
						logEntry({ id: "log-1", action: "update", summary: "Edited a client" }),
						logEntry({ id: "log-2", action: "delete", summary: "Removed a shop cut rate" }),
					],
				}),
			],
		});

		expect(await screen.findByText("Changed")).toBeInTheDocument();
		expect(screen.getByText("Deleted")).toBeInTheDocument();
	});

	// ACTION_LABELS has no entry for anything outside create/update/delete - the raw action string
	// is shown verbatim rather than something like "undefined".
	it("falls back to the raw action string for an action it doesn't recognise", async () => {
		renderPanel({
			mocks: [logsMock({ filter: undefined, items: [logEntry({ action: "restore" })] })],
		});

		expect(await screen.findByText("restore")).toBeInTheDocument();
	});

	it("shows no changes list when an entry has no changes", async () => {
		renderPanel({
			mocks: [logsMock({ filter: undefined, items: [logEntry({ changes: [] })] })],
		});

		await screen.findByText("Booked a new appointment");
		expect(document.querySelector(".eventLogChanges")).not.toBeInTheDocument();
	});

	it("formats a *Cents field as money on both sides of the change, and blanks a missing value", async () => {
		renderPanel({
			mocks: [
				logsMock({
					filter: undefined,
					items: [
						logEntry({
							changes: [
								{ __typename: "EventLogChange", field: "amountCents", from: 4500, to: 5000 },
								{ __typename: "EventLogChange", field: "status", from: null, to: "confirmed" },
							],
						}),
					],
				}),
			],
		});

		await screen.findByText("Booked a new appointment");
		// The <ul> carries no accessible name/role distinct from any other list on the page, so it's
		// queried directly by its class rather than through Testing Library's role queries.
		const list = document.querySelector(".eventLogChanges");
		expect(within(list).getByText("amountCents")).toBeInTheDocument();
		expect(list).toHaveTextContent("$45.00");
		expect(list).toHaveTextContent("$50.00");
		expect(list).toHaveTextContent("status");
		expect(list).toHaveTextContent("—");
		expect(list).toHaveTextContent("confirmed");
	});
});

describe("filtering by entity type", () => {
	it("re-queries with the selected entityType and resets to the first page", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				logsMock({ filter: undefined, items: [logEntry({ summary: "Everything item" })] }),
				logsMock({
					filter: { entityType: "Appointment" },
					items: [logEntry({ summary: "Appointment-only item" })],
				}),
			],
		});

		await screen.findByText("Everything item");

		await user.click(screen.getByRole("combobox", { name: "Show" }));
		await user.click(screen.getByRole("option", { name: "Appointments" }));

		expect(await screen.findByText("Appointment-only item")).toBeInTheDocument();
		expect(screen.queryByText("Everything item")).not.toBeInTheDocument();
	});
});

describe("changing page size", () => {
	it("re-queries with the new limit and resets to the first page", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				logsMock({ filter: undefined, items: [logEntry({ summary: "Page of 25" })] }),
				logsMock({
					filter: undefined,
					page: { limit: 10, offset: 0 },
					items: [logEntry({ summary: "Page of 10" })],
				}),
			],
		});

		await screen.findByText("Page of 25");

		await user.click(screen.getByRole("combobox", { name: "Per page" }));
		await user.click(screen.getByRole("option", { name: "10" }));

		expect(await screen.findByText("Page of 10")).toBeInTheDocument();
	});
});

describe("pagination controls", () => {
	it("shows neither Newer nor Older when there is only one page", async () => {
		renderPanel({
			mocks: [
				logsMock({
					filter: undefined,
					items: [logEntry()],
					pageInfo: { hasMore: false, offset: 0 },
				}),
			],
		});

		await screen.findByText("Booked a new appointment");
		expect(screen.queryByRole("button", { name: "Newer" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Older" })).not.toBeInTheDocument();
	});

	it("disables Newer and enables Older on the first page when more pages exist", async () => {
		renderPanel({
			mocks: [
				logsMock({
					filter: undefined,
					items: [logEntry()],
					pageInfo: { hasMore: true, offset: 0 },
				}),
			],
		});

		expect(await screen.findByRole("button", { name: "Newer" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Older" })).not.toBeDisabled();
	});

	it("advancing to the next page requests the next offset and enables Newer", async () => {
		const user = userEvent.setup();
		renderPanel({
			mocks: [
				logsMock({
					filter: undefined,
					items: [logEntry({ summary: "First page" })],
					pageInfo: { hasMore: true, offset: 0 },
				}),
				logsMock({
					filter: undefined,
					page: { limit: 25, offset: 25 },
					items: [logEntry({ summary: "Second page" })],
					pageInfo: { hasMore: false, offset: 25 },
				}),
			],
		});

		await screen.findByText("First page");
		await user.click(screen.getByRole("button", { name: "Older" }));

		expect(await screen.findByText("Second page")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Newer" })).not.toBeDisabled();
		// hasMore is now false, so Older is disabled rather than absent.
		expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
	});
});
