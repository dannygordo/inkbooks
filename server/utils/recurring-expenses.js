const RecurringExpense = require('../models/RecurringExpense');
const Expense = require('../models/Expense');

/**
 * Turns RecurringExpense templates into real Expense rows - see models/RecurringExpense.js for
 * the full design (template vs. ledger row, the catch-up rule, the idempotency guard). This file
 * is the sweep that reads "what's due" and writes "what happened."
 */

// A safety valve, not a business rule. Nothing legitimate should ever need more than a few years
// of missed monthly occurrences caught up in one sweep - this exists so a corrupted nextRunDate
// (e.g. stuck in 1970) fails loudly by running out of budget rather than writing years of rows in
// a single tick.
const MAX_OCCURRENCES_PER_TEMPLATE_PER_RUN = 60;

// UTC arithmetic, deliberately - this runs on the server with no viewer to be local FOR (compare
// client/scripts/check-no-utc-display.mjs's rule, which is about not showing a stored instant in
// the wrong zone; there is no display happening here). A fixed calendar rule computed in UTC
// advances the same way regardless of which machine or timezone the server process happens to be
// running in, which a local-time computation would not guarantee.
function advanceByFrequency(date, frequency) {
  const next = new Date(date);
  if (frequency === 'weekly') {
    next.setUTCDate(next.getUTCDate() + 7);
  } else if (frequency === 'yearly') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    // 'monthly' - the only remaining value the schema's enum allows.
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/**
 * Generates every Expense row currently due across every active RecurringExpense template.
 *
 * CATCH-UP: a template whose nextRunDate is weeks or months in the past (the app was down, or
 * this is the first run after the template was created with a startDate already elapsed) writes
 * one Expense per missed occurrence, not one for "now" - see the model's own comment on why.
 * Capped per template by MAX_OCCURRENCES_PER_TEMPLATE_PER_RUN so a bad row can't run away.
 *
 * IDEMPOTENT: a duplicate write (a retried tick, two instances racing the same template) collides
 * with Expense's partial unique index on {recurringExpenseId, date} and is caught here as a
 * no-op, not an error - see models/Expense.js.
 *
 * The advance is a single conditional update keyed on the nextRunDate this run actually read
 * (`{_id, nextRunDate: template.nextRunDate}`), not a blind $set - so a second process racing the
 * same template for the same period matches nothing on its own write and does not stomp progress
 * the first process already made.
 */
async function generateDueRecurringExpenses({ now = new Date() } = {}) {
  const due = await RecurringExpense.find({ active: true, nextRunDate: { $lte: now } });

  let templatesProcessed = 0;
  let generated = 0;
  let skippedDuplicate = 0;

  for (const template of due) {
    templatesProcessed += 1;
    const startingNextRunDate = template.nextRunDate;
    let cursor = startingNextRunDate;
    let iterations = 0;

    while (
      cursor <= now &&
      (!template.endDate || cursor <= template.endDate) &&
      iterations < MAX_OCCURRENCES_PER_TEMPLATE_PER_RUN
    ) {
      iterations += 1;
      try {
        await new Expense({
          shopId: template.shopId,
          artistUserId: template.artistUserId,
          expenseTypeId: template.expenseTypeId,
          amountCents: template.amountCents,
          description: template.description,
          date: cursor,
          recurringExpenseId: template._id,
          createdByUserId: template.createdByUserId,
        }).save();
        generated += 1;
      } catch (err) {
        if (err && err.code === 11000) {
          // Already generated - a previous run got here first. Not a failure; keep advancing.
          skippedDuplicate += 1;
        } else {
          throw err;
        }
      }
      cursor = advanceByFrequency(cursor, template.frequency);
    }

    // Past its endDate and has nothing left to generate - deactivated rather than left "active"
    // forever with a nextRunDate it will never actually reach, which would otherwise look like a
    // live template on every list from now on.
    const finished = Boolean(template.endDate) && cursor > template.endDate;
    await RecurringExpense.updateOne(
      { _id: template._id, nextRunDate: startingNextRunDate },
      { $set: { nextRunDate: cursor, ...(finished ? { active: false } : {}) } },
    );
  }

  return { templatesProcessed, generated, skippedDuplicate };
}

module.exports = { generateDueRecurringExpenses, advanceByFrequency };
