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

/**
 * Shared by the resolveShopCeiling field resolver below (what an artist's own row displays as its
 * read-only ceiling) and updateResponseTimeSettings' write-side guard (what actually enforces it) -
 * one lookup, not two copies of "how do I find this artist's shop ceiling" that could drift.
 */
async function getShopCeilingForArtist(artistUserId) {
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

      // An artist may tighten their own threshold but never loosen it past their shop's ceiling
      // (Decision #2, locked before this shipped - see models/ResponseTimeSettings.js's header
      // comment). Until now this was only enforced at READ time (utils/response-time.js's clamp),
      // which meant a write above the ceiling still succeeded and was echoed back as if it had
      // taken effect - every actual consumer (the nudge sweep) silently used the ceiling instead,
      // but nothing told the artist that. Rejecting it here, at the one place an artist's row is
      // actually written, means what's stored is always what's actually in effect - not a second
      // clamp (a silent rewrite would be just as confusing as no enforcement at all), an explicit
      // error naming the ceiling so the artist knows why.
      if (owner.artistUserId) {
        const ceiling = await getShopCeilingForArtist(owner.artistUserId);
        if (ceiling) {
          const ceilingErrors = {};
          if (
            data.initialThresholdMinutes !== undefined &&
            data.initialThresholdMinutes > ceiling.initialThresholdMinutes
          ) {
            ceilingErrors.initialThresholdMinutes = `Your shop limits this to at most ${ceiling.initialThresholdMinutes} minutes`;
          }
          if (
            data.repeatIntervalMinutes !== undefined &&
            data.repeatIntervalMinutes > ceiling.repeatIntervalMinutes
          ) {
            ceilingErrors.repeatIntervalMinutes = `Your shop limits this to at most ${ceiling.repeatIntervalMinutes} minutes`;
          }
          if (Object.keys(ceilingErrors).length) {
            throw new UserInputError('Errors', { errors: ceilingErrors });
          }
        }
      }

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
  // one exception. Exported here so resolvers/index.js can use the exact same lookup the write-side
  // guard above enforces against, instead of a second copy that could drift.
  resolveShopCeiling: getShopCeilingForArtist,
};
