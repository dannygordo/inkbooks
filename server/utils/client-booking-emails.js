const Appointment = require('../models/Appointment');
const BookingRequest = require('../models/BookingRequest');
const Client = require('../models/Client');
const ClientScheduleEmail = require('../models/ClientScheduleEmail');
const Project = require('../models/Project');
const User = require('../models/User');
const { formatCents } = require('./money');
const { digestTimingFor } = require('./notification-preferences');
const { sendEmail, buildGuestConversationLink } = require('./email');
const { getActiveShopIdForArtist } = require('./artist-shop');
const { resolveSystemMessageTemplate, DEFAULT_TEMPLATES } = require('./system-message-templates');
const { renderTemplate } = require('./message-templates');

/**
 * Telling a client what they have booked.
 *
 * ---------------------------------------------------------------------------------------------
 * TWO EVENTS, TWO TIMINGS, ONE EMAIL BODY
 *
 * A CONSULT sends immediately. There is exactly one appointment, nothing else is coming, and the
 * client is usually still standing at the counter or just off the phone.
 *
 * A SESSION waits, because an artist booking a course of work enters several sittings in a row.
 * Sending per sitting produces four emails in ninety seconds, the first three already wrong. So the
 * send is deferred by ClientScheduleEmail.DEBOUNCE_MS and the deadline RESTARTS on each new sitting
 * for that project - see queueProjectScheduleEmail. The client gets one email, after the artist has
 * finished, listing the whole schedule.
 *
 * Both render through the same builder, so the two paths cannot describe the same booking
 * differently.
 *
 * WHOSE CLOCK THE TIMES ARE IN
 *
 * The ARTIST's timezone, not the server's and not the client's. Stored appointment dates are
 * instants; printing one requires choosing a wall clock, and the only one that is certainly right
 * is the one the studio operates in - a client flying in for a sitting needs the time at the shop,
 * not the time where they happen to be reading their email. The zone is named in the email for
 * exactly that reason, because an unlabelled time is a guess.
 *
 * Formatted through Intl with a timeZone, the way utils/digest.js already does it - not by adding
 * an offset, which is wrong for half the year, and not by printing the UTC clock face, which is
 * right only in London. The client is banned from the latter outright by
 * scripts/check-no-utc-display.mjs; the same trap exists here.
 * ---------------------------------------------------------------------------------------------
 */

/**
 * "Tuesday, August 19, 2026 at 1:00 PM PDT".
 *
 * The WEEKDAY and the ZONE ABBREVIATION are both deliberate. A confirmation is checked against
 * somebody's memory of what they agreed, and "Tuesday" catches a wrong date that "19/08" does not;
 * an unlabelled time is a guess as soon as the reader is anywhere else.
 */
function formatWhen(date, zone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(date));
}

