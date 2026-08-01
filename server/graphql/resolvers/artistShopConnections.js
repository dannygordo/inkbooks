const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');

module.exports = {
  Query: {
    getArtistShopConnections: withAuth(async (_, { artistId }, context, info, user) => {
      if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(artistId)) {
        throw new AuthenticationError('Action not allowed');
      }
      return ArtistShopConnection.find({ artistId }).sort({ createdAt: -1 });
    }),
    // Shop has no owning-User field yet (see models/Shop.js) - there's no way to check "is this
    // caller the admin of *this specific* shop", only "is this caller a shop-admin-or-better at
    // all". Matches the same loose convention already used elsewhere in this codebase (e.g.
    // updateAppointment's role check) rather than inventing shop-scoped ownership as a side
    // effect of this task.
    getShopArtistConnections: withAuth(async (_, { shopId }, context, info, user) => {
      if (user.role > Constants.ROLES.SHOP_ADMIN) {
        throw new AuthenticationError('Action not allowed');
      }
      return ArtistShopConnection.find({ shopId }).sort({ createdAt: -1 });
    }),
  },
};
