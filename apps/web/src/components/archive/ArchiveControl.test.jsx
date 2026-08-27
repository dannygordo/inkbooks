// ArchiveControl.jsx tests. See the component's own header comment for why this exists at all:
// there is no delete for an Artist/Staff/Client, only archive/restore, because deleting one left
// projects, appointments and Square invoice ids pointing at nothing. This component is the entire
// UI for that: a button, a confirmation dialog that spells out what's kept, and the two mutations
// that flip the archived flag.
//
// archiveMutation/unarchiveMutation are plain gql documents passed in as PROPS - callers wire in
// their own service's real mutation (e.g. ClientService.ARCHIVE_CLIENT_MUTATION, see
// pages/clients/Client.jsx and Client.test.jsx's own archive-flow test). Because the component
// itself is decoupled from any particular service, these tests use small standalone documents
// rather than reconstructing a real service's - MockedProvider matches by the document's printed
// shape and variables, so any document with the right shape and variables works.
//
// Coverage here is organised around the three things the header comment calls out as deliberate:
//   - shop-admin-only rendering (`user?.role > ROLES.SHOP_ADMIN` returns null), including the
//     edge case of no user at all
//   - the confirmation dialog's copy and the fact that the plain "Archive" button is fully
//     REMOVED (not just covered) while it's open, so there is never more than one queryable
//     "Archive" button at a time
//   - restore needing no confirmation, since it's the undo
//   - the mutation flow itself: success calls onChanged and raises a success alert, failure raises
//     an error alert built from graphQLErrors first and err.message as the fallback
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { gql } from "@apollo/client";
import { GraphQLError } from "graphql";
import ArchiveControl from "./ArchiveControl";
import { AuthContext } from "../../context/auth";
import { ALERT_CONSTANTS, ROLES } from "../../constants";

const ARCHIVE_MUTATION = gql`
	mutation ArchiveArtist($artistId: ID!) {
		archiveArtist(artistId: $artistId) {
			id
			status
		}
	}
`;

const UNARCHIVE_MUTATION = gql`
	mutation UnarchiveArtist($artistId: ID!) {
		unarchiveArtist(artistId: $artistId) {
			id
			status
		}
	}
`;

const VARIABLES = { artistId: "artist-1" };

function archiveMock(extra = {}) {
	return {
		request: { query: ARCHIVE_MUTATION, variables: VARIABLES },
		...extra,
	};
}

function unarchiveMock(extra = {}) {
	return {
		request: { query: UNARCHIVE_MUTATION, variables: VARIABLES },
		...extra,
	};
}

function renderControl({
	mocks = [],
	kind = "artist",
	name = "Gendry Baratheon",
	isArchived = false,
	onChanged,
	user = { id: "admin-1", role: ROLES.SHOP_ADMIN },
	setAlert = vi.fn(),
} = {}) {
	const { container } = render(
		<MockedProvider mocks={mocks}>
			<AuthContext.Provider value={{ user, setAlert }}>
				<ArchiveControl
					kind={kind}
					name={name}
					isArchived={isArchived}
					archiveMutation={ARCHIVE_MUTATION}
					unarchiveMutation={UNARCHIVE_MUTATION}
					variables={VARIABLES}
					onChanged={onChanged}
				/>
			</AuthContext.Provider>
		</MockedProvider>,
	);
	return { setAlert, container };
}

describe("role gating", () => {
	it("renders the Archive button for a shop admin", () => {
		renderControl({ user: { id: "admin-1", role: ROLES.SHOP_ADMIN } });
		expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
	});

	it("renders nothing for an artist (a less-privileged role, numerically higher)", () => {
		const { container } = renderControl({ user: { id: "artist-1", role: ROLES.ARTIST } });
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing for shop staff", () => {
		const { container } = renderControl({ user: { id: "staff-1", role: ROLES.SHOP_STAFF } });
		expect(container).toBeEmptyDOMElement();
	});

	it("renders for the reserved ADMIN role too - lower numbers are more privileged, and ADMIN is 1", () => {
		renderControl({ user: { id: "root-1", role: ROLES.ADMIN } });
		expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
	});

	it("renders when there is no signed-in user at all, since `undefined > SHOP_ADMIN` is false, not true", () => {
		// user?.role is undefined when user is null/undefined, and `undefined > 10` evaluates to
		// false (a NaN comparison), not true - so the guard does NOT hide the control in this case.
		// Documenting the actual behaviour of the code as written, not what might be intended.
		renderControl({ user: null });
		expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
	});
});

describe("archived state", () => {
	it("shows an Archived badge and a Restore button, with no Archive button present", () => {
		renderControl({ isArchived: true });
		expect(screen.getByText("Archived")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
	});

	it("restoring needs no confirmation - clicking Restore calls the unarchive mutation directly", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		const setAlert = vi.fn();
		renderControl({
			isArchived: true,
			onChanged,
			setAlert,
			mocks: [
				unarchiveMock({
					result: { data: { unarchiveArtist: { __typename: "Artist", id: "artist-1", status: 1 } } },
				}),
			],
		});

		await user.click(screen.getByRole("button", { name: "Restore" }));

		await waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Gendry Baratheon restored.",
			}),
		);
	});

	it("shows 'Restoring...' on the button while the restore mutation is in flight", async () => {
		const user = userEvent.setup();
		renderControl({
			isArchived: true,
			mocks: [
				unarchiveMock({
					result: { data: { unarchiveArtist: { __typename: "Artist", id: "artist-1", status: 1 } } },
					// Never resolves during this test - this only checks the in-flight state, so a
					// short delay just races a real resolution against the assertion below on a
					// slow/loaded machine instead of removing the race.
					delay: 60 * 1000,
				}),
			],
		});

		await user.click(screen.getByRole("button", { name: "Restore" }));

		expect(await screen.findByRole("button", { name: "Restoring..." })).toBeDisabled();
	});
});

