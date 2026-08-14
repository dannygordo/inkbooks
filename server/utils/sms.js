// Twilio, sent from ONE shared InkBooks number/Messaging Service rather than a number registered
// per artist - see the chat thread this shipped from for the full reasoning. Short version: an
// A2P 10DLC Brand+Campaign registered per artist (the "ISV" path) would multiply a real per-artist
// cost and a week-long vetting lead time by every artist on the platform, for a product at a stage
// where that isn't justified yet. One InkBooks Brand/Campaign/number, with the artist's name
// rendered INTO the message body (see utils/reminders.js's DEFAULT_SMS_TEMPLATE), gets the same
// "reminder from your artist" experience without that multiplication - the real trade-off being
// that all artists' SMS traffic shares one trust score, so a spam-flagged run of messages from one
// artist can degrade deliverability for the rest. Revisit if that ever actually happens.
//
// Degrades gracefully exactly like utils/email.js's Resend client: everything else keeps working,
// this just warns and no-ops until the three env vars below are set.

let client = null;
let checkedConfig = false;
let fromAddress = null;

function ensureInitialized() {
  if (checkedConfig) {
    return client !== null;
  }
  checkedConfig = true;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Either a Messaging Service SID (preferred - lets the number pool/sender selection live in
  // Twilio's console without a redeploy) or a single From number. Messaging Service wins if both
  // are set.
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  fromAddress = messagingServiceSid || fromNumber;

  if (!accountSid || !authToken || !fromAddress) {
    console.warn(
      '[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / (TWILIO_MESSAGING_SERVICE_SID or ' +
        'TWILIO_FROM_NUMBER) not set - appointment reminder texts are disabled until this is ' +
        'configured.',
    );
    return false;
  }

  // Required lazily, not at module load - so a server with no Twilio credentials at all (every
  // environment until this is actually registered) never needs the package installed to boot.
  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  client = twilio(accountSid, authToken);
  return true;
}

/**
 * Sends one SMS. Returns the Twilio message resource on success, or null if SMS isn't configured
 * or the provider rejected it - same "null means didn't go out, check the log for why" contract
 * as utils/email.js's sendEmail(), so callers that already know that pattern don't need a new one.
 */
async function sendSms({ to, body }) {
  if (!ensureInitialized()) {
    console.warn(`[sms] Skipped sending to ${to} - SMS is not configured.`);
    return null;
  }
  if (!to) {
    console.warn('[sms] Skipped sending - no destination number.');
    return null;
  }
  try {
    const params = { to, body };
    if (fromAddress.startsWith('MG')) {
      params.messagingServiceSid = fromAddress;
    } else {
      params.from = fromAddress;
    }
    const message = await client.messages.create(params);
    // Logged on success too, same reasoning as email.js's own accepted-send log: once Twilio has
    // accepted a message this side of the line knows nothing further, and the sid is the join key
    // into Twilio's own console/logs for "did this actually land."
    console.log(`[sms] accepted to ${to} sid=${message.sid} status=${message.status}`);
    return message;
  } catch (err) {
    console.warn(`[sms] FAILED to send to ${to}:`, err.message);
    return null;
  }
}

module.exports = { sendSms };
