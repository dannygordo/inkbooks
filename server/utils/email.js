const { Resend } = require('resend');
const logger = require('./logger');
const { Constants } = require('./constants');
const { resolveSystemMessageTemplate, renderSystemMessage } = require('./system-message-templates');

// Resend's free tier (3,000 emails/month) chosen to start at $0 while volume is low - swap
// providers later just by rewriting this file, the higher-level send*() functions below don't
// know or care which provider is behind sendEmail(). Degrades gracefully if not configured, same
// pattern as utils/firebase-admin.js: everything else keeps working, this just warns and no-ops
// instead of crashing the server.

let client = null;
let checkedConfig = false;

function ensureInitialized() {
  if (checkedConfig) {
    return client !== null;
  }
  checkedConfig = true;
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !fromAddress) {
    logger.warn(
      '[email] RESEND_API_KEY / EMAIL_FROM_ADDRESS not set - transactional emails (booking ' +
        'request confirmations, new-message notifications) are disabled until this is configured.'
    );
    return false;
  }
  client = new Resend(apiKey);
  return true;
}

async function sendEmail({ to, subject, htmlBody, textBody }) {
  if (!ensureInitialized()) {
    logger.warn(`[email] Skipped sending "${subject}" to ${to} - email is not configured.`);
    return null;
  }
  try {
    // Resend's SDK returns { data, error } rather than throwing on API-level failures (e.g. an
    // unverified sending domain) - the try/catch here is only for network-level failures, per
    // Resend's own guidance.
    const { data, error } = await client.emails.send({
      from: process.env.EMAIL_FROM_ADDRESS,
      to,
      subject,
      html: htmlBody,
      text: textBody,
    });
    if (error) {
      // Recipient and subject included deliberately. "Failed to send email: <reason>" on its own
      // is nearly useless in a log next to a line claiming a notification was sent - you cannot
      // tell whether the two are about the same message. Resend also puts the useful part in
      // `name`/`statusCode` rather than always in `message` (an unverified sending domain reports
      // as `validation_error`), so all three are printed.
      logger.warn(
        { to, subject, errorName: error.name, statusCode: error.statusCode, error: error.message || error },
        '[email] REJECTED by provider',
      );
      return null;
    }
    // Logged on SUCCESS as well, which is not noise here - it is the only handoff point between
    // code we can read and a system we cannot.
    //
    // Once Resend has accepted a message, nothing on this side knows whether it was delivered,
    // bounced, or filtered. The id is the join key: it is what the Resend dashboard indexes by, so
    // printing it turns "no email arrived" from an argument into a lookup. The recipient is printed
    // beside it because "sent to the wrong address" and "sent and not delivered" look identical
    // from in here, and they have completely different fixes.
    logger.info(
      `[email] accepted "${subject}" to ${to} id=${data && data.id ? data.id : '(none returned)'}`,
    );
    return data;
  } catch (err) {
    logger.warn({ err, to, subject }, '[email] FAILED to send');
    return null;
  }
}

// Constants.URLS.INKBOOKS_WEBAPP is already environment-aware (localhost:3000 in dev,
// inkbooks.net in production) from the Phase 2 CORS work - reused here rather than adding a
// second env-specific URL constant.
function buildGuestConversationLink(guestToken) {
  return `${Constants.URLS.INKBOOKS_WEBAPP}/booking/${guestToken}`;
}

// Subject lines get cut off around here in most mail clients. Past this the snippet is costing
// space and showing nobody anything.
const SUBJECT_SNIPPET_MAX = 60;

/**
 * Turns a message body into something safe and readable to put in a Subject header.
 *
 * TWO JOBS, AND THE SECOND ONE IS A SECURITY BOUNDARY.
 *
 * Readability: every message notification used the same fixed subject, so mail clients that thread
 * by subject - Gmail among them - collapsed a whole back-and-forth into one conversation. The
 * second and third emails looked to the recipient exactly like no email had arrived, which is
 * precisely how this was reported.
 *
 * Safety: this text comes from whoever typed the message, and it is going into a MAIL HEADER. A
 * newline in a header value ends that header and begins another, which is how a stranger writing
 * "hi\nBcc: someone@else" gets to add recipients to your mail. Collapsing all whitespace kills
 * that outright rather than relying on the provider to catch it - and it has to happen here, in
 * the one function every subject goes through, not at each call site.
 */
/**
 * The subject for a new-message notification: "Cass Brown: Tuesday at 2 works".
 *
 * Extracted so the composition is testable on its own. It was briefly inline in both send
 * functions, which meant the only way to check it was to assert on a live send - and sendEmail()
 * no-ops without mail credentials, so that test would have passed or failed based on the machine
 * rather than the code.
 */
function subjectForNewMessage(senderName, messagePreview, fallback) {
  const snippet = snippetForSubject(messagePreview);
  return snippet ? `${senderName}: ${snippet}` : fallback;
}

