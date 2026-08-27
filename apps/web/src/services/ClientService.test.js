// ClientService.js tests. A "Service" file here is an IIFE exporting a mix of React-hook
// factories wrapping useQuery/useMutation/useLazyQuery around a gql document, and raw gql
// documents meant to be passed directly to useMutation by a calling component - there is almost
// no pure logic to unit-test in isolation, so every export below is exercised through a tiny
// throwaway harness component rendered under MockedProvider, built from the REAL exported gql
// document (never a hand-copied query string) exactly as UpdateEventDialog.test.jsx already does
// for AppointmentService.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment -
// this codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this
// project's Vite/oxc pipeline (confirmed there by the historical 91-file rename), and this file
// stays a .js to match its sibling ClientService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useQuery, useMutation } from "@apollo/client";
import { print } from "graphql";
import ClientService from "./ClientService";

// FETCH_CLIENT_QUERY isn't separately exported by ClientService (unlike FETCH_CLIENT_DASHBOARD),
// so it's reconstructed here field-for-field from the real source in ClientService.js purely so
// MockedProvider has a document to match against - MockedProvider compares a request by the
// document's printed text plus variables, not by reference identity, so this still fails loudly
// if the real query in ClientService.js ever drifts from what's copied here.
const FETCH_CLIENT_QUERY_FOR_TESTS = gql`
	query ($clientId: ID!) {
		getClient(clientId: $clientId) {
			id
			firstName
			lastName
			email
			phone
			address
			city
			state
			zip
			instagram
			facebook
			avatar
			userId
			status
			user {
				avatar
			}
		}
	}
`;

// ---- generic harnesses -----------------------------------------------------------------------

// Renders whatever a query/lazy-query-returning hook function produces. `hookFn` is called with
// no args and must itself close over any variables it needs - this lets one harness cover every
// query-shaped export without repeating the loading/error/data plumbing each time.
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

// Renders a button that fires a mutation with fixed variables, and the onCompleted payload once
// it lands - the same "click, then assert the mock's result flowed through" pattern the task
// description itself lays out.
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

// ---- fetchClient ------------------------------------------------------------------------------

describe("ClientService.fetchClient", () => {
	it("resolves with the full client record", async () => {
		const client = {
			__typename: "Client",
			id: "client-1",
			firstName: "Arya",
			lastName: "Stark",
			email: "arya@example.com",
			phone: "555-0100",
			address: "1 Winterfell Way",
			city: "Winterfell",
			state: "North",
			zip: "00001",
			instagram: null,
			facebook: null,
			avatar: null,
			userId: "user-1",
			status: null,
			user: { __typename: "User", avatar: null },
		};
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ClientService.fetchClient("client-1"),
			});
		}

		// ClientService doesn't separately export FETCH_CLIENT_QUERY the way it exports
		// FETCH_CLIENT_DASHBOARD, so the mock's `query` below is FETCH_CLIENT_QUERY_FOR_TESTS - a
		// verbatim copy of the query text from the real ClientService.js source (see below this
		// test) - rather than an import. MockedProvider matches a request by comparing the
		// document's printed text plus variables, not by reference identity, so this still fails
		// loudly if the real query in ClientService.js ever drifts from what's copied here.
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_CLIENT_QUERY_FOR_TESTS,
								variables: { clientId: "client-1" },
							},
							result: { data: { getClient: client } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Arya");
		expect(result).toHaveTextContent("arya@example.com");
	});
});

