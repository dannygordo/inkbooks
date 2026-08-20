const SystemMessageTemplate = require('../../models/SystemMessageTemplate');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const {
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
} = require('../../utils/shop-membership');
const { validate, updateSystemMessageTemplateInputSchema } = require('../../utils/validation');

/**
 * Feature 2 - manageable system-generated text. See models/SystemMessageTemplate.js for the data
 * shape and utils/system-message-templates.js for the built-in defaults and precedence rule the
 * 7 real send sites (utils/email.js x6, utils/client-booking-emails.js x1) resolve against. Same
 * two-step authorization shape as resolvers/autoResponses.js:
 *
 *   READ  - requireOneOwnerArg + assertCanManageBusinessRecord against the caller-supplied
 *           shopId/artistUserId.
 *   WRITE - resolveBusinessOwner(user, shopId) decides AND validates the owner in one call, the
 *           same as createAutoResponse - there is nothing to re-check afterwards because a row is
 *           addressed by (owner, key), not by an id a caller could pass in for someone else's row.
 */

// A read scoped by neither shopId nor artistUserId, or by both, isn't a real question - same
// helper as resolvers/autoResponses.js, duplicated per that file's own convention rather than
// shared.
function requireOneOwnerArg(shopId, artistUserId) {
  if (!shopId && !artistUserId) {
    throw new UserInputError('Errors', {
      errors: { shopId: 'Provide a shopId or an artistUserId' },
    });
  }
  if (shopId && artistUserId) {
    throw new UserInputError('Errors', {
      errors: { shopId: 'Provide only one of shopId or artistUserId, not both' },
    });
  }
}

module.exports = {
  Query: {
    getSystemMessageTemplates: withAuth(async (_, { shopId, artistUserId }, context, info, user) => {
      requireOneOwnerArg(shopId, artistUserId);
      await assertCanManageBusinessRecord(user, { shopId, artistUserId });
      const filter = shopId ? { shopId } : { artistUserId };
      return SystemMessageTemplate.find(filter).sort({ key: 1 });
    }),
  },

  Mutation: {
    updateSystemMessageTemplate: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors, data } = validate(updateSystemMessageTemplateInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, data.shopId);
      const ownerFilter = owner.shopId ? { shopId: owner.shopId, key: data.key } : { artistUserId: owner.artistUserId, key: data.key };

      const update = { setByUserId: user.id };
      if ('emailSubjectTemplate' in data) update.emailSubjectTemplate = data.emailSubjectTemplate || null;
      if ('emailBodyTemplate' in data) update.emailBodyTemplate = data.emailBodyTemplate || null;
      if ('extraNoteTemplate' in data) update.extraNoteTemplate = data.extraNoteTemplate || null;

      return SystemMessageTemplate.findOneAndUpdate(
        ownerFilter,
        {
          $set: update,
          $setOnInsert: {
            shopId: owner.shopId,
            artistUserId: owner.artistUserId,
            key: data.key,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }),

    // Deletes the override row outright - see models/SystemMessageTemplate.js's own header
    // comment on why "reset to the built-in default" means the row's ABSENCE here, unlike
    // AutoResponse's null-field convention.
    resetSystemMessageTemplate: withAuth(async (_, { shopId, key }, context, info, user) => {
      const owner = await resolveBusinessOwner(user, shopId);
      const ownerFilter = owner.shopId ? { shopId: owner.shopId, key } : { artistUserId: owner.artistUserId, key };
      const result = await SystemMessageTemplate.deleteOne(ownerFilter);
      return result.deletedCount > 0;
    }),
  },
};