function snippetForSubject(text, max = SUBJECT_SNIPPET_MAX) {
  // \s covers \r, \n, tabs and unicode separators in one pass. Nothing user-supplied reaches a
  // header with a line break in it.
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) {
    return '';
  }
  if (flat.length <= max) {
    return flat;
  }
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Break on a word if one is reasonably near the end; otherwise a single long token would get
  // chopped back to almost nothing.
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

// artistUserId/shopId are optional (a caller with neither still sends - the built-in default is
// always a valid answer, same as an AutoResponse owner with no enabled row for a trigger). Pass
// whichever ownership context is actually available at the call site - see
// utils/system-message-templates.js's resolveSystemMessageTemplate for the precedence between the
// two when both are given.
async function sendBookingRequestReceivedEmail({
  to,
  firstName,
  artistName,
  guestToken,
  artistUserId,
  shopId,
}) {
  const link = buildGuestConversationLink(guestToken);
  const custom = await resolveSystemMessageTemplate({
    artistUserId,
    shopId,
    key: 'BOOKING_REQUEST_RECEIVED',
  });
  const { subject, body } = renderSystemMessage('BOOKING_REQUEST_RECEIVED', custom, {
    firstName,
    artistName,
    link,
  });
  return sendEmail({
    to,
    subject,
    htmlBody: body.replace(/\n/g, '<br/>'),
    textBody: body,
  });
}

async function sendNewMessageNotificationToGuest({
  to,
  firstName,
  artistName,
  guestToken,
  messagePreview,
  artistUserId,
  shopId,
}) {
  const link = buildGuestConversationLink(guestToken);
  const custom = await resolveSystemMessageTemplate({
    artistUserId,
    shopId,
    key: 'NEW_MESSAGE_TO_GUEST',
  });
  const { subject: subjectFallback, body } = renderSystemMessage('NEW_MESSAGE_TO_GUEST', custom, {
    firstName,
    artistName,
    link,
  });
  return sendEmail({
    to,
    // Falls back to the (possibly customized) fixed wording when there's no usable text - an
    // image-only or whitespace message shouldn't produce a subject ending in a bare colon.
    subject: subjectForNewMessage(artistName, messagePreview, subjectFallback),
    htmlBody: body.replace(/\n/g, '<br/>'),
    textBody: body,
  });
}

async function sendNewBookingRequestNotificationToArtist({
  to,
  artistFirstName,
  clientName,
  artistUserId,
  shopId,
}) {
  const custom = await resolveSystemMessageTemplate({
    artistUserId,
    shopId,
    key: 'NEW_BOOKING_REQUEST_TO_ARTIST',
  });
  const { subject, body } = renderSystemMessage('NEW_BOOKING_REQUEST_TO_ARTIST', custom, {
    artistFirstName,
    clientName,
  });
  return sendEmail({
    to,
    subject,
    htmlBody: body.replace(/\n/g, '<br/>'),
    textBody: body,
  });
}

// conversationId is optional but should always be passed - it turns "log in to InkBooks and find
// it" into a link that opens the actual thread. The Messenger reads ?conversation= (see
// pages/messenger/Messenger.jsx); without one this still sends, it just lands on the message list.
async function sendNewMessageNotificationToArtist({
  to,
  artistFirstName,
  clientName,
  conversationId,
  messagePreview,
  artistUserId,
  shopId,
}) {
  const link = conversationId
    ? `${Constants.URLS.INKBOOKS_WEBAPP}/messenger?conversation=${conversationId}`
    : `${Constants.URLS.INKBOOKS_WEBAPP}/messenger`;
  const custom = await resolveSystemMessageTemplate({
    artistUserId,
    shopId,
    key: 'NEW_MESSAGE_TO_ARTIST',
  });
  const { subject: subjectFallback, body } = renderSystemMessage('NEW_MESSAGE_TO_ARTIST', custom, {
    artistFirstName,
    clientName,
    link,
  });
  return sendEmail({
    to,
    subject: subjectForNewMessage(clientName, messagePreview, subjectFallback),
    htmlBody: body.replace(/\n/g, '<br/>'),
    textBody: body,
  });
}

// Sent to the shop's own contact email (Shop.email) - not a specific Staff/SHOP_ADMIN user's
// inbox, since Shop has no owning-User field yet (see resolvers/artistShopConnections.js's
// comment on the same gap). This is the notification half of the manual mark-paid/confirm
// dual-control flow (see mutations/shopCutPayments.js) - the shop still has to log in and call
// confirmShopCutPaid themselves; this email is just the ping that something needs their action.
//
// SHOP-OWNED ONLY - no artistUserId here, unlike the four functions above. This lands in the
// shop's own inbox about an artist's action; there's no artist "voice" to speak this notification
// in, only the shop's own preference for how it reads.
async function sendShopCutMarkedPaidNotificationToShop({ to, shopName, artistName, amountCents, shopId }) {
  // Takes cents now, not dollars - every stored money value in this codebase is integer cents
  // (see utils/money.js). The old signature took `amount` in dollars and .toFixed(2)'d it, which
  // would have formatted a cents value as e.g. "$8950.00".
  const formattedAmount =
    typeof amountCents === 'number' ? `$${(amountCents / 100).toFixed(2)}` : 'their shop cut';
  const custom = await resolveSystemMessageTemplate({
    shopId,
    key: 'SHOP_CUT_MARKED_PAID',
  });
  const { subject, body } = renderSystemMessage('SHOP_CUT_MARKED_PAID', custom, {
    shopName,
    artistName,
    formattedAmount,
  });
  return sendEmail({
    to,
    subject,
    htmlBody: body.replace(/\n/g, '<br/>'),
    textBody: body,
  });
}

