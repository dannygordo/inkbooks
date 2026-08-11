const Artist = require('../../models/Artist');
const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { assertCanAccessShop } = require('../../utils/shop-membership');
const { squarePricingSettingsInputSchema, validate } = require('../../utils/validation');

/**
 * The tax rate and fee offset every charge is computed from.
 *
 * ---------------------------------------------------------------------------------------------
 * THESE FIELDS HAD NO WAY IN. taxRateBasisPoints and squareFeeOffsetCents have existed on both
 * Shop and Artist since M8 was written, seeded to 0, with no screen anywhere that could change
 * them. That was harmless while nothing charged a card. It is not harmless now: routes/
 * squarePayments.js reads exactly these, so every charge collected $0.00 of tax and could never
 * offer the offset, and nobody could correct it from inside the app.
 *
 * WRITES TO WHICHEVER OWNER M8 RESOLVES - the shop when the artist is connected to one, the artist
 * themselves when independent. The owner is resolved here, server-side, from the same rule
 * resolveSquareSettings reads with. A client-supplied "which one" argument would be a second way
 * to answer a question that already has one answer, and the two would disagree the first time an
 * artist changed shops with a settings page open.
 *
 * AUTHORIZATION FOLLOWS OWNERSHIP, not role. Tax is destination-based and belongs to the shop's
 * location (M8), so at a shop it is the shop's to set and takes assertCanAccessShop plus the
 * SHOP_ADMIN floor. Independent, the artist is their own admin (S2) and needs no further check -
 * they are editing their own record and there is no one else to ask.
 * ---------------------------------------------------------------------------------------------
 */
module.exports = {
  updateSquarePricingSettings: withAuth(async (_, args, context, info, user) => {
    const { valid, errors, data } = validate(squarePricingSettingsInputSchema, args);
    if (!valid) {
      throw new UserInputError('Errors', { errors });
    }

    const shopId = await getActiveShopIdForArtist(user.id);

    if (shopId) {
      // A shop artist who is not an admin can READ these (they appear on every charge they take)
      // but cannot change them - two artists in the same room must not bill different tax rates,
      // which is the whole reason the rate lives on the shop.
      if (user.role > Constants.ROLES.SHOP_ADMIN) {
        throw new AuthenticationError(
          'Your shop sets the tax rate and processing offset - ask a shop admin to change them.',
        );
      }
      await assertCanAccessShop(user, shopId);
      const shop = await Shop.findByIdAndUpdate(
        shopId,
        {
          taxRateBasisPoints: data.taxRateBasisPoints,
          squareFeeOffsetCents: data.squareFeeOffsetCents,
        },
        { new: true },
      );
      if (!shop) {
        throw new UserInputError('Errors', { errors: { shopId: 'Shop not found.' } });
      }
      return {
        source: 'shop',
        ownerName: shop.name,
        taxRateBasisPoints: shop.taxRateBasisPoints || 0,
        squareFeeOffsetCents: shop.squareFeeOffsetCents || 0,
        canEdit: true,
      };
    }

    // Independent. Looked up by the caller's own userId rather than a supplied artistId, so there
    // is no ownership check to get wrong - the same shape updateMyBookingSlug uses.
    const artist = await Artist.findOneAndUpdate(
      { userId: user.id },
      {
        taxRateBasisPoints: data.taxRateBasisPoints,
        squareFeeOffsetCents: data.squareFeeOffsetCents,
      },
      { new: true },
    );
    if (!artist) {
      // Same refusal as any other - a non-artist calling this learns nothing about what exists.
      throw new AuthenticationError('Action not allowed');
    }
    return {
      source: 'artist',
      ownerName: null,
      taxRateBasisPoints: artist.taxRateBasisPoints || 0,
      squareFeeOffsetCents: artist.squareFeeOffsetCents || 0,
      canEdit: true,
    };
  }),
};
