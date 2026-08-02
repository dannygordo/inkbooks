const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');
const square = require('../../utils/square');
const { signState } = require('../../routes/squareOAuth');
const { getShopIdsForUser } = require('../../utils/shop-membership');

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
                if (user.role <= Constants.ROLES.SHOP_ADMIN) {
                    return await Shop.find().sort({ name: 1 });
                }
                const shopIds = await getShopIdsForUser(user.id);
                if (shopIds.length === 0) {
                    return [];
                }
                return await Shop.find({ _id: { $in: shopIds } }).sort({ name: 1 });
            } catch (err) {
                throw new Error(err);
            }
        }),
        // Was withAuth with no restriction at all - any authenticated user could pass an
        // arbitrary shopId and read that shop's full contact/Square-connection details. Same
        // "own the resource, or shop-admin-or-better" convention as getShops above.
        getShop: withAuth(async (_, { shopId }, context, info, user) => {
            try {
                if (user.role > Constants.ROLES.SHOP_ADMIN) {
                    const shopIds = await getShopIdsForUser(user.id);
                    if (!shopIds.map(String).includes(String(shopId))) {
                        throw new AuthenticationError('Action not allowed');
                    }
                }
                const shop = await Shop.findById(shopId);
                if (shop) {
                  return shop;
                } throw new Error('Shop not found');
              } catch (err) {
                throw new Error(err);
            }
        }),
        // Shop-admin-or-better only, same convention as everywhere else in this file - see
        // PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. Returns a one-time authorization URL
        // pointing at Square's hosted consent page; `state` is a signed, 15-minute token binding
        // this attempt to shopId (see routes/squareOAuth.js) so the eventual callback can't be
        // pointed at a different shop.
        getSquareAuthorizationUrl: withAuth(async (_, { shopId }) => {
          const shop = await Shop.findById(shopId);
          if (!shop) {
            throw new Error('Shop not found');
          }
          return square.buildAuthorizationUrl(signState(shopId));
        }, Constants.ROLES.SHOP_ADMIN),
    }
}
