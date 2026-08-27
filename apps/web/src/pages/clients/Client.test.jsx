// Client.jsx tests. Not a thin wrapper: this page owns its own fetchClient query, an
// edit-on-blur Contact Info form, and the ArchiveControl header action, then hands off to
// ClientDashboard (components/clientDashboard/ClientDashboard.jsx) for the stats/projects/
// appointments/notes/flags panel.
//
// ClientDashboard is mocked out with vi.mock rather than exercised for real. It fires its own
// separate set of queries and mutations (fetchClientDashboard, getClientFlagTypes,
// FormService.getForms/getMyFillableForms, UPDATE_CLIENT_NOTES, RAISE_CLIENT_FLAG,
// RESOLVE_CLIENT_FLAG - see ClientDashboard.jsx and ClientService.test.js's own coverage of most
// of those documents) that have nothing to do with what Client.jsx itself is responsible for.
// Mocking it here keeps this file's mocks focused on fetchClient/updateClient/archive, and lets
// this test assert the one thing Client.jsx actually controls about it: that it's mounted with
// the right clientId and isSelf=false. ClientDashboard's own behavior belongs in a test file of
// its own, not duplicated here through a much bigger MockedProvider mock list.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import Client from "./Client";
import ClientDashboard from "../../components/clientDashboard/ClientDashboard";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants";

vi.mock("../../components/clientDashboard/ClientDashboard", () => ({
	default: vi.fn(({ clientId, isSelf }) => (
		<div data-testid="client-dashboard-stub">
			dashboard for {clientId} isSelf={String(isSelf)}
		</div>
	)),
}));

// Reconstructed field-for-field from ClientService.js's _fetchClient (not separately exported,
// same situation FormsPanel.test.jsx documents for ArtistService.fetchArtist) - MockedProvider
// matches by the document's printed shape and variables, not reference identity, so this still
// fails loudly if the real query in ClientService.js drifts from what's copied here.
const FETCH_CLIENT_QUERY = gql`
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

const UPDATE_CLIENT_MUTATION = gql`
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

function client(overrides = {}) {
	return {
		__typename: "Client",
		id: "client-1",
		firstName: "Arya",
		lastName: "Stark",
		email: "arya@example.com",
		phone: "5551234567",
		address: "1 Winterfell Way",
		city: "Winterfell",
		state: "North",
		zip: "00001",
		instagram: "arya.stark",
		facebook: null,
		avatar: null,
		userId: "user-1",
		status: null,
		user: { __typename: "User", avatar: null },
		...overrides,
	};
}

function fetchClientMock(clientId, data) {
	return {
		request: { query: FETCH_CLIENT_QUERY, variables: { clientId } },
		result: { data: { getClient: data } },
	};
}

function updateClientMock(payload, response) {
	return {
		request: { query: UPDATE_CLIENT_MUTATION, variables: { client: payload } },
		result: { data: { updateClient: response } },
	};
}

function authValue(overrides = {}) {
	return {
		user: { role: ROLES.SHOP_ADMIN, userInfo: { id: "viewer-1" } },
		setAlert: vi.fn(),
		...overrides,
	};
}

