const mongoose = require('mongoose');

/**
 * What percentage an artist owed a shop, and from when.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE COLLECTION AND NOT A NUMBER ON THE MEMBERSHIP
 *
 * A rate change applies FORWARD ONLY - it never reprices work already performed (DECISIONS.md M7).
 * A single `shopCutPercent` on the membership interval cannot express that, for one reason: a rate
 * can change WITHOUT a reconnect. An artist renegotiating from 40% to 35% in June, having worked at
 * the same shop since January, produces no new interval - so with one number per interval, June's
 * change would silently become January's rate too, and every payout back to January would recompute
 * at 35% the next time anything touched it.
 *
 * Rows here are append-only. Changing a rate writes a new row; it never edits an old one. That is
 * what makes "forward only" a property of the data rather than a rule someone has to remember.
 *
 * WHY NOT JUST TRUST Appointment.shopCutPercentApplied
 *
 * That field records what was used on each row and is why existing payouts are safe today. But it
 * is a RESULT, not an input - it can only answer "what did we charge", never "what should we charge
 * for this session I am entering now, dated last week". A back-dated appointment, a corrected
 * subtotal, or a session created after a rate change all need the rate as of the WORK's date, and
 * only a history can supply that.
 * ---------------------------------------------------------------------------------------------
 */
const shopCutRateSchema = new mongoose.Schema(
  {
    // The artist's own User._id, matching the convention used by ArtistShopConnection.artistId,
    // Project.artistId and BookingRequest.artistId. Not the Artist collection's _id.
    artistId: { type: mongoose.Schema.Types.ObjectId, required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Percentage, e.g. 40 for 40%. NOT nullable, unlike ArtistShopConnection.shopCutPercent - a row
    // here is an explicit statement that this rate applied from this date. "Use the shop's default"
    // is expressed by having no row at all, not by a null inside one.
    percent: { type: Number, required: true, min: 0, max: 100 },

    // Inclusive lower bound. The rate in force for a given date is the row with the greatest
    // effectiveFrom that is <= that date.
    //
    // Stored rather than derived from createdAt, because they are different questions: createdAt is
    // when somebody typed it in, effectiveFrom is when it started applying. Back-dating a
    // renegotiation to the start of the month is a normal thing to want, and conflating the two
    // makes it impossible.
    effectiveFrom: { type: Date, required: true, default: Date.now },

    // Who changed it. A rate is money; a change with no author is not auditable.
    setByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    note: { type: String, default: '' },

    createdAt: { type: Date, required: true, default: Date.now },
  },
  { minimize: false }
);

// THE resolution query: this pair's rates at or before a date, newest first, take one.
shopCutRateSchema.index({ artistId: 1, shopId: 1, effectiveFrom: -1 });

// One rate per pair per instant. Two rows with the same effectiveFrom would make "the rate that
// applied" ambiguous, and the tie would be broken by whichever the index happened to return -
// silently, and differently on a different day.
shopCutRateSchema.index({ artistId: 1, shopId: 1, effectiveFrom: 1 }, { unique: true });

module.exports = mongoose.model('ShopCutRate', shopCutRateSchema);
