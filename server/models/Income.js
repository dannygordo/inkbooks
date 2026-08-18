const mongoose = require('mongoose');

/**
 * Real money in that ISN'T a tattoo session - retail sales, piercing, booth rent collected from
 * another artist, anything computeAnalytics' revenueCents (Appointment.totalCents on completed
 * sessions) doesn't already cover. Kept as its own collection rather than another Appointment
 * type: this has no client, no project, no shop-cut lifecycle - none of the machinery that shape
 * carries, and forcing it through Appointment would mean a dozen fields that never apply here.
 *
 * No recurring counterpart (unlike Expense) - not asked for, and unlike a lease or a subscription,
 * non-tattoo income doesn't have the same "the same amount, on the same schedule" shape by default.
 */
const incomeSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  incomeTypeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true },
  description: { type: String, default: '' },
  date: { type: Date, required: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

incomeSchema.index({ shopId: 1, date: -1 });
incomeSchema.index({ artistUserId: 1, date: -1 });

module.exports = mongoose.model('Income', incomeSchema);
