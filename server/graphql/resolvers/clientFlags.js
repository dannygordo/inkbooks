const { GraphQLError } = require('graphql');
const Client = require('../../models/Client');
const ClientFlag = require('../../models/ClientFlag');
const ClientFlagType = require('../../models/ClientFlagType');
const withAuth = require('../../utils/with-auth');
const { UserInputError, AuthenticationError } = require('../../utils/errors');
const { assertCanAccessClient, assertCanAccessShop, getShopIdsForUser } = require('../../utils/shop-membership');
const { raiseClientFlag, resolveClientFlag } = require('../../utils/client-flags');
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

    // The other half of raiseClientFlag - see utils/client-flags.js's resolveClientFlag for why
    // this exists as its own function rather than reusing resolveClientFlagsForAppointment (this
    // is the only path that can clear a flag with no appointment behind it at all, which is the
    // common case for a hand-raised one). Same authorization boundary as raiseClientFlag, for the
    // same reason: taking a flag back is still an internal record about the client, so the person
    // it's about must not be the one deciding it no longer applies.
    resolveClientFlag: withAuth(async (_, { flagId }, context, info, user) => {
      const flag = await ClientFlag.findById(flagId);
      if (!flag) {
        throw new UserInputError('Errors', { errors: { flagId: 'Flag not found.' } });
      }
      const client = await Client.findById(flag.clientId);
      if (!client) {
        throw new UserInputError('Errors', { errors: { flagId: 'Flag not found.' } });
      }
      if (String(user.id) === String(client.userId)) {
        throw new AuthenticationError('Action not allowed');
      }
      await assertCanAccessClient(user, client);

      if (flag.resolvedAt) {
        // Already resolved - returned as-is rather than an error. Resolving something twice
        // (a slow double-click, two staff acting on the same stale list) should be a no-op the
        // caller can treat as success, not a failure to recover from.
        return flag;
      }

      const resolved = await resolveClientFlag({ flagId: flag._id, resolvedByUserId: user.id });

      await recordEvent({
        entityType: 'ClientFlag',
        entityId: flag._id,
        action: 'update',
        actorUserId: user.id,
        shopId: (await actingShopId(user.id)) || flag.shopId || undefined,
        summary: `Resolved ${client.firstName} ${client.lastName}'s ${flag.typeKey} flag`,
        changes: [{ field: 'resolvedAt', from: null, to: resolved.resolvedAt }],
      });

      return resolved;
    }),
  },
};
