const mongoose = require('mongoose');

/**
 * A stored notification EVENT.
 *
 * Only events live here. Conditions - "3 requests unanswered", "shop cut overdue", "deposit never
 * applied" - are derived at read time and have no model at all (see utils/attention.js). That split
 * is the load-bearing decision in NOTIFICATIONS_DESIGN.md §2, and the reason is this codebase's own
 * history: a stored condition is a second copy of a fact that already has a home, and the two
 * drift. Artist.shopId vs. ArtistShopConnection, Project.depositAmount vs. the appointment holding
 * the money, the Square app id in two files - same bug, three times, each one silent.
 *
 * A stored "unanswered booking request" notification would be that bug again: it would go on saying
 * unanswered after the request was answered, and would need reconciliation logic to un-say it.
 *
 * What belongs here instead is the immutable kind. "$200 deposit collected on the Chen consult,
 * Tuesday 2:14pm" happened; it will always have happened; and there is no other record that anyone
 * was told about it - which for money is an audit question, not a convenience.
 */
const NotificationSchema = new mongoose.Schema({
  // Who is being told. One row per recipient: two people learning about the same deposit are two
  // notifications, because read and done state belong to a person, not to an event.
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

  /**
   * Who CAUSED it, and the single most important field on this model.
   *
   * NOTIFICATIONS_DESIGN.md §1: the actor is never a recipient. An artist who takes a deposit does
   * not need telling that a deposit was taken. That one rule removes roughly half of any naive
   * notification list, and it's the same clause that keeps unread message counts honest (your own
   * messages never raise your own badge - see utils/conversation-reads.js).
   *
   * Required, deliberately. An event with no actor makes everyone a recipient, and the tempting
   * default for a background job or a webhook is null. Square's payment webhook is the live case:
   * nobody in the app "did" it. The answer there is the artist whose session was paid - the person
   * on whose behalf it happened - not null. Decide it at the emit site; do not let it default.
   */
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true },

  // What happened - 'deposit_collected', 'shop_cut_invoiced', ... Kept as a free string rather than
  // an enum so adding an event type is one emit site rather than a schema change plus a migration.
  type: { type: String, required: true },

  // Which preference bucket this obeys. Per-category rather than per-event-type (§7): six toggles
  // people actually configure, instead of forty checkboxes they leave at default.
  category: {
    type: String,
    enum: ['money', 'schedule', 'roster', 'message'],
    required: true,
  },

  // What it is about. Notifications group by SUBJECT, not by event - GitHub's thread model (§3).
  // Forty things happening to one project should read as one line in an inbox, not forty.
  subjectType: {
    type: String,
    enum: ['appointment', 'project', 'conversation', 'artist', 'shop', 'bookingRequest'],
    required: true,
  },
  subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },

  /**
   * Rendered at WRITE time, not read time.
   *
   * A notification is a record of what somebody was told. If the copy changes next month, last
   * month's notification should still say what it said - re-rendering from a payload would quietly
   * rewrite history, and for money events that history is the audit trail.
   *
   * Same reasoning that keeps money as integer cents on the appointment rather than recomputed from
   * a rate that may since have changed.
   *
   * The trade is that a typo is permanent in rows already written. Proofread these harder than UI
   * strings, which can be fixed by editing them.
   */
  title: { type: String, required: true },
  body: { type: String, default: '' },

  // Money events carry their amount so an inbox can show it without loading the appointment.
  // Integer cents, like every other money value in this system.
  amountCents: { type: Number },

  /**
   * Read and done are DIFFERENT, and they diverge constantly.
   *
   * Reading "shop cut invoice issued" is not paying it. Most inboxes have only read state, which is
   * why people archive them wholesale - read is the only tool they're given, so it gets used to
   * mean "dealt with" and then means nothing.
   *
   * Both are timestamps rather than booleans: "when did they see this" is a question worth being
   * able to answer, and a boolean throws it away for no saving.
   */
  readAt: { type: Date },
  doneAt: { type: Date },

  /**
   * Email delivery state for this notification.
   *
   * A notification fires in-app instantly and its email is queued with a grace period; reading it
   * before the grace expires cancels the email entirely (§11). So the send is a scheduled thing
   * with its own state, not a side effect of creation.
   *
   * 'pending'   - queued, grace not yet expired
   * 'sent'      - delivered to the mail provider
   * 'cancelled' - read before the grace expired, so never sent. The good outcome.
   * 'skipped'   - preferences said no, or the recipient has no email
   * 'failed'    - attempted and rejected
   *
   * Five states rather than a boolean because "we never tried" and "we tried and it failed" are
   * different facts, and collapsing them is exactly what made a broken notification path invisible
   * for weeks (the guest email that failed into a console.warn).
   */
  emailStatus: {
    type: String,
    enum: ['pending', 'sent', 'cancelled', 'skipped', 'failed'],
    default: 'pending',
  },
  // When the email becomes eligible to send. Null for anything that should never be emailed.
  emailAfter: { type: Date },
  emailError: { type: String },

  createdAt: { type: Date, required: true, default: Date.now },
});

// The bell badge: unread count for one person.
NotificationSchema.index({ userId: 1, readAt: 1 });
// The inbox: newest first, for one person.
NotificationSchema.index({ userId: 1, createdAt: -1 });
// Grouping by what it's about.
NotificationSchema.index({ subjectType: 1, subjectId: 1 });
// The email sweep: everything queued whose grace has expired.
NotificationSchema.index({ emailStatus: 1, emailAfter: 1 });

/**
 * Retention: hidden from the inbox after 90 days, deleted after two years.
 *
 * Two mechanisms, because "90 days then archive" means two different things and a TTL index can
 * only do one of them - a TTL DELETES, it cannot archive.
 *
 *   - Out of the inbox at 90 days: a query filter (see INBOX_WINDOW_DAYS). Nothing is destroyed.
 *   - Deleted at two years: this index.
 *
 * Keeping the rows past 90 days costs almost nothing and preserves the audit answer that justified
 * storing them at all. A 90-day hard delete would make "did we tell the shop about that payment?"
 * permanently unanswerable, which is the opposite of why this model exists.
 *
 * Created with the collection on purpose. Adding a TTL to a large collection later is a migration;
 * adding it now is this line.
 */
const RETENTION_SECONDS = 2 * 365 * 24 * 60 * 60;
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

// How far back the inbox looks. Not a deletion - see above.
const INBOX_WINDOW_DAYS = 90;

const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;
module.exports.INBOX_WINDOW_DAYS = INBOX_WINDOW_DAYS;
module.exports.RETENTION_SECONDS = RETENTION_SECONDS;