/** "3 hours 30 minutes", "45 minutes" - never a bare minute count nobody wants to divide. */
function formatDuration(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (rest > 0) parts.push(`${rest} minute${rest === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' ') : '0 minutes';
}

/**
 * The intake form, played back.
 *
 * Only the fields that were actually filled in. A confirmation listing "Placement: —, Size: —" reads
 * as a form that failed rather than as a request somebody chose not to over-specify.
 */
function intakeLines(bookingRequest) {
  if (!bookingRequest) return [];
  const fields = [
    ['What you asked for', bookingRequest.description],
    ['Placement', bookingRequest.placement],
    ['Size', bookingRequest.size],
    ['Budget', bookingRequest.budget],
    ['Cover-up', bookingRequest.isCoverUp ? 'Yes' : null],
  ];
  return fields
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([label, value]) => [label, String(value).trim()]);
}

/**
 * Builds the email.
 *
 * Returns { subject, htmlBody, textBody } rather than sending, so the shape is assertable in a test
 * without a mail provider and without inspecting a spy's arguments.
 *
 * @param {object}   input
 * @param {string}   input.clientFirstName
 * @param {string}   input.artistName
 * @param {string}   input.timezone
 * @param {'consult'|'session'} input.kind
 * @param {Array}    input.appointments - one for a consult; every sitting, in date order, for a project
 * @param {number}   input.depositCents - 0 when none was taken
 * @param {object}   [input.bookingRequest]
 * @param {string}   [input.guestLink]
 * @param {string}   [input.subjectOverride] - Feature 2: an owner's custom subject, already
 *   rendered against {{clientFirstName}}/{{artistName}}. Null/omitted keeps the code-generated
 *   subject below, which stays smart about singular/plural and consult/session wording in a way
 *   a single static override can't be.
 * @param {string}   [input.extraNote] - Feature 2: an owner's appendable note, already rendered.
 *   The ONLY other part of this email that's owner-editable - see this file's own header comment
 *   on why the schedule/deposit/intake body stays code-generated rather than becoming a second
 *   free-text template a shop could accidentally delete real information from.
 */
function buildClientBookingEmail({
  clientFirstName,
  artistName,
  timezone,
  kind,
  appointments,
  depositCents,
  bookingRequest,
  guestLink,
  subjectOverride,
  extraNote,
}) {
  const isConsult = kind === 'consult';
  const subject =
    subjectOverride ||
    (isConsult
      ? `Your consult with ${artistName} is booked`
      : appointments.length === 1
        ? `Your session with ${artistName} is booked`
        : `Your ${appointments.length} sessions with ${artistName} are booked`);

  const when = appointments.map((appointment) => ({
    when: formatWhen(appointment.appointmentDate, timezone),
    duration: formatDuration(appointment.durationMinutes),
  }));

  const intake = intakeLines(bookingRequest);

  // A deposit of zero is stated rather than omitted. "Nothing was taken" is information a client
  // wants confirmed; silence about money reads as an oversight and generates the exact question
  // this email exists to prevent.
  const depositLine =
    depositCents > 0
      ? `Deposit paid: ${formatCents(depositCents)}`
      : 'Deposit paid: none taken';

  const html = [
    `<p>Hi ${clientFirstName},</p>`,
    isConsult
      ? `<p>Your consult with ${artistName} is confirmed.</p>`
      : `<p>Your ${appointments.length === 1 ? 'session' : 'sessions'} with ${artistName} ${
          appointments.length === 1 ? 'is' : 'are'
        } confirmed.</p>`,
    `<p><strong>${isConsult ? 'When' : 'Your schedule'}</strong></p>`,
    '<ul>',
    ...when.map((row) => `<li>${row.when} (${row.duration})</li>`),
    '</ul>',
    `<p>${depositLine}</p>`,
    ...(intake.length > 0
      ? [
          '<p><strong>Your original request</strong></p>',
          '<ul>',
          ...intake.map(([label, value]) => `<li>${label}: ${value}</li>`),
          '</ul>',
        ]
      : []),
    ...(guestLink
      ? [`<p>You can view this and message ${artistName} here:</p>`,
         `<p><a href="${guestLink}">${guestLink}</a></p>`]
      : []),
    ...(extraNote ? [`<p>${extraNote}</p>`] : []),
    `<p>Times are shown in ${timezone}.</p>`,
  ].join('');

  const text = [
    `Hi ${clientFirstName},`,
    '',
    isConsult
      ? `Your consult with ${artistName} is confirmed.`
      : `Your ${appointments.length === 1 ? 'session' : 'sessions'} with ${artistName} ${
          appointments.length === 1 ? 'is' : 'are'
        } confirmed.`,
    '',
    isConsult ? 'When' : 'Your schedule',
    ...when.map((row) => `  - ${row.when} (${row.duration})`),
    '',
    depositLine,
    ...(intake.length > 0
      ? ['', 'Your original request', ...intake.map(([label, value]) => `  ${label}: ${value}`)]
      : []),
    ...(guestLink ? ['', `View this and message ${artistName}:`, guestLink] : []),
    ...(extraNote ? ['', extraNote] : []),
    '',
    `Times are shown in ${timezone}.`,
  ].join('\n');

  return { subject, htmlBody: html, textBody: text };
}

/**
 * Feature 2's narrower treatment for this one email - see buildClientBookingEmail's own doc
 * comment on subjectOverride/extraNote. Resolved once here rather than inline at each of the two
 * call sites below, so BOOKING_CONFIRMATION's precedence can't drift between the immediate-consult
 * path and the debounced-session sweep.
 */
async function resolveBookingConfirmationExtras({ artistUserId, shopId, clientFirstName, artistName }) {
  const custom = await resolveSystemMessageTemplate({
    artistUserId,
    shopId,
    key: 'BOOKING_CONFIRMATION',
  });
  const vars = { clientFirstName, artistName };
  const subjectTemplate = (custom && custom.emailSubjectTemplate) || DEFAULT_TEMPLATES.BOOKING_CONFIRMATION.emailSubject;
  const noteTemplate = (custom && custom.extraNoteTemplate) || DEFAULT_TEMPLATES.BOOKING_CONFIRMATION.extraNote;
  return {
    subjectOverride: subjectTemplate ? renderTemplate(subjectTemplate, vars) : null,
    extraNote: noteTemplate ? renderTemplate(noteTemplate, vars) : '',
  };
}

/** Everything the builder needs, gathered from ids. Shared by both timings. */
async function gather({ clientUserId, artistUserId, bookingRequestId }) {
  const [clientUser, artistUser, bookingRequest] = await Promise.all([
    User.findById(clientUserId).select('email firstName'),
    User.findById(artistUserId).select('firstName lastName timezone'),
    bookingRequestId ? BookingRequest.findById(bookingRequestId) : Promise.resolve(null),
  ]);
  return { clientUser, artistUser, bookingRequest };
}

function artistDisplayName(artistUser) {
  if (!artistUser) return 'your artist';
  return [artistUser.firstName, artistUser.lastName].filter(Boolean).join(' ') || 'your artist';
}

/**
 * A consult, sent NOW.
 *
 * Inline rather than through the sweep, deliberately. The scheduler ticks on a period; routing an
 * "immediately" through it would make immediately mean "within a tick", and there is nothing to
 * coalesce - a consult is one appointment and no second one is coming for it.
 *
 * Best-effort, like every other emit site: a booking must not fail because a confirmation could not
 * be sent. sendEmail() already warns and returns null rather than throwing (see utils/email.js), and
 * the outcome is returned so a caller can act on it rather than it vanishing into a log.
 */
async function sendConsultBookedEmail(
  { appointment, clientUserId, artistUserId, bookingRequestId },
  { send = sendEmail } = {},
) {
  try {
    const { clientUser, artistUser, bookingRequest } = await gather({
      clientUserId,
      artistUserId,
      bookingRequestId,
    });
    if (!clientUser || !clientUser.email) {
      return { ok: false, reason: 'no-email' };
    }
    const { timezone } = digestTimingFor(artistUser);
    const displayName = artistDisplayName(artistUser);
    const shopId = await getActiveShopIdForArtist(artistUserId);
    const { subjectOverride, extraNote } = await resolveBookingConfirmationExtras({
      artistUserId,
      shopId,
      clientFirstName: clientUser.firstName,
      artistName: displayName,
    });
    const email = buildClientBookingEmail({
      clientFirstName: clientUser.firstName,
      artistName: displayName,
      timezone,
      kind: 'consult',
      appointments: [appointment],
      depositCents: appointment.depositCents || 0,
      bookingRequest,
      guestLink: bookingRequest?.guestToken
        ? buildGuestConversationLink(bookingRequest.guestToken)
        : null,
      subjectOverride,
      extraNote,
    });
    const result = await send({ to: clientUser.email, ...email });
    // sendEmail() signals failure by returning null rather than throwing - the convention
    // notification-jobs.js and message-notifications.js already check. Treating a null as success
    // is how "sent" came to be reported for mail that never left.
    return result ? { ok: true } : { ok: false, reason: 'provider-rejected' };
  } catch (err) {
    console.warn(`[client-emails] consult confirmation failed: ${err.message}`);
    return { ok: false, reason: 'failed', error: err.message };
  }
}

/**
 * A session, queued - and the deadline RESTARTED if one is already waiting.
 *
 * THE UPSERT IS THE DEBOUNCE. One findOneAndUpdate against the pending row for this project either
 * pushes an existing deadline forward or creates the row. Four sittings entered in a row therefore
 * produce one row whose deadline is three minutes after the FOURTH, not four rows and not a
 * deadline three minutes after the first.
 *
 * Scoped to status 'pending' so a project whose confirmation has already gone out can queue a fresh
 * one when a sitting is added weeks later - the client then gets the full updated schedule rather
 * than a fragment. models/ClientScheduleEmail.js's partial unique index is what makes that safe.
 */
async function queueProjectScheduleEmail(projectId, { now = new Date() } = {}) {
  if (!projectId) {
    return null;
  }
  // EVERYTHING IS DERIVED FROM THE PROJECT, and the function takes nothing else.
  //
  // convertBookingRequest has the client and artist ids to hand and could pass them; createAppointment,
  // which books sittings two through four, has only a projectId. Accepting both shapes would mean two
  // ways to queue the same email and a way to pass a set of ids that disagree with each other. One
  // argument means every caller is saying the same thing: the schedule for this piece changed.
  const project = await Project.findById(projectId).select('artistId clientId bookingRequestId');
  if (!project || !project.artistId || !project.clientId) {
    return null;
  }
  // Project.clientId is the Client sub-document's own _id, NOT the client's User._id - the
  // distinction that has bitten this codebase before (see resolvers/index.js's project resolvers).
  // The email needs a User, because that is where the address lives.
  const client = await Client.findById(project.clientId).select('userId');
  if (!client || !client.userId) {
    return null;
  }

  const sendAfter = new Date(now.getTime() + ClientScheduleEmail.DEBOUNCE_MS);
  return ClientScheduleEmail.findOneAndUpdate(
    { projectId: project._id, status: 'pending' },
    {
      $set: {
        sendAfter,
        clientUserId: client.userId,
        artistUserId: project.artistId,
        updatedAt: now,
      },
      $setOnInsert: {
        projectId: project._id,
        bookingRequestId: project.bookingRequestId || null,
        status: 'pending',
        createdAt: now,
      },
    },
    { upsert: true, new: true },
  );
}

/**
 * Sends the queued confirmations whose deadline has passed.
 *
 * Claims each row BEFORE sending, with a conditional update out of 'pending'. Two server instances
 * racing the same row means the second one's update matches nothing and it moves on. Sending first
 * and recording after would double-send on a race and lose the record on a crash - the wrong way
 * round for something whose entire job is not to send twice. Same pattern as
 * notification-jobs.js's sendDueEmails, deliberately.
 *
 * `send` is injectable so tests are deterministic rather than dependent on the environment having
 * mail credentials. Nothing in production passes it.
 */
async function sendDueClientScheduleEmails({ now = new Date(), limit = 100, send = sendEmail } = {}) {
  const due = await ClientScheduleEmail.find({ status: 'pending', sendAfter: { $lte: now } })
    .sort({ sendAfter: 1 })
    .limit(limit);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of due) {
    const claimed = await ClientScheduleEmail.updateOne(
      { _id: row._id, status: 'pending' },
      { $set: { status: 'sent', sentAt: now } },
    );
    if (claimed.matchedCount === 0) {
      continue;
    }

    try {
      const { clientUser, artistUser, bookingRequest } = await gather(row);

      // EVERY sitting on the project, read HERE rather than carried on the row. This is the reason
      // the queue stores ids and not content: the row may have been created when only the first
      // sitting existed.
      const appointments = await Appointment.find({
        projectId: row.projectId,
        appointmentType: 'session',
      }).sort({ appointmentDate: 1 });

      if (!clientUser || !clientUser.email || appointments.length === 0) {
        await ClientScheduleEmail.updateOne(
          { _id: row._id },
          { $set: { status: 'failed', error: !clientUser?.email ? 'no email address' : 'no sessions' } },
        );
        skipped += 1;
        continue;
      }

      // The deposit lives on the appointment it was taken at - usually the consult, which is not in
      // the list above. Summed across the project so a deposit taken at a consult still appears on
      // the confirmation for the sittings it is being held against.
      const projectAppointments = await Appointment.find({ projectId: row.projectId }).select(
        'depositCents depositStatus',
      );
      const depositCents = projectAppointments.reduce(
        (total, appointment) =>
          total + (appointment.depositStatus === 'none' ? 0 : appointment.depositCents || 0),
        0,
      );

      const { timezone } = digestTimingFor(artistUser);
      const displayName = artistDisplayName(artistUser);
      // eslint-disable-next-line no-await-in-loop
      const shopId = await getActiveShopIdForArtist(row.artistUserId);
      // eslint-disable-next-line no-await-in-loop
      const { subjectOverride, extraNote } = await resolveBookingConfirmationExtras({
        artistUserId: row.artistUserId,
        shopId,
        clientFirstName: clientUser.firstName,
        artistName: displayName,
      });
      const email = buildClientBookingEmail({
        clientFirstName: clientUser.firstName,
        artistName: displayName,
        timezone,
        kind: 'session',
        appointments,
        depositCents,
        bookingRequest,
        guestLink: bookingRequest?.guestToken
          ? buildGuestConversationLink(bookingRequest.guestToken)
          : null,
        subjectOverride,
        extraNote,
      });

      const result = await send({ to: clientUser.email, ...email });
      if (!result) {
        await ClientScheduleEmail.updateOne(
          { _id: row._id },
          { $set: { status: 'failed', error: 'provider rejected' } },
        );
        failed += 1;
        continue;
      }
      sent += 1;
    } catch (err) {
      await ClientScheduleEmail.updateOne(
        { _id: row._id },
        { $set: { status: 'failed', error: err.message } },
      );
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}

module.exports = {
  buildClientBookingEmail,
  formatDuration,
  formatWhen,
  intakeLines,
  resolveBookingConfirmationExtras,
  queueProjectScheduleEmail,
  sendConsultBookedEmail,
  sendDueClientScheduleEmails,
};
