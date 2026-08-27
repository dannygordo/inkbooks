// ClientSettings.jsx tests. Per its own header comment this is deliberately a tiny page - "two
// small pages beat one page that is mostly hidden" - that just puts AccountPanel and
// NotificationSettingsPanel (the two sections a client is allowed) on screen, unconditionally and
// with no props of its own. AccountPanel already has its own test file
// (components/settings/AccountPanel.test.jsx) covering its client-vs-artist branching, so both
// panels are mocked out here to markers: what belongs to THIS test file is only "does the client
// settings page render both of the sections a client is supposed to have, and nothing else" -
// mirroring AppointmentsList.test.jsx's convention of mocking out heavy children that have their
// own dedicated test files.
//
// Explicit React import - see the matching note in pages/login/Login.test.jsx.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ClientSettings from "./ClientSettings";

vi.mock("../../components/settings/AccountPanel", () => ({
	default: () => <div data-testid="account-panel">AccountPanel</div>,
}));
vi.mock("../../components/notifications/NotificationSettingsPanel", () => ({
	default: () => <div data-testid="notification-settings-panel">NotificationSettingsPanel</div>,
}));

describe("ClientSettings", () => {
	it("renders both AccountPanel and NotificationSettingsPanel", () => {
		render(<ClientSettings />);

		expect(screen.getByTestId("account-panel")).toBeInTheDocument();
		expect(screen.getByTestId("notification-settings-panel")).toBeInTheDocument();
	});

	it("renders AccountPanel before NotificationSettingsPanel", () => {
		render(<ClientSettings />);

		const account = screen.getByTestId("account-panel");
		const notifications = screen.getByTestId("notification-settings-panel");
		// DOCUMENT_POSITION_FOLLOWING means `notifications` comes after `account` in the tree - the
		// photo/password section (moved here from the old /profile page, per the header comment)
		// stays above notification preferences.
		expect(
			account.compareDocumentPosition(notifications) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("takes no props - a client always sees the same fixed page", () => {
		// Renders without throwing and without any prop at all, confirming this is a plain
		// role-specific page rather than one that branches on something passed in from a parent
		// route (unlike Settings.jsx, which is handed a category via the URL).
		expect(() => render(<ClientSettings />)).not.toThrow();
	});

	it("does not render anything shop-, rate-, or booking-related - a client has no business seeing those", () => {
		render(<ClientSettings />);

		expect(screen.queryByTestId("shop-panel")).not.toBeInTheDocument();
		expect(screen.queryByText(/Shop Connection/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Booth Rent/i)).not.toBeInTheDocument();
	});
});
