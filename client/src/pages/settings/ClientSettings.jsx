import React from "react";
import NotificationSettingsPanel from "../../components/notifications/NotificationSettingsPanel";
import AccountPanel from "../../components/settings/AccountPanel";
import "./settings.css";

/**
 * The first client-facing settings page in the app.
 *
 * Clients have never had one - there was nowhere for them to configure anything, so the question
 * of whether they could turn notifications off had no answer. Built alongside the preferences
 * model rather than retrofitted, which is what makes it small: it reuses the same panel every
 * other role sees, and the panel already resolves the right defaults from the person's role.
 *
 * Deliberately separate from pages/settings/Settings.jsx rather than being a role branch inside
 * it. That page is dense with things a client has no business seeing - shop connection, rates,
 * booking link - and hiding six sections behind conditionals to show one is how a page becomes
 * impossible to reason about. Two small pages beat one page that is mostly hidden.
 */
const ClientSettings = () => (
	<div className="settings">
		<div className="settingsContainer">
			{/* Photo and password, which used to live on the separate /profile page. A client has no
			    calendar to be coloured on, so AccountPanel leaves that section out for them. Without
			    this, removing /profile would have taken away a client's only way to change their own
			    password. */}
			<AccountPanel />
			<NotificationSettingsPanel />
		</div>
	</div>
);

export default ClientSettings;
