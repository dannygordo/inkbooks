const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const square = require('../../utils/square');
const { signState } = require('../../routes/squareOAuth');

module.exports = {
    Query: {
        getShops: withAuth(async () => {
            try {
                const shops = await Shop.find().sort({ name: 1 });
                return shops;
            } catch (err) {
                throw new Error(err);
            }
        }),
        getShop: withAuth(async (_,{shopId}) => {
            try {
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
