// StaffProfile.jsx tests. Same shape as Client.jsx/Client.test.jsx (see that file's own header
// comment) - its own fetchOneStaff query, an edit-on-blur Details form, and the ArchiveControl
// header action - with two differences worth calling out: there is no dashboard hand-off (no
// StaffProfile equivalent of ClientDashboard) and the Details fields are gated by role rather than
// always editable, since updateStaff has a hard SHOP_ADMIN floor server-side with no self-service
// path (see StaffProfile.jsx's own comment on canEditIdentity).
//
// fetchOneStaff isn't separately exported by StaffService (see StaffService.test.js's own note),
// so FETCH_ONE_STAFF_QUERY below is reconstructed field-for-field from the real source purely so
// MockedProvider has a document to match against - it compares by printed text plus variables, not
// reference identity, so this still fails loudly if the real query drifts from what's copied here.
// updateStaff, by contrast, IS used through the real StaffService.updateStaff() call (it just
// returns a fixed document regardless of its argument - see StaffService.test.js's own "ignores
// its argument" test), so UPDATE_STAFF_MUTATION is built the same way StaffProfile.jsx itself gets
// it rather than hand-copied a second time.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { gql } from "@apollo/client";
import StaffProfile from "./StaffProfile";
import StaffService from "../../services/StaffService";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants";

