const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const {
  assertAdminAuthority,
  assertCanAccessClient,
  linkClientToUsersShops,
} = require('../../utils/shop-membership');
const { assertNoArchiveTransition } = require('../../utils/archiving');
const { redactClient } = require('../../utils/redaction');

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
  /**
   * Erasure request (GDPR/CCPA). Overwrites who this person was; keeps everything transacted.
   *
   * IRREVERSIBLE - there is no unredact, unlike archiving. Deliberately has no button in the UI:
   * this is a rare, legally-initiated action, and putting "permanently erase this person" next to
   * "Archive" invites the misclick it can't recover from. Reached deliberately, by someone acting
   * on a request.
   *
   * Archives them too, in the same call. A redacted client left in the active list is a row named
   * "Redacted" that staff can't identify and shouldn't be picking for new work.
   *
   * See utils/redaction.js - including what it deliberately does NOT erase, and why that scope is
   * a legal decision rather than an engineering one.
   */
  redactClient: withAuth(async (_, { clientId }, context, info, user) => {
    // S2: shop-admin authority where a shop exists, the artist's own where one does not.
    //
    // Needed here, unlike in mutations/artists.js where the floor could simply be dropped. The
    // difference is what the ownership check underneath permits: assertCanAccessClient passes any
    // artist who shares a shop OR a project with the client, so removing the floor outright would
    // let a plain artist at a shop archive that shop's clients. At a shop this is an admin action.
    // With no shop there is no admin to be, which is exactly what this asks.
    await assertAdminAuthority(user);
    const client = await Client.findById(clientId);
    if (!client) {
      throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
    }
    await assertCanAccessClient(user, client);
    const summary = await redactClient(client);
    await Client.updateOne(
      { _id: client._id },
      { $set: { status: Constants.CLIENT_STATUS.ARCHIVED } },
    );
    return summary;
  }),
  // Same shape as archiveArtist - see the note there. A client's projects, appointments and the
  // money on them are untouched; they simply stop appearing in the client list and in pickers.
  archiveClient: withAuth(async (_, { clientId }, context, info, user) => {
    await assertAdminAuthority(user);
    const client = await Client.findById(clientId);
    if (!client) {
      throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
    }
    await assertCanAccessClient(user, client);
    client.status = Constants.CLIENT_STATUS.ARCHIVED;
    await client.save();
    return client;
  }),
  unarchiveClient: withAuth(async (_, { clientId }, context, info, user) => {
    await assertAdminAuthority(user);
    const client = await Client.findById(clientId);
    if (!client) {
      throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
    }
    await assertCanAccessClient(user, client);
    client.status = Constants.CLIENT_STATUS.ACTIVE;
    await client.save();
    return client;
  }),
  // The minRole was the whole check here too - any shop admin could rewrite any client's name,
  // email, phone and address anywhere on the platform.
  updateClient: withAuth(async (_, args, context, info, user) => {
    await assertAdminAuthority(user);
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
  }),
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
        throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
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
