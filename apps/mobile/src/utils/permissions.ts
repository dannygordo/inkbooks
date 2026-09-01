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
