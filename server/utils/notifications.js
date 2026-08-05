const Notification = require('../models/Notification');

/**
 * Creating notifications, in one place.
 *
 * Every emit site in the app goes through `notify()`. That matters for one reason above all: the
 * actor rule (NOTIFICATIONS_DESIGN.md §1) is enforced HERE, once, rather than being a thing each
 * caller has to remember. An artist who takes a deposit must not be told a deposit was taken, and
 * the way to guarantee that is to make it impossible to write the row rather than to write the
 * check twenty times and get it right nineteen.
 *
 * This is the same lesson as utils/conversation-reads.js, which exists so that "unread means newer
 * than my lastReadAt AND not sent by me" is defined once. The senderId clause there and the actorId
 * clause here are the same idea: you are never notified about your own actions.
 */

// How long an email waits before sending, so that reading the notification can cancel it (§11).
// One named constant, like NOTIFY_THROTTLE_MS - it is a guess, and it should cost one edit when it
// turns out to be wrong.
const EMAIL_GRACE_MS = 3 * 60 * 1000;

/**
 * Creates notifications for a set of recipients.
 *
 * @param {object}   event
 * @param {ObjectId} event.actorId      - who caused this. Required; see below.
 * @param {Array}    event.recipientIds - who might be told. The actor is removed automatically.
 * @param {string}   event.type
 * @param {string}   event.category     - money | schedule | roster | message
 * @param {string}   event.subjectType
 * @param {ObjectId} event.subjectId
 * @param {string}   event.title        - rendered NOW, stored as written (see models/Notification.js)
 * @param {string}   [event.body]
 * @param {number}   [event.amountCents]
 * @param {boolean}  [event.email=true] - false for things that should only ever appear in-app
 *
 * Returns the created notifications. Recipients who were filtered out are simply absent - the
 * actor being excluded is normal operation, not an error.
 */
async function notify({
  actorId,
  recipientIds,
  type,
  category,
  subjectType,
  subjectId,
  title,
  body = '',
  amountCents,
  email = true,
}) {
  // Thrown rather than defaulted. An event with no actor notifies everybody including whoever
  // caused it, and the tempting default for a background job or a webhook is null - which is
  // exactly the case that silently breaks the rule. Square's payment webhook has no logged-in
  // caller; the right actor there is the artist whose session was paid, not nobody. Failing loudly
  // at the emit site is the only way that decision actually gets made.
  if (!actorId) {
    throw new Error(
      `notify(${type}) has no actorId. Every event has someone who caused it, including events ` +
        'raised by webhooks and scheduled jobs - see NOTIFICATIONS_DESIGN.md §1. Passing null ' +
        'would notify the actor about their own action.',
    );
  }

  // THE rule. Deduplicated as well as filtered, so a recipient listed twice (a shop admin who is
  // also the artist, say) gets one notification rather than two.
  const recipients = Array.from(
    new Set((recipientIds || []).filter(Boolean).map(String)),
  ).filter((id) => id !== String(actorId));

  if (recipients.length === 0) {
    return [];
  }

  const now = new Date();
  // Queued, not sent. The sweep picks it up once the grace has expired, and reading the
  // notification before then cancels it outright (§11). Email is a scheduled consequence of a
  // notification, never a side effect of creating one.
  const emailAfter = email ? new Date(now.getTime() + EMAIL_GRACE_MS) : null;

  return Notification.insertMany(
    recipients.map((userId) => ({
      userId,
      actorId,
      type,
      category,
      subjectType,
      subjectId,
      title,
      body,
      amountCents,
      emailStatus: email ? 'pending' : 'skipped',
      emailAfter,
      createdAt: now,
    })),
  );
}

/**
 * Marks notifications read for a user.
 *
 * Cancels any email still inside its grace window, in the same operation. This is the entire point
 * of the grace: somebody who has already seen and handled a thing should not be emailed about it
 * three minutes later. Doing it here rather than in a separate step means there is no window where
 * a notification is read but its email is still queued.
 *
 * Scoped to the caller's own rows by userId in the filter, not by a check beforehand - so there is
 * no path where a mistake in an id lets one person mark another's notifications read.
 */
async function markRead(userId, notificationIds = null, at = new Date()) {
  const filter = { userId, readAt: null };
  if (notificationIds) {
    filter._id = { $in: notificationIds };
  }
  const result = await Notification.updateMany(filter, {
    $set: { readAt: at },
  });

  // Same scope, restricted to email that hasn't gone out yet. A 'sent' row is left alone: the
  // email has already left, and rewriting its status to cancelled would be a record of something
  // that didn't happen.
  const cancelFilter = { userId, emailStatus: 'pending' };
  if (notificationIds) {
    cancelFilter._id = { $in: notificationIds };
  }
  await Notification.updateMany(cancelFilter, { $set: { emailStatus: 'cancelled' } });

  return result.modifiedCount || 0;
}

/**
 * Marks notifications done - handled, not merely seen.
 *
 * Sets readAt too when it isn't already set, because handling something you never read is possible
 * (you did the thing from elsewhere in the app) but "done and unread" is a state no interface can
 * render sensibly.
 */
async function markDone(userId, notificationIds, at = new Date()) {
  // Only fills in readAt where there isn't one. The tempting single-statement version is
  // `$max: { readAt: at }`, which overwrites an EARLIER read time with now - so marking something
  // done next week would rewrite "you saw this on Tuesday" to "you saw this next week". Losing
  // when somebody actually saw a money notification is the kind of quiet wrongness that only
  // surfaces when someone is trying to reconstruct what happened.
  await Notification.updateMany(
    { userId, _id: { $in: notificationIds }, readAt: null },
    { $set: { readAt: at } },
  );
  const result = await Notification.updateMany(
    { userId, _id: { $in: notificationIds } },
    { $set: { doneAt: at } },
  );
  return result.modifiedCount || 0;
}

/**
 * notify(), but a failure here never fails the thing that caused it.
 *
 * Every emit site is a side effect of something the person actually asked for - taking a deposit,
 * booking a session, connecting an artist. Losing that work because a notification could not be
 * written would be a strictly worse trade than the missing notification, every time.
 *
 * The failure is REPORTED rather than swallowed, though. The last time this codebase had a
 * notification path that failed into a bare console.warn, it was broken for weeks and only found
 * by accident - so the outcome comes back as a value the caller can act on, and the message says
 * plainly that a notification was lost rather than being one line in a log nobody reads.
 *
 * Use this at emit sites. Use notify() directly where the notification IS the point.
 */
async function notifySafely(event) {
  try {
    const created = await notify(event);
    return { ok: true, created: created.length };
  } catch (err) {
    console.warn(
      `[notifications] LOST a ${event && event.type} notification: ${err.message}. ` +
        'The action itself succeeded; only the notification failed.',
    );
    return { ok: false, error: err.message };
  }
}

/** Unread count for the bell. */
async function unreadCount(userId) {
  return Notification.countDocuments({ userId, readAt: null });
}

module.exports = { notify, notifySafely, markRead, markDone, unreadCount, EMAIL_GRACE_MS };
