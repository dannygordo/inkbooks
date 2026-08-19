const AutoResponse = require('../models/AutoResponse');
const AutoResponseLog = require('../models/AutoResponseLog');
const Appointment = require('../models/Appointment');
const Artist = require('../models/Artist');
const User = require('../models/User');
const Client = require('../models/Client');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { sendEmail } = require('./email');
const { sendSms } = require('./sms');
const { renderTemplate } = require('./message-templates');
const { resolveClientForAppointment, buildClientLink, formatAppointmentDateTime } = require('./reminders');
const { getActiveShopIdForArtist } = require('./artist-shop');
const { UserInputError } = require('./errors');

/**
 * Auto-Responses: owner-editable message templates, fired automatically on a lifecycle event or
 * sent by hand. See models/AutoResponse.js/AutoResponseLog.js for the data shapes and the plan
 * this shipped from for the full decision record; this file is the three send paths (two
 * automatic, one manual) plus the precedence rule that decides which owner's template actually
 * fires.
 */

// Built-in wording per trigger, used whenever an AutoResponse's own template field is null - same
// "null means built-in default" convention as ReminderSettings (see utils/reminders.js's
// DEFAULT_EMAIL_SUBJECT_TEMPLATE etc.). MANUAL has no automatic use, but keeps a default for the
// same reason a brand-new manual template shouldn't start life sending nothing.
const DEFAULT_TEMPLATES = {
  SESSION_COMPLETED: {
    emailSubject: 'Aftercare instructions from {{artistName}}',
    emailBody:
      'Hi {{clientFirstName}},\n\n' +
      'Thanks for coming in! Please take good care of your new tattoo: keep it clean, keep it ' +
      'moisturized, and avoid direct sun, swimming, and tight clothing over it while it heals.\n\n' +
      'Reach out any time if you have questions.\n\n' +
      '{{artistName}}',
    sms:
      'Hi {{clientFirstName}}, thanks for coming in today! Keep the area clean and moisturized, ' +
      'avoid sun/swimming while it heals, and reach out with any questions. - {{artistName}}',
  },
  PAYMENT_RECEIVED: {
    emailSubject: 'Your receipt from {{artistName}}',
    emailBody:
      'Hi {{clientFirstName}},\n\n' +
      'Thanks for your payment - this confirms it was received. Let {{artistName}} know if ' +
      'anything looks off.',
    sms: 'Hi {{clientFirstName}}, this confirms your payment was received. Thanks! - {{artistName}}',
  },
  MESSAGE_RECEIVED: {
    emailSubject: "We got your message",
    emailBody:
      'Hi {{clientFirstName}},\n\n' +
      "Thanks for reaching out - {{artistName}} is away from messages right now and will get " +
      'back to you as soon as possible.',
    sms:
      'Hi {{clientFirstName}}, thanks for reaching out! {{artistName}} is away right now and ' +
      'will get back to you as soon as possible.',
  },
  MANUAL: {
    emailSubject: 'A message from {{artistName}}',
    emailBody: 'Hi {{clientFirstName}},\n\n{{artistName}} wanted to reach out.',
    sms: 'Hi {{clientFirstName}}, this is {{artistName}}.',
  },
};

/**
 * Decision #4's precedence rule, as its own testable function: the artist's own enabled response
 * for this trigger wins; the shop's fires only when the artist has none. Returns null when
 * neither owner has an enabled, active response for this trigger - the caller's cue to send
 * nothing rather than fall back to some other default.
 */
async function resolveAutoResponseForTrigger({ artistUserId, shopId, trigger }) {
  if (artistUserId) {
    const artistResponse = await AutoResponse.findOne({
      artistUserId,
      trigger,
      enabled: true,
      active: true,
    });
    if (artistResponse) {
      return { autoResponse: artistResponse, ownerType: 'ARTIST' };
    }
  }
  if (shopId) {
    const shopResponse = await AutoResponse.findOne({
      shopId,
      trigger,
      enabled: true,
      active: true,
    });
    if (shopResponse) {
      return { autoResponse: shopResponse, ownerType: 'SHOP' };
    }
  }
  return null;
}

