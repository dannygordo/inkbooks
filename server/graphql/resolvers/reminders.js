const ReminderSettings = require('../../models/ReminderSettings');
const withAuth = require('../../utils/with-auth');
const { validate, updateReminderSettingsInputSchema } = require('../../utils/validation');
const { UserInputError } = require('../../utils/errors');

/**
 * Appointment reminder settings - always the CALLER's own row, never looked up by id and never
 * shared across a shop. See models/ReminderSettings.js: reminders were built against one shared
 * InkBooks Twilio Brand/number rather than one registered per artist, and each artist owns their
 * own send configuration exactly the way they own their own Square connection - a shop admin
 * cannot see or change another artist's reminder settings here, same authority boundary as
 * SquarePanel.jsx.
 *
 * LAZILY CREATED on first read or write, defaulted to both channels off with a single
 * 24-hours-before rule (see the model's own default) - there is no provisioning step at signup,
 * so the first visit to Settings > Messages is what creates the row.
 */
async function findOrCreateSettings(artistUserId) {
  return ReminderSettings.findOneAndUpdate(
    { artistUserId },
    { $setOnInsert: { artistUserId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

module.exports = {
  Query: {
    getReminderSettings: withAuth(async (_, args, context, info, user) =>
      findOrCreateSettings(user.id),
    ),
  },
  Mutation: {
    updateReminderSettings: withAuth(async (_, args, context, info, user) => {
      const { valid, errors, data } = validate(updateReminderSettingsInputSchema, args);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }

      // Each field set only when the caller actually sent it - a save that only touched the
      // "24 hours before" toggle must not also wipe emailBodyTemplate back to null, and an
      // explicit null (reset to default) has to survive being distinct from "wasn't sent" the
      // same way updateNotificationSettings's timezone/digestHour already do.
      const update = {};
      for (const key of [
        'emailEnabled',
        'smsEnabled',
        'rules',
        'emailSubjectTemplate',
        'emailBodyTemplate',
        'smsTemplate',
      ]) {
        if (data[key] !== undefined) {
          update[key] = data[key];
        }
      }

      return ReminderSettings.findOneAndUpdate(
        { artistUserId: user.id },
        { $set: update, $setOnInsert: { artistUserId: user.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }),
  },
};
