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
    disconnectedAt: { type: Date },
    // Which side's rate/billingType this artist's sessions are computed against at this shop -
    // the shop's own hourlyRate/flatRate/billingType, or the artist's personal ones (User.hourlyRate
    // etc.). Lives on the connection, not on User or Shop directly, since an artist could in
    // principle be connected to more than one shop later and might reasonably use a different
    // rate at each. Defaults to 'shop' - the common case (booth-rent/commission shop sets the
    // rate everyone bills at), with 'own' as the explicit opt-out for an artist whose personal
    // rate should be used instead.
    rateSource: { type: String, required: true, default: 'shop', enum: ['shop', 'own'] },
  },
  { timestamps: true }
);

// One connection record per artist/shop pair, reused across disconnect/reconnect cycles (status
// flips on the same document rather than a new one each time) - simplest way to answer "has this
// artist and shop ever been connected" is a single lookup, not a scan across history.
ArtistShopConnectionSchema.index({ artistId: 1, shopId: 1 }, { unique: true });

module.exports = mongoose.model('ArtistShopConnection', ArtistShopConnectionSchema);
