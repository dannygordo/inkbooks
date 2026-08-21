const Notification = require('../models/Notification');
const { reportError } = require('./error-reporting');
const User = require('../models/User');
const Artist = require('../models/Artist');
const { sendEmail } = require('./email');
const { sendDailyDigests } = require('./digest');
const { sendDueClientScheduleEmails } = require('./client-booking-emails');
const { sendDueReminders } = require('./reminders');
const { findUnansweredMessages, findOverdueBoothRentCharges } = require('./attention');
const { resolveThresholdsForArtists, DEFAULT_REPEAT_INTERVAL_MINUTES } = require('./response-time');
const { resolveBoothRentPlanAt } = require('./booth-rent');
const { shopAdminUserIds } = require('./notification-audience');
const { actorName } = require('./notification-copy');
const { formatCents } = require('./money');
const { notifySafely } = require('./notifications');

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
 * Feature 3's active half: an artist whose client message has gone unanswered gets a real,
 * stored Notification - first once the initial threshold passes, then again every
 * repeatIntervalMinutes until they reply, at which point utils/attention.js's
 * findUnansweredMessages simply stops returning that conversation and this sweep naturally stops
 * creating rows for it (NOTIFICATIONS_DESIGN.md §2's derive-don't-store rule - there is no
 * "resolved" flag to clear).
 *
 * DEDUPED BY QUERY, NOT BY A UNIQUE INDEX - unlike ReminderLog/AutoResponseLog's claim-before-send
 * pattern, the repeat window here is per-artist-configurable (repeatIntervalMinutes), which
 * doesn't fit a fixed period-bucket unique index the way "one reminder per offsetMinutes per
 * appointment" does. Safe anyway: the scheduler's own lock (see index.js's startScheduler call)
 * already guarantees this job never runs two-at-once, which is the same guarantee a unique index
 * would be enforcing here.
 *
 * Every artist in the system is checked, not just ones with a ResponseTimeSettings row - the
 * 480/180-minute defaults apply whether or not anyone ever visited Settings > Messages, the same
 * way sendDueReminders checks appointment reminders regardless of whether an artist customized
 * theirs.
 */
async function sendMessageNudges({ now = new Date() } = {}) {
  const artists = await Artist.find({}).select('userId');
  const artistUserIds = artists.map((a) => String(a.userId));
  if (artistUserIds.length === 0) {
    return { created: 0, considered: 0 };
  }

  const thresholdsByArtist = await resolveThresholdsForArtists(artistUserIds);
  const due = await findUnansweredMessages(artistUserIds, thresholdsByArtist, { now });

  let created = 0;
  for (const { artistUserId, clientUserId, conversationId, latestMessage } of due) {
    const thresholds = thresholdsByArtist.get(String(artistUserId));
    const repeatIntervalMinutes =
      (thresholds && thresholds.repeatIntervalMinutes) || DEFAULT_REPEAT_INTERVAL_MINUTES;
    const repeatCutoff = new Date(now.getTime() - repeatIntervalMinutes * 60 * 1000);

    // eslint-disable-next-line no-await-in-loop
    const alreadyNudged = await Notification.exists({
      userId: artistUserId,
      type: 'message_unanswered',
      subjectId: conversationId,
      createdAt: { $gte: repeatCutoff },
    });
    if (alreadyNudged) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const result = await notifySafely({
      actorId: clientUserId,
      recipientIds: [artistUserId],
      type: 'message_unanswered',
      category: 'message',
      subjectType: 'conversation',
      subjectId: conversationId,
      title: 'A client message is still unanswered',
      body:
        (latestMessage.message || '').slice(0, 140) ||
        (latestMessage.imageUrls && latestMessage.imageUrls.length > 0
          ? 'They sent an image.'
          : 'Reply when you get a chance.'),
    });
    if (result.ok) {
      created += result.created;
    }
  }

  return { created, considered: due.length };
}

// Not one of the four locked decisions (see PLAN.md's Feature 5 section) - decision #3 said
// "escalate until marked paid" but left the cadence unspecified. 3 days, my own default: long
// enough that nobody gets nagged daily over a bill that's a few hours late, short enough that a
// genuinely ignored charge surfaces again well within the same month it was due.
const BOOTH_RENT_REPEAT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Feature 5's active half: booth rent past due keeps re-notifying BOTH sides - the artist who
 * owes it and the shop admins who are owed it - until it's marked paid (locked decision #3,
 * "escalate until marked paid"). The same repeat-until-resolved shape as sendMessageNudges above,
 * not shared with it: the audience here is two-directional, and there's no per-owner configurable
 * interval to resolve (a flat cadence for everyone - see the constant above).
 *
 * TWO notify() CALLS PER OVERDUE CHARGE, not one, because notify()'s own actor rule (utils/
 * notifications.js - "you didn't cause it, so you're never a recipient") means a single call can
 * only ever reach one side: whichever party ISN'T the actor. There is no natural third party here
 * the way an unanswered message has the client who sent it, so each direction borrows the OTHER
 * side as its actor - the shop admin who set the rent (BoothRentPlan.setByUserId) is the actor
 * when notifying the artist, and the artist themselves is the actor when notifying the shop.
 *
 * DEDUPED BY QUERY, NOT BY A UNIQUE INDEX, same reasoning and same safety as sendMessageNudges -
 * the scheduler's own lock is what actually prevents a double-run, the query is just convenient
 * shorthand for "have I already nudged about this specific charge recently".
 */
