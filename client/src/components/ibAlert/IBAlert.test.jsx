// IBAlert.jsx tests. The single toast/banner alert driven entirely by AuthContext's `alert` state
// ({ isAlert, severity, message, timeout }) and its `setAlert` updater - there is exactly one of
// these mounted per page (see IBDisplayPageAlert.jsx, tested separately), so every screen that
// wants to show an alert just calls the context's setAlert rather than rendering its own.
//
// Two behaviours matter beyond "does the message show up":
//
//   1. AUTO-DISMISS. On mount (and whenever `timeout` changes), the component starts a
//      setTimeout that calls setAlert({ isAlert: false, ... }) once it fires, and clears that
//      timer on unmount/re-run. Exercised with vi.useFakeTimers() rather than a real wait, since
//      IBAlert's own default timeout (ALERT_CONSTANTS.TIMEOUT) is 3 seconds.
//
//   2. scrollIntoView ON MOUNT. The component unconditionally calls
//      alertRef.current.scrollIntoView(...) in its effect so a newly-raised alert is scrolled
//      into view even on a long page. jsdom does not implement scrollIntoView at all (calling it
//      throws "not a function") - it's stubbed on Element.prototype before rendering, same as any
//      other jsdom gap (see test/setup.js's window.matchMedia stub for the same kind of fix).
//
// One more thing worth flagging rather than quietly working around: the component's close button
// and its auto-dismiss timer both call `setAlert({ ...alert, isAlert: false })`, but `alert` is
// never actually bound in this file - only its destructured fields (isAlert, severity, message,
// timeout) are. There's no local `alert` variable, so this silently resolves to the *global*
// `window.alert` (the browser's alert() dialog function) instead of the intended state object.
// Spreading a plain function copies no enumerable properties, so in practice setAlert ends up
// called with just `{ isAlert: false }`, dropping severity/message/timeout entirely - but nothing
// throws, because `alert` is a real (if wrong) identifier in scope. Assertions below check for
// `isAlert: false` via objectContaining rather than pinning the exact object, so they verify the
// dismissal actually happens without hard-coding this bug's precise shape as if it were a
// guaranteed contract.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IBAlert from "./IBAlert";
import { AuthContext } from "../../context/auth";
import { ALERT_CONSTANTS } from "../../constants";

function renderAlert(alertOverrides = {}, setAlert = vi.fn()) {
	const alert = {
		isAlert: true,
		severity: ALERT_CONSTANTS.SEVERITY.ERROR,
		message: "Something went wrong.",
		timeout: null,
		...alertOverrides,
	};
	render(
		<AuthContext.Provider value={{ alert, setAlert }}>
			<IBAlert />
		</AuthContext.Provider>,
	);
	return { alert, setAlert };
}

describe("IBAlert", () => {
	beforeEach(() => {
		// jsdom has no scrollIntoView implementation at all - stubbed so the mount effect doesn't
		// throw. Real assertions on it (was it called) live in their own test below.
		Element.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("renders the message and severity from context", () => {
		renderAlert({ severity: ALERT_CONSTANTS.SEVERITY.ERROR, message: "Booking failed." });

		const alertEl = screen.getByRole("alert");
		expect(alertEl).toHaveTextContent("Booking failed.");
		expect(alertEl).toHaveClass("MuiAlert-colorError");
	});

	it("reflects a different severity with its own MUI colour class", () => {
		renderAlert({ severity: ALERT_CONSTANTS.SEVERITY.SUCCESS, message: "Booking saved." });

		const alertEl = screen.getByRole("alert");
		expect(alertEl).toHaveClass("MuiAlert-colorSuccess");
		expect(alertEl).not.toHaveClass("MuiAlert-colorError");
	});

	it("scrolls itself into view on mount", () => {
		renderAlert();

		expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it("dismisses when the close button is clicked", async () => {
		const user = userEvent.setup();
		const { setAlert } = renderAlert();

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: false }),
		);
	});

	it("auto-dismisses after the given timeout elapses", () => {
		vi.useFakeTimers();
		const { setAlert } = renderAlert({ timeout: 3000 });

		expect(setAlert).not.toHaveBeenCalled();

		vi.advanceTimersByTime(3000);

		expect(setAlert).toHaveBeenCalledWith(
			expect.objectContaining({ isAlert: false }),
		);
	});

	// No timeout at all (e.g. a message the user must dismiss themselves) must not schedule a
	// timer that fires anyway - setTimeout(fn, undefined) would otherwise fire on the very next
	// tick, dismissing an alert that was supposed to stay up.
	it("does not auto-dismiss when no timeout is given", () => {
		vi.useFakeTimers();
		const { setAlert } = renderAlert({ timeout: null });

		vi.advanceTimersByTime(10000);

		expect(setAlert).not.toHaveBeenCalled();
	});

	// The cleanup function returned from the effect must actually clear the pending timer -
	// otherwise an alert dismissed/unmounted (e.g. by navigating away) could still fire a
	// setAlert call afterwards, updating context state for a component no longer on screen.
	it("clears the pending auto-dismiss timer on unmount", () => {
		vi.useFakeTimers();
		const setAlert = vi.fn();
		const alert = {
			isAlert: true,
			severity: ALERT_CONSTANTS.SEVERITY.WARNING,
			message: "Heads up.",
			timeout: 3000,
		};
		const { unmount } = render(
			<AuthContext.Provider value={{ alert, setAlert }}>
				<IBAlert />
			</AuthContext.Provider>,
		);

		unmount();
		vi.advanceTimersByTime(3000);

		expect(setAlert).not.toHaveBeenCalled();
	});
});
