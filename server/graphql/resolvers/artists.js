const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { getShopIdsForUser } = require('../../utils/shop-membership');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could list every artist at every shop on the platform. SHOP_ADMIN-or-better still sees
    // everyone - see the matching comment in resolvers/shops.js. Staff/Artist callers only see
    // artists at the shop(s) they're actually affiliated with. Like getArtistsByShop below (which
    // has the same limitation already), this only matches Artist's legacy single shopId field,
    // not the fuller ArtistShopConnection multi-shop model - not a new inconsistency introduced
    // here, just not fixed here either.
    getArtists: withAuth(async (_, __, context, info, user) => {
      try {
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
          return await Artist.find().sort({ startDate: 1 });
        }
        const shopIds = await getShopIdsForUser(user.id);
        if (shopIds.length === 0) {
          return [];
        }
        return await Artist.find({ shopId: { $in: shopIds } }).sort({ startDate: 1 });
      } catch (err) {
        throw new Error(err);
      }
    }),
    getArtist: withAuth(async (_, { artistId }) => {
      try {
        const artist = await Artist.findById(artistId);
        if (artist) {
          return artist;
        } throw new Error('Artist not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
    getArtistsByShop: withAuth(async (_, { shopId }) => {
      try {
        const artists = await Artist.find({ shopId: shopId }).sort({ firstName: 1 });
        if (artists) {
          return artists;
        } throw new Error('Artists not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
