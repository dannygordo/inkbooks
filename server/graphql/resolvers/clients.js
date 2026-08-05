const Client = require('../../models/Client');
const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const {
  getShopIdsForUser,
  getArtistIdsForShops,
  assertCanAccessClient,
} = require('../../utils/shop-membership');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including one Client,
    // could list every client (name, email, phone, address) of every shop on the platform. There
    // is no unscoped branch now, for any role.
    //
    // Two ways a client is "ours", matching canAccessClient (utils/shop-membership.js):
    //   - Client.shopIds contains one of our shops - true from the moment a shop adds them
    //   - one of our artists has a Project with them - the only path for an INDEPENDENT artist,
    //     who has no shop to share
    // Both are needed. Project.clientId is the Client sub-document's own _id, not the client's
    // User._id (see resolvers/index.js's Project.client resolver), which is what the distinct
    // below relies on.
    getClients: withAuth(async (_, __, context, info, user) => {
      try {
        const shopIds = await getShopIdsForUser(user.id);
        const artistIds =
          user.role === Constants.ROLES.ARTIST ? [user.id] : await getArtistIdsForShops(shopIds);

        const clientIdsFromProjects = artistIds.length
          ? await Project.distinct('clientId', { artistId: { $in: artistIds } })
          : [];

        const or = [];
        if (shopIds.length) {
          or.push({ shopIds: { $in: shopIds } });
        }
        if (clientIdsFromProjects.length) {
          or.push({ _id: { $in: clientIdsFromProjects } });
        }
        if (or.length === 0) {
          return [];
        }
        return await Client.find({ $or: or }).sort({ lastName: 1 });
      } catch (err) {
        throw new Error(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // clientId and read that client's contact info. Same rule as getClients above, for one row.
    getClient: withAuth(async (_, { clientId }, context, info, user) => {
      const client = await Client.findById(clientId);
      if (!client) {
        throw new Error('Client not found');
      }
      // Outside any try/catch: an authorization failure shouldn't be rewrapped as if the lookup
      // broke, which is what the old `throw new Error(err)` around this did.
      await assertCanAccessClient(user, client);
      return client;
    }),
  },
};
