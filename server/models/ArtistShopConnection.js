const mongoose = require('mongoose');

// Minimal slice of the full artist-centric tenancy model - see PRODUCTION_ROADMAP.md's
// "Artist-centric tenancy model" section. Deliberately does NOT include invite-link tokens,
// shop-directory search, or billing-tier enforcement yet - tier enforcement specifically needs
// the Square Subscriptions integration wired up first (decided: Square handles all financial
// transactions, including subscriptions), which is real, separate work. This model exists solely
// to give Appointment.shopId something real to check against - see mutations/appointments.js.
//
// artistId is the artist's own User._id, not the Artist collection's own _id - matching the same
// convention Project.artistId and BookingRequest.artistId already use.
const ArtistShopConnectionSchema = new mongoose.Schema(
  {
    artistId: { type: mongoose.Schema.Types.ObjectId, required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // 'disconnected' is kept, not deleted, on purpose. The design calls for checking "a real
    // current OR historical connection" when authorizing an Appointment's shopId - disconnecting
    // stops future data from flowing to a shop, but never retroactively invalidates a shopId
    // already written to a past Appointment. Deleting the row here would make that check
    // indistinguishable from "never connected at all".
    status: { type: String, required: true, default: 'active', enum: ['active', 'disconnected'] },

    // THE INTERVAL. A membership is a period, not a flag.
    //
    // This row used to be reused across disconnect/reconnect cycles - status flipped on the same
    // document - so a reconnect OVERWROTE the previous period and there was no history at all. That
    // is the wrong shape for two rules that both depend on when somebody worked where:
    //
    //   - shop cut follows the SESSION date against the interval, so an artist who leaves in March
    //     and finishes a project in July owes nothing on the July sittings (DECISIONS.md A1);
    //   - an artist keeps visibility of everything from the period they were connected, and the gap
    //     stays invisible to the shop (DECISIONS.md S1).
    //
    // Neither is answerable from a boolean. Reconnecting now opens a NEW row.
    //
    // endedAt null means "still here" - a real open interval, not a sentinel date. Querying
    // "was this artist here on date D" is startedAt <= D AND (endedAt is null OR endedAt > D),
    // which is the same half-open [start, end) convention the rest of this codebase uses for dates.
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date, default: null },

    // Kept as an alias of endedAt for the existing readers that check it. New code should use
    // endedAt; this is written alongside so nothing silently reads null on a closed interval during
    // the transition.
    disconnectedAt: { type: Date },
    // Which side's rate/billingType this artist's sessions are computed against at this shop -
    // the shop's own hourlyRate/flatRate/billingType, or the artist's personal ones (User.hourlyRate
    // etc.). Lives on the connection, not on User or Shop directly, since an artist could in
    // principle be connected to more than one shop later and might reasonably use a different
    // rate at each. Defaults to 'shop' - the common case (booth-rent/commission shop sets the
    // rate everyone bills at), with 'own' as the explicit opt-out for an artist whose personal
    // rate should be used instead.
    rateSource: { type: String, required: true, default: 'shop', enum: ['shop', 'own'] },
    // Per-artist override of Shop.shopCutPercent. Null (the default) means "use the shop's rate" -
    // which is NOT the same as 0, and that distinction is the whole reason this is nullable rather
    // than defaulting to 0: a guest artist who genuinely owes the shop nothing is a real
    // arrangement, and it has to be expressible as something other than "unset". See
    // utils/shop-cut.js's resolveShopCutPercent.
    //
    // DEPRECATED AS THE AUTHORITY. A rate can change without a reconnect, so a single number on the
    // membership cannot say what applied last March (DECISIONS.md M7). models/ShopCutRate.js holds
    // the effective-dated history and is what resolveShopCutPercentAt reads. This field remains as
    // the SEED for the first rate row when a connection is opened, and as the fallback for
    // connections that predate the rate history.
    shopCutPercent: { type: Number, default: null },
  },
  { timestamps: true }
);

// The interval query: this artist's memberships, newest first.
ArtistShopConnectionSchema.index({ artistId: 1, startedAt: -1 });
ArtistShopConnectionSchema.index({ shopId: 1, startedAt: -1 });

// AT MOST ONE OPEN MEMBERSHIP PER ARTIST, enforced by the database.
//
// The unique index here used to be on { artistId, shopId } outright, which is what forced the
// row-reuse that destroyed the history. It cannot simply be dropped: "an artist works at one shop
// at a time" is a real rule this app already enforces in application code (see
// mutations/artistShopConnections.js's confirmed-transfer flow), and without an index it survives
// only as long as nobody races it.
//
// Partial, on open intervals only. That says exactly what is meant - never two current memberships,
// any number of closed ones - where the old index said "never two memberships, ever".
ArtistShopConnectionSchema.index(
  { artistId: 1 },
  { unique: true, partialFilterExpression: { endedAt: null } }
);

const ArtistShopConnection = mongoose.model('ArtistShopConnection', ArtistShopConnectionSchema);

/**
 * Was this artist at this shop at the given moment?
 *
 * Half-open [startedAt, endedAt): a session on the exact day a membership ended belongs to the
 * period that ended, not the one that started. Same convention as every other date range here.
 */
ArtistShopConnection.membershipQueryAt = (artistUserId, at) => ({
  artistId: artistUserId,
  startedAt: { $lte: at },
  $or: [{ endedAt: null }, { endedAt: { $gt: at } }],
});

module.exports = ArtistShopConnection;
