const mongoose = require('mongoose');

/**
 * A category an expense is logged against - "Rent", "Supplies", "Insurance".
 *
 * ---------------------------------------------------------------------------------------------
 * OWNED, NOT SEEDED. Unlike ClientFlagType (platform defaults plus an optional shop override),
 * there is no universal expense vocabulary worth shipping as a default - what a shop spends money
 * on is exactly the thing this table exists to let them define for themselves. See
 * utils/shop-membership.js's resolveBusinessOwner/assertCanManageBusinessRecord for the
 * shopId-XOR-artistUserId ownership shape this and every other business-record table shares.
 *
 * DEACTIVATED, NOT DELETED - same reasoning as ClientFlagType: an Expense keeps pointing at its
 * type by id, so removing the type out from under existing rows would orphan them. `active: false`
 * stops it being offered for a NEW expense while every existing one still resolves its label.
 * ---------------------------------------------------------------------------------------------
 */
const expenseTypeSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

// One name per owner - a shop (or an independent artist) shouldn't end up with two categories
// that mean the same thing because nobody noticed "Supplies" already existed. Partial, so the two
// owner shapes never collide with each other's index.
expenseTypeSchema.index(
  { shopId: 1, name: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } },
);
expenseTypeSchema.index(
  { artistUserId: 1, name: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' } } },
);

module.exports = mongoose.model('ExpenseType', expenseTypeSchema);
