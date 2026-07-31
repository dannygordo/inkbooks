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
// www.inkbooks.net in production) from the Phase 2 CORS work - reused here rather than adding a
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

module.exports = {
  sendBookingRequestReceivedEmail,
  sendNewMessageNotificationToGuest,
  sendNewBookingRequestNotificationToArtist,
  sendNewMessageNotificationToArtist,
};
