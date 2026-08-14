const mongoose = require('mongoose');

/**
 * One artist's appointment-reminder configuration - text and email reminders sent to CLIENTS
 * ahead of an appointment, not to be confused with NotificationSettings (models/User.js), which
 * controls what an artist/shop is told about their OWN activity.
 *
 * ONE ROW PER ARTIST, keyed by their own User._id (artistUserId), the same shape as the Square
 * connection (see SquarePanel.jsx: "EVERY ARTIST HAS ONE, shop or no shop"). Reminders were built
 * against a single, shared InkBooks Twilio number rather than a Brand/number registered per
 * artist - see the chat thread this shipped from - so there is nothing shop-level to configure
 * here: each artist owns their own reminder settings regardless of whether they're shop-connected.
 *
 * BOTH CHANNELS DEFAULT OFF. A rule (24 hours before) is pre-populated so turning a channel on
 * does something immediately, but nothing sends until the artist deliberately opts in - flipping
 * every existing artist into texting their clients the moment this feature deployed would be a
 * surprise, not a feature.
 */
const reminderRuleSchema = new mongoose.Schema(
  {
    // Minutes before the appointment start this rule fires. 1440 = 24 hours. Minutes rather than
    // hours so a "30 minutes before" same-day nudge is expressible without a second unit.
    offsetMinutes: { type: Number, required: true, min: 1 },
    enabled: { type: Boolean, required: true, default: true },
  },
  { _id: true },
);

const reminderSettingsSchema = new mongoose.Schema(
  {
    artistUserId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    emailEnabled: { type: Boolean, required: true, default: false },
    smsEnabled: { type: Boolean, required: true, default: false },
    rules: {
      type: [reminderRuleSchema],
      default: () => [{ offsetMinutes: 24 * 60, enabled: true }],
    },
    // Null means "use the built-in default" (see utils/reminders.js's DEFAULT_EMAIL_TEMPLATE /
    // DEFAULT_SMS_TEMPLATE) - the same null-means-default convention as User.notificationPrefs,
    // so a copy change to the built-in wording doesn't have to be replayed into every existing
    // artist's row. Merge fields: {{clientFirstName}}, {{artistName}}, {{appointmentDate}},
    // {{appointmentTime}}, {{link}}.
    emailSubjectTemplate: { type: String },
    emailBodyTemplate: { type: String },
    smsTemplate: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ReminderSettings', reminderSettingsSchema);