/**
 * The automatic path - resolves the artist (and their shop, if any) straight from the
 * appointment, applies the precedence rule, claims an AutoResponseLog row per channel BEFORE
 * sending (same ordering as ReminderLog - see that model's header comment for why claim-first is
 * what makes a duplicate call safe), renders, sends, and updates the log.
 *
 * BEST-EFFORT, NEVER THROWS - matches syncNoShowFlag's contract at the exact same two call sites
 * (mutations/appointments.js, routes/squarePayments.js): an appointment transition that already
 * happened must never be undone because an Auto-Response could not be resolved or sent.
 *
 * `sendEmailFn`/`sendSmsFn` are injectable so tests are deterministic rather than dependent on
 * real mail/SMS credentials - the same pattern utils/client-booking-emails.js's
 * sendConsultBookedEmail and sendDueClientScheduleEmails already use. Nothing in production passes
 * them.
 */
async function sendAutoResponsesForTrigger(
  { trigger, appointment },
  { sendEmailFn = sendEmail, sendSmsFn = sendSms } = {},
) {
  try {
    if (!appointment || !appointment.userId) {
      return { sent: 0, skipped: 0, failed: 0 };
    }

    const resolved = await resolveAutoResponseForTrigger({
      artistUserId: appointment.userId,
      shopId: appointment.shopId || null,
      trigger,
    });
    if (!resolved) {
      return { sent: 0, skipped: 0, failed: 0 };
    }
    const { autoResponse, ownerType } = resolved;

    const channels = [];
    if (autoResponse.emailEnabled) channels.push('email');
    if (autoResponse.smsEnabled) channels.push('sms');
    if (channels.length === 0) {
      return { sent: 0, skipped: 0, failed: 0 };
    }

    const [client, artist, artistUser] = await Promise.all([
      resolveClientForAppointment(appointment),
      Artist.findOne({ userId: appointment.userId }),
      User.findById(appointment.userId).select('timezone'),
    ]);
    if (!client || !artist) {
      // No client to send to, or no known sender identity for {{artistName}} - skip rather than
      // guess, same reasoning as sendRemindersForArtist.
      return { sent: 0, skipped: 0, failed: 0 };
    }

    const artistName = `${artist.firstName} ${artist.lastName}`.trim();
    const link = buildClientLink(artist);
    const { appointmentDate, appointmentTime } = formatAppointmentDateTime(
      appointment.appointmentDate,
      artistUser && artistUser.timezone,
    );
    const vars = { clientFirstName: client.firstName, artistName, appointmentDate, appointmentTime, link };
    const defaults = DEFAULT_TEMPLATES[trigger] || DEFAULT_TEMPLATES.MANUAL;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const channel of channels) {
      // The claim. A duplicate-key error means another process (a retried webhook, an overlapping
      // request) already handled this exact (response, appointment, channel) - see
      // models/AutoResponseLog.js's own comment on the partial unique index this relies on.
      let logRow;
      try {
        // eslint-disable-next-line no-await-in-loop
        logRow = await AutoResponseLog.create({
          autoResponseId: autoResponse._id,
          ownerType,
          channel,
          appointmentId: appointment._id,
          status: 'sending',
        });
      } catch (err) {
        if (err && err.code === 11000) {
          continue;
        }
        throw err;
      }

      try {
        let result = null;
        if (channel === 'email') {
          if (client.email) {
            // eslint-disable-next-line no-await-in-loop
            result = await sendEmailFn({
              to: client.email,
              subject: renderTemplate(autoResponse.emailSubjectTemplate || defaults.emailSubject, vars),
              htmlBody: renderTemplate(
                autoResponse.emailBodyTemplate || defaults.emailBody,
                vars,
              ).replace(/\n/g, '<br/>'),
              textBody: renderTemplate(autoResponse.emailBodyTemplate || defaults.emailBody, vars),
            });
          }
        } else if (client.phone) {
          // eslint-disable-next-line no-await-in-loop
          result = await sendSmsFn({
            to: client.phone,
            body: renderTemplate(autoResponse.smsTemplate || defaults.sms, vars),
          });
        }

        if (result) {
          // eslint-disable-next-line no-await-in-loop
          await AutoResponseLog.updateOne(
            { _id: logRow._id },
            { $set: { status: 'sent', sentAt: new Date() } },
          );
          sent += 1;
        } else {
          // eslint-disable-next-line no-await-in-loop
          await AutoResponseLog.updateOne(
            { _id: logRow._id },
            {
              $set: {
                status: 'skipped',
                error: `no ${channel === 'email' ? 'email' : 'phone number'} on file, or the provider rejected it`,
              },
            },
          );
          skipped += 1;
        }
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await AutoResponseLog.updateOne({ _id: logRow._id }, { $set: { status: 'failed', error: err.message } });
        failed += 1;
      }
    }

    return { sent, skipped, failed };
  } catch (err) {
    console.warn(`[auto-responses] sendAutoResponsesForTrigger failed: ${err.message}`);
    return { sent: 0, skipped: 0, failed: 0, error: err.message };
  }
}