function renderClient({ clientId = "client-1", mocks = [], auth = authValue() } = {}) {
	const utils = render(
		<MemoryRouter initialEntries={[`/client/${clientId}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={auth}>
					<Routes>
						<Route path="/client/:clientId" element={<Client />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { ...utils, auth };
}

describe("loading", () => {
	it("shows the page loader while fetchClient is in flight", () => {
		renderClient({ mocks: [fetchClientMock("client-1", client())] });

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
});

describe("not found", () => {
	// Client.jsx's own final `else` branch: `data` came back falsy (getClient: null) rather than
	// the query erroring, and it renders IBCardShowError directly rather than delegating to
	// ClientDashboard at all.
	it("shows an error card when the client does not exist", async () => {
		renderClient({ mocks: [fetchClientMock("client-1", null)] });

		expect(await screen.findByText("Something Went Wrong!")).toBeInTheDocument();
		expect(screen.getByText("This client does not exist.")).toBeInTheDocument();
		expect(screen.queryByTestId("client-dashboard-stub")).not.toBeInTheDocument();
	});
});

describe("populated", () => {
	it("renders the header, contact fields, and hands off to ClientDashboard with isSelf=false", async () => {
		renderClient({ mocks: [fetchClientMock("client-1", client())] });

		expect(await screen.findByRole("heading", { name: "Arya Stark" })).toBeInTheDocument();

		// One FormField per contact field, each with a real <label htmlFor> tying it to the
		// underlying MUI-rendered <input id=...> - see FormField.jsx and IBInput.jsx.
		expect(screen.getByLabelText("First Name")).toHaveValue("Arya");
		expect(screen.getByLabelText("Last Name")).toHaveValue("Stark");
		expect(screen.getByLabelText("Email")).toHaveValue("arya@example.com");
		expect(screen.getByLabelText("Address")).toHaveValue("1 Winterfell Way");
		expect(screen.getByLabelText("City")).toHaveValue("Winterfell");
		expect(screen.getByLabelText("State")).toHaveValue("North");
		expect(screen.getByLabelText("Zip")).toHaveValue("00001");
		expect(screen.getByLabelText("Instagram")).toHaveValue("arya.stark");
		expect(screen.getByLabelText("Facebook")).toHaveValue("");

		const dashboard = await screen.findByTestId("client-dashboard-stub");
		expect(dashboard).toHaveTextContent("dashboard for client-1");
		expect(dashboard).toHaveTextContent("isSelf=false");
		// React invokes function components as Component(props, secondArg); for a plain function
		// component secondArg is a literal `undefined`, not an omitted argument (confirmed against
		// react-dom's own source - see Messenger.test.jsx's matching note, which hit the same thing
		// against IBChatBox). expect.anything() explicitly refuses to match null/undefined, so pairing
		// it with that second positional slot always fails. Dropping the second argument doesn't fix it
		// either: vitest's toHaveBeenCalledWith does NOT ignore a trailing undefined call argument the
		// way toEqual ignores undefined object properties, so a one-argument matcher against the real
		// (props, undefined) call still reports a length mismatch. Assert the second argument for what
		// it actually is instead: a literal undefined.
		expect(ClientDashboard).toHaveBeenCalledWith(
			expect.objectContaining({ clientId: "client-1", isSelf: false }),
			undefined,
		);
	});

	it("shows the Archive control for a shop admin, and archiving refetches the client", async () => {
		const user = userEvent.setup();
		const ARCHIVE_CLIENT_MUTATION = gql`
			mutation ArchiveClient($clientId: ID!) {
				archiveClient(clientId: $clientId) {
					id
					status
				}
			}
		`;
		renderClient({
			mocks: [
				fetchClientMock("client-1", client()),
				{
					request: { query: ARCHIVE_CLIENT_MUTATION, variables: { clientId: "client-1" } },
					result: { data: { archiveClient: { __typename: "Client", id: "client-1", status: 4 } } },
				},
				// ArchiveControl's onChanged calls refetch() on success - the same query fires
				// again with the same variables and this time comes back archived.
				fetchClientMock("client-1", client({ status: 4 })),
			],
		});

		await screen.findByRole("heading", { name: "Arya Stark" });
		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(screen.getByRole("dialog"));
		await user.click(screen.getByRole("button", { name: "Archive", exact: true }));

		await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
	});
});

describe("editing contact info", () => {
	it("saves on blur only when the field's value actually changed", async () => {
		const user = userEvent.setup();
		const updatedPayload = {
			id: "client-1",
			firstName: "Arya Updated",
			lastName: "Stark",
			email: "arya@example.com",
			phone: "5551234567",
			address: "1 Winterfell Way",
			city: "Winterfell",
			state: "North",
			zip: "00001",
			instagram: "arya.stark",
			facebook: null,
		};
		renderClient({
			mocks: [
				fetchClientMock("client-1", client()),
				updateClientMock(updatedPayload, { __typename: "Client", ...updatedPayload, avatar: null, userId: "user-1" }),
			],
		});

		const firstName = await screen.findByLabelText("First Name");
		await user.clear(firstName);
		await user.type(firstName, "Arya Updated");
		await user.tab();

		await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
	});

	it("shows an error state and alerts when the save fails", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		const updatedPayload = {
			id: "client-1",
			firstName: "Arya Updated",
			lastName: "Stark",
			email: "arya@example.com",
			phone: "5551234567",
			address: "1 Winterfell Way",
			city: "Winterfell",
			state: "North",
			zip: "00001",
			instagram: "arya.stark",
			facebook: null,
		};
		renderClient({
			auth: authValue({ setAlert }),
			mocks: [
				fetchClientMock("client-1", client()),
				{
					request: { query: UPDATE_CLIENT_MUTATION, variables: { client: updatedPayload } },
					error: new Error("Couldn't reach the server"),
				},
			],
		});

		const firstName = await screen.findByLabelText("First Name");
		await user.clear(firstName);
		await user.type(firstName, "Arya Updated");
		await user.tab();

		await waitFor(() => expect(screen.getByText(/Couldn't save/)).toBeInTheDocument());
		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: "error",
				}),
			),
		);
	});

	it("does not fire a mutation on blur when nothing changed", async () => {
		const user = userEvent.setup();
		renderClient({ mocks: [fetchClientMock("client-1", client())] });

		const firstName = await screen.findByLabelText("First Name");
		firstName.focus();
		await user.tab();

		// No update mock was registered at all - if handleContactFieldBlur fired the mutation
		// anyway, MockedProvider would surface an unmatched-request error and the idle indicator
		// below would never render as "idle" (Client.jsx starts contactSaveState at "idle" and
		// only leaves it on an actual send).
		expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
		expect(screen.queryByText("All changes saved")).not.toBeInTheDocument();
		expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
	});
});
