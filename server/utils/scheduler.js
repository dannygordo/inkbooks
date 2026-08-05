const ScheduledRun = require('../models/ScheduledRun');

/**
 * A small scheduler: an interval in this process, plus a database lock so a second process can't
 * do the same work twice.
 *
 * Deliberately not a job queue. The jobs here are idempotent sweeps that run hourly or daily, and
 * a queue would be more infrastructure than the problem needs (NOTIFICATIONS_DESIGN.md §8). What
 * it does need is the lock, because the failure without one - every digest sent twice - is
 * invisible in development where there is only ever one instance.
 */

/**
 * Floors a moment to the start of the period it belongs to.
 *
 * This is the whole trick. Two instances waking 40ms apart compute the SAME periodStart, so their
 * inserts collide and exactly one wins. Keying the lock on the wall clock instead would make every
 * run unique, the unique index would never fire, and the lock would be decoration.
 */
function periodStartFor(everyMs, now = Date.now()) {
  return new Date(Math.floor(now / everyMs) * everyMs);
}

/**
 * Claims a period for a job. Returns the run row, or null if somebody else already has it.
 *
 * An insert, not a read-then-write. The uniqueness of {job, periodStart} is enforced by the index,
 * so losing the race is a duplicate-key error - a definite answer - rather than a check that
 * happened to be true a moment ago.
 */
async function claim(job, periodStart) {
  try {
    return await ScheduledRun.create({ job, periodStart, startedAt: new Date() });
  } catch (err) {
    // 11000 is the only expected failure here and it means "another instance got there first",
    // which is success from this instance's point of view. Anything else is a real problem and
    // should not be swallowed into a silent skip.
    if (err && err.code === 11000) {
      return null;
    }
    throw err;
  }
}

/**
 * Runs `fn` at most once per period, whatever else is running.
 *
 * Records the outcome on the claimed row either way. A job that throws leaves a row with an error
 * on it rather than vanishing - the run happened, it just failed, and those are different facts
 * (the same distinction that makes emailStatus five states rather than a boolean).
 */
async function runOnce(job, everyMs, fn, now = Date.now()) {
  const periodStart = periodStartFor(everyMs, now);
  const run = await claim(job, periodStart);
  if (!run) {
    return { ran: false, reason: 'already-claimed' };
  }

  try {
    const summary = await fn();
    await ScheduledRun.updateOne(
      { _id: run._id },
      { $set: { finishedAt: new Date(), summary: summary ? String(summary) : 'ok' } },
    );
    return { ran: true, summary };
  } catch (err) {
    await ScheduledRun.updateOne(
      { _id: run._id },
      { $set: { finishedAt: new Date(), error: err.message } },
    );
    // Rethrown for the caller to log. A scheduler that swallows job failures is a scheduler that
    // stops working silently, which is the failure class this whole notification system exists to
    // catch - it would be absurd to build it into the thing doing the catching.
    throw err;
  }
}

/**
 * Starts the interval loop.
 *
 * Each tick attempts every registered job; the lock decides which actually run. Ticking more often
 * than the shortest cadence is intentional - it means a restart doesn't have to wait a full period
 * to catch up, and the lock makes the extra attempts free.
 *
 * Returns a stop function. Tests use it; so does anything that needs a clean shutdown.
 */
function startScheduler(jobs, { tickMs = 5 * 60 * 1000, onError = console.error } = {}) {
  let stopped = false;

  const tick = async () => {
    for (const { name, everyMs, run } of jobs) {
      if (stopped) return;
      try {
        await runOnce(name, everyMs, run);
      } catch (err) {
        // One job failing must not stop the others - they are independent sweeps, and a broken
        // digest should not take down the condition sweep that would have reported it.
        onError(`[scheduler] ${name} failed:`, err.message);
      }
    }
  };

  const timer = setInterval(tick, tickMs);
  // Does not hold the process open. Without this a test run, or a graceful shutdown, hangs on a
  // timer nobody is waiting for.
  if (timer.unref) timer.unref();

  // Deliberately NOT run immediately on boot. A crash-looping process would otherwise attempt
  // every job on every restart; with the lock that is harmless but noisy, and waiting one tick
  // costs nothing.
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

module.exports = { startScheduler, runOnce, claim, periodStartFor };
