const Client = require('../../models/Client');
const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');
const {
  getShopIdsForUser,
  getArtistIdsForShops,
} = require('../../utils/shop-membership');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including one Client,
    // could list every client (name, email, phone, address) of every shop on the platform.
    // SHOP_ADMIN-or-better still sees everyone - see the matching comment in resolvers/shops.js.
    // Client has no shopId of its own (unlike Staff/Artist), so the only path from "a shop" or
    // "an artist" to "its clients" is through the Projects that connect them - see
    // resolvers/index.js's Project.client resolver for why Project.clientId is the Client
    // sub-document's own _id, not the client's User._id, which is what Project.distinct below
    // relies on.
    getClients: withAuth(async (_, __, context, info, user) => {
      try {
        // No unscoped branch, for anyone. Everyone reaches clients the same way: through the
        // projects their own shop's artists have with them.
        let artistIds;
        if (user.role === Constants.ROLES.ARTIST) {
          artistIds = [user.id];
        } else {
          const shopIds = await getShopIdsForUser(user.id);
          artistIds = await getArtistIdsForShops(shopIds);
        }
        if (!artistIds || artistIds.length === 0) {
          return [];
        }
        const clientIds = await Project.distinct('clientId', { artistId: { $in: artistIds } });
        if (clientIds.length === 0) {
          return [];
        }
        return await Client.find({ _id: { $in: clientIds } }).sort({ lastName: 1 });
      } catch (err) {
        throw new Error(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // clientId and read that client's contact info. Allowed: shop-admin-or-better, the client
    // themselves, or an artist/staff who shares a Project with this client (same join logic as
    // getClients above).
    getClient: withAuth(async (_, { clientId }, context, info, user) => {
      try {
        const client = await Client.findById(clientId);
        if (!client) {
          throw new Error('Client not found');
        }
        if (String(user.id) !== String(client.userId)) {
          let artistIds;
          if (user.role === Constants.ROLES.ARTIST) {
            artistIds = [user.id];
          } else {
            const shopIds = await getShopIdsForUser(user.id);
            artistIds = await getArtistIdsForShops(shopIds);
          }
          const hasSharedProject = artistIds.length > 0 && await Project.exists({
            clientId: client.id,
            artistId: { $in: artistIds },
          });
          if (!hasSharedProject) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return client;
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
