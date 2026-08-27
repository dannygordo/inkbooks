import { ROLES } from "../constants/auth";

/**
 * Whether `user` may open/manage a specific appointment - the client-side mirror of the server's
 * canManageArtist default floor (server/utils/shop-membership.js), which getProject,
 * getAppointmentsByProject, updateAppointment and the session-timer mutations all enforce for an
 * appointment that isn't the caller's own.
 *
 * PRESENTATION ONLY. This does not grant or restrict anything by itself - the server is what
 * actually enforces it, on every one of those resolvers, regardless of what this function says.
 * Its only job is to keep the UI honest about what it's about to be refused for: a fellow artist
 * could always click through to another artist's appointment and land on a real "Action not
 * allowed" error a few requests later (see the getChargeQuote incident this was written for) -
 * this is what stops the click from being offered in the first place.
 *
 * Allowed: the appointment's own artist, or a shop admin (role <= SHOP_ADMIN). A fellow artist
 * and even shop STAFF (role 15) are not - matching canManageArtist's default minRole, which is
 * SHOP_ADMIN rather than the looser SHOP_STAFF floor some other checks use. This intentionally
 * does NOT check shop membership the way the server's sharesShopWith does - a shop admin viewing
 * their own shop's appointments list is already scoped to their own shop by the query that fetched
 * it, so there is no cross-shop case for this function to get wrong.
 */
export function canManageAppointment(user, appointment) {
	if (!appointment || !user) {
		return false;
	}
	const ownerId = appointment.userId || appointment.user?.id;
	if (ownerId && String(user.id) === String(ownerId)) {
		return true;
	}
	return Boolean(user.role) && user.role <= ROLES.SHOP_ADMIN;
}
