// IBDisplayPageAlert.jsx tests. A one-line gate in front of IBAlert: it reads only
// `alert.location` off AuthContext and renders <IBAlert /> exactly when that location is
// ALERT_CONSTANTS.DISPLAY_MAIN_PAGE, rendering nothing otherwise.
//
// This split exists because IBAlert is mounted in more than one place (a full-page alert vs. a
// modal-scoped one - see ALERT_CONSTANTS.DISPLAY_MODAL) and each mount point needs to show the
// SAME context alert only when it's meant for that location, not render every alert everywhere it
// could possibly appear. The location check is the entire contract, so it's tested directly
// rather than re-testing IBAlert's own rendering (that's IBAlert.test.jsx's job) - here it's
// enough to confirm IBAlert shows up (or doesn't) as a whole.
//
// IBAlert itself calls useAuth() again once mounted, so the AuthContext.Provider wrapping these
// tests supplies the full { isAlert, severity, message, timeout } shape IBAlert needs too, not
// just `location` - and scrollIntoView is stubbed for the same reason IBAlert.test.jsx stubs it:
// jsdom doesn't implement it, and IBAlert calls it unconditionally on mount.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import IBDisplayPageAlert from "./IBDisplayPageAlert";
import { AuthContext } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

function renderWithLocation(location) {
	const alert = {
		isAlert: true,
		severity: ALERT_CONSTANTS.SEVERITY.INFO,
		message: "Your changes were saved.",
		timeout: null,
		location,
	};
	return render(
		<AuthContext.Provider value={{ alert, setAlert: vi.fn() }}>
			<IBDisplayPageAlert />
		</AuthContext.Provider>,
	);
}

describe("IBDisplayPageAlert", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("renders IBAlert when the alert is targeted at the main page", () => {
		renderWithLocation(ALERT_CONSTANTS.DISPLAY_MAIN_PAGE);

		expect(screen.getByRole("alert")).toHaveTextContent("Your changes were saved.");
	});

	it("renders nothing when the alert is targeted at a modal instead", () => {
		const { container } = renderWithLocation(ALERT_CONSTANTS.DISPLAY_MODAL);

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(container).toBeEmptyDOMElement();
	});

	// No location set at all shouldn't accidentally fall back to showing the alert - "main page"
	// is an explicit opt-in, not the default for anything unset.
	it("renders nothing when the alert has no location set", () => {
		renderWithLocation(undefined);

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});
