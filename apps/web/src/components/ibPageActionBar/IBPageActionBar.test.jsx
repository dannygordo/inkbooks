// IBPageActionBar.jsx tests. This component is a straight switch on `pageType`, rendering one
// heading plus an optional "Add" button that opens a create wizard in the global modal (see
// context/auth's `modal`/`setModal`) - see the component's own header comment for why these used
// to be dead links and now open wizards instead.
//
// The three wizard components (CreateArtistWizard/CreateClientWizard/CreateStaffWizard) are mocked
// out with vi.mock, the same "don't exercise somebody else's component/test" pattern
// Project.test.jsx and AppointmentsList.test.jsx use for their own heavy children - each wizard
// pulls in EntityWizard, AccountService's mutations and BookingSlugField, none of which is this
// component's job to verify. What IS this component's job: which button shows for which role, and
// that clicking it opens the modal with the right title and the right wizard component (with
// onClose/onCreated wired through).
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBPageActionBar from "./IBPageActionBar";
import { AuthContext } from "../../context/auth";
import { ROLES } from "../../constants/auth";
import {
	CreateArtistWizard,
	CreateClientWizard,
	CreateStaffWizard,
} from "../wizards/AccountWizards";

vi.mock("../wizards/AccountWizards", () => ({
	CreateArtistWizard: vi.fn(({ onClose, onCreated }) => (
		<div data-testid="wizard-artist">
			<button onClick={onClose}>close</button>
			<button onClick={onCreated}>created</button>
		</div>
	)),
	CreateClientWizard: vi.fn(({ onClose, onCreated }) => (
		<div data-testid="wizard-client">
			<button onClick={onClose}>close</button>
			<button onClick={onCreated}>created</button>
		</div>
	)),
	CreateStaffWizard: vi.fn(({ onClose, onCreated }) => (
		<div data-testid="wizard-staff">
			<button onClick={onClose}>close</button>
			<button onClick={onCreated}>created</button>
		</div>
	)),
}));

function renderBar({ pageType, user, onCreated = vi.fn() } = {}) {
	const setModal = vi.fn();
	const modal = { isOpen: false, title: "", content: "" };
	render(
		<AuthContext.Provider value={{ user, setModal, modal }}>
			<IBPageActionBar pageType={pageType} onCreated={onCreated} />
		</AuthContext.Provider>,
	);
	return { setModal, onCreated };
}

const SHOP_ADMIN = { id: "admin-1", role: ROLES.SHOP_ADMIN };
const SHOP_STAFF = { id: "staff-1", role: ROLES.SHOP_STAFF };
const ARTIST = { id: "artist-1", role: ROLES.ARTIST };

describe("artists page", () => {
	it("shows the heading and Add Artist button for a shop admin", () => {
		renderBar({ pageType: "artists", user: SHOP_ADMIN });
		expect(screen.getByRole("heading", { name: "Artists" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add Artist" })).toBeInTheDocument();
	});

	it("hides Add Artist for a role below shop admin", () => {
		renderBar({ pageType: "artists", user: SHOP_STAFF });
		expect(screen.getByRole("heading", { name: "Artists" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Add Artist" })).not.toBeInTheDocument();
	});

	it("opens the modal with the CreateArtistWizard and the right title when clicked", async () => {
		const user = userEvent.setup();
		const { setModal, onCreated } = renderBar({ pageType: "artists", user: SHOP_ADMIN });

		await user.click(screen.getByRole("button", { name: "Add Artist" }));

		expect(setModal).toHaveBeenCalledTimes(1);
		const call = setModal.mock.calls[0][0];
		expect(call.isOpen).toBe(true);
		expect(call.title).toBe("Add Artist");
		expect(call.content.type).toBe(CreateArtistWizard);
		expect(call.content.props.onCreated).toBe(onCreated);
		// onClose closes the modal by spreading the CURRENT modal and setting isOpen false - not
		// asserted on `modal` directly here (it's a fixed prop in this test harness), just that a
		// real close handler was actually wired through rather than left undefined.
		expect(typeof call.content.props.onClose).toBe("function");
	});
});

describe("clients page", () => {
	it("shows Add Client for Staff and above (role <= SHOP_STAFF)", () => {
		renderBar({ pageType: "clients", user: SHOP_STAFF });
		expect(screen.getByRole("button", { name: "Add Client" })).toBeInTheDocument();
	});

	it("shows Add Client for a shop admin too", () => {
		renderBar({ pageType: "clients", user: SHOP_ADMIN });
		expect(screen.getByRole("button", { name: "Add Client" })).toBeInTheDocument();
	});

	it("hides Add Client for an artist (role above SHOP_STAFF)", () => {
		renderBar({ pageType: "clients", user: ARTIST });
		expect(screen.queryByRole("button", { name: "Add Client" })).not.toBeInTheDocument();
	});

	it("opens the modal with the CreateClientWizard when clicked", async () => {
		const user = userEvent.setup();
		const { setModal } = renderBar({ pageType: "clients", user: SHOP_STAFF });

		await user.click(screen.getByRole("button", { name: "Add Client" }));

		const call = setModal.mock.calls[0][0];
		expect(call.title).toBe("Add Client");
		expect(call.content.type).toBe(CreateClientWizard);
	});
});

describe("staff page", () => {
	it("shows Add Staff for a shop admin", () => {
		renderBar({ pageType: "staff", user: SHOP_ADMIN });
		expect(screen.getByRole("button", { name: "Add Staff" })).toBeInTheDocument();
	});

	it("hides Add Staff for plain staff", () => {
		renderBar({ pageType: "staff", user: SHOP_STAFF });
		expect(screen.queryByRole("button", { name: "Add Staff" })).not.toBeInTheDocument();
	});

	it("opens the modal with the CreateStaffWizard when clicked", async () => {
		const user = userEvent.setup();
		const { setModal } = renderBar({ pageType: "staff", user: SHOP_ADMIN });

		await user.click(screen.getByRole("button", { name: "Add Staff" }));

		const call = setModal.mock.calls[0][0];
		expect(call.title).toBe("Add Staff Member");
		expect(call.content.type).toBe(CreateStaffWizard);
	});
});

describe("projects and shops pages", () => {
	it("renders only the Projects heading, with no Add button at all", () => {
		renderBar({ pageType: "projects", user: SHOP_ADMIN });
		expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("renders only the Shops heading, with no Add button at all", () => {
		renderBar({ pageType: "shops", user: SHOP_ADMIN });
		expect(screen.getByRole("heading", { name: "Shops" })).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("an unknown pageType", () => {
	it("renders the fallback message", () => {
		renderBar({ pageType: "something-unrecognized", user: SHOP_ADMIN });
		expect(screen.getByText("Unknown page type")).toBeInTheDocument();
	});
});

describe("closing the modal", () => {
	it("wires onClose to close the currently open modal", async () => {
		const userEv = userEvent.setup();
		const setModal = vi.fn();
		const modal = { isOpen: true, title: "Add Artist", content: "" };
		render(
			<AuthContext.Provider value={{ user: SHOP_ADMIN, setModal, modal }}>
				<IBPageActionBar pageType="artists" onCreated={vi.fn()} />
			</AuthContext.Provider>,
		);

		await userEv.click(screen.getByRole("button", { name: "Add Artist" }));
		const opened = setModal.mock.calls[0][0];
		// Simulate the wizard calling its own onClose - it should close by spreading the CURRENT
		// modal object and forcing isOpen false, matching openWizard's own closeModal.
		opened.content.props.onClose();

		expect(setModal).toHaveBeenLastCalledWith({ ...modal, isOpen: false });
	});
});