describe("archiving with confirmation", () => {
	it("clicking Archive opens a confirm dialog and removes the plain Archive button entirely", async () => {
		const user = userEvent.setup();
		renderControl({ kind: "artist", name: "Gendry Baratheon" });

		await user.click(screen.getByRole("button", { name: "Archive" }));

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveTextContent("Archive Gendry Baratheon?");
		// Only the dialog's own "Archive" action button remains queryable - the trigger button is
		// gone from the DOM, not just visually covered, per the component's own comment on why.
		expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(1);
		expect(within(dialog).getByRole("button", { name: "Archive" })).toBeInTheDocument();
	});

	it("mentions booking specifically for an artist, but not for a client", async () => {
		const user = userEvent.setup();
		renderControl({ kind: "artist", name: "Gendry Baratheon" });
		await user.click(screen.getByRole("button", { name: "Archive" }));
		expect(screen.getByRole("dialog")).toHaveTextContent(/so no new work can be booked with them/);
	});

	it("does not mention booking for a client", async () => {
		const user = userEvent.setup();
		renderControl({ kind: "client", name: "Arya Stark" });
		await user.click(screen.getByRole("button", { name: "Archive" }));
		expect(screen.getByRole("dialog")).not.toHaveTextContent(/so no new work can be booked with them/);
	});

	it("always shows the reassurance that past records and revenue are kept", async () => {
		const user = userEvent.setup();
		renderControl({ kind: "staff member", name: "Renee Wolf" });
		await user.click(screen.getByRole("button", { name: "Archive" }));
		expect(screen.getByText(/Nothing they've already done changes/)).toBeInTheDocument();
	});

	it("Cancel closes the dialog and restores the plain Archive button, without calling the mutation", async () => {
		const user = userEvent.setup();
		// No mocks registered at all - if the mutation fired, MockedProvider would surface a "no
		// matching call" error.
		renderControl({ mocks: [] });

		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
	});

	it("confirming calls the archive mutation, then onChanged, then raises a success alert", async () => {
		const user = userEvent.setup();
		const onChanged = vi.fn();
		const setAlert = vi.fn();
		renderControl({
			name: "Gendry Baratheon",
			onChanged,
			setAlert,
			mocks: [
				archiveMock({
					result: { data: { archiveArtist: { __typename: "Artist", id: "artist-1", status: 4 } } },
				}),
			],
		});

		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

		await waitFor(() => expect(onChanged).toHaveBeenCalled());
		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({
				isAlert: true,
				severity: ALERT_CONSTANTS.SEVERITY.SUCCESS,
				message: "Gendry Baratheon archived.",
				location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			}),
		);
		// The confirm dialog closes on success along with the rest of the reset back to the plain
		// (now-archived) state.
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("does not require onChanged - a caller that omits it doesn't crash the success path", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		renderControl({
			onChanged: undefined,
			setAlert,
			mocks: [
				archiveMock({
					result: { data: { archiveArtist: { __typename: "Artist", id: "artist-1", status: 4 } } },
				}),
			],
		});

		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ severity: ALERT_CONSTANTS.SEVERITY.SUCCESS })),
		);
	});

	it("shows 'Archiving...' on the confirm button while the mutation is in flight", async () => {
		const user = userEvent.setup();
		renderControl({
			mocks: [
				archiveMock({
					result: { data: { archiveArtist: { __typename: "Artist", id: "artist-1", status: 4 } } },
					// Never resolves during this test (same reasoning as the "Restoring..." test
					// above) - this only checks the in-flight state.
					delay: 60 * 1000,
				}),
			],
		});

		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

		expect(await screen.findByRole("button", { name: "Archiving..." })).toBeDisabled();
		// The Cancel button is disabled too while busy - there's nothing to cancel back to mid-flight.
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
	});

	it("on a GraphQL error, closes the dialog and raises an alert built from the server's message", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		renderControl({
			setAlert,
			mocks: [
				archiveMock({
					result: { errors: [new GraphQLError("Cannot archive: has upcoming appointments.")] },
				}),
			],
		});

		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					isAlert: true,
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: "Cannot archive: has upcoming appointments.",
				}),
			),
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("falls back to err.message when there are no graphQLErrors (e.g. a network failure)", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		renderControl({
			setAlert,
			mocks: [archiveMock({ error: new Error("Failed to fetch") })],
		});

		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

		await waitFor(() =>
			expect(setAlert).toHaveBeenCalledWith(
				expect.objectContaining({
					severity: ALERT_CONSTANTS.SEVERITY.ERROR,
					message: "Failed to fetch",
				}),
			),
		);
	});
});
