const mongoose = require('mongoose');

/**
 * One partial (or full) spend of a gift card against a session - the ledger that makes
 * GiftCard.balanceCents auditable rather than asserted.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A SEPARATE COLLECTION, NOT AN EMBEDDED ARRAY ON GiftCard
 *
 * Same reasoning as ShopCutRate living apart from ArtistShopConnection (see that model's own
 * comment): this is an append-only log of a financial EVENT, not a piece of the card's current
 * state, and two things need it queryable on its own rather than nested inside a parent document:
 *
 *   - DECISIONS.md M6's required report ("outstanding balance, card count, oldest issue date") is
 *     about GiftCard, but a fuller ledger view - which cards redeemed against which appointments,
 *     when - is a query over REDEMPTIONS, filterable by date or by appointment, that an embedded
 *     array can't index or aggregate over without loading every parent GiftCard document first.
 *   - redeemGiftCard needs "has this appointment already drawn from this card" and equivalent
 *     questions answerable without holding the whole card in memory and scanning an array by hand.
 *
 * A top-level collection also matches how balance corrections would be audited if one were ever
 * needed: sum the rows, don't trust the cached number. GiftCard.balanceCents stays as a cache for
 * cheap reads (checkout can't afford to aggregate a ledger on every redemption attempt), but this
 * collection is the thing it is a cache OF.
 * ---------------------------------------------------------------------------------------------
 */
const giftCardRedemptionSchema = new mongoose.Schema(
  {
    giftCardId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    redeemedAt: { type: Date, required: true, default: Date.now },
    // Who processed the redemption - the artist doing the session, ordinarily. Not necessarily the
    // card's issuer: a SHOP-issued card is explicitly redeemable by any artist at the shop, and
    // even an ARTIST-issued card's redemption is initiated by whoever is running that session
    // (which, per the lock, can only be the issuing artist themselves - see
    // resolvers/giftCards.js's redeemGiftCard).
    redeemedByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // The DECISIONS.md M6 payout formula's result for THIS redemption - see
    // utils/gift-card.js's computeShopIssuedGiftCardPayoutCents for the formula and its sign
    // convention (positive: artist owes shop; negative: shop owes artist).
    //
    // NULL for an ARTIST-issued card's redemption, deliberately, not zero - M6 is explicit that an
    // artist-issued card "never reaches a second party to net against" (the cut was already taken
    // at the sale, on the artist's own money, per M3). Zero would read as "netted to nothing";
    // null reads as "there was nothing to net in the first place", which is the true state.
    shopPayoutCents: { type: Number, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('GiftCardRedemption', giftCardRedemptionSchema);
