const mongoose = require('mongoose');

/**
 * A category non-tattoo income is logged against - "Retail/Merch", "Piercing", "Booth Rent
 * Collected". See models/ExpenseType.js - same shape, same reasoning (owned rather than seeded,
 * deactivated rather than deleted), for the income side of the same bookkeeping feature.
 */
const incomeTypeSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

incomeTypeSchema.index(
  { shopId: 1, name: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } },
);
incomeTypeSchema.index(
  { artistUserId: 1, name: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' } } },
);

module.exports = mongoose.model('IncomeType', incomeTypeSchema);