async function sendBoothRentNudges({ now = new Date() } = {}) {
  const artists = await Artist.find({}).select('userId');
  const artistUserIds = artists.map((a) => String(a.userId));
  if (artistUserIds.length === 0) {
    return { created: 0, considered: 0 };
  }

  const overdue = await findOverdueBoothRentCharges(artistUserIds, { now });
  const repeatCutoff = new Date(now.getTime() - BOOTH_RENT_REPEAT_INTERVAL_MS);

  let created = 0;
  for (const charge of overdue) {
    // eslint-disable-next-line no-await-in-loop
    const alreadyNudged = await Notification.exists({
      type: 'booth_rent_overdue',
      subjectId: charge._id,
      createdAt: { $gte: repeatCutoff },
    });
    if (alreadyNudged) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const plan = await resolveBoothRentPlanAt(charge.artistId, charge.shopId, charge.dueDate);
    if (plan) {
      // eslint-disable-next-line no-await-in-loop
      const artistResult = await notifySafely({
        actorId: plan.setByUserId,
        recipientIds: [charge.artistId],
        type: 'booth_rent_overdue',
        category: 'money',
        subjectType: 'boothRentCharge',
        subjectId: charge._id,
        amountCents: charge.amountCents,
        title: `Booth rent overdue: ${formatCents(charge.amountCents)}`,
        body: `Was due ${charge.dueDate.toDateString()}. Mark it paid once it's settled.`,
      });
      if (artistResult.ok) {
        created += artistResult.created;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    const adminResult = await notifySafely({
      actorId: charge.artistId,
      recipientIds: await shopAdminUserIds(charge.shopId),
      type: 'booth_rent_overdue',
      category: 'money',
      subjectType: 'boothRentCharge',
      subjectId: charge._id,
      amountCents: charge.amountCents,
      // eslint-disable-next-line no-await-in-loop
      title: `${await actorName(charge.artistId)}'s booth rent is overdue`,
      body: `${formatCents(charge.amountCents)} was due ${charge.dueDate.toDateString()}.`,
    });
    if (adminResult.ok) {
      created += adminResult.created;
    }
  }

  return { created, considered: overdue.length };
}

/**
 * The jobs, as the scheduler wants them.
 *
 * Both cadences are deliberately shorter than they strictly need to be. The email sweep every five
 * minutes keeps the delay between "grace expired" and "email sent" close to the three minutes the
 * grace promises; running it hourly would make the real delay up to an hour and turn a considered
 * pause into an apparent outage.
 */
// A stuck-notification health check finding real backlog IS an incident worth Sentry's attention,
// not just a log line - "the send sweep is not completing" is exactly the kind of thing that
// deserves an alert, not silence until someone happens to grep for it. onReport stays injectable
// (tests override it with a plain recorder) - this is only the default a real run actually uses.
function notificationJobs({ onReport = (msg) => reportError(new Error(msg)) } = {}) {
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
      // Feature 3 - see sendMessageNudges above. Hourly, same cadence as notification-digests:
      // the repeat interval is measured in hours by default (180 minutes) and nobody notices a
      // few minutes of slop on a nudge the way they would on a booking confirmation.
      name: 'message-nudges',
      everyMs: 60 * 60 * 1000,
      run: async () => {
        const result = await sendMessageNudges();
        return `created=${result.created} considered=${result.considered}`;
      },
    },
    {
      // Feature 5 - see sendBoothRentNudges above. Hourly, matching message-nudges' own cadence -
      // the repeat interval here is measured in days (3), so a few minutes of slop between ticks
      // is never noticeable.
      name: 'booth-rent-nudges',
      everyMs: 60 * 60 * 1000,
      run: async () => {
        const result = await sendBoothRentNudges();
        return `created=${result.created} considered=${result.considered}`;
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
  sendMessageNudges,
  sendBoothRentNudges,
  notificationJobs,
  ORPHAN_AFTER_MS,
  DIGEST_ORPHAN_AFTER_MS,
};
