const mongoose = require('mongoose');

/**
 * What a booth-rent artist owes their shop, flat, and from when - the booth-rent counterpart to
 * ShopCutRate's percentage. See models/ShopCutRate.js's compensationModel field for which model
 * an artist is actually on; this only describes the TERMS of the flat-fee model, for artists on
 * it. An artist can be on BOOTH_RENT with no BoothRentPlan row for a moment - the two are set by
 * separate mutations (setShopCutRate flips the model, setBoothRentPlan sets the terms) - see
 * resolvers/boothRent.js.
 *
 * APPEND-ONLY, same reasoning as ShopCutRate (DECISIONS.md M7): a rent amount can change without
 * the compensation model itself changing, and a change must never reprice a month that already
 * generated its charge. Changing the rent writes a new dated row; it never edits an old one.
 *
 * `active` is informational only - it is NOT a filter utils/booth-rent.js's generator applies.
 * The generator's real gate is whether ShopCutRate currently resolves this artist/shop pair to
 * BOOTH_RENT (see generateDueBoothRentCharges); resolveBoothRentPlanAt always finds the newest
 * dated row for a period regardless of `active`, the same way resolveShopCutPercentAt never looks
 * at a boolean either. It exists purely so a shop admin's UI can show "no longer the current
 * plan" without deleting a row a past BoothRentCharge still needs to explain itself.
 */
const boothRentPlanSchema = new mongoose.Schema({
  // The artist's own User._id, matching the convention ShopCutRate.artistId/
  // ArtistShopConnection.artistId/Project.artistId all already use.
  artistId: { type: mongoose.Schema.Types.ObjectId, required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true, min: 0 },
  // 1-31. A shorter month (February) clamps to its own real last day rather than rolling into the
  // next month - see utils/booth-rent.js's dueDateForPeriod.
  dueDayOfMonth: { type: Number, required: true, min: 1, max: 31 },
  // Who set it. A rent amount is money, same reasoning as ShopCutRate.setByUserId.
  setByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  effectiveFrom: { type: Date, required: true, default: Date.now },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

// THE resolution query, identical shape to ShopCutRate's own: this pair's plans at or before a
// date, newest first, take one.
boothRentPlanSchema.index({ artistId: 1, shopId: 1, effectiveFrom: -1 });

// One plan per pair per instant - same tie-breaking concern ShopCutRate's own unique index
// exists to prevent.
boothRentPlanSchema.index({ artistId: 1, shopId: 1, effectiveFrom: 1 }, { unique: true });

module.exports = mongoose.model('BoothRentPlan', boothRentPlanSchema);
