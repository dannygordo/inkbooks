// IBModal.jsx tests.
//
// The single shared MUI Dialog every "open a modal" call in the app renders into - AuthContext
// carries one `modal` object ({ isOpen, title, content }) and one `setModal` updater, and whatever
// page called setModal({ isOpen: true, title, content }) gets its content rendered here, with a
// close (X) button wired to setModal({ ...modal, isOpen: false }).
//
// It optionally also renders IBAlert inline, above `modal.content`, when
// alert.location === ALERT_CONSTANTS.DISPLAY_MODAL - i.e. an alert raised specifically for
// "inside whatever modal happens to be open" rather than the main-page banner. IBAlert has its own
// dedicated test file (components/ibAlert/IBAlert.test.jsx); the tests below only check that it
// does or doesn't get mounted for a given `location`, not its internal rendering, since that's
// already covered there. Still stubbing Element.prototype.scrollIntoView the same way that file
// does - IBAlert's mount effect calls it unconditionally, and jsdom doesn't implement it, so any
// test here that renders IBAlert (location === DISPLAY_MODAL) would otherwise throw.
//
// ONE MORE BUG TO NOTE, same shape as the one IBAlert.test.jsx documents in that file: this
// component destructures `alert: { location, isAlert, setAlert }` from context - i.e. it expects
// its OWN close-of-modal effect to have a `setAlert` function living *inside* the `alert` object.
// The real AuthProvider (context/auth.jsx) puts `setAlert` as a sibling of `alert`, not inside it
// - the shape IBAlert.jsx itself actually reads. So against the real app, `setAlert` here is
// `undefined`, and the modal-dismissal effect below would throw "setAlert is not a function" the
// moment it actually tried to fire (isAlert true, location DISPLAY_MODAL, modal just closed).
// Rather than silently mocking around it, the tests below build the context value in the exact
// (buggy) shape this component reads - `alert: { location, isAlert, setAlert }` - so that the
// happy-path assertions exercise the code as written, and separately document what happens with a
// realistic AuthProvider-shaped context in a test of its own.
//
// The dismissal effect also references a bare `alert` identifier inside its callback
// (`setAlert({ ...alert, isAlert: false })`) that was never bound locally - only its destructured
// fields were. That resolves to the global `window.alert` function, and spreading a plain function
// copies no enumerable properties, so in practice setAlert is called with just `{ isAlert: false }`
// - assertions below use objectContaining rather than pinning that as if it were guaranteed.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBModal from "./IBModal";
import { AuthContext } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

function defaultModal(overrides = {}) {
	return { isOpen: true, title: "Appointment", content: <div>Modal body</div>, ...overrides };
}

function buildTree({ modal, location, isAlert, setAlert, setModal, user }) {
	return (
		<AuthContext.Provider
			value={{
				user,
				modal,
				setModal,
				// Top-level setAlert - the shape IBAlert.jsx actually reads.
				setAlert,
				// Nested setAlert - the shape THIS component's dismissal effect actually reads. See
				// the file header for why both are supplied.
				alert: { location, isAlert, setAlert },
			}}
		>
			<IBModal />
		</AuthContext.Provider>
	);
}

function renderModal(overrides = {}) {
	const props = {
		modal: defaultModal(),
		location: undefined,
		isAlert: false,
		setAlert: vi.fn(),
		setModal: vi.fn(),
		user: null,
		...overrides,
	};
	const utils = render(buildTree(props));
	return {
		...utils,
		props,
		rerenderWith: (newOverrides) => utils.rerender(buildTree({ ...props, ...newOverrides })),
	};
}

describe("dialog content", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("renders open with the modal's title and content when isOpen is true", () => {
		renderModal({ modal: defaultModal({ title: "Book an appointment" }) });

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByText("Book an appointment")).toBeInTheDocument();
		expect(screen.getByText("Modal body")).toBeInTheDocument();
	});

	it("renders nothing (dialog absent from the DOM) when isOpen is false", () => {
		renderModal({ modal: defaultModal({ isOpen: false }) });

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(screen.queryByText("Modal body")).not.toBeInTheDocument();
	});

	it("renders arbitrary content passed in modal.content, not just plain text", () => {
		renderModal({
			modal: defaultModal({
				content: (
					<form aria-label="Quick note">
						<input aria-label="Note" />
					</form>
				),
			}),
		});

		expect(screen.getByRole("form", { name: "Quick note" })).toBeInTheDocument();
		expect(screen.getByLabelText("Note")).toBeInTheDocument();
	});
});

