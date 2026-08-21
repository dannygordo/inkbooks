// Clients.jsx tests. This page replaced a grid of IBCard tiles with EntityList/EntityListPager
// built directly off ClientService.fetchClients - see Clients.jsx's own header comment. The gql
// document below is reconstructed field-for-field from ClientService.js's _fetchClients (which,
// like _fetchClient, isn't separately exported the way FETCH_CLIENT_DASHBOARD is) purely so
// MockedProvider has something to match against - it compares a request by the document's printed
// text plus variables, not by reference identity, so this still fails loudly if the real query in
// ClientService.js ever drifts from what's copied here. Same approach ClientService.test.js and
// FormsPanel.test.jsx already take for their own un-exported queries.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import { gql } from "@apollo/client";
import Clients from "./Clients";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants";
import { CreateClientWizard } from "../../components/wizards/AccountWizards";

const FETCH_CLIENTS_QUERY = gql`
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

// Clients.jsx always calls fetchClients(showArchived, { limit, offset }) - never with an
// undefined page the way a bare ClientService.fetchClients() call could - so every mock here
// supplies both variables explicitly, defaulting to the page's own initial state (PAGE_SIZE=50,
// offset 0).
function clientsMock({ includeArchived = false, page = { limit: 50, offset: 0 }, items, pageInfo }) {
	return {
		request: { query: FETCH_CLIENTS_QUERY, variables: { includeArchived, page } },
		result: {
			data: {
				getClients: {
					__typename: "ClientPage",
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

function client(overrides = {}) {
	return {
		__typename: "Client",
		id: "client-1",
		firstName: "Arya",
		lastName: "Stark",
		email: "arya@example.com",
		phone: "5551234567",
		address: null,
		city: "Winterfell",
		state: "North",
		zip: "00001",
		instagram: "arya.stark",
		facebook: "arya.stark.fb",
		avatar: null,
		userId: "user-1",
		status: null,
		...overrides,
	};
}

// The active user driving IBPageActionBar's own role gate (canAddClients = role <= SHOP_STAFF) -
// see IBPageActionBar.jsx. setModal/modal are spied on so a click on "Add Client" can be asserted
// without needing the global modal host that would actually render CreateClientWizard.
function authValue(role, overrides = {}) {
	return {
		user: { role, userInfo: { id: "viewer-1" } },
		setModal: vi.fn(),
		modal: { isOpen: false },
		setAlert: vi.fn(),
		...overrides,
	};
}

function renderClients({ mocks = [], auth = authValue(ROLES.SHOP_ADMIN), route = "/clients" } = {}) {
	function ClientIdProbe() {
		const { clientId } = useParams();
		return <div>Client Detail Page for {clientId}</div>;
	}
	const utils = render(
		<MemoryRouter initialEntries={[route]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={auth}>
					<Routes>
						<Route path="/clients" element={<Clients />} />
						<Route path="/client/:clientId" element={<ClientIdProbe />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { ...utils, auth };
}

describe("loading", () => {
	it("shows the page loader while the query is in flight", () => {
		renderClients({ mocks: [clientsMock({ items: [client()] })] });

		// Asserted synchronously, before the mocked response has had a chance to resolve -
		// IBPageLoader (see its own file) renders MUI's CircularProgress with this text as its
		// child, matching APP_SETTINGS_CONSTANTS.LOADING_TEXT.
		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
});

describe("empty state", () => {
	it("shows the empty message when the shop has no clients", async () => {
		renderClients({ mocks: [clientsMock({ items: [] })] });

		expect(await screen.findByText("No clients yet.")).toBeInTheDocument();
	});

	// Clients.jsx destructures only { loading, data, refetch } off fetchClients - there is no
	// `error` branch at all, so a query error falls through the same `data?.getClients?.items ||
	// []` default an empty result does. Worth pinning explicitly: it's easy to assume an errored
	// query would show *something* different, and it doesn't.
	it("falls through to the empty state on a query error, rather than crashing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		renderClients({
			mocks: [
				{
					request: {
						query: FETCH_CLIENTS_QUERY,
						variables: { includeArchived: false, page: { limit: 50, offset: 0 } },
					},
					error: new Error("network down"),
				},
			],
		});

		expect(await screen.findByText("No clients yet.")).toBeInTheDocument();
		spy.mockRestore();
	});
});

describe("populated list", () => {
	it("renders each client's row fields", async () => {
		renderClients({
			mocks: [
				clientsMock({
					items: [
						client(),
						client({
							id: "client-2",
							firstName: "Gendry",
							lastName: "Baratheon",
							email: "gendry@example.com",
							phone: "5559876543",
							city: null,
							state: null,
							instagram: null,
							facebook: null,
						}),
					],
				}),
			],
		});

		expect(await screen.findByText("Arya Stark")).toBeInTheDocument();
		expect(screen.getByText("arya@example.com")).toBeInTheDocument();
		expect(screen.getByText("Winterfell, North")).toBeInTheDocument();
		expect(screen.getByText("arya.stark")).toBeInTheDocument();
		expect(screen.getByText("arya.stark.fb")).toBeInTheDocument();

		// Second row has no city/state/instagram/facebook - EntityList renders an em dash rather
		// than a blank cell for each missing value (see EntityList.jsx's own comment on why).
		expect(screen.getByText("Gendry Baratheon")).toBeInTheDocument();
		const gendryRow = screen.getByText("Gendry Baratheon").closest(".entityRow");
		expect(within(gendryRow).getAllByText("—").length).toBeGreaterThanOrEqual(3);
	});

	it("mutes and labels an archived row", async () => {
		const user = userEvent.setup();
		renderClients({
			auth: authValue(ROLES.SHOP_ADMIN, {}),
			mocks: [
				// The initial, unchecked render (includeArchived: false) - answered first.
				clientsMock({ items: [client()] }),
				// What the "Show archived" toggle below switches to - a shop's archived query
				// includes both active and archived records, which is what makes the archived
				// styling worth asserting against a mixed list rather than an archived-only one.
				clientsMock({
					includeArchived: true,
					items: [client(), client({ id: "client-2", firstName: "Gendry", lastName: "Baratheon", status: 4 })],
				}),
			],
		});

		await screen.findByText("Arya Stark");
		await user.click(screen.getByRole("checkbox", { name: "Show archived" }));

		await screen.findByText("Gendry Baratheon");
		const archivedRow = screen.getByText("Gendry Baratheon").closest(".entityRow");
		expect(archivedRow).toHaveClass("entityRowArchived");
		expect(within(archivedRow).getByText("Archived")).toBeInTheDocument();

		const activeRow = screen.getByText("Arya Stark").closest(".entityRow");
		expect(activeRow).not.toHaveClass("entityRowArchived");
	});
});

