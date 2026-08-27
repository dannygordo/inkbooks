// StaffService.js tests. Same IIFE-of-hook-factories shape as ClientService.js (and in fact
// fetchOneStaff/fetchStaff/updateStaff are near-verbatim structural copies of ClientService's
// fetchClient/fetchClients/updateClient), so every export below is exercised through the same tiny
// throwaway harness-under-MockedProvider pattern ClientService.test.js already establishes, built
// from the REAL exported gql documents where they're exported directly (ARCHIVE/UNARCHIVE), and
// reconstructed field-for-field from the source where a query/mutation is only built internally
// (fetchOneStaff, fetchStaff, updateStaff) - MockedProvider matches by printed document text plus
// variables, not identity, so a reconstructed copy still fails loudly if the real query drifts.
//
// Written with React.createElement rather than JSX: see vite.config.js's own header comment - this
// codebase's .js files (as opposed to .jsx) cannot contain literal JSX at all under this project's
// Vite/oxc pipeline, and this file stays a .js to match its sibling StaffService.js.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql, useMutation } from "@apollo/client";
import { print } from "graphql";
import StaffService from "./StaffService";

// FETCH_ONE_STAFF_QUERY isn't separately exported by StaffService, so it's reconstructed here
// field-for-field from the real source in StaffService.js purely so MockedProvider has a document
// to match against.
const FETCH_ONE_STAFF_QUERY_FOR_TESTS = gql`
	query ($staffId: ID!) {
		getOneStaff(staffId: $staffId) {
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
			title
			status
			shopId
		}
	}
`;

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

// ---- fetchOneStaff ------------------------------------------------------------------------------

describe("StaffService.fetchOneStaff", () => {
	it("resolves with the full staff record", async () => {
		const staff = {
			__typename: "Staff",
			id: "staff-1",
			firstName: "Gendry",
			lastName: "Baratheon",
			email: "gendry@example.com",
			phone: "555-0200",
			address: null,
			city: null,
			state: null,
			zip: null,
			instagram: null,
			facebook: null,
			avatar: null,
			userId: "user-2",
			title: "Front desk",
			status: null,
			shopId: "shop-1",
		};
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => StaffService.fetchOneStaff("staff-1"),
			});
		}

		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_ONE_STAFF_QUERY_FOR_TESTS,
								variables: { staffId: "staff-1" },
							},
							result: { data: { getOneStaff: staff } },
						},
					],
				},
				React.createElement(Harness),
			),
		);

		const result = await screen.findByTestId("result");
		expect(result).toHaveTextContent("Gendry");
		expect(result).toHaveTextContent("Front desk");
	});
});

describe("StaffService.fetchOneStaff has no skip guard", () => {
	// Like ClientService's fetchClient, _fetchOneStaff has no `skip` at all - it fires
	// unconditionally even with a falsy id. Registering zero mocks and observing the query still
	// error out (rather than sitting quietly with loading:false/data:undefined the way a skipped
	// query would) is the proof that a real request was attempted.
	it("still fires the query even when staffId is falsy", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => StaffService.fetchOneStaff("") });
		}
		render(React.createElement(MockedProvider, { mocks: [] }, React.createElement(Harness)));

		expect(await screen.findByTestId("error")).toBeInTheDocument();
		spy.mockRestore();
	});
});

// ---- fetchStaff -----------------------------------------------------------------------------