/**
 * The second automatic path - trigger: 'MESSAGE_RECEIVED', called from createMessage
 * (mutations/messages.js) after every message is saved. Fires an away-reply for a client's
 * incoming message the same way an email out-of-office responder does: once per message, not once
 * per conversation or per day (see HANDOFF.md's 2026-08-19 entry for the decision record).
 *
 * ONLY FIRES FOR A CLEAN CLIENT -> SINGLE-ARTIST THREAD. The sender must be a Client (an
 * artist/staff member replying, or messaging a coworker, must never trigger an away-reply - this
 * is also what stops the reply this function posts from ever triggering itself, since that
 * follow-up message is authored by the artist, not the client). Among the conversation's other
 * members, exactly one must resolve to an Artist - zero (a staff-only thread) or more than one (a
 * group thread) is left alone rather than guessing who should answer; in practice every ordinary
 * client/artist Messages thread is exactly this shape.
 *
 * BEST-EFFORT, NEVER THROWS - same contract as sendAutoResponsesForTrigger above: the message the
 * client actually sent is the thing that must never be lost because an away-reply couldn't be
 * resolved or sent.
 *
 * TWO CHANNELS THAT AREN'T emailEnabled/smsEnabled: this trigger always posts a real Message into
 * the conversation (channel: 'thread' in the log) whenever a MESSAGE_RECEIVED response resolves,
 * regardless of the emailEnabled/smsEnabled toggles - those two govern only the SEPARATE
 * standalone email/SMS send below the thread-post. An away-reply is meant to reach someone who
 * isn't actively watching the thread, which in-app-only can't do; posting into the thread is what
 * makes it a real reply rather than just an email that happens to reference the conversation.
 *
 * `sendEmailFn`/`sendSmsFn` are injectable for the same testability reason as
 * sendAutoResponsesForTrigger above. Nothing in production passes them.
 */
