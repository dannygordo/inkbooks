const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendEmail } = require('./email');
const { sendDailyDigests } = require('./digest');
const { sendDueClientScheduleEmails } = require('./client-booking-emails');
const { sendDueReminders } = require('./reminders');

/**
 * The scheduled half of the notification system.
 *
 * Two sweeps, both idempotent, both safe to run more often than needed - which matters, because
 * the scheduler ticks more frequently than any job's cadence and relies on the lock rather than
 * on precise timing.
 */

// A queued email that never sent is invisible unless something looks for it. This is the
// notification system's own silent-failure catcher, and building the feature without it would be
// indefensible given that catching silent failures is most of why the feature exists
// (NOTIFICATIONS_DESIGN.md §5, §12).
const ORPHAN_AFTER_MS = 60 * 60 * 1000;

// A digest legitimately waits until the recipient's chosen hour, so the threshold has to clear a
// full day. 25 hours means a whole cycle was missed, which is a failure rather than patience.
const DIGEST_ORPHAN_AFTER_MS = 25 * 60 * 60 * 1000;

/**
 * Sends the emails whose grace has expired and which nobody read in time.
 *
 * The grace is the whole point: a notification read in-app before its email goes out has already
 * done its job, and the email would be about something the person has finished with. markRead()
 * flips those to 'cancelled', so they simply aren't in this query.
 *
 * Claims each row BEFORE sending, by flipping it out of 'pending' with a conditional update. Two
 * instances racing the same row means the second one's update matches nothing, so it doesn't send.
 * Sending first and recording after would double-send on a race and lose the record on a crash -
 * the wrong way round for something whose whole job is not to send twice.
 *
 * `send` is injectable so tests are deterministic rather than dependent on whether the environment
 * happens to have mail credentials. Nothing in production passes it.
 */
async function sendDueEmails({ now = new Date(), limit = 200, send = sendEmail } = {}) {
  const due = await Notification.find({
    emailStatus: 'pending',
    emailAfter: { $lte: now },
  })
    .sort({ emailAfter: 1 })
    .limit(limit);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const notification of due) {
    // Conditional on still being pending. This is the claim - if another instance got here first,
    // matchedCount is 0 and this one moves on without sending.
    const claimed = await Notification.updateOne(
      { _id: notification._id, emailStatus: 'pending' },
      { $set: { emailStatus: 'sent' } },
    );
    if (claimed.matchedCount === 0) {
      continue;
    }

    try {
      const recipient = await User.findById(notification.userId).select('email firstName');
      if (!recipient || !recipient.email) {
        await Notification.updateOne(
          { _id: notification._id },
          { $set: { emailStatus: 'skipped', emailError: 'no email address' } },
        );
        skipped += 1;
        continue;
      }

      // The stored title and body, exactly as they were written. Re-rendering here would let a
      // copy change rewrite what somebody was told - see models/Notification.js.
      const result = await send({
        to: recipient.email,
        subject: notification.title,
        htmlBody: `<p>Hi ${recipient.firstName},</p><p>${notification.body || notification.title}</p>`,
        textBody: `Hi ${recipient.firstName},\n\n${notification.body || notification.title}`,
      });

      // sendEmail() returns null rather than throwing when email isn't configured, or when the
      // provider rejects the message (see utils/email.js). Recording those as 'sent' would put a
      // false claim in the audit trail - and in a dev environment with no email set up, EVERY
      // notification would claim it had been emailed. Not-sent is recorded as not-sent.
      if (!result) {
        await Notification.updateOne(
          { _id: notification._id },
          {
            $set: {
              emailStatus: 'skipped',
              emailError: 'no result from the mail provider - not configured, or rejected',
            },
          },
        );
        skipped += 1;
        continue;
      }
      sent += 1;
    } catch (err) {
      // Rolled back to 'failed' rather than left as 'sent'. A row claiming an email went out when
      // it didn't is worse than no record at all, because it's the record somebody would trust.
      await Notification.updateOne(
        { _id: notification._id },
        { $set: { emailStatus: 'failed', emailError: err.message } },
      );
      failed += 1;
    }
  }

  return { sent, skipped, failed, considered: due.length };
}

/**
 * Finds emails that were queued and then never resolved either way.
 *
 * A row still 'pending' an hour after its grace expired means the send sweep isn't running, or is
 * dying before it reaches this row. Nothing else in the system would ever say so - the
 * notifications look fine in-app, and the only symptom is email that quietly stopped.
 *
 * Reports rather than fixing. A sweep that silently repaired its own backlog would hide the fact
 * that it had one.
 */
