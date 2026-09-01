import { ROLES } from '@/constants/auth';
import { canManageAppointment } from '@/utils/permissions';

describe('canManageAppointment', () => {
	it('allows the appointment owner regardless of role', () => {
		const user = { id: 'user-1', role: ROLES.CLIENT };
		expect(canManageAppointment(user, { userId: 'user-1' })).toBe(true);
	});

	it('falls back to appointment.user.id when userId is absent', () => {
		const user = { id: 'user-1', role: ROLES.CLIENT };
		expect(canManageAppointment(user, { user: { id: 'user-1' } })).toBe(true);
	});

	it('allows a shop admin who does not own the appointment', () => {
		const user = { id: 'admin-1', role: ROLES.SHOP_ADMIN };
		expect(canManageAppointment(user, { userId: 'artist-2' })).toBe(true);
	});

	it('denies a fellow artist who does not own the appointment', () => {
		const user = { id: 'artist-1', role: ROLES.ARTIST };
		expect(canManageAppointment(user, { userId: 'artist-2' })).toBe(false);
	});

	it('denies shop staff - the floor is SHOP_ADMIN, not the looser SHOP_STAFF some other checks use', () => {
		const user = { id: 'staff-1', role: ROLES.SHOP_STAFF };
		expect(canManageAppointment(user, { userId: 'artist-2' })).toBe(false);
	});

	it('denies with no appointment or no user', () => {
		expect(canManageAppointment({ id: 'user-1', role: ROLES.ADMIN }, null)).toBe(false);
		expect(canManageAppointment(null, { userId: 'user-1' })).toBe(false);
	});
});
