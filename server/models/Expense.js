const mongoose = require('mongoose');

/**
 * Real money out - rent, supplies, insurance, a recurring subscription's monthly charge.
 *
 * ---------------------------------------------------------------------------------------------
 * recurringExpenseId is set ONLY on a row the scheduler wrote (see
 * utils/recurring-expenses.js and models/RecurringExpense.js) - null on anything logged by hand.
 * It is a back-reference, not a lock: an auto-generated row can be edited or deleted exactly like
 * a manual one. Editing changes only that occurrence; the template it came from is untouched and
 * will generate the next one on schedule regardless.
 *
 * THE UNIQUE INDEX ON {recurringExpenseId, date} IS THE IDEMPOTENCY GUARD for the whole recurring
 * system - see RecurringExpense's own comment. A retried scheduler tick that tries to write the
 * same occurrence twice fails at the database, not by trusting in-memory state to not double-fire.
 * Partial, so it says nothing about two unrelated manual expenses sharing a date - only about one
 * template's own occurrences.
 * ---------------------------------------------------------------------------------------------
 */
const expenseSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  expenseTypeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true },
  description: { type: String, default: '' },
  // The date the expense applies to - when it was incurred/paid, not when the row was typed in.
  // Analytics scope by this field, matching every other money figure in the app (see
  // utils/analytics.js's own header on why appointmentDate, not createdAt, is what a range means).
  date: { type: Date, required: true },
  recurringExpenseId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

expenseSchema.index({ shopId: 1, date: -1 });
expenseSchema.index({ artistUserId: 1, date: -1 });
expenseSchema.index(
  { recurringExpenseId: 1, date: 1 },
  { unique: true, partialFilterExpression: { recurringExpenseId: { $type: 'objectId' } } },
);

module.exports = mongoose.model('Expense', expenseSchema);
