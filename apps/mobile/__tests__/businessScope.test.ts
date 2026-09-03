import { businessScopeFor, canManageForms, createScopeFor } from '@/utils/businessScope';
import { ROLES } from '@/constants/auth';

function artist(role: number, shopId?: string) {
	return {
		id: 'artist-1',
		role,
		userInfo: {
			__typename: 'Artist',
			shop: shopId ? { __typename: 'Shop', id: shopId, name: 'Copper Wolf' } : null,
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe('businessScopeFor', () => {
	it("returns shopId for a shop admin with a shop", () => {
		expect(businessScopeFor(artist(ROLES.SHOP_ADMIN, 'shop-1'))).toEqual({ shopId: 'shop-1' });
	});

	it('returns artistUserId for a shop-connected artist who is not a shop admin', () => {
		expect(businessScopeFor(artist(ROLES.ARTIST, 'shop-1'))).toEqual({ artistUserId: 'artist-1' });
	});

	it('returns artistUserId for an independent artist with no shop, even at SHOP_ADMIN role', () => {
		expect(businessScopeFor(artist(ROLES.SHOP_ADMIN))).toEqual({ artistUserId: 'artist-1' });
	});
});

describe('createScopeFor', () => {
	it("returns { shopId } for a shop admin's scope", () => {
		expect(createScopeFor(artist(ROLES.SHOP_ADMIN, 'shop-1'))).toEqual({ shopId: 'shop-1' });
	});

	it('returns an empty object for an artistUserId scope - the create input has no such field', () => {
		expect(createScopeFor(artist(ROLES.ARTIST))).toEqual({});
	});
});

describe('canManageForms', () => {
	it('allows a shop admin regardless of shop connection', () => {
		expect(canManageForms(artist(ROLES.SHOP_ADMIN, 'shop-1'))).toBe(true);
	});

	it('allows an independent artist with no shop at all', () => {
		expect(canManageForms(artist(ROLES.ARTIST))).toBe(true);
	});

	it('denies a plain shop-connected artist who is not a shop admin', () => {
		expect(canManageForms(artist(ROLES.ARTIST, 'shop-1'))).toBe(false);
	});

	it('denies a missing user', () => {
		expect(canManageForms(null)).toBe(false);
	});
});