async function findOrphanedEmails({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - ORPHAN_AFTER_MS);
  const count = await Notification.countDocuments({
    emailStatus: 'pending',
    emailAfter: { $lte: cutoff },
  });

  // Digests get their own, longer horizon.
  //
  // A row sits in 'digest' legitimately until the recipient's chosen hour comes round, so anything
  // under a day is normal. Past 25 hours it is not: the digest job has missed a full cycle, and
  // nothing else would ever say so - the notifications look right in-app and the only symptom is
  // a summary email that quietly stopped arriving.
  //
  // This was a real gap. The sweep originally watched only 'pending', so the entire digest path -
  // which is the DEFAULT for every shop admin - had no failure detection at all.
  const digestStuck = await Notification.countDocuments({
    emailStatus: 'digest',
    createdAt: { $lte: new Date(now.getTime() - DIGEST_ORPHAN_AFTER_MS) },
  });

  return { orphaned: count, digestStuck };
}

/**
 * The jobs, as the scheduler wants them.
 *
 * Both cadences are deliberately shorter than they strictly need to be. The email sweep every five
 * minutes keeps the delay between "grace expired" and "email sent" close to the three minutes the
 * grace promises; running it hourly would make the real delay up to an hour and turn a considered
 * pause into an apparent outage.
 */
function notificationJobs({ onReport = console.warn } = {}) {
  return [
    {
      name: 'notification-emails',
      everyMs: 5 * 60 * 1000,
      run: async () => {
        const result = await sendDueEmails();
        return `sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`;
      },
    },
    {
      // A CLIENT'S booking confirmation, coalesced per project - see utils/client-booking-emails.js.
      //
      // Every minute, which is finer than any other job here and deliberately so. This one is not
      // enforcing a policy delay the way the notification grace does; it is waiting for an artist to
      // finish entering sittings, and then the client is owed the email. A five-minute sweep on a
      // three-minute debounce means an artist can book somebody in and watch nothing happen for
      // eight minutes, which reads as broken and generates the "did that send?" question the email
      // exists to prevent. The scheduler's lock makes the extra attempts free - that is the reason
      // it exists.
      name: 'client-schedule-emails',
      everyMs: 60 * 1000,
      run: async () => {
        const result = await sendDueClientScheduleEmails();
        return `sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`;
      },
    },
    {
      // Hourly, because "somebody's chosen hour" only comes round once a day but the job has to be
      // awake at every hour to notice whose it is. The scheduler's lock makes the 23 no-op runs
      // free.
      name: 'notification-digests',
      everyMs: 60 * 60 * 1000,
      run: async () => {
        const result = await sendDailyDigests();
        return `digests=${result.sent} considered=${result.considered}`;
      },
    },
    {
      // Appointment reminders (text and email to CLIENTS) - see utils/reminders.js and
      // models/ReminderSettings.js. Five minutes, matching the notification-emails cadence rather
      // than the one-minute client-schedule-emails one: a reminder rule is granular to the minute
      // in principle, but nobody notices a few minutes of slop on a "24 hours before" nudge the
      // way they would on a booking confirmation that's supposed to feel instant.
      name: 'appointment-reminders',
      everyMs: 5 * 60 * 1000,
      run: async () => {
        const result = await sendDueReminders();
        return `sent=${result.sent} skipped=${result.skipped} failed=${result.failed} artistsChecked=${result.artistsChecked}`;
      },
    },
    {
      name: 'notification-email-orphans',
      everyMs: 60 * 60 * 1000,
      run: async () => {
        const { orphaned, digestStuck } = await findOrphanedEmails();
        if (orphaned > 0) {
          onReport(
            `[notifications] ${orphaned} email(s) queued over an hour ago and still unsent. ` +
              'The send sweep is not completing - see utils/notification-jobs.js.',
          );
        }
        if (digestStuck > 0) {
          onReport(
            `[notifications] ${digestStuck} notification(s) waiting on a digest for over a day. ` +
              'The digest job has missed a full cycle - see utils/digest.js.',
          );
        }
        return `orphaned=${orphaned} digestStuck=${digestStuck}`;
      },
    },
  ];
}

module.exports = {
  sendDueEmails,
  findOrphanedEmails,
  notificationJobs,
  ORPHAN_AFTER_MS,
  DIGEST_ORPHAN_AFTER_MS,
};
