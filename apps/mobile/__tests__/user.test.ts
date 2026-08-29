import { getUserShopId } from '@/utils/user';

describe('getUserShopId', () => {
  it("returns a shop-connected artist's shop id", () => {
    expect(
      getUserShopId({
        userInfo: { __typename: 'Artist', shop: { __typename: 'Shop', id: 'shop-1', name: 'Copper Wolf' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toBe('shop-1');
  });

  it('returns a shop-connected staff member\'s shop id', () => {
    expect(
      getUserShopId({
        userInfo: { __typename: 'Staff', shop: { __typename: 'Shop', id: 'shop-2', name: 'Copper Wolf' } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toBe('shop-2');
  });

  it('returns undefined for an independent artist with no shop', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getUserShopId({ userInfo: { __typename: 'Artist', shop: null } } as any)).toBeUndefined();
  });

  it('returns undefined for a client - clients never carry a shop field', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getUserShopId({ userInfo: { __typename: 'Client' } } as any)).toBeUndefined();
  });

  it('returns undefined for a null or missing user', () => {
    expect(getUserShopId(null)).toBeUndefined();
    expect(getUserShopId(undefined)).toBeUndefined();
  });
});
