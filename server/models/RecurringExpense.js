const mongoose = require('mongoose');

/**
 * A template that generates real Expense rows on a schedule - "Rent, $2,000, monthly."
 *
 * ---------------------------------------------------------------------------------------------
 * A TEMPLATE, NOT A LEDGER ROW. This describes what recurs; it is never itself the money. Every
 * occurrence is a real, independent Expense document (see models/Expense.js's recurringExpenseId)
 * that can be edited or deleted on its own without touching this row or any other occurrence -
 * "the March entry was actually $50 more" is a fact about one Expense, not about the template.
 *
 * nextRunDate IS THE CURSOR. utils/recurring-expenses.js's generator finds every active template
 * with nextRunDate <= now, writes an Expense dated nextRunDate, and advances nextRunDate by one
 * `frequency` step - so the field always means "the next date this is due," both before and after
 * a run. A template with nextRunDate in the future has nothing left to do today.
 *
 * CATCH-UP, NOT SKIP. If the app was down for two months, the generator writes both missed months
 * rather than jumping straight to today - the rent was actually due each of those months, and an
 * expense ledger that quietly drops a period is worse than one that runs a few minutes late.
 *
 * IDEMPOTENT BY CONSTRUCTION, not by a lock on this row. Expense carries a partial unique index on
 * {recurringExpenseId, date} (models/Expense.js) - a duplicate write from a retried tick fails at
 * the database rather than needing this document to coordinate anything.
 *
 * PAUSED, NOT DELETED, via `active`. Deleting a template that already generated real Expense rows
 * would orphan their recurringExpenseId; pausing stops future generation while the history and the
 * "what generates what" link both stay intact.
 * ---------------------------------------------------------------------------------------------
 */
const recurringExpenseSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  expenseTypeId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amountCents: { type: Number, required: true },
  description: { type: String, default: '' },
  frequency: { type: String, required: true, enum: ['weekly', 'monthly', 'yearly'] },
  // The first occurrence's date, and the cursor's starting value - see the model comment above.
  startDate: { type: Date, required: true },
  nextRunDate: { type: Date, required: true },
  // Null means "runs indefinitely." Set means "the last occurrence is on or before this date" -
  // generateDueRecurringExpenses stops advancing past it rather than generating one final row
  // exactly on the boundary and then silently going quiet forever after.
  endDate: { type: Date, default: null },
  active: { type: Boolean, default: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
});

// The generator's own query: every active template whose next occurrence is due.
recurringExpenseSchema.index({ active: 1, nextRunDate: 1 });
recurringExpenseSchema.index({ shopId: 1 });
recurringExpenseSchema.index({ artistUserId: 1 });

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
