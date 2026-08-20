const SystemMessageTemplate = require('../models/SystemMessageTemplate');
const { renderTemplate } = require('./message-templates');

/**
 * Feature 2 - the built-in wording every hardcoded outbound email now falls back to, and the
 * lookup that decides whether an owner has replaced it. See models/SystemMessageTemplate.js for
 * the data shape and DECISIONS.md for the two identity/security emails (account invite, password
 * reset) that were deliberately left out of this system - those two stay hardcoded in
 * utils/email.js, unreachable from here.
 *
 * WORDING MOVED HERE VERBATIM from utils/email.js and utils/client-booking-emails.js, and
 * rewritten from string concatenation into {{mergeField}} templates - the same substitution
 * AutoResponse and ReminderSettings already use (utils/message-templates.js's renderTemplate).
 * The visual result is slightly different (renderTemplate's \n -> <br/> convention rather than
 * hand-written <p> tags) - the same trade-off Auto-Responses and Reminders already made, for the
 * same reason: once a body is an editable textarea rather than code, it has to render the way
 * every other editable body in this app renders.
 */
const DEFAULT_TEMPLATES = {
  BOOKING_REQUEST_RECEIVED: {
    emailSubject: 'Your request to {{artistName}} has been sent',
    emailBody:
      'Hi {{firstName}},\n\n' +
      'Your booking request has been sent to {{artistName}}. You can view your request and ' +
      'reply here at any time - no account needed:\n\n{{link}}',
  },
  // Subject here is the FALLBACK subjectForNewMessage falls back to when there's no usable
  // message preview to build a real subject from - see utils/email.js's own comment on
  // subjectForNewMessage. It is not the subject that's actually used most of the time.
  NEW_MESSAGE_TO_GUEST: {
    emailSubject: '{{artistName}} replied to your request',
    emailBody:
      'Hi {{firstName}},\n\n' +
      '{{artistName}} sent you a new message. View it and reply here:\n\n{{link}}',
  },
  NEW_MESSAGE_TO_ARTIST: {
    emailSubject: 'New message from {{clientName}}',
    emailBody:
      'Hi {{artistFirstName}},\n\n' +
      '{{clientName}} sent you a new message. Read it and reply here:\n\n{{link}}',
  },
  NEW_BOOKING_REQUEST_TO_ARTIST: {
    emailSubject: 'New booking request from {{clientName}}',
    emailBody:
      'Hi {{artistFirstName}},\n\n' +
      'You have a new booking request from {{clientName}}. Log in to InkBooks to view it and ' +
      'respond.',
  },
  SHOP_CUT_MARKED_PAID: {
    emailSubject: '{{artistName}} marked a shop cut as paid',
    emailBody:
      'Hi {{shopName}},\n\n' +
      '{{artistName}} marked {{formattedAmount}} as paid outside the app (e.g. cash). Log in ' +
      "to InkBooks to review and confirm you received it before it's marked complete.",
  },
  SHOP_CUT_CONFIRMED: {
    emailSubject: '{{shopName}} confirmed your payment',
    emailBody:
      'Hi {{artistFirstName}},\n\n' +
      '{{shopName}} confirmed they received your shop-cut payment. This is now marked paid.',
  },
  // NARROWER THAN THE OTHER SIX - see utils/client-booking-emails.js's own comment on why. Only
  // emailSubject and extraNote are ever read for this key; the structural schedule/deposit/intake
  // body stays code-generated so an owner can't accidentally delete the information the email
  // exists to convey. extraNote defaults to empty - most confirmations have nothing extra to say.
  BOOKING_CONFIRMATION: {
    emailSubject: null,
    extraNote: '',
  },
};

/**
 * The precedence rule: the artist's own override for this key wins outright; the shop's applies
 * only when the artist has none; no row at all means "use DEFAULT_TEMPLATES[key]" (returned as
 * null - the caller already has the defaults and doesn't need them handed back).
 *
 * ONE OWNER WINS OUTRIGHT, not a per-field merge - same shape as resolveAutoResponseForTrigger,
 * unlike utils/response-time.js's resolveResponseTimeThresholds (a genuinely different clamp
 * shape for a genuinely different feature). An artist who has overridden only the subject of a
 * key still gets their own row's (null) body back rather than the shop's body - see this
 * function's own callers for how a null field falls through to DEFAULT_TEMPLATES from there.
 */
async function resolveSystemMessageTemplate({ artistUserId, shopId, key }) {
  if (artistUserId) {
    const artistRow = await SystemMessageTemplate.findOne({ artistUserId, key });
    if (artistRow) {
      return artistRow;
    }
  }
  if (shopId) {
    const shopRow = await SystemMessageTemplate.findOne({ shopId, key });
    if (shopRow) {
      return shopRow;
    }
  }
  return null;
}

/**
 * The rendered {subject, body} for a key, given an already-resolved override (or null) and the
 * merge-field values for this particular send. Centralizes the "custom field, or the built-in
 * default" fallback so every one of utils/email.js's send functions does it the same way.
 */
function renderSystemMessage(key, custom, vars) {
  const defaults = DEFAULT_TEMPLATES[key];
  return {
    subject: renderTemplate((custom && custom.emailSubjectTemplate) || defaults.emailSubject, vars),
    body: renderTemplate((custom && custom.emailBodyTemplate) || defaults.emailBody, vars),
  };
}

module.exports = {
  DEFAULT_TEMPLATES,
  resolveSystemMessageTemplate,
  renderSystemMessage,
};
