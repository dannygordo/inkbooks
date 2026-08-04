const { Resend } = require('resend');
const { Constants } = require('./constants');

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
    console.warn(
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
    console.warn(`[email] Skipped sending "${subject}" to ${to} - email is not configured.`);
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
      console.warn('[email] Failed to send email:', error.message || error);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[email] Failed to send email:', err.message);
    return null;
  }
}

// Constants.URLS.INKBOOKS_WEBAPP is already environment-aware (localhost:3000 in dev,
// inkbooks.net in production) from the Phase 2 CORS work - reused here rather than adding a
// second env-specific URL constant.
function buildGuestConversationLink(guestToken) {
  return `${Constants.URLS.INKBOOKS_WEBAPP}/booking/${guestToken}`;
}

async function sendBookingRequestReceivedEmail({ to, firstName, artistName, guestToken }) {
  const link = buildGuestConversationLink(guestToken);
  return sendEmail({
    to,
    subject: `Your request to ${artistName} has been sent`,
    htmlBody:
      `<p>Hi ${firstName},</p>` +
      `<p>Your booking request has been sent to ${artistName}. You can view your request and ` +
      `reply here at any time - no account needed:</p>` +
      `<p><a href="${link}">${link}</a></p>`,
    textBody:
      `Hi ${firstName},\n\nYour booking request has been sent to ${artistName}. View your ` +
      `request and reply here at any time - no account needed:\n${link}`,
  });
}

async function sendNewMessageNotificationToGuest({ to, firstName, artistName, guestToken }) {
  const link = buildGuestConversationLink(guestToken);
  return sendEmail({
    to,
    subject: `${artistName} replied to your request`,
    htmlBody:
      `<p>Hi ${firstName},</p><p>${artistName} sent you a new message. View it and reply here:</p>` +
      `<p><a href="${link}">${link}</a></p>`,
    textBody: `Hi ${firstName},\n\n${artistName} sent you a new message. View it and reply here:\n${link}`,
  });
}

async function sendNewBookingRequestNotificationToArtist({ to, artistFirstName, clientName }) {
  return sendEmail({
    to,
    subject: `New booking request from ${clientName}`,
    htmlBody:
      `<p>Hi ${artistFirstName},</p><p>You have a new booking request from ${clientName}. ` +
      `Log in to InkBooks to view it and respond.</p>`,
    textBody:
      `Hi ${artistFirstName},\n\nYou have a new booking request from ${clientName}. Log in to ` +
      `InkBooks to view it and respond.`,
  });
}

async function sendNewMessageNotificationToArtist({ to, artistFirstName, clientName }) {
  return sendEmail({
    to,
    subject: `New message from ${clientName}`,
    htmlBody:
      `<p>Hi ${artistFirstName},</p><p>${clientName} replied to your conversation. Log in to ` +
      `InkBooks to view it.</p>`,
    textBody: `Hi ${artistFirstName},\n\n${clientName} replied to your conversation. Log in to InkBooks to view it.`,
  });
}

// Sent to the shop's own contact email (Shop.email) - not a specific Staff/SHOP_ADMIN user's
// inbox, since Shop has no owning-User field yet (see resolvers/artistShopConnections.js's
// comment on the same gap). This is the notification half of the manual mark-paid/confirm
// dual-control flow (see mutations/shopCutPayments.js) - the shop still has to log in and call
// confirmShopCutPaid themselves; this email is just the ping that something needs their action.
async function sendShopCutMarkedPaidNotificationToShop({ to, shopName, artistName, amountCents }) {
  // Takes cents now, not dollars - every stored money value in this codebase is integer cents
  // (see utils/money.js). The old signature took `amount` in dollars and .toFixed(2)'d it, which
  // would have formatted a cents value as e.g. "$8950.00".
  const formattedAmount =
    typeof amountCents === 'number' ? `$${(amountCents / 100).toFixed(2)}` : 'their shop cut';
  return sendEmail({
    to,
    subject: `${artistName} marked a shop cut as paid`,
    htmlBody:
      `<p>Hi ${shopName},</p>` +
      `<p>${artistName} marked ${formattedAmount} as paid outside the app (e.g. cash). Log in to ` +
      `InkBooks to review and confirm you received it before it's marked complete.</p>`,
    textBody:
      `Hi ${shopName},\n\n${artistName} marked ${formattedAmount} as paid outside the app (e.g. ` +
      `cash). Log in to InkBooks to review and confirm you received it before it's marked complete.`,
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

async function sendShopCutConfirmedNotificationToArtist({ to, artistFirstName, shopName }) {
  return sendEmail({
    to,
    subject: `${shopName} confirmed your payment`,
    htmlBody: `<p>Hi ${artistFirstName},</p><p>${shopName} confirmed they received your shop-cut payment. This is now marked paid.</p>`,
    textBody: `Hi ${artistFirstName},\n\n${shopName} confirmed they received your shop-cut payment. This is now marked paid.`,
  });
}

module.exports = {
  sendAccountInviteEmail,
  sendPasswordResetEmail,
  buildSetPasswordLink,
  sendBookingRequestReceivedEmail,
  sendNewMessageNotificationToGuest,
  sendNewBookingRequestNotificationToArtist,
  sendNewMessageNotificationToArtist,
  sendShopCutMarkedPaidNotificationToShop,
  sendShopCutConfirmedNotificationToArtist,
};
