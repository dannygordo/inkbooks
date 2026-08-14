const mongoose = require('mongoose');

/**
 * One row per (appointment, offsetMinutes, channel) reminder attempt - both the dedup key and the
 * audit trail.
 *
 * WHY A CLAIM ROW RATHER THAN A FLAG ON THE APPOINTMENT: "is this reminder due" is recomputed
 * fresh every sweep from the appointment's own date and the artist's current rules (see
 * utils/reminders.js's sendDueReminders) - there is no pending row to flip the way
 * ClientScheduleEmail has one. Without something written the FIRST time a rule fires, the exact
 * same appointment+rule would look due again on every subsequent tick forever. This collection is
 * that something: the unique index below is what turns "already sent" into a fact the database
 * enforces, not a fact the sweep has to remember on its own.
 *
 * KEYED ON offsetMinutes, NOT the reminderRuleSchema subdocument's own _id. A rule's _id is an
 * implementation detail of how the artist's settings happen to be stored, and updateReminderSettings
 * (resolvers/reminders.js) replaces the whole rules array on every save - editing an unrelated
 * rule, or just re-saving the form, mints a brand-new _id for every rule in the array. Keying the
 * dedup on that id would mean a rule that already fired for an upcoming appointment could fire
 * AGAIN the moment the artist next touches their settings, because the "same" rule now carries a
 * different id. offsetMinutes is the actual business meaning of a rule ("24 hours before") and
 * survives exactly that kind of edit, which is the property this dedup key needs.
 *
 * INSERTED BEFORE THE SEND ATTEMPT, same ordering as Notification's own email claim
 * (utils/notification-jobs.js) and for the same reason: claiming after sending can double-send on
 * a race (two sweeps overlapping) or a retry after a crash; claiming first makes the failure mode
 * "we meant to send this and the log says so" instead.
 */
const reminderLogSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  offsetMinutes: { type: Number, required: true },
  channel: { type: String, required: true, enum: ['email', 'sms'] },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, required: true, enum: ['sending', 'sent', 'skipped', 'failed'] },
  error: { type: String },
  sentAt: { type: Date },
  createdAt: { type: Date, required: true, default: Date.now },
});

// THE dedup guarantee. A second insert attempt for the same triple fails with a duplicate-key
// error, which sendDueReminders reads as "somebody already handled this" and moves on - see the
// comment above on why this has to be enforced by the database rather than a query-then-write
// check the sweep does itself.
reminderLogSchema.index({ appointmentId: 1, offsetMinutes: 1, channel: 1 }, { unique: true });

module.exports = mongoose.model('ReminderLog', reminderLogSchema);