async function sendAutoResponseForIncomingMessage(
  { conversationId, senderId, messageId },
  { sendEmailFn = sendEmail, sendSmsFn = sendSms } = {},
) {
  try {
    const senderClient = await Client.findOne({ userId: senderId });
    if (!senderClient) {
      return { sent: 0, skipped: 0, failed: 0 };
    }

    const conversation = await Conversation.findById(conversationId).select('members');
    if (!conversation) {
      return { sent: 0, skipped: 0, failed: 0 };
    }
    const otherMemberIds = (conversation.members || []).filter(
      (memberId) => String(memberId) !== String(senderId),
    );
    const artistMembers = (
      await Promise.all(otherMemberIds.map((memberId) => Artist.findOne({ userId: memberId })))
    ).filter(Boolean);
    if (artistMembers.length !== 1) {
      // Zero artist members (staff-only thread) or more than one (group thread) - see this
      // function's own header comment for why both are left alone rather than guessed at.
      return { sent: 0, skipped: 0, failed: 0 };
    }
    const [artistMember] = artistMembers;

    const shopId = await getActiveShopIdForArtist(artistMember.userId);
    const resolved = await resolveAutoResponseForTrigger({
      artistUserId: artistMember.userId,
      shopId,
      trigger: 'MESSAGE_RECEIVED',
    });
    if (!resolved) {
      return { sent: 0, skipped: 0, failed: 0 };
    }
    const { autoResponse, ownerType } = resolved;

    const sendingArtistUser = await User.findById(artistMember.userId).select('firstName lastName');
    const artistName = sendingArtistUser
      ? `${sendingArtistUser.firstName} ${sendingArtistUser.lastName}`.trim()
      : `${artistMember.firstName} ${artistMember.lastName}`.trim();
    const link = buildClientLink(artistMember);
    const vars = {
      clientFirstName: senderClient.firstName,
      artistName,
      appointmentDate: '',
      appointmentTime: '',
      link,
    };
    const defaults = DEFAULT_TEMPLATES.MESSAGE_RECEIVED;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    // The in-app reply. Claimed first and independently of the email/sms claims below - see this
    // function's own header comment on why it isn't gated by emailEnabled/smsEnabled.
    let threadLog = null;
    try {
      threadLog = await AutoResponseLog.create({
        autoResponseId: autoResponse._id,
        ownerType,
        channel: 'thread',
        messageId,
        status: 'sending',
      });
    } catch (err) {
      if (err && err.code === 11000) {
        threadLog = null; // already claimed by a previous attempt at this exact message
      } else {
        throw err;
      }
    }
    if (threadLog) {
      try {
        const bodyText = renderTemplate(autoResponse.emailBodyTemplate || defaults.emailBody, vars);
        const now = new Date();
        await new Message({
          conversationId,
          senderId: artistMember.userId,
          message: bodyText,
          createdAt: now,
          updatedAt: now,
        }).save();
        // Same bump createMessage itself does - the away-reply is a real message and the
        // conversation's own "most recent activity" ordering must reflect it.
        await Conversation.updateOne({ _id: conversationId }, { $set: { updatedAt: now } });
        await AutoResponseLog.updateOne(
          { _id: threadLog._id },
          { $set: { status: 'sent', sentAt: new Date() } },
        );
        sent += 1;
      } catch (err) {
        await AutoResponseLog.updateOne(
          { _id: threadLog._id },
          { $set: { status: 'failed', error: err.message } },
        );
        failed += 1;
      }
    }

    const channels = [];
    if (autoResponse.emailEnabled) channels.push('email');
    if (autoResponse.smsEnabled) channels.push('sms');

    for (const channel of channels) {
      let logRow;
      try {
        // eslint-disable-next-line no-await-in-loop
        logRow = await AutoResponseLog.create({
          autoResponseId: autoResponse._id,
          ownerType,
          channel,
          messageId,
          status: 'sending',
        });
      } catch (err) {
        if (err && err.code === 11000) {
          continue;
        }
        throw err;
      }

      try {
        let result = null;
        if (channel === 'email') {
          if (senderClient.email) {
            // eslint-disable-next-line no-await-in-loop
            result = await sendEmailFn({
              to: senderClient.email,
              subject: renderTemplate(autoResponse.emailSubjectTemplate || defaults.emailSubject, vars),
              htmlBody: renderTemplate(
                autoResponse.emailBodyTemplate || defaults.emailBody,
                vars,
              ).replace(/\n/g, '<br/>'),
              textBody: renderTemplate(autoResponse.emailBodyTemplate || defaults.emailBody, vars),
            });
          }
        } else if (senderClient.phone) {
          // eslint-disable-next-line no-await-in-loop
          result = await sendSmsFn({
            to: senderClient.phone,
            body: renderTemplate(autoResponse.smsTemplate || defaults.sms, vars),
          });
        }

        if (result) {
          // eslint-disable-next-line no-await-in-loop
          await AutoResponseLog.updateOne(
            { _id: logRow._id },
            { $set: { status: 'sent', sentAt: new Date() } },
          );
          sent += 1;
        } else {
          // eslint-disable-next-line no-await-in-loop
          await AutoResponseLog.updateOne(
            { _id: logRow._id },
            {
              $set: {
                status: 'skipped',
                error: `no ${channel === 'email' ? 'email' : 'phone number'} on file, or the provider rejected it`,
              },
            },
          );
          skipped += 1;
        }
      } catch (err) {
        // eslint-disable-next-line no-await-in-loop
        await AutoResponseLog.updateOne({ _id: logRow._id }, { $set: { status: 'failed', error: err.message } });
        failed += 1;
      }
    }

    return { sent, skipped, failed };
  } catch (err) {
    console.warn(`[auto-responses] sendAutoResponseForIncomingMessage failed: ${err.message}`);
    return { sent: 0, skipped: 0, failed: 0, error: err.message };
  }
}

/**
 * The manual path behind the "Send a message" picker / sendAutoResponseNow mutation. Unlike the
 * automatic path this is a DELIBERATE action - no dedup constraint (see AutoResponseLog's own
 * comment on why appointmentId is nullable), and real errors throw rather than being swallowed,
 * since the caller is a mutation the UI should surface a failure from.
 *
 * artistName in the rendered template is whoever is doing the sending (triggeredByUserId), not
 * necessarily the response's own owner - a shop-owned template sent by staff or a shop admin still
 * needs a real name in the merge field, and the person physically sending it is the only always-
 * available answer to "who is this message from."
 *
 * `sendEmailFn`/`sendSmsFn` are injectable for the same testability reason as
 * sendAutoResponsesForTrigger above. Nothing in production passes them.
 */
