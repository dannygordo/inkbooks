const { generateDueRecurringExpenses } = require('./recurring-expenses');
const { generateDueBoothRentCharges } = require('./booth-rent');

/**
 * The scheduled half of the expense/income feature - see utils/recurring-expenses.js. Kept in its
 * own file rather than folded into notification-jobs.js: this sweep has nothing to do with
 * notifications, and the two files' jobs are composed together at startup (see index.js) rather
 * than one importing the other.
 */
function businessJobs() {
  return [
    {
      // Daily is the finest grain any RecurringExpense frequency actually needs (the shortest
      // supported frequency is weekly) - but the scheduler's own lock makes a shorter, safer tick
      // free, so this runs hourly the same way notification-digests does: 23 no-op claims a day
      // cost nothing, and it means a template created mid-morning with a same-day nextRunDate
      // doesn't wait until a once-daily job's own fixed hour comes back around.
      name: 'recurring-expenses',
      everyMs: 60 * 60 * 1000,
      run: async () => {
        const result = await generateDueRecurringExpenses();
        return `templates=${result.templatesProcessed} generated=${result.generated} skipped=${result.skippedDuplicate}`;
      },
    },
    {
      // Feature 5 - see utils/booth-rent.js. Same hourly cadence and the same reasoning as
      // recurring-expenses above: rent is due monthly at the finest, but an hourly tick costs
      // nothing and means a newly-switched artist's first charge doesn't wait for a once-daily
      // job's fixed hour.
      name: 'booth-rent-charges',
      everyMs: 60 * 60 * 1000,
      run: async () => {
        const result = await generateDueBoothRentCharges();
        return `pairs=${result.pairsProcessed} generated=${result.generated} skipped=${result.skippedDuplicate}`;
      },
    },
  ];
}

module.exports = { businessJobs };
