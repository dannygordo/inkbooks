const ShopCutRate = require('../../models/ShopCutRate');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError } = require('../../utils/errors');
const { assertCanAccessShop, canManageArtist } = require('../../utils/shop-membership');
const { setShopCutRate } = require('../../utils/shop-cut');
const { recordEvent } = require('../../utils/event-log');

/**
 * The shop cut rate history.
 *
 * WHO MAY DO WHAT, and the asymmetry is the point:
 *
 *   READ  - the artist themselves, or a shop admin at that shop. Being charged a percentage you
 *           cannot see is worse than the percentage being wrong; an artist has to be able to check
 *           what they are paying and from when.
 *   WRITE - shop admin only. This is what the artist OWES the shop. A party setting the number they
 *           owe is not a rate, it is a suggestion.
 *
 * That asymmetry is why these are not both behind one `assertCanManageArtist` call, which passes an
 * artist for themselves by design (see utils/shop-membership.js) and would therefore let an artist
 * set their own cut to zero.
 */
module.exports = {
  Query: {
    getShopCutRates: withAuth(async (_, { artistId, shopId }, context, info, user) => {
      const isTheArtist = String(user.id) === String(artistId);
      if (!isTheArtist) {
        // A shop admin at THAT shop. assertCanAccessShop is the same check used everywhere else a
        // shop's own data is read, so this can't drift from the rest of the boundary.
        await assertCanAccessShop(user, shopId);
        if (!(await canManageArtist(user, artistId))) {
          throw new AuthenticationError('Action not allowed');
        }
      }
      return ShopCutRate.find({ artistId, shopId }).sort({ effectiveFrom: -1 });
    }),
  },

  Mutation: {
    setShopCutRate: withAuth(
      async (_, { artistId, shopId, percent, effectiveFrom, note }, context, info, user) => {
        // The caller must be an admin AT THIS SHOP, not merely an admin somewhere. withAuth's role
        // floor below establishes the rank; this establishes that it is this shop's rank.
        await assertCanAccessShop(user, shopId);

        // NOT assertCanManageArtist - that returns true for an artist acting on themselves, which
        // is exactly the case this must refuse.
        if (String(user.id) === String(artistId)) {
          throw new AuthenticationError(
            'An artist cannot set their own shop cut. Ask a shop admin to change it.',
          );
        }

        try {
          const rate = await setShopCutRate({
            artistUserId: artistId,
            shopId,
            percent,
            setByUserId: user.id,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
            note,
          });
          // Append-only history, like the row itself - a new ShopCutRate document, so this is a
          // 'create', not an 'update' of some prior rate.
          await recordEvent({
            entityType: 'ShopCutRate',
            entityId: rate._id,
            action: 'create',
            actorUserId: user.id,
            shopId,
            summary: `Set shop cut to ${percent}% for an artist`,
          });
          return rate;
        } catch (err) {
          // setShopCutRate throws plain Errors for the two things a caller can get wrong - an
          // out-of-range percent and a collision on effectiveFrom. Both are user input, so they
          // come back as field errors rather than as a 500 the client renders as "something went
          // wrong".
          throw new UserInputError('Errors', {
            errors: /moment/.test(err.message)
              ? { effectiveFrom: err.message }
              : { percent: err.message },
          });
        }
      },
      Constants.ROLES.SHOP_ADMIN,
    ),
  },
};
