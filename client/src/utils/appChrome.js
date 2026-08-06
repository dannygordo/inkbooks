import { ROUTE_CONSTANTS } from "../constants/app";

/**
 * Whether a route gets the sidebar and header.
 *
 * A SEPARATE MODULE FROM App.jsx so the rule can be tested without mounting the app. App pulls in
 * SocketProvider, the auth context's Firebase client and every routed page; a test that rendered it
 * to find out whether a nav bar is showing would be testing all of that instead. The rule is one
 * boolean, so it lives where a boolean can be checked.
 */

/**
 * Routes that render bare, even for a signed-in user.
 *
 * ONBOARDING IS THE ONLY ONE, and it needs listing because "signed in" stopped being the same
 * question as "in the app". The signup wizard creates the account at step two so the later steps
 * can save through authenticated mutations - which leaves somebody logged in for the back half of a
 * setup they haven't finished. Chrome keyed on the user alone put a full sidebar and header around
 * step three: navigation into an app that isn't configured yet, offered halfway through
 * configuring it.
 *
 * Every other bare route (/login, /book/:handle, /set-password/:token) is unauthenticated by
 * nature, so the user check already covers it. Those are absent here deliberately rather than
 * forgotten - listing them would imply the list is what hides them, and quietly break the day one
 * of them started allowing a session.
 */
export const CHROMELESS_ROUTES = new Set([ROUTE_CONSTANTS.REGISTER]);

/**
 * A ROUTE LIST RATHER THAN A FLAG ON THE AUTH CONTEXT, deliberately. A flag would be a second place
 * that has to be told the wizard finished - and it would be wrong for the whole of any session that
 * closed the tab mid-setup and came back, since nothing would ever clear it. The URL already knows.
 */
export function shouldShowChrome(user, pathname) {
	return Boolean(user) && !CHROMELESS_ROUTES.has(pathname);
}
