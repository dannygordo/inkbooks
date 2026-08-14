const mongoose = require('mongoose');
const { normalizeGiftCardCode } = require('../utils/gift-card');

/**
 * A gift card - see DECISIONS.md M6 for the full design, including the earlier framing this
 * replaced (shop-level liability whenever the artist was shop-connected) and why it was wrong: a
 * client charge settles into the ARTIST's own Square account, never the shop's (M9), so liability
 * has to follow who actually issued the card, not a connection status.
 *
 * ---------------------------------------------------------------------------------------------
 * TWO ISSUER TYPES, NOT ONE FLOW WITH A FLAG. They are different money events end to end:
 *
 *   ARTIST - sold by one artist, for that artist alone. LOCKED to them at redemption (see
 *            resolvers/giftCards.js's redeemGiftCard) - no other artist, and not the shop either,
 *            will honour it. The shop's cut is taken AT THE SALE, exactly as if the sale were a
 *            consult deposit (M3): applyShopCut runs against a synthetic sale-shaped object (this
 *            document is not an Appointment - see the comment on buildSyntheticGiftCardSale in
 *            resolvers/giftCards.js for why a small synthetic object was chosen over reshaping
 *            applyShopCut itself) and its result - shopCutCents/shopCutPercentApplied/
 *            shopCutStatus - is stored on THIS document, in the same fields and with the same
 *            meaning Appointment uses them for. That is deliberate: it lets this card be invoiced,
 *            marked paid, and confirmed through mirrors of the exact same dual-control machinery
 *            already built for an appointment's shop cut (mutations/shopCutPayments.js) rather
 *            than a second, parallel one.
 *
 *   SHOP   - sold as a shop product. No Client record or artist session is needed to make the sale
 *            at all - it is always charged by a shop admin, into THEIR OWN Square account (every
 *            shop admin is an artist too, S0, so they have one like anyone else). But none of that
 *            money is the admin's - the full face value is owed to the shop, at 100%, through the
 *            same mechanism described above. Redeemable against ANY artist's session at the shop;
 *            see utils/gift-card.js's computeShopIssuedGiftCardPayoutCents for the net settlement
 *            that produces between the shop and whichever artist eventually does the redeemed
 *            work - that number is NOT stored here, it is computed fresh per redemption and stored
 *            on the GiftCardRedemption row it belongs to (see models/GiftCardRedemption.js).
 * ---------------------------------------------------------------------------------------------
 *
 * shopId IS NOT REQUIRED AT THE SCHEMA LEVEL, even though the field list this shipped against says
 * "both issuer types need one". A SHOP-issued card always has one - it cannot exist without a shop
 * to be a product of. An ARTIST-issued card usually does (their active shop at the moment of sale,
 * resolved server-side, never taken from the caller - see resolvers/giftCards.js), but M6 is
 * explicit that an independent artist can issue one too ("An independent artist's card carries no
 * cut at all, same as M1's 0-with-no-shop case") - and an independent artist has no shop to put
 * here. Making this required would make that case unrepresentable. The redemption lock for an
 * ARTIST-issued card is on issuerArtistId alone, never on shopId, for the same reason: it is locked
 * to the PERSON who sold it, not to whichever shop they happened to be at that day.
 */
