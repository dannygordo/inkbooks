import { ROLES } from '@/constants/auth';
import { canManageAppointment, isShopAdminOrBetter, isStaffOrBetter } from '@/utils/permissions';

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

describe('isShopAdminOrBetter', () => {
	it('allows plain Admin and Shop Admin', () => {
		expect(isShopAdminOrBetter({ id: 'admin-1', role: ROLES.ADMIN })).toBe(true);
		expect(isShopAdminOrBetter({ id: 'admin-2', role: ROLES.SHOP_ADMIN })).toBe(true);
	});

	it('denies Shop Staff - the floor is SHOP_ADMIN, matching canManageAppointment above', () => {
		expect(isShopAdminOrBetter({ id: 'staff-1', role: ROLES.SHOP_STAFF })).toBe(false);
	});

	it('denies a plain Artist and a Client', () => {
		expect(isShopAdminOrBetter({ id: 'artist-1', role: ROLES.ARTIST })).toBe(false);
		expect(isShopAdminOrBetter({ id: 'client-1', role: ROLES.CLIENT })).toBe(false);
	});

	it('denies a missing user or a user with no role', () => {
		expect(isShopAdminOrBetter(null)).toBe(false);
		expect(isShopAdminOrBetter({ id: 'user-1' })).toBe(false);
	});
});

describe('isStaffOrBetter', () => {
	it('allows Admin, Shop Admin, and Shop Staff', () => {
		expect(isStaffOrBetter({ id: 'admin-1', role: ROLES.ADMIN })).toBe(true);
		expect(isStaffOrBetter({ id: 'admin-2', role: ROLES.SHOP_ADMIN })).toBe(true);
		expect(isStaffOrBetter({ id: 'staff-1', role: ROLES.SHOP_STAFF })).toBe(true);
	});

	it('denies a plain Artist and a Client - the roster is a shop-management view, not a peer one', () => {
		expect(isStaffOrBetter({ id: 'artist-1', role: ROLES.ARTIST })).toBe(false);
		expect(isStaffOrBetter({ id: 'client-1', role: ROLES.CLIENT })).toBe(false);
	});

	it('denies a missing user or a user with no role', () => {
		expect(isStaffOrBetter(null)).toBe(false);
		expect(isStaffOrBetter({ id: 'user-1' })).toBe(false);
	});
});
