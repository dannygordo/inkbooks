const mongoose = require("mongoose");

const ArtistSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    title: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    startDate: { type: Date },
    endDate: { type: Date },
    hourlyRate: { type: Number },

    // --- Square pricing, for an INDEPENDENT artist ----------------------------------------------
    // An artist connected to a shop uses the SHOP's values: tax is destination-based, so it belongs
    // to where the work happens, and one artist billing a different tax rate than the chair next to
    // them would be wrong twice over. These apply only when there is no shop.
    // See utils/square-pricing.js, which is the one place that decides which set applies.
    taxRateBasisPoints: { type: Number, default: 0 },
    squareFeeOffsetCents: { type: Number, default: 0 },
    // Added alongside Shop.flatRate so an artist can express a flat-rate expectation for
    // sessions, not just hourly - see billingType below. Which one actually gets used to compute
    // a session's total, and whether the shop's rate is used instead when this artist is
    // shop-connected, is decided by ArtistShopConnection.rateSource, not here - this only says
    // what the artist's *own* rate is, for when 'own' is selected (or there's no shop at all).
    flatRate: { type: Number },
    billingType: { type: String, enum: ['hourly', 'flat_rate'], default: 'hourly' },
    avatar: { type: String, default: "" },
    // The artist's public booking handle - /book/<slug>. See utils/booking-slug.js.
    //
    // sparse, because unique + null is a trap: without it, the SECOND artist created without a
    // slug collides with the first on a shared null. sparse means the index only covers documents
    // that actually have one, so "no booking link yet" stays a legal state for as many artists as
    // like. (This is the same shape of bug that the deleted User.username left behind in a stale
    // index - see the syncIndexes note in scripts/seed.js.)
    //
    // Chosen by the artist, never derived and assigned silently. An auto-generated handle nobody
    // picked and nobody was shown is exactly what username was, and it was invisible to its owner
    // right until it locked them out. suggestSlug() prefills the field; the artist confirms it.
    bookingSlug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    // No shopId here, deliberately. Which shop an artist works at is ArtistShopConnection and
    // nothing else (see utils/artist-shop.js). This model used to carry the field as well, and the
    // two disagreed: connectArtistToShop only ever wrote the connection, so an artist connected
    // through the real flow had a null Artist.shopId, which the whole client reads as "independent
    // artist" - and the client puts that value on every appointment it creates. Their sessions
    // were written with no shop at all: no shop cut, no revenue for the shop, nothing erroring.
    // Don't add it back as a convenience cache; that is exactly what it was.
    userId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: Number },
  },
  {
    timestamps: true,
  }
);
module.exports = mongoose.model("Artist", ArtistSchema);
