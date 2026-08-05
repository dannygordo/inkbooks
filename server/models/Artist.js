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
    // Added alongside Shop.flatRate so an artist can express a flat-rate expectation for
    // sessions, not just hourly - see billingType below. Which one actually gets used to compute
    // a session's total, and whether the shop's rate is used instead when this artist is
    // shop-connected, is decided by ArtistShopConnection.rateSource, not here - this only says
    // what the artist's *own* rate is, for when 'own' is selected (or there's no shop at all).
    flatRate: { type: Number },
    billingType: { type: String, enum: ['hourly', 'flat_rate'], default: 'hourly' },
    avatar: { type: String, default: "" },
    // DEPRECATED - no longer read or written anywhere. Which shop an artist works at is
    // ArtistShopConnection, full stop (see utils/artist-shop.js). This field is left in place so
    // scripts/backfill-artist-connections.js has something to read and so no data is destroyed
    // before that has run everywhere; drop it once there's confidence nothing regressed.
    shopId: { type: mongoose.Schema.Types.ObjectId },
    userId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: Number },
  },
  {
    timestamps: true,
  }
);
module.exports = mongoose.model("Artist", ArtistSchema);
