import React, { useContext } from "react";
import { useLocation, useParams, Navigate } from "react-router-dom";
import { AuthContext } from "../context/auth";
import { ROUTE_CONSTANTS } from "../constants";

/**
 * AuthRoute with a minimum-role requirement on top.
 *
 * AuthRoute only ever asked "is anyone logged in?", so every gated area of the app was gated by
 * hiding its nav item in Sidebar.jsx and nothing else - typing the URL still rendered the page.
 * That was fine while the server-side resolvers were the real gate (see the standing note in
 * Sidebar.jsx about hidden-nav not being a security fix), but it produces a bad failure mode now
 * that those resolvers actually deny: the page mounts, fires its query, and the user gets a raw
 * "Action not allowed" GraphQL error where a page should be. This redirects instead.
 *
 * This is still NOT the security boundary - the resolvers are. It exists so that being denied
 * looks like being denied rather than looking broken.
 *
 * Roles are numeric and lower is more privileged (ADMIN 1 / SHOP_ADMIN 10 / STAFF 15 / ARTIST 20 /
 * CLIENT 30 - see constants/auth.js), so "at least this privileged" is `role <= minRole`, matching
 * the same convention used server-side in utils/with-auth.js.
 *
 * @param {number} minRole - the least privileged role allowed through
 * @param {(user: object, params: object) => boolean} [allowIf] - an escape hatch for rules a flat
 *   role check can't express, e.g. "or it's your own artist page". Receives the matched route's
 *   params. Checked first; if it returns true the role requirement is skipped entirely.
 */
function RoleRoute({ children, minRole, allowIf }) {
	const { user } = useContext(AuthContext);
	const location = useLocation();
	// Read here rather than passed in from App.jsx: RoleRoute renders inside the matched <Route>,
	// so it has access to that route's own params, which is what "is this your own page?" needs.
	const params = useParams();

	if (!user) {
		return <Navigate to="/login" state={{ from: location }} replace />;
	}

	if (allowIf && allowIf(user, params)) {
		return children;
	}

	if (user.role > minRole) {
		// Home, not /login - the user is perfectly well authenticated, they just can't be here.
		// Sending them to a login screen they're already past would read as a session bug.
		return <Navigate to={ROUTE_CONSTANTS.HOME} replace />;
	}

	return children;
}

export default RoleRoute;