const FETCH_ONE_STAFF_QUERY = gql`
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

const UPDATE_STAFF_MUTATION = StaffService.updateStaff();

function staff(overrides = {}) {
	return {
		__typename: "Staff",
		id: "staff-1",
		firstName: "Gendry",
		lastName: "Baratheon",
		email: "gendry@example.com",
		phone: "5551234567",
		address: "1 Forge Row",
		city: "King's Landing",
		state: "Crownlands",
		zip: "00002",
		instagram: "gendry.tattoos",
		facebook: null,
		avatar: null,
		userId: "user-2",
		title: "Front desk",
		status: null,
		shopId: "shop-1",
		...overrides,
	};
}

function fetchStaffMock(staffId, data) {
	return {
		request: { query: FETCH_ONE_STAFF_QUERY, variables: { staffId } },
		result: { data: { getOneStaff: data } },
	};
}

function updateStaffMock(payload, response) {
	return {
		request: { query: UPDATE_STAFF_MUTATION, variables: { staff: payload } },
		result: { data: { updateStaff: response } },
	};
}

// buildIdentityPayload echoes back shopId/userId/status untouched alongside whatever changed -
// this mirrors that shape exactly so payload objects built for a mock match what StaffProfile.jsx
// actually sends.
function identityPayload(base, overrides = {}) {
	return {
		id: base.id,
		firstName: base.firstName,
		lastName: base.lastName,
		email: base.email,
		phone: base.phone,
		title: base.title,
		address: base.address,
		city: base.city,
		state: base.state,
		zip: base.zip,
		instagram: base.instagram,
		facebook: base.facebook,
		shopId: base.shopId,
		userId: base.userId,
		status: base.status,
		...overrides,
	};
}

function authValue(overrides = {}) {
	return {
		user: { role: ROLES.SHOP_ADMIN, userInfo: { id: "viewer-1" } },
		setAlert: vi.fn(),
		...overrides,
	};
}

function renderStaffProfile({ staffId = "staff-1", mocks = [], auth = authValue() } = {}) {
	const utils = render(
		<MemoryRouter initialEntries={[`/staff/${staffId}`]}>
			<MockedProvider mocks={mocks}>
				<AuthContext.Provider value={auth}>
					<Routes>
						<Route path="/staff/:staffId" element={<StaffProfile />} />
					</Routes>
				</AuthContext.Provider>
			</MockedProvider>
		</MemoryRouter>,
	);
	return { ...utils, auth };
}

describe("loading", () => {
	it("shows the page loader while fetchOneStaff is in flight", () => {
		renderStaffProfile({ mocks: [fetchStaffMock("staff-1", staff())] });

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});
});

describe("not found", () => {
	// StaffProfile.jsx's own final `else` branch: `data` came back falsy (getOneStaff: null)
	// rather than the query erroring, and it renders IBCardShowError directly.
	it("shows an error card when the staff member does not exist", async () => {
		renderStaffProfile({ mocks: [fetchStaffMock("staff-1", null)] });

		expect(await screen.findByText("Something Went Wrong!")).toBeInTheDocument();
		expect(screen.getByText("This staffProfile does not exist.")).toBeInTheDocument();
	});
});

describe("populated, as a shop admin (can edit)", () => {
	it("renders the header and every Details field, all enabled", async () => {
		renderStaffProfile({ mocks: [fetchStaffMock("staff-1", staff())] });

		expect(await screen.findByRole("heading", { name: "Gendry Baratheon" })).toBeInTheDocument();

		// One FormField per Details field, each with a real <label htmlFor> tying it to the
		// underlying MUI-rendered <input id=...> - see FormField.jsx and IBInput.jsx.
		expect(screen.getByLabelText("First Name")).toHaveValue("Gendry");
		expect(screen.getByLabelText("Last Name")).toHaveValue("Baratheon");
		expect(screen.getByLabelText("Email")).toHaveValue("gendry@example.com");
		expect(screen.getByLabelText("Phone")).toHaveValue("5551234567");
		expect(screen.getByLabelText("Title")).toHaveValue("Front desk");
		expect(screen.getByLabelText("Address")).toHaveValue("1 Forge Row");
		expect(screen.getByLabelText("City")).toHaveValue("King's Landing");
		expect(screen.getByLabelText("State")).toHaveValue("Crownlands");
		expect(screen.getByLabelText("Zip")).toHaveValue("00002");
		expect(screen.getByLabelText("Instagram")).toHaveValue("gendry.tattoos");
		expect(screen.getByLabelText("Facebook")).toHaveValue("");

		expect(screen.getByLabelText("First Name")).not.toBeDisabled();
		expect(
			screen.queryByText("Only a shop admin can edit these details."),
		).not.toBeInTheDocument();
	});

	it("shows the Archive control, and archiving refetches the staff member", async () => {
		const user = userEvent.setup();
		renderStaffProfile({
			mocks: [
				fetchStaffMock("staff-1", staff()),
				{
					request: {
						query: StaffService.ARCHIVE_STAFF_MUTATION,
						variables: { staffId: "staff-1" },
					},
					result: { data: { archiveStaff: { __typename: "Staff", id: "staff-1", status: 4 } } },
				},
				// ArchiveControl's onChanged calls refetch() on success - the same query fires
				// again with the same variables and this time comes back archived.
				fetchStaffMock("staff-1", staff({ status: 4 })),
			],
		});

		await screen.findByRole("heading", { name: "Gendry Baratheon" });
		await user.click(screen.getByRole("button", { name: "Archive" }));
		await user.click(screen.getByRole("dialog"));
		await user.click(screen.getByRole("button", { name: "Archive", exact: true }));

		await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
	});

	it("offers Restore instead of Archive once the staff member is archived", async () => {
		renderStaffProfile({ mocks: [fetchStaffMock("staff-1", staff({ status: 4 }))] });

		await screen.findByRole("heading", { name: "Gendry Baratheon" });
		expect(screen.getByText("Archived")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
	});
});

describe("editing identity fields, as a shop admin", () => {
	it("saves on blur only when the field's value actually changed", async () => {
		const user = userEvent.setup();
		const base = staff();
		const updatedPayload = identityPayload(base, { firstName: "Gendry Updated" });
		renderStaffProfile({
			mocks: [
				fetchStaffMock("staff-1", base),
				updateStaffMock(updatedPayload, { __typename: "Staff", ...updatedPayload }),
			],
		});

		const firstName = await screen.findByLabelText("First Name");
		await user.clear(firstName);
		await user.type(firstName, "Gendry Updated");
		await user.tab();

		await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
	});

	it("shows an error state and alerts the server's message when the save fails", async () => {
		const user = userEvent.setup();
		const setAlert = vi.fn();
		const base = staff();
		const updatedPayload = identityPayload(base, { firstName: "Gendry Updated" });
		renderStaffProfile({
			auth: authValue({ setAlert }),
			mocks: [
				fetchStaffMock("staff-1", base),
				{
					request: { query: UPDATE_STAFF_MUTATION, variables: { staff: updatedPayload } },
					error: new Error("Couldn't reach the server"),
				},
			],
		});

		const firstName = await screen.findByLabelText("First Name");
		await user.clear(firstName);
		await user.type(firstName, "Gendry Updated");
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
		renderStaffProfile({ mocks: [fetchStaffMock("staff-1", staff())] });

		const firstName = await screen.findByLabelText("First Name");
		firstName.focus();
		await user.tab();

		// No update mock was registered at all - if handleIdentityFieldBlur fired the mutation
		// anyway, MockedProvider would surface an unmatched-request error and neither indicator
		// below would ever render (StaffProfile.jsx starts identitySaveState at "idle" and only
		// leaves it on an actual send).
		expect(screen.queryByText("Saving...")).not.toBeInTheDocument();
		expect(screen.queryByText("All changes saved")).not.toBeInTheDocument();
		expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
	});
});

describe("viewed by someone below shop admin (read-only)", () => {
	it("disables every Details field and shows the read-only hint", async () => {
		renderStaffProfile({
			auth: authValue({ user: { role: ROLES.ARTIST, userInfo: { id: "viewer-2" } } }),
			mocks: [fetchStaffMock("staff-1", staff())],
		});

		expect(await screen.findByRole("heading", { name: "Gendry Baratheon" })).toBeInTheDocument();
		expect(
			screen.getByText("Only a shop admin can edit these details."),
		).toBeInTheDocument();

		expect(screen.getByLabelText("First Name")).toBeDisabled();
		expect(screen.getByLabelText("Last Name")).toBeDisabled();
		expect(screen.getByLabelText("Email")).toBeDisabled();
		expect(screen.getByLabelText("Phone")).toBeDisabled();
		expect(screen.getByLabelText("Title")).toBeDisabled();
		expect(screen.getByLabelText("Address")).toBeDisabled();
		expect(screen.getByLabelText("City")).toBeDisabled();
		expect(screen.getByLabelText("State")).toBeDisabled();
		expect(screen.getByLabelText("Zip")).toBeDisabled();
		expect(screen.getByLabelText("Instagram")).toBeDisabled();
		expect(screen.getByLabelText("Facebook")).toBeDisabled();
	});

	// ArchiveControl gates itself off user.role internally (returns null above SHOP_ADMIN) - see
	// ArchiveControl.jsx. Worth pinning here too: an artist viewing a staff profile should see
	// neither the identity fields nor the archive action enabled.
	it("hides the Archive control entirely", async () => {
		renderStaffProfile({
			auth: authValue({ user: { role: ROLES.ARTIST, userInfo: { id: "viewer-2" } } }),
			mocks: [fetchStaffMock("staff-1", staff())],
		});

		await screen.findByRole("heading", { name: "Gendry Baratheon" });
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
	});
});
