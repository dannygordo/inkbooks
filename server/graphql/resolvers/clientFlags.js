const { GraphQLError } = require('graphql');
const Client = require('../../models/Client');
const ClientFlagType = require('../../models/ClientFlagType');
const withAuth = require('../../utils/with-auth');
const { UserInputError, AuthenticationError } = require('../../utils/errors');
const { assertCanAccessClient, assertCanAccessShop, getShopIdsForUser } = require('../../utils/shop-membership');
const { raiseClientFlag } = require('../../utils/client-flags');
const { recordEvent } = require('../../utils/event-log');

// The acting user's own shop, for EventLog.shopId - same helper, same reasoning, as
// mutations/clients.js's actingShopId (not exported from there, so restated here rather than
// reaching across a mutations file for one function).
async function actingShopId(userId) {
  const shopIds = await getShopIdsForUser(userId);
  return shopIds[0] || undefined;
}

/**
 * Read/raise surface over utils/client-flags.js - see that file and models/ClientFlag.js for the
 * actual business logic and reasoning. Nothing here duplicates a rule already enforced there;
 * this is authorization and GraphQL shape only.
 */
module.exports = {
  Query: {
    // shopId omitted: platform-wide types only. shopId passed: platform-wide plus that shop's own
    // - assertCanAccessShop first, so this can't be used to read another shop's custom vocabulary.
    getClientFlagTypes: withAuth(async (_, { shopId }, context, info, user) => {
      if (shopId) {
        await assertCanAccessShop(user, shopId);
        return ClientFlagType.find({
          active: true,
          $or: [{ shopId: null }, { shopId }],
        }).sort({ key: 1 });
      }
      return ClientFlagType.find({ active: true, shopId: null }).sort({ key: 1 });
    }),
  },

  Mutation: {
    // Same boundary as updateClientNotes, and the same reasoning: a flag is a candid internal
    // record about someone's conduct, so the person it's about must not be able to write one -
    // about themselves or anyone else.
    raiseClientFlag: withAuth(async (_, { input }, context, info, user) => {
      try {
        const client = await Client.findById(input.clientId);
        if (!client) {
          throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
        }
        if (String(user.id) === String(client.userId)) {
          throw new AuthenticationError('Action not allowed');
        }
        await assertCanAccessClient(user, client);

        const shopId = await actingShopId(user.id);
        const flag = await raiseClientFlag({
          clientId: client._id,
          typeKey: input.typeKey,
          note: input.note || '',
          shopId: shopId || null,
          createdByUserId: user.id,
          systemGenerated: false,
        });

        await recordEvent({
          entityType: 'ClientFlag',
          entityId: flag._id,
          action: 'create',
          actorUserId: user.id,
          shopId: shopId || null,
          summary: `Flagged ${client.firstName} ${client.lastName}: ${flag.typeKey}`,
        });

        return flag;
      } catch (err) {
        // The UserInputError/AuthenticationError thrown above are GraphQLErrors already and pass
        // straight through unwrapped - see utils/errors.js's rethrow on why that check matters.
        // Anything else here is a plain Error from raiseClientFlag itself: an unknown typeKey or a
        // systemGenerated one (utils/client-flags.js), which becomes a field error the same way
        // setShopCutRate turns setShopCutRate's plain Errors into one.
        if (err instanceof GraphQLError) {
          throw err;
        }
        throw new UserInputError('Errors', { errors: { typeKey: err.message } });
      }
    }),
  },
};
