const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, rethrow } = require('../../utils/errors');
const {
  assertCanAccessClient,
  linkClientToUsersShops,
} = require('../../utils/shop-membership');
const { assertNoArchiveTransition } = require('../../utils/archiving');

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
    context,
    info,
    user,
  ) => {
    // Same link the wizard makes - see createClientAccount in mutations/accounts.js.
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
    await linkClientToUsersShops(client._id, user.id);
    return client;
  }, Constants.ROLES.CLIENT),
  // Same shape as archiveArtist - see the note there. A client's projects, appointments and the
  // money on them are untouched; they simply stop appearing in the client list and in pickers.
  archiveClient: withAuth(async (_, { clientId }, context, info, user) => {
    const client = await Client.findById(clientId);
    if (!client) {
      throw new Error('Client not found');
    }
    await assertCanAccessClient(user, client);
    client.status = Constants.CLIENT_STATUS.ARCHIVED;
    await client.save();
    return client;
  }, Constants.ROLES.SHOP_ADMIN),
  unarchiveClient: withAuth(async (_, { clientId }, context, info, user) => {
    const client = await Client.findById(clientId);
    if (!client) {
      throw new Error('Client not found');
    }
    await assertCanAccessClient(user, client);
    client.status = Constants.CLIENT_STATUS.ACTIVE;
    await client.save();
    return client;
  }, Constants.ROLES.SHOP_ADMIN),
  // The minRole was the whole check here too - any shop admin could rewrite any client's name,
  // email, phone and address anywhere on the platform.
  updateClient: withAuth(async (_, args, context, info, user) => {
    // Outside the try - see the matching note in mutations/artists.js on why.
    const client = args.client;
    const existing = await Client.findById(client.id);
    if (!existing) {
      throw new UserInputError('Errors', { errors: { id: 'Client not found' } });
    }
    await assertCanAccessClient(user, existing);
    assertNoArchiveTransition(existing, client.status, 'archiveClient');
    try{
      const res = await Client.findByIdAndUpdate({_id: client.id}, client, {new: true});
      return res;
    } catch (err) {
        rethrow(err);
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
      // notes on any shop's client. Nobody skips it now. The self-check above is the part that
      // makes this stricter than a plain read: a client may read their own record but must never
      // edit the notes written about them.
      await assertCanAccessClient(user, client);
      return await Client.findByIdAndUpdate({ _id: clientId }, { notes }, { new: true });
    } catch (err) {
      rethrow(err);
    }
  })
};
