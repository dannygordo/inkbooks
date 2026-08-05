const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const square = require('../../utils/square');
const { signState } = require('../../routes/squareOAuth');
const { getShopIdsForUser, assertCanAccessShop } = require('../../utils/shop-membership');
const { UserInputError, rethrow } = require('../../utils/errors');

module.exports = {
    Query: {
        // Was withAuth with no restriction at all - any authenticated user, including a Client
        // with no relationship to any shop, could list every shop on the platform (name, email,
        // phone, address, Square connection status). SHOP_ADMIN-or-better still sees every shop -
        // matching the existing, already-documented "no owning-User field on Shop yet to scope a
        // SHOP_ADMIN to just their own shop" limitation noted in resolvers/artistShopConnections.js,
        // not a new gap introduced here. Everyone else only sees the shop(s) they're actually
        // affiliated with, via Staff/Artist/ArtistShopConnection - see utils/shop-membership.js.
        getShops: withAuth(async (_, __, context, info, user) => {
            try {
                // No unscoped branch, for anyone. Every caller sees exactly the shops they are
                // assigned to; a caller assigned to none sees none.
                const shopIds = await getShopIdsForUser(user.id);
                if (shopIds.length === 0) {
                    return [];
                }
                return await Shop.find({ _id: { $in: shopIds } }).sort({ name: 1 });
            } catch (err) {
                rethrow(err);
            }
        }),
        // Was withAuth with no restriction at all - any authenticated user could pass an
        // arbitrary shopId and read that shop's full contact/Square-connection details. Same
        // "own the resource, or shop-admin-or-better" convention as getShops above.
        getShop: withAuth(async (_, { shopId }, context, info, user) => {
            // Outside the try: the catch below rewraps everything as a generic Error, and an
            // authorization failure shouldn't be reported as if the lookup broke.
            await assertCanAccessShop(user, shopId);
            try {
                const shop = await Shop.findById(shopId);
                if (shop) {
                  return shop;
                } throw new UserInputError('Errors', { errors: { shopId: 'Shop not found.' } });
              } catch (err) {
                rethrow(err);
            }
        }),
        // Shop-admin-or-better only, same convention as everywhere else in this file - see
        // PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. Returns a one-time authorization URL
        // pointing at Square's hosted consent page; `state` is a signed, 15-minute token binding
        // this attempt to shopId (see routes/squareOAuth.js) so the eventual callback can't be
        // pointed at a different shop.
        getSquareAuthorizationUrl: withAuth(async (_, { shopId }, context, info, user) => {
          // The role gate alone let a shop admin start an OAuth handshake against a shop they
          // have nothing to do with. The signed `state` binds the callback to this shopId, so
          // without this check that binding is to someone else's shop.
          await assertCanAccessShop(user, shopId);
          const shop = await Shop.findById(shopId);
          if (!shop) {
            throw new UserInputError('Errors', { errors: { shopId: 'Shop not found.' } });
          }
          return square.buildAuthorizationUrl(signState(shopId));
        }, Constants.ROLES.SHOP_ADMIN),
    }
}
