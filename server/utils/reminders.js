const ReminderSettings = require('../models/ReminderSettings');
const ReminderLog = require('../models/ReminderLog');
const Appointment = require('../models/Appointment');
const Project = require('../models/Project');
const BookingRequest = require('../models/BookingRequest');
const Client = require('../models/Client');
const Artist = require('../models/Artist');
const User = require('../models/User');
const { sendEmail } = require('./email');
const { sendSms } = require('./sms');
const { Constants } = require('./constants');

/**
 * Appointment reminders: text and email nudges sent to a CLIENT ahead of an appointment.
 *
 * See models/ReminderSettings.js and models/ReminderLog.js for the data shapes and why each looks
 * the way it does. This file is the send sweep itself, wired into utils/notification-jobs.js the
 * same way the rest of the notification system is - a scheduled function, not a queue.
 */

// Only these two statuses represent a real, still-upcoming appointment worth reminding someone
// about (see client/src/constants/app.js's APPOINTMENT_STATUS). 'completed', 'cancelled' and
// 'no_show' are all resolved one way or another - reminding a client about an appointment that
// was already cancelled is the exact failure this list exists to prevent.
const REMINDABLE_STATUSES = ['scheduled', 'rescheduled'];

const DEFAULT_EMAIL_SUBJECT_TEMPLATE = 'Reminder: your appointment with {{artistName}}';
const DEFAULT_EMAIL_BODY_TEMPLATE =
  'Hi {{clientFirstName}},\n\n' +
  'This is a reminder from {{artistName}} about your appointment on {{appointmentDate}} at ' +
  '{{appointmentTime}}.\n\n' +
  '{{link}}';
const DEFAULT_SMS_TEMPLATE =
  'Hi {{clientFirstName}}, this is a reminder from {{artistName}} for your appointment on ' +
  '{{appointmentDate}} at {{appointmentTime}}. {{link}}';

/**
 * {{mergeField}} substitution. Deliberately not a templating engine - five known fields, no
 * loops/conditionals, so a regex swap is the whole implementation rather than a dependency and an
 * injection surface for something an artist types into a settings box.
 */
