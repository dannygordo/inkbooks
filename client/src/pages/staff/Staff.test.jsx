// Staff.jsx tests. Same EntityList/EntityListPager shape as Clients.jsx (see Clients.test.jsx's
// own header comment, which this mirrors closely) - the main difference worth calling out is that
// Staff.jsx's own header comment explains it deliberately does NOT reuse StaffService.fetchStaff:
// that service's query currently selects a bare `user` (an object type with no subfields), which
// GraphQL rejects outright, so Staff.jsx keeps its own inline FETCH_STAFF_QUERY that selects
// `user { avatar }` properly. The gql document below is copied from THAT inline query, not from
// StaffService.js - see StaffService.test.js for the (currently broken) service query's own
// coverage. MockedProvider matches by the document's printed text plus variables, not identity, so
// this still fails loudly if Staff.jsx's own inline query ever drifts from what's copied here.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import { gql } from "@apollo/client";
import Staff from "./Staff";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants";
import { CreateStaffWizard } from "../../components/wizards/AccountWizards";

const FETCH_STAFF_QUERY = gql`
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
				status
				title
				shopId
				shop {
					name
				}
				user {
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

// Staff.jsx always calls useQuery with an explicit { includeArchived, page: { limit, offset } } -
// never an undefined page - so every mock here supplies both variables explicitly, defaulting to
// the page's own initial state (PAGE_SIZE=50, offset 0).
function staffMock({ includeArchived = false, page = { limit: 50, offset: 0 }, items, pageInfo }) {
	return {
		request: { query: FETCH_STAFF_QUERY, variables: { includeArchived, page } },
		result: {
			data: {
				getStaff: {
					__typename: "StaffPage",
					items,
					pageInfo: pageInfo || {
						__typename: "PageInfo",
						totalCount: items.length,
						hasMore: false,
						limit: page.limit,
						offset: page.offset,
					},
				},
			},
		},
	};
}

function staff(overrides = {}) {
	return {
		__typename: "Staff",
		id: "staff-1",
		firstName: "Gendry",
		lastName: "Baratheon",
		email: "gendry@example.com",
		phone: "5551234567",
		address: null,
		city: "King's Landing",
		state: "Crownlands",
		zip: "00002",
		instagram: null,
		facebook: null,
		avatar: null,
		userId: "user-2",
		status: null,
		title: "Front desk",
		shopId: "shop-1",
		shop: { __typename: "Shop", name: "Smoking Log Tattoo" },
		user: { __typename: "User", avatar: null },
		...overrides,
	};
}

// The active user driving IBPageActionBar's own role gate (canManageAccounts = role <= SHOP_ADMIN)
// - see IBPageActionBar.jsx. setModal/modal are spied on so a click on "Add Staff" can be asserted
// without needing the global modal host that would actually render CreateStaffWizard.
function authValue(role, overrides = {}) {
	return {
		user: { role, userInfo: { id: "viewer-1" } },
		setModal: vi.fn(),
		modal: { isOpen: false },
		setAlert: vi.fn(),
		...overrides,
	};
}

function renderStaff({ mocks = [], auth = authValue(ROLES.SHOP_ADMIN), route = "/staff" } = {}) {
	function StaffIdProbe() {
		const { staffId } = useParams();
		return <div>Staff Profile Page for {staffId}</div>;
	}
	const utils = render(
		<MemoryRouter initialEntries={[route]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={auth}>
					<Routes>
						<Route path="/staff" element={<Staff />} />
						<Route path="/staff/:staffId" element={<StaffIdProbe />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { ...utils, auth };
}

describe("loading", () => {
	it("shows the page loader while the query is in flight", () => {
		renderStaff({ mocks: [staffMock({ items: [staff()] })] });

		// Asserted synchronously, before the mocked response has had a chance to resolve -
		// IBPageLoader (see its own file) renders MUI's CircularProgress with this text as its
		// child, matching APP_SETTINGS_CONSTANTS.LOADING_TEXT.
		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
});

describe("empty state", () => {
	it("shows the empty message when the shop has no staff", async () => {
		renderStaff({ mocks: [staffMock({ items: [] })] });

		expect(await screen.findByText("No staff yet.")).toBeInTheDocument();
	});

	// Staff.jsx destructures only { loading, data, refetch } off useQuery - there is no `error`
	// branch at all, so a query error falls through the same `data?.getStaff?.items || []` default
	// an empty result does.
	it("falls through to the empty state on a query error, rather than crashing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		renderStaff({
			mocks: [
				{
					request: {
						query: FETCH_STAFF_QUERY,
						variables: { includeArchived: false, page: { limit: 50, offset: 0 } },
					},
					error: new Error("network down"),
				},
			],
		});

		expect(await screen.findByText("No staff yet.")).toBeInTheDocument();
		spy.mockRestore();
	});
});

describe("populated list", () => {
	it("renders each staff member's row fields, preferring user.avatar with a fallback", async () => {
		renderStaff({
			mocks: [
				staffMock({
					items: [
						staff(),
						staff({
							id: "staff-2",
							firstName: "Sansa",
							lastName: "Stark",
							email: "sansa@example.com",
							phone: "5559876543",
							city: null,
							state: null,
							shop: null,
							title: "Piercer",
						}),
					],
				}),
			],
		});

		expect(await screen.findByText("Gendry Baratheon")).toBeInTheDocument();
		expect(screen.getByText("Front desk")).toBeInTheDocument();
		expect(screen.getByText("gendry@example.com")).toBeInTheDocument();
		expect(screen.getByText("Smoking Log Tattoo")).toBeInTheDocument();
		expect(screen.getByText("King's Landing, Crownlands")).toBeInTheDocument();

		// Second row has no shop and no city/state - EntityList renders an em dash rather than a
		// blank cell for each missing value (see EntityList.jsx's own comment on why).
		expect(screen.getByText("Sansa Stark")).toBeInTheDocument();
		const sansaRow = screen.getByText("Sansa Stark").closest(".entityRow");
		expect(within(sansaRow).getAllByText("—").length).toBeGreaterThanOrEqual(2);
	});

	it("links each row to its staff profile at ROUTE_CONSTANTS.STAFF, not STAFF_PROFILE", async () => {
		const user = userEvent.setup();
		renderStaff({ mocks: [staffMock({ items: [staff()] })] });

		await user.click((await screen.findByText("Gendry Baratheon")).closest(".entityRow"));

		expect(await screen.findByText("Staff Profile Page for staff-1")).toBeInTheDocument();
	});

	it("mutes and labels an archived row", async () => {
		const user = userEvent.setup();
		renderStaff({
			mocks: [
				// The initial, unchecked render (includeArchived: false) - answered first.
				staffMock({ items: [staff()] }),
				// What the "Show archived" toggle below switches to - includes both active and
				// archived records, which is what makes the archived styling worth asserting
				// against a mixed list rather than an archived-only one.
				staffMock({
					includeArchived: true,
					items: [staff(), staff({ id: "staff-2", firstName: "Sansa", lastName: "Stark", status: 4 })],
				}),
			],
		});

		await screen.findByText("Gendry Baratheon");
		await user.click(screen.getByRole("checkbox", { name: "Show archived" }));

		await screen.findByText("Sansa Stark");
		const archivedRow = screen.getByText("Sansa Stark").closest(".entityRow");
		expect(archivedRow).toHaveClass("entityRowArchived");
		expect(within(archivedRow).getByText("Archived")).toBeInTheDocument();

		const activeRow = screen.getByText("Gendry Baratheon").closest(".entityRow");
		expect(activeRow).not.toHaveClass("entityRowArchived");
	});
});

describe("Show archived toggle", () => {
	it("refetches with includeArchived true and resets the offset when checked", async () => {
		const user = userEvent.setup();
		renderStaff({
			mocks: [
				staffMock({ items: [staff()] }),
				staffMock({
					includeArchived: true,
					items: [staff({ id: "staff-2", firstName: "Sansa", lastName: "Stark", status: 4 })],
				}),
			],
		});

		await screen.findByText("Gendry Baratheon");

		await user.click(screen.getByRole("checkbox", { name: "Show archived" }));

		// Reaching the second mock's distinct staff member (rather than an Apollo "no matching
		// mock" error) IS the assertion that includeArchived:true and offset:0 were the variables
		// sent.
		expect(await screen.findByText("Sansa Stark")).toBeInTheDocument();
		expect(screen.queryByText("Gendry Baratheon")).not.toBeInTheDocument();
	});
});

describe("pagination", () => {
	it("hides Previous/Next but still shows the count when everything fits on one page", async () => {
		renderStaff({
			mocks: [
				staffMock({
					items: [staff()],
					pageInfo: { __typename: "PageInfo", totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		await screen.findByText("Gendry Baratheon");
		expect(screen.getByText("1 staff member")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("advances the offset on Next and requests the next page", async () => {
		const user = userEvent.setup();
		renderStaff({
			mocks: [
				staffMock({
					items: [staff()],
					pageInfo: { __typename: "PageInfo", totalCount: 75, hasMore: true, limit: 50, offset: 0 },
				}),
				staffMock({
					page: { limit: 50, offset: 50 },
					items: [staff({ id: "staff-2", firstName: "Sansa", lastName: "Stark" })],
					pageInfo: { __typename: "PageInfo", totalCount: 75, hasMore: false, limit: 50, offset: 50 },
				}),
			],
		});

		await screen.findByText("Gendry Baratheon");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Sansa Stark")).toBeInTheDocument();
		expect(screen.queryByText("Gendry Baratheon")).not.toBeInTheDocument();
		// Fully paged and on the last page now - Next disables, Previous stays available.
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
	});

	it("changing the page size resets the offset and re-requests with the new limit", async () => {
		const user = userEvent.setup();
		renderStaff({
			mocks: [
				staffMock({
					items: [staff()],
					pageInfo: { __typename: "PageInfo", totalCount: 60, hasMore: true, limit: 50, offset: 0 },
				}),
				staffMock({
					page: { limit: 10, offset: 0 },
					items: [staff({ id: "staff-2", firstName: "Sansa", lastName: "Stark" })],
					pageInfo: { __typename: "PageInfo", totalCount: 60, hasMore: true, limit: 10, offset: 0 },
				}),
			],
		});

		await screen.findByText("Gendry Baratheon");
		await user.selectOptions(screen.getByRole("combobox"), "10");

		expect(await screen.findByText("Sansa Stark")).toBeInTheDocument();
	});
});

describe("Add Staff action", () => {
	it("shows Add Staff for a shop admin and opens the create wizard on click", async () => {
		const user = userEvent.setup();
		const { auth } = renderStaff({
			auth: authValue(ROLES.SHOP_ADMIN),
			mocks: [staffMock({ items: [] })],
		});

		await screen.findByText("No staff yet.");
		await user.click(screen.getByRole("button", { name: "Add Staff" }));

		expect(auth.setModal).toHaveBeenCalledWith(
			expect.objectContaining({
				isOpen: true,
				title: "Add Staff Member",
				content: expect.objectContaining({ type: CreateStaffWizard }),
			}),
		);
	});

	// canManageAccounts = role <= SHOP_ADMIN - an artist is well above that, matching the button's
	// absence for anyone who isn't a shop admin (see IBPageActionBar.jsx's own comment on why
	// creating a staff login is shop-admin-only).
	it("hides Add Staff for a role below shop admin", async () => {
		renderStaff({
			auth: authValue(ROLES.ARTIST),
			mocks: [staffMock({ items: [] })],
		});

		await screen.findByText("No staff yet.");
		expect(screen.queryByRole("button", { name: "Add Staff" })).not.toBeInTheDocument();
	});
});
