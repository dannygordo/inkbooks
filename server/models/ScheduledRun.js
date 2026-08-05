const mongoose = require('mongoose');

/**
 * One row per (job, period). The unique index is the double-send guarantee.
 *
 * The scheduler is a setInterval in the API process (NOTIFICATIONS_DESIGN.md §8). That is fine on
 * one instance and sends every digest twice on two - and the failure is invisible in development,
 * where there is only ever one instance, so it would first appear in production as customers
 * receiving duplicate email.
 *
 * The obvious guard is to check whether the job already ran and skip if so. That is a race by
 * construction: two instances both check, both see nothing, both run. The same shape as the
 * booking-slug availability check, and the same answer - the CHECK is a courtesy, the INDEX is the
 * guarantee. Claiming a period here is an insert, so the loser gets a duplicate-key error instead
 * of a second send.
 *
 * periodStart is the START of the window a run covers, floored to the job's cadence - not the
 * moment the run happened. That is what makes the key meaningful: two instances waking a few
 * milliseconds apart compute the same periodStart and therefore collide, which is exactly the
 * behaviour wanted. Keying on the wall clock would make every run unique and the index useless.
 */
const ScheduledRunSchema = new mongoose.Schema({
  job: { type: String, required: true },
  periodStart: { type: Date, required: true },

  // Claimed when the insert succeeds; completed when the work finishes. A row with startedAt and
  // no finishedAt that is hours old means a run died partway - worth being able to see, which is
  // why this isn't just a marker row.
  startedAt: { type: Date, required: true, default: Date.now },
  finishedAt: { type: Date },
  // What the run did, for the same reason. A sweep that quietly produced nothing for a week should
  // be answerable from the database rather than from log archaeology.
  summary: { type: String },
  error: { type: String },
});

// THE guarantee. Not an optimisation.
ScheduledRunSchema.index({ job: 1, periodStart: 1 }, { unique: true });

// These are operational breadcrumbs, not records anybody needs for a year. Thirty days is enough
// to answer "did the digest run last Tuesday" and short enough that the collection stays small.
ScheduledRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ScheduledRun', ScheduledRunSchema);