describe("Show archived toggle", () => {
	it("refetches with includeArchived true and resets the offset when checked", async () => {
		const user = userEvent.setup();
		renderClients({
			mocks: [
				clientsMock({ items: [client()] }),
				clientsMock({
					includeArchived: true,
					items: [client({ id: "client-2", firstName: "Gendry", lastName: "Baratheon", status: 4 })],
				}),
			],
		});

		await screen.findByText("Arya Stark");

		await user.click(screen.getByRole("checkbox", { name: "Show archived" }));

		// Reaching the second mock's distinct client (rather than an Apollo "no matching mock"
		// error) IS the assertion that includeArchived:true and offset:0 were the variables sent -
		// same pattern ClientService.test.js's own fetchClients tests use.
		expect(await screen.findByText("Gendry Baratheon")).toBeInTheDocument();
		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
	});
});

describe("pagination", () => {
	it("hides Previous/Next but still shows the count when everything fits on one page", async () => {
		renderClients({
			mocks: [
				clientsMock({
					items: [client()],
					pageInfo: { __typename: "PageInfo", totalCount: 1, hasMore: false, limit: 50, offset: 0 },
				}),
			],
		});

		await screen.findByText("Arya Stark");
		expect(screen.getByText("1 client")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
	});

	it("advances the offset on Next and requests the next page", async () => {
		const user = userEvent.setup();
		renderClients({
			mocks: [
				clientsMock({
					items: [client()],
					pageInfo: { __typename: "PageInfo", totalCount: 75, hasMore: true, limit: 50, offset: 0 },
				}),
				clientsMock({
					page: { limit: 50, offset: 50 },
					items: [client({ id: "client-2", firstName: "Gendry", lastName: "Baratheon" })],
					pageInfo: { __typename: "PageInfo", totalCount: 75, hasMore: false, limit: 50, offset: 50 },
				}),
			],
		});

		await screen.findByText("Arya Stark");
		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(await screen.findByText("Gendry Baratheon")).toBeInTheDocument();
		expect(screen.queryByText("Arya Stark")).not.toBeInTheDocument();
		// Fully paged and on the last page now - Next disables, Previous stays available.
		expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
	});

	it("changing the page size resets the offset and re-requests with the new limit", async () => {
		const user = userEvent.setup();
		renderClients({
			mocks: [
				clientsMock({
					items: [client()],
					pageInfo: { __typename: "PageInfo", totalCount: 60, hasMore: true, limit: 50, offset: 0 },
				}),
				clientsMock({
					page: { limit: 10, offset: 0 },
					items: [client({ id: "client-2", firstName: "Gendry", lastName: "Baratheon" })],
					pageInfo: { __typename: "PageInfo", totalCount: 60, hasMore: true, limit: 10, offset: 0 },
				}),
			],
		});

		await screen.findByText("Arya Stark");
		await user.selectOptions(screen.getByRole("combobox"), "10");

		expect(await screen.findByText("Gendry Baratheon")).toBeInTheDocument();
	});
});

describe("Add Client action", () => {
	it("shows Add Client for a shop admin and opens the create wizard on click", async () => {
		const user = userEvent.setup();
		const { auth } = renderClients({
			auth: authValue(ROLES.SHOP_ADMIN),
			mocks: [clientsMock({ items: [] })],
		});

		await screen.findByText("No clients yet.");
		await user.click(screen.getByRole("button", { name: "Add Client" }));

		expect(auth.setModal).toHaveBeenCalledWith(
			expect.objectContaining({
				isOpen: true,
				title: "Add Client",
				content: expect.objectContaining({ type: CreateClientWizard }),
			}),
		);
	});

	it("hides Add Client for a role above shop staff", async () => {
		renderClients({
			auth: authValue(ROLES.ARTIST),
			mocks: [clientsMock({ items: [] })],
		});

		await screen.findByText("No clients yet.");
		expect(screen.queryByRole("button", { name: "Add Client" })).not.toBeInTheDocument();
	});
});

describe("navigating to a client", () => {
	it("navigates to the client detail route when a row is clicked", async () => {
		const user = userEvent.setup();
		renderClients({ mocks: [clientsMock({ items: [client()] })] });

		await screen.findByText("Arya Stark");
		await user.click(screen.getByText("Arya Stark").closest(".entityRow"));

		expect(await screen.findByText("Client Detail Page for client-1")).toBeInTheDocument();
	});
});