async function sendManualAutoResponse(
  { autoResponseId, clientId, appointmentId, triggeredByUserId },
  { sendEmailFn = sendEmail, sendSmsFn = sendSms } = {},
) {
  const autoResponse = await AutoResponse.findOne({ _id: autoResponseId, active: true });
  if (!autoResponse) {
    throw new UserInputError('This Auto-Response no longer exists or has been deactivated.');
  }

  const channels = [];
  if (autoResponse.emailEnabled) channels.push('email');
  if (autoResponse.smsEnabled) channels.push('sms');
  if (channels.length === 0) {
    throw new UserInputError('This Auto-Response has no channel enabled to send on.');
  }

  const ownerType = autoResponse.shopId ? 'SHOP' : 'ARTIST';

  const [client, sendingUser, appointment] = await Promise.all([
    Client.findById(clientId),
    User.findById(triggeredByUserId).select('firstName lastName timezone'),
    appointmentId ? Appointment.findById(appointmentId) : Promise.resolve(null),
  ]);
  if (!client) {
    throw new UserInputError('Client not found.');
  }

  const artist = await Artist.findOne({ userId: triggeredByUserId });
  const artistName = sendingUser ? `${sendingUser.firstName} ${sendingUser.lastName}`.trim() : 'your artist';
  const link = buildClientLink(artist);
  const dateVars = appointment
    ? formatAppointmentDateTime(appointment.appointmentDate, sendingUser && sendingUser.timezone)
    : { appointmentDate: '', appointmentTime: '' };
  const vars = { clientFirstName: client.firstName, artistName, ...dateVars, link };
  const defaults = DEFAULT_TEMPLATES[autoResponse.trigger] || DEFAULT_TEMPLATES.MANUAL;

  const results = [];
  for (const channel of channels) {
    // eslint-disable-next-line no-await-in-loop
    const logRow = await AutoResponseLog.create({
      autoResponseId: autoResponse._id,
      ownerType,
      channel,
      triggeredByUserId,
      appointmentId: appointment ? appointment._id : null,
      status: 'sending',
    });
    try {
      let result = null;
      if (channel === 'email') {
        if (client.email) {
          // eslint-disable-next-line no-await-in-loop
          result = await sendEmailFn({
            to: client.email,
            subject: renderTemplate(autoResponse.emailSubjectTemplate || defaults.emailSubject, vars),
            htmlBody: renderTemplate(autoResponse.emailBodyTemplate || defaults.emailBody, vars).replace(
              /\n/g,
              '<br/>',
            ),
            textBody: renderTemplate(autoResponse.emailBodyTemplate || defaults.emailBody, vars),
          });
        }
      } else if (client.phone) {
        // eslint-disable-next-line no-await-in-loop
        result = await sendSmsFn({
          to: client.phone,
          body: renderTemplate(autoResponse.smsTemplate || defaults.sms, vars),
        });
      }

      if (result) {
        // eslint-disable-next-line no-await-in-loop
        await AutoResponseLog.updateOne({ _id: logRow._id }, { $set: { status: 'sent', sentAt: new Date() } });
        results.push({ channel, ok: true });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await AutoResponseLog.updateOne(
          { _id: logRow._id },
          {
            $set: {
              status: 'skipped',
              error: `no ${channel === 'email' ? 'email' : 'phone number'} on file, or the provider rejected it`,
            },
          },
        );
        results.push({ channel, ok: false, reason: 'skipped' });
      }
    } catch (err) {
      // eslint-disable-next-line no-await-in-loop
      await AutoResponseLog.updateOne({ _id: logRow._id }, { $set: { status: 'failed', error: err.message } });
      results.push({ channel, ok: false, reason: 'failed', error: err.message });
    }
  }

  return { ok: results.some((r) => r.ok), results };
}

module.exports = {
  DEFAULT_TEMPLATES,
  resolveAutoResponseForTrigger,
  sendAutoResponsesForTrigger,
  sendAutoResponseForIncomingMessage,
  sendManualAutoResponse,
};
