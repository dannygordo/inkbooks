const BoothRentPlan = require('../../models/BoothRentPlan');
const BoothRentCharge = require('../../models/BoothRentCharge');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError } = require('../../utils/errors');
const { assertCanAccessShop, canManageArtist } = require('../../utils/shop-membership');
const { paginate } = require('../../utils/pagination');
const { recordEvent } = require('../../utils/event-log');
const { formatCents } = require('../../utils/money');

/**
 * Booth-rent plan history and charges - the flat-fee counterpart to resolvers/shopCutRates.js.
 * Same asymmetry, same reasoning: an artist reads their own terms and their own charges (being
 * billed a flat fee you cannot see is worse than the fee being wrong), a shop admin sets the
 * terms and reads the shop's own roster - but only a shop admin ever WRITES a plan, never the
 * artist it applies to. See that file's own header comment; this mirrors it deliberately rather
 * than sharing code, since the two types diverge just enough (a page of charges, not a bare list)
 * that a shared abstraction would cost more than it saves.
 */
module.exports = {
  Query: {
    getBoothRentPlans: withAuth(async (_, { artistId, shopId }, context, info, user) => {
      const isTheArtist = String(user.id) === String(artistId);
      if (!isTheArtist) {
        await assertCanAccessShop(user, shopId);
        if (!(await canManageArtist(user, artistId))) {
          throw new AuthenticationError('Action not allowed');
        }
      }
      return BoothRentPlan.find({ artistId, shopId }).sort({ effectiveFrom: -1 });
    }),

    getBoothRentCharges: withAuth(
      async (_, { artistId, shopId, status, page }, context, info, user) => {
        if (!artistId && !shopId) {
          throw new UserInputError('Errors', {
            errors: { artistId: 'Provide an artistId or a shopId' },
          });
        }
        if (artistId) {
          const isTheArtist = String(user.id) === String(artistId);
          if (!isTheArtist) {
            if (!shopId) {
              // Someone else's artistId with no shopId to check against - refuse rather than
              // guess which shop would entitle them to look.
              throw new AuthenticationError('Action not allowed');
            }
            await assertCanAccessShop(user, shopId);
            if (!(await canManageArtist(user, artistId))) {
              throw new AuthenticationError('Action not allowed');
            }
          }
        } else {
          await assertCanAccessShop(user, shopId);
          if (user.role > Constants.ROLES.SHOP_ADMIN) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        const filter = {};
        if (artistId) filter.artistId = artistId;
        if (shopId) filter.shopId = shopId;
        if (status) filter.status = status;
        return paginate(BoothRentCharge, filter, { sort: { periodMonth: -1 }, page });
      },
    ),
  },

  Mutation: {
    setBoothRentPlan: withAuth(
      async (_, { artistId, shopId, amountCents, dueDayOfMonth, effectiveFrom }, context, info, user) => {
        // The caller must be an admin AT THIS SHOP - same shape as setShopCutRate.
        await assertCanAccessShop(user, shopId);

        // NOT assertCanManageArtist - an artist acting on themselves is exactly what this must
        // refuse. Booth rent is what the artist owes the shop, and a party setting the number
        // they owe is not a rate, it is a suggestion.
        if (String(user.id) === String(artistId)) {
          throw new AuthenticationError(
            'An artist cannot set their own booth rent. Ask a shop admin to change it.',
          );
        }
        if (!Number.isInteger(amountCents) || amountCents < 0) {
          throw new UserInputError('Errors', {
            errors: { amountCents: 'Enter an amount of $0 or more.' },
          });
        }
        if (!Number.isInteger(dueDayOfMonth) || dueDayOfMonth < 1 || dueDayOfMonth > 31) {
          throw new UserInputError('Errors', {
            errors: { dueDayOfMonth: 'Enter a due day between 1 and 31.' },
          });
        }

        try {
          const plan = await new BoothRentPlan({
            artistId,
            shopId,
            amountCents,
            dueDayOfMonth,
            setByUserId: user.id,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
          }).save();
          // Append-only history, like the row itself - a new BoothRentPlan document, so this is a
          // 'create', not an 'update' of some prior plan.
          await recordEvent({
            entityType: 'BoothRentPlan',
            entityId: plan._id,
            action: 'create',
            actorUserId: user.id,
            shopId,
            summary: `Set booth rent to ${formatCents(amountCents)}/month for an artist`,
          });
          return plan;
        } catch (err) {
          if (err && err.code === 11000) {
            throw new UserInputError('Errors', {
              errors: {
                effectiveFrom:
                  'A booth-rent plan already exists for this artist and shop at that exact ' +
                  'moment. Pick a different effective date, or change the existing one.',
              },
            });
          }
          throw err;
        }
      },
      Constants.ROLES.SHOP_ADMIN,
    ),
  },
};
