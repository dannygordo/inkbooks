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
    avatar: { type: String, default: "" },
    shopId: { type: mongoose.Schema.Types.ObjectId },
    userId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: Number },
  },
  {
    timestamps: true,
  }
);
module.exports = mongoose.model("Artist", ArtistSchema);