function renderTemplate(template, vars) {
  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/**
 * A client has no timezone of their own on file (Client has no timezone field, unlike User - see
 * models/Client.js). The artist's chosen timezone (User.timezone, the same field the digest
 * reminder respects - see NotificationSettingsPanel.jsx) is the best available proxy: an artist
 * and their client are, in the overwhelming majority of cases, in the same city. Falls back to no
 * explicit zone (the server's own) when the artist hasn't set one either.
 */
function formatAppointmentDateTime(date, timezone) {
  const opts = timezone ? { timeZone: timezone } : {};
  return {
    appointmentDate: date.toLocaleDateString('en-US', {
      ...opts,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    appointmentTime: date.toLocaleTimeString('en-US', {
      ...opts,
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

/**
 * The client an appointment's reminder is FOR. Appointment itself carries no clientId (see
 * models/Appointment.js and resolvers/index.js's own Appointment.project/bookingRequest field
 * resolvers, which reach the client the same two ways) - a session appointment reaches it through
 * its Project, a consult with no Project yet reaches it through the BookingRequest that will
 * become one. An "Other" appointment (see APPOINTMENT_TYPE) has neither and has no client to
 * remind - null is the correct, expected answer for those, not a failure.
 */
async function resolveClientForAppointment(appointment) {
  if (appointment.projectId) {
    const project = await Project.findById(appointment.projectId).select('clientId');
    if (project) {
      return Client.findById(project.clientId);
    }
  }
  if (appointment.bookingRequestId) {
    const bookingRequest = await BookingRequest.findById(appointment.bookingRequestId).select(
      'clientId',
    );
    if (bookingRequest) {
      return Client.findById(bookingRequest.clientId);
    }
  }
  return null;
}

/**
 * Where the reminder sends the client: the artist's own public booking page when they have one
 * (see models/Artist.js's bookingSlug), since that's the one client-reachable URL that exists for
 * every artist without building a client-facing "my appointments" portal this feature doesn't
 * otherwise need. Falls back to the plain marketing/app root for an artist who hasn't set a slug.
 */
function buildClientLink(artist) {
  const base = Constants.URLS.INKBOOKS_WEBAPP;
  return artist && artist.bookingSlug ? `${base}/book/${artist.bookingSlug}` : base;
}

/**
 * One artist's due reminders: their enabled rules against their own upcoming, remindable
 * appointments.
 *
 * A rule is "due" once now has reached (appointmentDate - offsetMinutes) and STAYS due on every
 * later tick too - unlike Notification's emailAfter sweep, there is no separate pending row whose
 * state changes on send, so the ONLY thing preventing a re-send on the next tick is ReminderLog's
 * unique index (see that model's own comment). That means a send failure here does not retry -
 * the same accepted trade-off utils/email.js already makes for a rejected/unreachable provider,
 * not a new gap this feature introduces.
 */
async function sendRemindersForArtist(settings, now) {
  const enabledRules = (settings.rules || []).filter((rule) => rule.enabled);
  if (!enabledRules.length || (!settings.emailEnabled && !settings.smsEnabled)) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const [artist, artistUser, appointments] = await Promise.all([
    Artist.findOne({ userId: settings.artistUserId }),
    User.findById(settings.artistUserId).select('timezone'),
    Appointment.find({
      userId: settings.artistUserId,
      appointmentDate: { $gt: now },
      appointmentStatus: { $in: REMINDABLE_STATUSES },
    }),
  ]);
  if (!artist) {
    // An artist row can't disappear while their User does not, but a reminder with no known
    // sender identity has nothing honest to put in {{artistName}} - skip rather than guess.
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const artistName = `${artist.firstName} ${artist.lastName}`.trim();
  const link = buildClientLink(artist);
  // User.timezone, not Artist - the artist's chosen zone lives on their account (see
  // models/User.js's own comment: it's the ONLY thing read at send time), and Artist has no
  // timezone field of its own.
  const artistTimezone = artistUser && artistUser.timezone;

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const appointment of appointments) {
    for (const rule of enabledRules) {
      const dueAt = new Date(
        appointment.appointmentDate.getTime() - rule.offsetMinutes * 60 * 1000,
      );
      if (dueAt > now) {
        continue;
      }

      const channels = [];
      if (settings.emailEnabled) channels.push('email');
      if (settings.smsEnabled) channels.push('sms');

      // eslint-disable-next-line no-await-in-loop
      const client = await resolveClientForAppointment(appointment);
      if (!client) {
        continue;
      }

      for (const channel of channels) {
        // The claim. See models/ReminderLog.js - inserted BEFORE the send attempt, and a
        // duplicate-key error here means another sweep (or an earlier tick) already has this one.
        // Keyed on offsetMinutes rather than rule._id - see that model's own comment on why.
        let logRow;
        try {
          // eslint-disable-next-line no-await-in-loop
          logRow = await ReminderLog.create({
            appointmentId: appointment._id,
            channel,
            artistUserId: settings.artistUserId,
            offsetMinutes: rule.offsetMinutes,
            status: 'sending',
          });
        } catch (err) {
          if (err && err.code === 11000) {
            continue;
          }
          throw err;
        }

        const { appointmentDate, appointmentTime } = formatAppointmentDateTime(
          appointment.appointmentDate,
          artistTimezone,
        );
        const vars = {
          clientFirstName: client.firstName,
          artistName,
          appointmentDate,
          appointmentTime,
          link,
        };

        try {
          let result = null;
          if (channel === 'email') {
            if (client.email) {
              result = await sendEmail({
                to: client.email,
                subject: renderTemplate(
                  settings.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT_TEMPLATE,
                  vars,
                ),
                htmlBody: renderTemplate(
                  settings.emailBodyTemplate || DEFAULT_EMAIL_BODY_TEMPLATE,
                  vars,
                ).replace(/\n/g, '<br/>'),
                textBody: renderTemplate(
                  settings.emailBodyTemplate || DEFAULT_EMAIL_BODY_TEMPLATE,
                  vars,
                ),
              });
            }
          } else {
            if (client.phone) {
              result = await sendSms({
                to: client.phone,
                body: renderTemplate(settings.smsTemplate || DEFAULT_SMS_TEMPLATE, vars),
              });
            }
          }

          if (result) {
            await ReminderLog.updateOne(
              { _id: logRow._id },
              { $set: { status: 'sent', sentAt: new Date() } },
            );
            sent += 1;
          } else {
            // No client email/phone on file, or the provider rejected/no-opped it - sendEmail and
            // sendSms both already warned with the specifics; this just records the outcome.
            await ReminderLog.updateOne(
              { _id: logRow._id },
              { $set: { status: 'skipped', error: `no ${channel === 'email' ? 'email' : 'phone number'} on file, or the provider rejected it` } },
            );
            skipped += 1;
          }
        } catch (err) {
          await ReminderLog.updateOne(
            { _id: logRow._id },
            { $set: { status: 'failed', error: err.message } },
          );
          failed += 1;
        }
      }
    }
  }

  return { sent, skipped, failed };
}

/**
 * The sweep, as utils/notification-jobs.js wants it: every artist with reminders configured at
 * all, checked against their own appointments and rules.
 */
async function sendDueReminders({ now = new Date() } = {}) {
  const settingsList = await ReminderSettings.find({
    $or: [{ emailEnabled: true }, { smsEnabled: true }],
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const settings of settingsList) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendRemindersForArtist(settings, now);
    sent += result.sent;
    skipped += result.skipped;
    failed += result.failed;
  }
  return { sent, skipped, failed, artistsChecked: settingsList.length };
}

module.exports = {
  sendDueReminders,
  sendRemindersForArtist,
  resolveClientForAppointment,
  renderTemplate,
  buildClientLink,
  formatAppointmentDateTime,
  REMINDABLE_STATUSES,
  DEFAULT_EMAIL_SUBJECT_TEMPLATE,
  DEFAULT_EMAIL_BODY_TEMPLATE,
  DEFAULT_SMS_TEMPLATE,
};