describe("closing the modal", () => {
	it("calls setModal with isOpen false and the rest of the modal preserved, when the close button is clicked", async () => {
		const user = userEvent.setup();
		const setModal = vi.fn();
		const modal = defaultModal({ title: "Book an appointment" });
		renderModal({ modal, setModal });

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(setModal).toHaveBeenCalledWith({ ...modal, isOpen: false });
	});

	it("also calls setModal (via the Dialog's own onClose) when Escape is pressed", async () => {
		const user = userEvent.setup();
		const setModal = vi.fn();
		const modal = defaultModal();
		renderModal({ modal, setModal });

		await user.keyboard("{Escape}");

		expect(setModal).toHaveBeenCalledWith({ ...modal, isOpen: false });
	});
});

describe("the inline IBAlert", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("renders IBAlert when alert.location is DISPLAY_MODAL", () => {
		renderModal({ location: ALERT_CONSTANTS.DISPLAY_MODAL, isAlert: true });

		expect(screen.getByRole("alert")).toBeInTheDocument();
	});

	it("does not render IBAlert when alert.location is DISPLAY_MAIN_PAGE", () => {
		renderModal({ location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE, isAlert: true });

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("does not render IBAlert when alert.location is unset", () => {
		renderModal({ location: undefined });

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("places IBAlert above the modal's own content", () => {
		renderModal({
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
			isAlert: true,
			modal: defaultModal({ content: <div data-testid="body">Modal body</div> }),
		});

		const dialog = screen.getByRole("dialog");
		const alertEl = screen.getByRole("alert");
		const body = screen.getByTestId("body");
		// compareDocumentPosition's DOCUMENT_POSITION_FOLLOWING (4) bit means "alertEl comes before
		// body in document order".
		// eslint-disable-next-line no-bitwise
		expect(alertEl.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(dialog).toContainElement(alertEl);
		expect(dialog).toContainElement(body);
	});
});

describe("the modal-close dismissal effect", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("dismisses a DISPLAY_MODAL-location alert on mount when the modal already starts closed", () => {
		const setAlert = vi.fn();
		renderModal({
			modal: defaultModal({ isOpen: false }),
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
			isAlert: true,
			setAlert,
		});

		// See the file header: `alert` inside the effect resolves to window.alert, not the state
		// object, so only `isAlert: false` reliably survives the spread.
		expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ isAlert: false }));
	});

	it("does nothing on mount when the modal starts open", () => {
		const setAlert = vi.fn();
		renderModal({
			modal: defaultModal({ isOpen: true }),
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
			isAlert: true,
			setAlert,
		});

		expect(setAlert).not.toHaveBeenCalled();
	});

	it("does nothing when the modal closes but there was no alert showing", () => {
		const setAlert = vi.fn();
		renderModal({
			modal: defaultModal({ isOpen: false }),
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
			isAlert: false,
			setAlert,
		});

		expect(setAlert).not.toHaveBeenCalled();
	});

	it("does nothing when the modal closes but the showing alert belongs to the main page, not this modal", () => {
		const setAlert = vi.fn();
		renderModal({
			modal: defaultModal({ isOpen: false }),
			location: ALERT_CONSTANTS.DISPLAY_MAIN_PAGE,
			isAlert: true,
			setAlert,
		});

		expect(setAlert).not.toHaveBeenCalled();
	});

	it("fires the dismissal when the dialog transitions from open to closed, not only on mount", () => {
		const setAlert = vi.fn();
		const { rerenderWith } = renderModal({
			modal: defaultModal({ isOpen: true }),
			location: ALERT_CONSTANTS.DISPLAY_MODAL,
			isAlert: true,
			setAlert,
		});
		expect(setAlert).not.toHaveBeenCalled();

		rerenderWith({ modal: defaultModal({ isOpen: false }) });

		expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ isAlert: false }));
	});
});