// Courtesy confirmation back to the artist once the shop has independently confirmed - not part
// of the security-relevant half of the flow (that's confirmShopCutPaid's own role check), just
// closes the loop for the artist.
// Same environment-aware base URL the guest links use - see buildGuestConversationLink above.
function buildSetPasswordLink(rawToken) {
  return `${Constants.URLS.INKBOOKS_WEBAPP}/set-password/${rawToken}`;
}

// Sent when a shop admin creates an artist or staff account. The account exists with an unusable
// random password until this link is used (see utils/password-tokens.js), so this email is the
// ONLY way in - which is why the wizard also shows the link on screen for the admin to hand over
// directly. sendEmail() no-ops when the provider isn't configured, and an invite that silently
// went nowhere would leave a new hire with an account they can't reach and no way to find out.
async function sendAccountInviteEmail({ to, firstName, shopName, rawToken, expiresAt }) {
  const link = buildSetPasswordLink(rawToken);
  const expiry = expiresAt ? new Date(expiresAt).toDateString() : 'in one week';
  return sendEmail({
    to,
    subject: `Set up your InkBooks account`,
    htmlBody:
      `<p>Hi ${firstName || 'there'},</p>` +
      `<p>${shopName || 'Your shop'} has created an InkBooks account for you. ` +
      `Choose a password to get started:</p>` +
      `<p><a href="${link}">Set your password</a></p>` +
      `<p>This link works until ${expiry}, and can only be used once. ` +
      `If it expires, ask your shop admin to send a new one.</p>`,
    textBody:
      `Hi ${firstName || 'there'},\n\n` +
      `${shopName || 'Your shop'} has created an InkBooks account for you. ` +
      `Choose a password to get started:\n\n${link}\n\n` +
      `This link works until ${expiry}, and can only be used once.`,
  });
}

// Self-service reset. Deliberately says nothing about whether the address is registered - the
// mutation behind it returns the same response either way (see mutations/passwords.js), and an
// email that says "no account here" would undo that by telling anyone who asks.
async function sendPasswordResetEmail({ to, firstName, rawToken }) {
  const link = buildSetPasswordLink(rawToken);
  return sendEmail({
    to,
    subject: 'Reset your InkBooks password',
    htmlBody:
      `<p>Hi ${firstName || 'there'},</p>` +
      `<p>Someone asked to reset the password for this account. ` +
      `If that was you, choose a new one here:</p>` +
      `<p><a href="${link}">Reset your password</a></p>` +
      `<p>This link expires in one hour and can only be used once. ` +
      `If you didn't ask for it, you can ignore this email - nothing has changed.</p>`,
    textBody:
      `Hi ${firstName || 'there'},\n\n` +
      `Someone asked to reset the password for this account. If that was you, ` +
      `choose a new one here:\n\n${link}\n\n` +
      `This link expires in one hour and can only be used once. If you didn't ask for it, ` +
      `you can ignore this email - nothing has changed.`,
  });
}

// ARTIST-OWNED ONLY, mirroring sendShopCutMarkedPaidNotificationToShop's shop-owned-only shape in
// the other direction - this lands in the artist's own inbox about their own payment, so their
// own preference (not the shop's) is what applies.
async function sendShopCutConfirmedNotificationToArtist({ to, artistFirstName, shopName, artistUserId }) {
  const custom = await resolveSystemMessageTemplate({
    artistUserId,
    key: 'SHOP_CUT_CONFIRMED',
  });
  const { subject, body } = renderSystemMessage('SHOP_CUT_CONFIRMED', custom, {
    artistFirstName,
    shopName,
  });
  return sendEmail({
    to,
    subject,
    htmlBody: body.replace(/\n/g, '<br/>'),
    textBody: body,
  });
}

module.exports = {
  // Exported for its own tests. It is a header-safety boundary as much as a formatting helper,
  // and that is not something to verify only indirectly through whatever a send happens to produce.
  snippetForSubject,
  subjectForNewMessage,
  SUBJECT_SNIPPET_MAX,
  sendAccountInviteEmail,
  sendPasswordResetEmail,
  buildSetPasswordLink,
  // Exported for utils/client-booking-emails.js, which puts the same guest link on a booking
  // confirmation. Building a second copy of that URL is how two links to the same thing end up
  // disagreeing after an environment change.
  buildGuestConversationLink,
  sendBookingRequestReceivedEmail,
  sendNewMessageNotificationToGuest,
  sendNewBookingRequestNotificationToArtist,
  sendNewMessageNotificationToArtist,
  sendShopCutMarkedPaidNotificationToShop,
  sendShopCutConfirmedNotificationToArtist,
};
