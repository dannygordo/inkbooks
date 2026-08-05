const { GraphQLError } = require('graphql');
const Client = require('../../models/Client');
const Project = require('../../models/Project');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');
const {
  getShopIdsForUser,
  getArtistIdsForShops,
} = require('../../utils/shop-membership');

/**
 * Throws unless the caller's own shop has a Project with this client.
 *
 * A Client has no shopId of its own (unlike Staff and Artist), so there is no direct "is this
 * your client" field to check - the Projects connecting a shop's artists to them are the only
 * path. Same join getClient/getClients already use on the read side (see resolvers/clients.js);
 * pulled out here because three mutations now need it.
 */
async function assertSharesProjectWithClient(user, client) {
  let artistIds;
  if (user.role === Constants.ROLES.ARTIST) {
    artistIds = [user.id];
  } else {
    const shopIds = await getShopIdsForUser(user.id);
    artistIds = await getArtistIdsForShops(shopIds);
  }
  const hasSharedProject =
    artistIds.length > 0 &&
    (await Project.exists({ artistId: { $in: artistIds }, clientId: client._id }));
  if (!hasSharedProject) {
    throw new AuthenticationError('Action not allowed');
  }
}

module.exports = {
  createClient: withAuth(async (
    _,
    {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      userId,
    },
  ) => {
    const newClient = new Client({
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      userId,
    });
    const client = await newClient.save();
    return client;
  }, Constants.ROLES.CLIENT),
  // Was ADMIN-gated, i.e. reachable only by the global role that no longer exists. Now a shop
  // admin whose own shop actually works with this client.
  deleteClient: withAuth(async (_, { clientId }, context, info, user) => {
    try {
      const client = await Client.findById(clientId);
      if (client) {
        await assertSharesProjectWithClient(user, client);
      }
      //TODO: revisit rule that allows a user to delete an client.  Might want to inactive client instead of delete in order to prevent historical documents from breaking
      if (client) {
        await Client.deleteOne({ _id: clientId });
        return 'Client deleted successfully';
      }
      throw new Error('Client not found');
    } catch (err) {
      throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN),
  // The minRole was the whole check here too - any shop admin could rewrite any client's name,
  // email, phone and address anywhere on the platform.
  updateClient: withAuth(async (_, args, context, info, user) => {
    try{
      const client = args.client;
      const existing = await Client.findById(client.id);
      if (!existing) {
        throw new Error('Client not found');
      }
      await assertSharesProjectWithClient(user, existing);
      const res = await Client.findByIdAndUpdate({_id: client.id}, client, {new: true});
      return res;
    } catch (err) {
        throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN),
  // Shop-side notes about a client. Mirrors updateProjectNotes (mutations/projects.js) - the whole
  // array is replaced rather than appended to, matching how IBNote collections are already edited
  // everywhere else in this app.
  //
  // Authorization is NOT the same as getClient's, and the difference is deliberate. getClient lets
  // a client read their own record; this must not let them write these notes. The value of a note
  // like "cancels a lot" or "needed a break every 20 minutes" comes entirely from it being a
  // candid internal record - if the subject can edit it, it stops being one. Artists who share a
  // project with the client can write them, since they're the ones who learn this material.
  updateClientNotes: withAuth(async (_, { notes, clientId }, context, info, user) => {
    try {
      const client = await Client.findById(clientId);
      if (!client) {
        throw new Error('Client not found');
      }
      // Checked before the role gate below, not after: a Client's role (30) would fail that check
      // anyway, but only incidentally. Stating it explicitly means the rule survives someone
      // later loosening the role requirement without thinking about this case.
      if (String(user.id) === String(client.userId)) {
        throw new AuthenticationError('Action not allowed');
      }
      // Was `role <= SHOP_ADMIN` skipping this entirely - any shop admin could write internal
      // notes on any shop's client. Nobody skips it now; a shop admin reaches the client the same
      // way an artist does, through a shared Project.
      await assertSharesProjectWithClient(user, client);
      return await Client.findByIdAndUpdate({ _id: clientId }, { notes }, { new: true });
    } catch (err) {
      if (err instanceof GraphQLError) {
        throw err;
      }
      throw new Error(err);
    }
  })
};
