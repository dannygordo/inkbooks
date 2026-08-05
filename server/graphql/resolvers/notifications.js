const Notification = require('../../models/Notification');
const withAuth = require('../../utils/with-auth');
const { markRead, markDone } = require('../../utils/notifications');
const { attentionForUser } = require('../../utils/attention');

/**
 * The inbox: stored events and derived conditions, merged into one list.
 *
 * The caller cannot tell which is which, and shouldn't need to. That is the point of building both
 * halves against one shape (NOTIFICATIONS_DESIGN.md §9) - a person looking at "deposit still
 * unapplied" and "shop cut invoice issued" is looking at two things that want the same attention,
 * and the fact that one is a row and the other is a query is our problem, not theirs.
 */

// Stored events fall out of the inbox after 90 days. Not a deletion - the rows survive for a
// further two years under the TTL, because "did we tell the shop about that payment?" is a real
// question about money and a hard delete at 90 days makes it permanently unanswerable.
const { INBOX_WINDOW_DAYS } = Notification;

function toItem(notification) {
  return {
    key: String(notification._id),
    type: notification.type,
    category: notification.category,
    subjectType: notification.subjectType,
    subjectId: notification.subjectId ? String(notification.subjectId) : null,
    title: notification.title,
    body: notification.body,
    amountCents: notification.amountCents ?? null,
    createdAt: notification.createdAt,
    readAt: notification.readAt || null,
    doneAt: notification.doneAt || null,
    isCondition: false,
  };
}

module.exports = {
  Query: {
    getInbox: withAuth(async (_, { includeRead = true }, context, info, user) => {
      const windowStart = new Date(Date.now() - INBOX_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      const storedFilter = { userId: user.id, createdAt: { $gte: windowStart } };
      if (!includeRead) {
        storedFilter.readAt = null;
      }

      // Both halves in parallel. The conditions are several independent indexed queries (see
      // utils/attention.js) and the stored events are one - no reason for either to wait.
      const [stored, conditions] = await Promise.all([
        Notification.find(storedFilter).sort({ createdAt: -1 }).limit(200),
        attentionForUser(user),
      ]);

      const items = [...stored.map(toItem), ...conditions].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );

      // Unread stored events plus EVERY live condition.
      //
      // Conditions always count, whether or not they've been looked at. A condition has no read
      // state by design: it goes away when it stops being true. Letting one be dismissed while
      // still true would turn the most valuable notifications in the system - the silent-failure
      // catchers - into ones you can make disappear without fixing anything, which is precisely
      // the behaviour that makes people stop trusting a badge.
      const unreadStored = stored.filter((n) => !n.readAt).length;

      return { items, unreadCount: unreadStored + conditions.length };
    }),
  },

  Mutation: {
    // Scoped by userId inside the update filter rather than by a check beforehand, so there is no
    // path where a wrong id lets one person mark another's notifications read.
    markNotificationsRead: withAuth(async (_, { notificationIds }, context, info, user) =>
      markRead(user.id, notificationIds || null),
    ),
    markNotificationsDone: withAuth(async (_, { notificationIds }, context, info, user) =>
      markDone(user.id, notificationIds),
    ),
  },
};