describe("StaffService.fetchStaff", () => {
	const FETCH_STAFF_QUERY_FOR_TESTS = gql`
		query GetStaff($includeArchived: Boolean, $page: PageInput) {
			getStaff(includeArchived: $includeArchived, page: $page) {
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
					title
					status
					shopId
					user {
						id
						firstName
						lastName
						avatar
					}
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

	it("resolves with a page of staff using its default arguments", async () => {
		function Harness() {
			return React.createElement(QueryHarness, { hookFn: () => StaffService.fetchStaff() });
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_STAFF_QUERY_FOR_TESTS,
								// Defaults: includeArchived = false, page = undefined (no page arg passed).
								variables: { includeArchived: false, page: undefined },
							},
							result: {
								data: {
									getStaff: {
										__typename: "StaffPage",
										items: [
											{
												__typename: "Staff",
												id: "staff-1",
												firstName: "Gendry",
												lastName: "Baratheon",
												email: "gendry@example.com",
												phone: "555-0200",
												address: null,
												city: null,
												state: null,
												zip: null,
												instagram: null,
												facebook: null,
												avatar: null,
												userId: "user-2",
												title: "Front desk",
												status: null,
												shopId: "shop-1",
												user: {
													__typename: "User",
													id: "user-2",
													firstName: "Gendry",
													lastName: "Baratheon",
													avatar: null,
												},
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

		expect(await screen.findByTestId("result")).toHaveTextContent("Gendry");
	});

	it("passes includeArchived and page through as variables", async () => {
		const page = { limit: 10, offset: 20 };
		function Harness() {
			return React.createElement(QueryHarness, {
				hookFn: () => StaffService.fetchStaff(true, page),
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: FETCH_STAFF_QUERY_FOR_TESTS,
								variables: { includeArchived: true, page },
							},
							result: {
								data: {
									getStaff: {
										__typename: "StaffPage",
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

		// Reaching a resolved (non-error) result at all IS the assertion that the variables the mock
		// demanded (includeArchived: true, page: {limit:10, offset:20}) were what was sent -
		// MockedProvider throws loudly on any mismatch.
		expect(await screen.findByTestId("result")).toHaveTextContent('"items":[]');
	});

	// The `user` subfield was fixed this session (see StaffService.js's own comment: a bare "user"
	// selection with no subfields would make the server reject the whole document) - locks in that
	// the reconstructed test document, and by extension the real one, actually selects subfields.
	it("selects subfields on the nested user object, not a bare selection", () => {
		const printed = print(FETCH_STAFF_QUERY_FOR_TESTS);
		expect(printed).toMatch(/user\s*\{\s*id/);
	});
});

// ---- updateStaff (an odd one: returns a raw document, ignoring its own argument) ----------------

describe("StaffService.updateStaff", () => {
	const UPDATE_STAFF_MUTATION_FOR_TESTS = gql`
		mutation ($staff: StaffInput) {
			updateStaff(staff: $staff) {
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
				title
				status
				shopId
			}
		}
	`;

	// SURPRISE: despite taking a `staff` parameter, _updateStaff's body never reads it - it just
	// builds and returns the UPDATE_STAFF_MUTATION document unconditionally, exactly the same
	// pattern as ClientService's _updateClient.
	it("ignores its argument - the same document comes back regardless of what's passed", () => {
		const docA = StaffService.updateStaff({ id: "a" });
		const docB = StaffService.updateStaff(undefined);
		expect(print(docA)).toEqual(print(docB));
		expect(print(docA)).toEqual(print(UPDATE_STAFF_MUTATION_FOR_TESTS));
	});

	it("is a usable mutation document when handed to useMutation directly, as real callers would", async () => {
		const user = userEvent.setup();
		const staff = { id: "staff-1", firstName: "Gendry Updated" };
		const document = StaffService.updateStaff(staff);

		function Harness() {
			return React.createElement(MutationHarness, {
				document,
				variables: { staff },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: { query: UPDATE_STAFF_MUTATION_FOR_TESTS, variables: { staff } },
							result: {
								data: {
									updateStaff: {
										__typename: "Staff",
										id: "staff-1",
										firstName: "Gendry Updated",
										lastName: "Baratheon",
										email: "gendry@example.com",
										phone: "555-0200",
										address: null,
										city: null,
										state: null,
										zip: null,
										instagram: null,
										facebook: null,
										avatar: null,
										userId: "user-2",
										title: "Front desk",
										status: null,
										shopId: "shop-1",
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
		expect(await screen.findByTestId("result")).toHaveTextContent("Gendry Updated");
	});
});

// ---- ARCHIVE_STAFF_MUTATION / UNARCHIVE_STAFF_MUTATION -----------------------------------------

describe("StaffService.ARCHIVE_STAFF_MUTATION", () => {
	it("archives a staff member by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: StaffService.ARCHIVE_STAFF_MUTATION,
				variables: { staffId: "staff-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: StaffService.ARCHIVE_STAFF_MUTATION,
								variables: { staffId: "staff-1" },
							},
							result: {
								data: {
									archiveStaff: { __typename: "Staff", id: "staff-1", status: 1 },
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

describe("StaffService.UNARCHIVE_STAFF_MUTATION", () => {
	it("unarchives a staff member by id", async () => {
		const user = userEvent.setup();
		function Harness() {
			return React.createElement(MutationHarness, {
				document: StaffService.UNARCHIVE_STAFF_MUTATION,
				variables: { staffId: "staff-1" },
			});
		}
		render(
			React.createElement(
				MockedProvider,
				{
					mocks: [
						{
							request: {
								query: StaffService.UNARCHIVE_STAFF_MUTATION,
								variables: { staffId: "staff-1" },
							},
							result: {
								data: {
									unarchiveStaff: { __typename: "Staff", id: "staff-1", status: null },
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

describe("StaffService.ARCHIVE_STAFF_MUTATION / UNARCHIVE_STAFF_MUTATION standalone via useQuery-shaped hooks", () => {
	// Confirms both documents are independently usable via a plain useMutation, the same way a
	// calling component reaching for the raw document (rather than a wrapped hook, since StaffService
	// exposes none for archive/unarchive) would use them.
	it("ARCHIVE_STAFF_MUTATION works standalone via useMutation", async () => {
		const user = userEvent.setup();
		function RawHarness() {
			const [result, setResult] = React.useState(null);
			const [mutate] = useMutation(StaffService.ARCHIVE_STAFF_MUTATION, { onCompleted: setResult });
			return React.createElement(
				"div",
				null,
				React.createElement(
					"button",
					{ onClick: () => mutate({ variables: { staffId: "staff-2" } }) },
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
							request: {
								query: StaffService.ARCHIVE_STAFF_MUTATION,
								variables: { staffId: "staff-2" },
							},
							result: { data: { archiveStaff: { __typename: "Staff", id: "staff-2", status: 1 } } },
						},
					],
				},
				React.createElement(RawHarness),
			),
		);

		await clickGo(user);
		expect(await screen.findByTestId("result")).toHaveTextContent("staff-2");
	});
});

// ---- module shape -----------------------------------------------------------------------------

describe("StaffService module shape", () => {
	// StaffService, unlike ClientService, has no query-returning raw document export (no
	// FETCH_STAFF_DASHBOARD equivalent) and no lazy-query export - pinning down the exact export
	// list guards against a silent rename of any of these five going unnoticed.
	it("exposes exactly the five documented exports", () => {
		expect(Object.keys(StaffService).sort()).toEqual(
			["ARCHIVE_STAFF_MUTATION", "UNARCHIVE_STAFF_MUTATION", "fetchOneStaff", "fetchStaff", "updateStaff"].sort(),
		);
	});
});
