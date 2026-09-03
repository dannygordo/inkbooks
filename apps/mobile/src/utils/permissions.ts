import { ROLES } from '@/constants/auth';

type AppointmentOwnerLike = {
	userId?: string | null;
	user?: { id?: string | null } | null;
} | null | undefined;

type UserLike = {
	id: string;
	role?: number | null;
} | null | undefined;

/**
 * Direct port of apps/web/src/utils/permissions.js's canManageAppointment - see that file's own
 * comment for the full reasoning. PRESENTATION ONLY: this gates whether the appointments list
 * offers opening a row at all, so a fellow artist never sees a tap land on a server-refused
 * request a few round trips later - it grants nothing by itself. The server enforces the real
 * floor independently on getProject/getAppointmentsByProject/updateAppointment/the session-timer
 * mutations.
 *
 * Allowed: the appointment's own artist, or a shop admin (role <= SHOP_ADMIN). A fellow artist,
 * and even shop staff (role 15), are not - matching the server's canManageArtist default minRole.
 */
export function canManageAppointment(user: UserLike, appointment: AppointmentOwnerLike): boolean {
	if (!appointment || !user) {
		return false;
	}
	const ownerId = appointment.userId || appointment.user?.id;
	if (ownerId && String(user.id) === String(ownerId)) {
		return true;
	}
	return Boolean(user.role) && (user.role as number) <= ROLES.SHOP_ADMIN;
}

/**
 * Direct port of apps/web's Sidebar.jsx `isShopAdminOrBetter` inline check - gates which nav
 * entry points a shop-admin-only screen even shows up as. Shop Cut Confirmations is the first
 * mobile screen that needs this (see DECISIONS.md X21) - every prior header link (Clients,
 * Projects, Requests, Messages) is shown to any logged-in artist, matching web's own `!isClient`
 * gate rather than a role floor, since mobile has no client login at all yet (X15's own note).
 */
export function isShopAdminOrBetter(user: UserLike): boolean {
	return Boolean(user?.role) && (user!.role as number) <= ROLES.SHOP_ADMIN;
}

/**
 * Direct port of apps/web's Sidebar.jsx `isStaffOrBetter` inline check - gates the Artists/Staff
 * directory header links (see DECISIONS.md X22). Looser than isShopAdminOrBetter above
 * (SHOP_STAFF=15, not SHOP_ADMIN=10) - matches `getArtists`/`getStaff`'s own server-side minRole,
 * which is deliberately Staff-and-above rather than Shop-Admin-and-above: front-desk staff need
 * the roster to do their job, even though they can't archive or edit from it.
 */
export function isStaffOrBetter(user: UserLike): boolean {
	return Boolean(user?.role) && (user!.role as number) <= ROLES.SHOP_STAFF;
}
