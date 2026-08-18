const mongoose = require('mongoose');

/**
 * A documented reversal against an appointment - DECISIONS.md M4.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS NOT. M4 is explicit: "Nothing in InkBooks is refundable." InkBooks never calls
 * Square's refund API, and this row does not either - the actual money movement happens by hand,
 * in the Square app, BEFORE this gets written. This is the record of that having happened, not
 * the mechanism that makes it happen. There is no code path anywhere that reads an Adjustment and
 * moves money because of it.
 *
 * WHAT THIS ALSO IS NOT: a rewrite of the appointment's own figures. Recording one does not touch
 * Appointment.totalCents, tipCents or shopCutCents - those stay exactly what they were charged.
 * Reconciling "what this session shows" against "what was actually kept" is a manual, human
 * exercise done by reading both rows side by side, the same way a bank statement is reconciled
 * against a paper ledger. Folding this into the figures automatically would mean a shop's own
 * revenue number silently changes underneath a report someone already pulled - the opposite of
 * what an audit trail is for.
 *
 * amountCents is always a positive magnitude - the amount that was reversed. There is no signed
 * convention here because M4 only describes one direction: money going back. If a future need
 * ever requires the other direction, that is a deliberate schema change, not a sign flip nobody
 * agreed to.
 *
 * WHO MAY WRITE ONE mirrors S2 exactly, through utils/shop-membership.js's canManageArtist: the
 * appointment's own artist, or a shop admin who shares a shop with them. An independent artist has
 * no shop to share, so only they can ever pass for their own appointments - which is precisely
 * "shop-admin only where there is a shop; an unaffiliated artist adjusts their own."
 * ---------------------------------------------------------------------------------------------
 */
const adjustmentSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, required: true },

  // Denormalised off the appointment at write time, same reasoning as ClientFlag.shopId: scoping
  // and shop-wide reporting without a join, and a true record of which shop's admin this was (or
  // null, for an independent artist) even after a disconnect.
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, required: true },

  // A positive magnitude - see the model comment above for why there is no sign.
  amountCents: { type: Number, required: true },

  // Required, not optional - M4 says "recorded here as a shop-admin adjustment with a documented
  // reason." An adjustment with no reason is just a number nobody can audit later.
  reason: { type: String, required: true, trim: true },

  createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

// This appointment's adjustment history, newest first - what the session detail panel renders.
adjustmentSchema.index({ appointmentId: 1, createdAt: -1 });
// Shop-wide reporting, matching ClientFlag's and ShopCutRate's own indexing convention.
adjustmentSchema.index({ shopId: 1, createdAt: -1 });

module.exports = mongoose.model('Adjustment', adjustmentSchema);
