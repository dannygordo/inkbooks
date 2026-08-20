const ResponseTimeSettings = require('../../models/ResponseTimeSettings');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const {
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
} = require('../../utils/shop-membership');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { validate, updateResponseTimeSettingsInputSchema } = require('../../utils/validation');

/**
 * Feature 3 - unanswered-message nudges. See models/ResponseTimeSettings.js for the data shape
 * and utils/response-time.js for the actual precedence/clamp rule this settings screen is
 * configuring. Same two-step authorization shape as resolvers/autoResponses.js:
 *
 *   READ  - requireOneOwnerArg + assertCanManageBusinessRecord against the caller-supplied
 *           shopId/artistUserId, exactly like getAutoResponses.
 *   WRITE - resolveBusinessOwner(user, input.shopId) decides AND validates the owner in one call,
 *           the same as createAutoResponse - there is nothing to re-check afterwards because this
 *           is a singleton keyed by the owner itself, not a row with its own id a caller could
 *           pass in for someone else's.
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

/**
 * Lazily created on first read or write, defaulted from the model's own schema defaults (480/180)
 * - same convention as ReminderSettings (see resolvers/reminders.js's findOrCreateSettings). The
 * owner filter passed in is itself the entire ownership boundary, already validated by the
 * caller (requireOneOwnerArg + assertCanManageBusinessRecord on read, resolveBusinessOwner on
 * write) - there is nothing left to check here.
 */
async function findOrCreateSettings(owner) {
  return ResponseTimeSettings.findOneAndUpdate(
    owner,
    { $setOnInsert: owner },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

module.exports = {
  Query: {
    getResponseTimeSettings: withAuth(async (_, { shopId, artistUserId }, context, info, user) => {
      requireOneOwnerArg(shopId, artistUserId);
      await assertCanManageBusinessRecord(user, { shopId, artistUserId });
      return findOrCreateSettings(shopId ? { shopId } : { artistUserId });
    }),
  },

  Mutation: {
    updateResponseTimeSettings: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors, data } = validate(updateResponseTimeSettingsInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // Decides the owner AND validates the caller may manage it, in one call - a shopId in the
      // input is checked against the caller's own shop-admin authority; omitted, it becomes the
      // caller's own artistUserId unconditionally. See utils/shop-membership.js.
      const owner = await resolveBusinessOwner(user, data.shopId);
      const ownerFilter = owner.shopId ? { shopId: owner.shopId } : { artistUserId: owner.artistUserId };

      const update = { setByUserId: user.id };
      if (data.initialThresholdMinutes !== undefined) {
        update.initialThresholdMinutes = data.initialThresholdMinutes;
      }
      if (data.repeatIntervalMinutes !== undefined) {
        update.repeatIntervalMinutes = data.repeatIntervalMinutes;
      }

      return ResponseTimeSettings.findOneAndUpdate(
        ownerFilter,
        { $set: update, $setOnInsert: ownerFilter },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }),
  },

  // Field resolver, not merged with the others in resolvers/index.js - every other type-level
  // resolver in this codebase (Form, FormResponse, Expense, ...) lives inline there rather than
  // being spread in from its own feature file, so this one stays there too rather than being the
  // one exception. Exported here only so resolvers/index.js can re-use the same computation
  // resolveResponseTimeThresholds already does, instead of a second copy that could drift.
  resolveShopCeiling: async (artistUserId) => {
    const shopId = await getActiveShopIdForArtist(artistUserId);
    if (!shopId) {
      return null;
    }
    const shopRow = await ResponseTimeSettings.findOne({ shopId });
    if (!shopRow) {
      return null;
    }
    return {
      initialThresholdMinutes: shopRow.initialThresholdMinutes,
      repeatIntervalMinutes: shopRow.repeatIntervalMinutes,
    };
  },
};