describe("ClientService.fetchClient has no skip guard", () => {
	// Unlike fetchClientDashboard below, _fetchClient has no `skip` at all - it fires
	// unconditionally even with a falsy id. Registering zero mocks and observing the query
	// still error out (rather than sitting quietly with loading:false/data:undefined the way a
	// skipped query would) is the proof that a real request was attempted.
	it("still fires the query even when clientId is falsy", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ClientService.fetchClient("") });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- fetchClients -------------------------------------------------------------------------

describe("ClientService.fetchClients", () => {
	const FETCH_CLIENTS_QUERY_FOR_TESTS = gql`
		query GetClients($includeArchived: Boolean, $page: PageInput) {
			getClients(includeArchived: $includeArchived, page: $page) {
				items {
					id
					firstName
					lastName
					email
					phone
					address
					city
					state
					zip
					instagram
					facebook
					avatar
					userId
					status
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

	it("resolves with a page of clients using its default arguments", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => ClientService.fetchClients() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_CLIENTS_QUERY_FOR_TESTS,
								// Defaults: includeArchived = false, page = undefined (no page arg passed).
								variables: { includeArchived: false, page: undefined },
							},
							result: {
								data: {
									getClients: {
										__typename: "ClientPage",
										items: [
											{
												__typename: "Client",
												id: "client-1",
												firstName: "Arya",
												lastName: "Stark",
												email: "arya@example.com",
												phone: "555-0100",
												address: null,
												city: null,
												state: null,
												zip: null,
												instagram: null,
												facebook: null,
												avatar: null,
												userId: "user-1",
												status: null,
											},
										],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 1,
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

		expect(await screen.findByTestId("result")).toHaveTextContent("Arya");
	});

	it("passes includeArchived and page through as variables", async () => {
		const page = { limit: 10, offset: 20 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ClientService.fetchClients(true, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_CLIENTS_QUERY_FOR_TESTS,
								variables: { includeArchived: true, page },
							},
							result: {
								data: {
									getClients: {
										__typename: "ClientPage",
										items: [],
										pageInfo: {
											__typename: "PageInfo",
											totalCount: 0,
											hasMore: false,
											limit: 10,
											offset: 20,
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

		// Reaching a resolved (non-error) result at all IS the assertion that the variables the
		// mock demanded (includeArchived: true, page: {limit:10, offset:20}) were what was sent -
		// MockedProvider throws loudly on any mismatch.
		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});
});

// ---- updateClient (an odd one: returns a raw document, ignoring its own argument) --------------

describe("ClientService.updateClient", () => {
	const UPDATE_CLIENT_MUTATION_FOR_TESTS = gql`
		mutation ($client: ClientInput) {
			updateClient(client: $client) {
				id
				firstName
				lastName
				email
				phone
				address
				city
				state
				zip
				instagram
				facebook
				avatar
				userId
			}
		}
	`;

	// SURPRISE: despite taking a `client` parameter, _updateClient's body never reads it - it
	// just builds and returns the UPDATE_CLIENT_MUTATION document unconditionally. Calling it is
	// really just "give me the mutation document", not "give me a mutation bound to this client".
	it("ignores its argument - the same document comes back regardless of what's passed", () => {
		const docA = ClientService.updateClient({ id: "a" });
		const docB = ClientService.updateClient(undefined);
		expect(print(docA)).toEqual(print(docB));
		expect(print(docA)).toEqual(print(UPDATE_CLIENT_MUTATION_FOR_TESTS));
	});

	it("is a usable mutation document when handed to useMutation directly, as real callers would", async () => {
		const user = userEvent.setup();
		const client = { id: "client-1", firstName: "Arya Updated" };
		const document = ClientService.updateClient(client);

		function Harness() {
			return React.createElement(MutationHarness, {
				document,
				variables: { client },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UPDATE_CLIENT_MUTATION_FOR_TESTS, variables: { client } },
							result: {
								data: {
									updateClient: {
										__typename: "Client",
										id: "client-1",
										firstName: "Arya Updated",
										lastName: "Stark",
										email: "arya@example.com",
										phone: "555-0100",
										address: null,
										city: null,
										state: null,
										zip: null,
										instagram: null,
										facebook: null,
										avatar: null,
										userId: "user-1",
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
		expect(await screen.findByTestId("result")).toHaveTextContent("Arya Updated");
	});
});

// ---- fetchClientDashboard / FETCH_CLIENT_DASHBOARD ---------------------------------------------

describe("ClientService.fetchClientDashboard", () => {
	function dashboardClient(overrides = {}) {
		return {
			__typename: "Client",
			id: "client-1",
			firstName: "Arya",
			lastName: "Stark",
			email: "arya@example.com",
			phone: "555-0100",
			avatar: null,
			userId: "user-1",
			stats: {
				__typename: "ClientStats",
				totalSpentCents: 50000,
				totalTipsCents: 5000,
				averageTipCents: 2500,
				tippedSessionCount: 2,
				completedSessionCount: 4,
				projectCount: 2,
				upcomingAppointmentCount: 1,
			},
			projects: {
				__typename: "ProjectPage",
				items: [
					{
						__typename: "Project",
						id: "project-1",
						title: "Half sleeve - koi",
						status: "in_progress",
						createdAt: "2026-01-01T00:00:00.000Z",
					},
				],
				pageInfo: { __typename: "PageInfo", totalCount: 1, hasMore: false, limit: 10, offset: 0 },
			},
			appointments: {
				__typename: "AppointmentPage",
				items: [
					{
						__typename: "Appointment",
						id: "appt-1",
						title: "Sleeve session 2",
						appointmentDate: "2026-08-01T12:00:00.000Z",
						appointmentType: "session",
						appointmentStatus: "completed",
						subtotalCents: 20000,
						taxCents: 1500,
						feeCents: 0,
						tipCents: 2500,
						totalCents: 24000,
						projectId: "project-1",
						project: { __typename: "Project", id: "project-1", title: "Half sleeve - koi" },
					},
				],
				pageInfo: { __typename: "PageInfo", totalCount: 1, hasMore: false, limit: 10, offset: 0 },
			},
			notes: [
				{
					__typename: "IBNote",
					id: "note-1",
					author: "Gendry Baratheon",
					note: "Cancels a lot.",
					createdAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
				},
			],
			flags: [
				{
					__typename: "ClientFlag",
					id: "flag-1",
					typeKey: "NO_SHOW",
					note: null,
					systemGenerated: true,
					createdAt: "2026-01-01T00:00:00.000Z",
					type: { __typename: "ClientFlagType", key: "NO_SHOW", label: "No-show" },
					createdBy: null,
				},
			],
			...overrides,
		};
	}

	it("resolves with the full dashboard payload (stats, projects, appointments, notes, flags)", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					ClientService.fetchClientDashboard(
						"client-1",
						{ limit: 10, offset: 0 },
						{ limit: 10, offset: 0 },
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
								query: ClientService.FETCH_CLIENT_DASHBOARD,
								variables: {
									clientId: "client-1",
									projectsPage: { limit: 10, offset: 0 },
									appointmentsPage: { limit: 10, offset: 0 },
								},
							},
							result: { data: { getClient: dashboardClient() } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Half sleeve - koi");
		expect(result).toHaveTextContent("Cancels a lot.");
		expect(result).toHaveTextContent("NO_SHOW");
	});

	// skip: !clientId - a falsy clientId must never fire a request at all.
	it("skips the query entirely when clientId is falsy, with no error", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ClientService.fetchClientDashboard(null, undefined, undefined),
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
});

describe("ClientService.FETCH_CLIENT_DASHBOARD (raw document)", () => {
	// Confirms the exported document is independently usable via a plain useQuery, the same way
	// a calling component reaching for the raw document (rather than the wrapped hook) would use
	// it - this is the exact document _fetchClientDashboard itself runs internally.
	it("works standalone via useQuery", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () =>
					useQuery(ClientService.FETCH_CLIENT_DASHBOARD, {
						variables: { clientId: "client-1", projectsPage: undefined, appointmentsPage: undefined },
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
								query: ClientService.FETCH_CLIENT_DASHBOARD,
								variables: {
									clientId: "client-1",
									projectsPage: undefined,
									appointmentsPage: undefined,
								},
							},
							result: {
								data: {
									getClient: {
										__typename: "Client",
										id: "client-1",
										firstName: "Arya",
										lastName: "Stark",
										email: "arya@example.com",
										phone: "555-0100",
										avatar: null,
										userId: "user-1",
										stats: {
											__typename: "ClientStats",
											totalSpentCents: 0,
											totalTipsCents: 0,
											averageTipCents: 0,
											tippedSessionCount: 0,
											completedSessionCount: 0,
											projectCount: 0,
											upcomingAppointmentCount: 0,
										},
										projects: {
											__typename: "ProjectPage",
											items: [],
											pageInfo: { __typename: "PageInfo", totalCount: 0, hasMore: false, limit: 10, offset: 0 },
										},
										appointments: {
											__typename: "AppointmentPage",
											items: [],
											pageInfo: { __typename: "PageInfo", totalCount: 0, hasMore: false, limit: 10, offset: 0 },
										},
										notes: [],
										flags: [],
									},
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		expect(await screen.findByTestId("result")).toHaveTextContent("Arya");
	});
});

// ---- UPDATE_CLIENT_NOTES ------------------------------------------------------------------------

describe("ClientService.UPDATE_CLIENT_NOTES", () => {
	it("sends notes + clientId and the updated client's notes flow back", async () => {
		const user = userEvent.setup();
		const notes = [
			{
				id: "note-1",
				author: "Gendry Baratheon",
				note: "New note",
				createdAt: "2026-08-21T00:00:00.000Z",
				updatedAt: "2026-08-21T00:00:00.000Z",
			},
		];

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ClientService.UPDATE_CLIENT_NOTES,
				variables: { clientId: "client-1", notes },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ClientService.UPDATE_CLIENT_NOTES,
								variables: { clientId: "client-1", notes },
							},
							result: {
								data: {
									updateClientNotes: {
										__typename: "Client",
										id: "client-1",
										notes: notes.map((n) => ({ __typename: "IBNote", ...n })),
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
		expect(await screen.findByTestId("result")).toHaveTextContent("New note");
	});
});

// ---- useLazyFindClientByEmail -------------------------------------------------------------------

describe("ClientService.useLazyFindClientByEmail", () => {
	const FIND_CLIENT_BY_EMAIL_FOR_TESTS = gql`
		query FindClientByEmail($email: String!) {
			findClientByEmail(email: $email) {
				id
				firstName
				lastName
				email
				phone
			}
		}
	`;

	function LazyHarness({ email }) {
		const [findClientByEmail, { data, called }] = ClientService.useLazyFindClientByEmail();
		return React.createElement(
			"div",
			null,
			React.createElement(
				"button",
				{ onClick: () => findClientByEmail({ variables: { email } }) },
				"search",
			),
			React.createElement("div", { "data-testid": "called" }, called ? "called" : "not-called"),
			data &&
				React.createElement("div", { "data-testid": "result" }, JSON.stringify(data)),
		);
	}

	it("does not fire until the trigger is called", async () => {
		render(
			React.createElement(
				MockedProvider,
				{ mocks: [] },
				React.createElement(LazyHarness, { email: "arya@example.com" }),
			),
		);

		expect(screen.getByTestId("called")).toHaveTextContent("not-called");
		expect(screen.queryByTestId("result")).not.toBeInTheDocument();
	});

	it("fires FIND_CLIENT_BY_EMAIL with the given email once triggered", async () => {
		const user = userEvent.setup();
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FIND_CLIENT_BY_EMAIL_FOR_TESTS,
								variables: { email: "arya@example.com" },
							},
							result: {
								data: {
									findClientByEmail: {
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
					],
				},
				React.createElement(LazyHarness, { email: "arya@example.com" }),
			),
		);

		await user.click(screen.getByRole("button", { name: "search" }));

		expect(await screen.findByTestId("result")).toHaveTextContent("Arya");
	});
});

// ---- ARCHIVE_CLIENT_MUTATION / UNARCHIVE_CLIENT_MUTATION -----------------------------------------

describe("ClientService.ARCHIVE_CLIENT_MUTATION", () => {
	it("archives a client by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ClientService.ARCHIVE_CLIENT_MUTATION,
				variables: { clientId: "client-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ClientService.ARCHIVE_CLIENT_MUTATION,
								variables: { clientId: "client-1" },
							},
							result: {
								data: {
									archiveClient: { __typename: "Client", id: "client-1", status: 1 },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":1');
	});
});

describe("ClientService.UNARCHIVE_CLIENT_MUTATION", () => {
	it("unarchives a client by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: ClientService.UNARCHIVE_CLIENT_MUTATION,
				variables: { clientId: "client-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: ClientService.UNARCHIVE_CLIENT_MUTATION,
								variables: { clientId: "client-1" },
							},
							result: {
								data: {
									unarchiveClient: { __typename: "Client", id: "client-1", status: null },
								},
							},
						},
					],
				},
				React.createElement(Harness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent('"status":null');
	});
});

// ---- getClientFlagTypes -----------------------------------------------------------------------

describe("ClientService.getClientFlagTypes", () => {
	const GET_CLIENT_FLAG_TYPES_FOR_TESTS = gql`
		query GetClientFlagTypes($shopId: ID) {
			getClientFlagTypes(shopId: $shopId) {
				key
				label
				systemGenerated
			}
		}
	`;

	it("resolves with the platform-wide flag types when called with no shopId", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ClientService.getClientFlagTypes(undefined),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: GET_CLIENT_FLAG_TYPES_FOR_TESTS, variables: { shopId: undefined } },
							result: {
								data: {
									getClientFlagTypes: [
										{ __typename: "ClientFlagType", key: "NO_SHOW", label: "No-show", systemGenerated: true },
										{
											__typename: "ClientFlagType",
											key: "DIFFICULT",
											label: "Difficult to work with",
											systemGenerated: false,
										},
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
		expect(result).toHaveTextContent("No-show");
		expect(result).toHaveTextContent("Difficult to work with");
	});

	// ClientDashboard.jsx calls this as getClientFlagTypes(undefined, { skip: isSelf }) - the
	// second `options` argument has to actually reach useQuery and be able to skip it.
	it("honors a skip option passed through in the second argument, the way ClientDashboard.jsx uses it", async () => {
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => ClientService.getClientFlagTypes(undefined, { skip: true }),
			});
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		await waitFor(() => {
			expect(screen.queryByTestId("error")).not.toBeInTheDocument();
		});
		expect(screen.getByTestId("result")).toHaveTextContent("null");
	});
});

// ---- RAISE_CLIENT_FLAG --------------------------------------------------------------------------

describe("ClientService.RAISE_CLIENT_FLAG", () => {
	it("raises a flag with the RaiseClientFlagInput shape ClientDashboard.jsx actually sends", async () => {
		const user = userEvent.setup();
		const input = { clientId: "client-1", typeKey: "DIFFICULT", note: "Argued about pricing." };

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ClientService.RAISE_CLIENT_FLAG,
				variables: { input },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ClientService.RAISE_CLIENT_FLAG, variables: { input } },
							result: {
								data: {
									raiseClientFlag: {
										__typename: "ClientFlag",
										id: "flag-2",
										typeKey: "DIFFICULT",
										note: "Argued about pricing.",
										systemGenerated: false,
										createdAt: "2026-08-21T00:00:00.000Z",
										type: { __typename: "ClientFlagType", key: "DIFFICULT", label: "Difficult to work with" },
										createdBy: { __typename: "User", id: "user-1", firstName: "Gendry", lastName: "Baratheon" },
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
		expect(result).toHaveTextContent("Argued about pricing.");
		expect(result).toHaveTextContent("Gendry");
	});
});

// ---- RESOLVE_CLIENT_FLAG (new export this session) ----------------------------------------------

describe("ClientService.RESOLVE_CLIENT_FLAG", () => {
	it("resolves a flag by id and returns its resolvedAt", async () => {
		const user = userEvent.setup();

		function Harness() {
			return React.createElement(MutationHarness, {
				document: ClientService.RESOLVE_CLIENT_FLAG,
				variables: { flagId: "flag-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: ClientService.RESOLVE_CLIENT_FLAG, variables: { flagId: "flag-1" } },
							result: {
								data: {
									resolveClientFlag: {
										__typename: "ClientFlag",
										id: "flag-1",
										resolvedAt: "2026-08-21T00:00:00.000Z",
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
		expect(result).toHaveTextContent("flag-1");
		expect(result).toHaveTextContent("2026-08-21T00:00:00.000Z");
	});

	// resolveClientFlag's selection set is deliberately narrow (id + resolvedAt only) - matching
	// the "patch what changed" pattern raiseClientFlag itself follows, per ClientService.js's own
	// comment on this mutation. Locks in that the document does NOT over-fetch the rest of the
	// flag (e.g. typeKey/note), which would be a silent regression toward a bigger response.
	it("does not select fields beyond id and resolvedAt", () => {
		const printed = print(ClientService.RESOLVE_CLIENT_FLAG);
		expect(printed).toContain("resolvedAt");
		expect(printed).not.toContain("typeKey");
		expect(printed).not.toContain("systemGenerated");
	});
});
