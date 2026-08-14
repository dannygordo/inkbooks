const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const {
  assertCanAccessClient,
  canAccessClient,
  clientScopeFilter,
} = require('../../utils/shop-membership');
const { archiveFilter } = require('../../utils/archiving');
const { paginate, normalizePage } = require('../../utils/pagination');
const { UserInputError, rethrow } = require('../../utils/errors');

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
    getClients: withAuth(async (_, { includeArchived, page }, context, info, user) => {
      try {
        // See clientScopeFilter's own comment (utils/shop-membership.js) - this is the same
        // scoping search's getClients-equivalent reuses, extracted so there is exactly one place
        // that answers "which clients can this person see" rather than two that have to agree.
        const scope = await clientScopeFilter(user);
        if (!scope) {
          const { limit, offset } = normalizePage(page);
          return { items: [], pageInfo: { totalCount: 0, hasMore: false, limit, offset } };
        }
        return await paginate(Client, archiveFilter(includeArchived, scope), {
          sort: { lastName: 1 },
          page,
        });
      } catch (err) {
        rethrow(err);
      }
    }),
    // See the note in typeDefs.js. Returns null rather than throwing for "not ours": the wizard
    // asks this on every keystroke-settled email, and a not-found is the normal answer, not an
    // error. canAccessClient is what stops it becoming an email-to-name oracle for other shops'
    // clients.
    findClientByEmail: withAuth(async (_, { email }, context, info, user) => {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      const client = await Client.findOne({ email: normalized });
      if (!client) {
        return null;
      }
      return (await canAccessClient(user, client)) ? client : null;
    }, Constants.ROLES.SHOP_STAFF),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // clientId and read that client's contact info. Same rule as getClients above, for one row.
    getClient: withAuth(async (_, { clientId }, context, info, user) => {
      const client = await Client.findById(clientId);
      if (!client) {
        throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
      }
      // Outside any try/catch: an authorization failure shouldn't be rewrapped as if the lookup
      // broke, which is what the old `rethrow(err)` around this did.
      await assertCanAccessClient(user, client);
      return client;
    }),
  },
};
