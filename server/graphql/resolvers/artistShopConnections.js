const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { assertCanAccessShop, assertCanManageArtist } = require('../../utils/shop-membership');

module.exports = {
  Query: {
    getArtistShopConnections: withAuth(async (_, { artistId }, context, info, user) => {
      // The artist themselves, or a shop admin who actually shares a shop with them. The old
      // `role <= SHOP_ADMIN` half of this let any shop admin enumerate any artist's shop history.
      await assertCanManageArtist(user, artistId);
      return ArtistShopConnection.find({ artistId }).sort({ createdAt: -1 });
    }),
    // The "Shop has no owning-User field, so we can only check the role" note that used to sit
    // here is no longer true - Staff.shopId and ArtistShopConnection.shopId are exactly that
    // relationship, read through utils/shop-membership.js. Two separate questions now: the role
    // says a caller is senior enough to see a shop's roster, assertCanAccessShop says it's their
    // shop.
    getShopArtistConnections: withAuth(async (_, { shopId }, context, info, user) => {
      await assertCanAccessShop(user, shopId);
      return ArtistShopConnection.find({ shopId }).sort({ createdAt: -1 });
    }),
  },
};