const giftCardSchema = new mongoose.Schema(
  {
    // See utils/gift-card.js's generateGiftCardCode/normalizeGiftCardCode - random, not derived
    // from any other field on this document (M6: a hash is opaque and still needs this row, and
    // guessable inputs make codes enumerable). Stored in its display form (XXXX-XXXX-XXXX).
    code: { type: String, required: true, unique: true, index: true },
    // The same code, uppercased with dashes stripped - what a lookup actually queries on, so a
    // caller who types a code back without the dashes or in lowercase isn't told a real card
    // doesn't exist. Derived from `code` in the pre-validate hook below rather than trusted from
    // the caller, so there is exactly one place this can ever disagree with `code` itself.
    codeNormalized: { type: String, required: true, unique: true, index: true },

    issuerType: { type: String, required: true, enum: ['ARTIST', 'SHOP'] },
    // The artist's own User._id, matching the convention every other artist-identifying field in
    // this codebase uses (ArtistShopConnection.artistId, Project.artistId, ShopCutRate.artistId) -
    // not the Artist collection's own _id. Required exactly when issuerType is ARTIST; enforced in
    // the pre-validate hook below rather than by a bare `required: true`, since Mongoose's
    // declarative required doesn't have a way to say "required, conditioned on a sibling field".
    issuerArtistId: { type: mongoose.Schema.Types.ObjectId },
    // See the class comment above on why this is NOT required at the schema level.
    shopId: { type: mongoose.Schema.Types.ObjectId },

    // Integer cents throughout - see utils/money.js.
    faceValueCents: { type: Number, required: true, min: 1 },
    // What is still spendable. Starts equal to faceValueCents and only ever decreases, by
    // redemption amounts recorded in GiftCardRedemption - see that model's own comment on why the
    // ledger is a separate collection rather than an array here. NEVER decreased by
    // feeOffsetCents: M6 is explicit that the offset "does not load onto the balance" - a client
    // who bought a $200 card holds $200 of credit no matter what the sale actually totalled.
    balanceCents: { type: Number, required: true, min: 0 },
    // Recorded for audit ("what did this sale actually total") but deliberately never combined
    // with faceValueCents/balanceCents - see the comment on balanceCents above.
    feeOffsetCents: { type: Number, default: 0 },

    soldAt: { type: Date, required: true, default: Date.now },
    // Who actually ran the sale. For an ARTIST-issued card this is always issuerArtistId - the
    // artist is the one selling their own card, there is no path where someone sells it for them.
    // For a SHOP-issued card this is whichever shop admin rang it up, which is why the two fields
    // exist separately rather than reusing one.
    soldByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // --- Shop-cut ledger fields - SAME NAMES AND MEANING AS Appointment's, deliberately. ---
    // See the class comment above: this is what lets a gift card's shop-cut settlement flow
    // through mirrors of the existing dual-control invoice machinery (Square invoice, or manual
    // mark-paid/confirm) instead of a second implementation of it. 'none' is not a reachable state
    // here the way it is on an Appointment with no shopId - a gift card either has no cut to settle
    // yet (independent artist, shopId null) or genuinely owes one; see resolvers/giftCards.js.
    shopCutStatus: {
      type: String,
      enum: ['none', 'unpaid', 'invoice_sent', 'pending_confirmation', 'paid'],
      default: 'none',
    },
    // ARTIST-issued: this artist's own configured rate, resolved and applied at the sale (M1/M3).
    // SHOP-issued: always 100 - "not the admin's own artist rate" (M6, verbatim).
    shopCutCents: { type: Number, default: 0 },
    shopCutPercentApplied: { type: Number },
    shopCutPaymentMethod: { type: String, enum: ['square_invoice', 'manual'] },
    shopCutSquareInvoiceId: { type: String },
    shopCutMarkedPaidBy: { type: mongoose.Schema.Types.ObjectId },
    shopCutMarkedPaidAt: { type: Date },
    shopCutConfirmedBy: { type: mongoose.Schema.Types.ObjectId },
    shopCutConfirmedAt: { type: Date },
  },
  { timestamps: true },
);

// PROMISE-STYLE, NO `next` CALLBACK - deliberately, not a style preference. Mongoose 9's
// `document.validate()` (called directly, the way redeemGiftCard's `GiftCard.exists`/`.save()`
// path and this file's own tests do) throws `TypeError: next is not a function` against a
// callback-style hook - found by actually invoking `.validate()` in isolation while verifying
// this file, since nothing else in this codebase's models uses `.pre()` to have hit it already.
// An async function with no `next` parameter is what Mongoose's own docs recommend for 6+, and it
// sidesteps the callback-detection path entirely.
giftCardSchema.pre('validate', async function conditionallyRequireIssuerArtistId() {
  if (this.issuerType === 'ARTIST' && !this.issuerArtistId) {
    this.invalidate('issuerArtistId', 'An artist-issued gift card needs the artist who issued it.');
  }
  if (this.issuerType === 'SHOP' && !this.shopId) {
    this.invalidate('shopId', 'A shop-issued gift card needs the shop it was sold for.');
  }
  if (this.code) {
    this.codeNormalized = normalizeGiftCardCode(this.code);
  }
});

// The report DECISIONS.md M6 requires (outstanding balance, card count, oldest issue date) is
// scoped by shop and filters on an outstanding balance - both hit by this index.
giftCardSchema.index({ shopId: 1, balanceCents: 1 });
giftCardSchema.index({ issuerArtistId: 1 });

module.exports = mongoose.model('GiftCard', giftCardSchema);
