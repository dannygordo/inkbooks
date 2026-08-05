const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Client = require('../models/Client');
const BookingRequest = require('../models/BookingRequest');
const {
  sendNewMessageNotificationToGuest,
  sendNewMessageNotificationToArtist,
} = require('./email');
const { readRowFor, markConversationNotified } = require('./conversation-reads');

/**
 * Tells the other side of a conversation that a message arrived.
 *
 * ONE function for both directions. The previous arrangement had the artist-notifies-guest case
 * inlined in createMessage and the guest-notifies-artist case inlined in sendGuestMessage, which
 * meant two half-implementations of the same idea: only the booking-request flow was covered, a
 * client with a real account messaging about a project was notified by nothing at all, and
 * neither path had any concept of not emailing four times for four messages.
 *
 * Reachability, not role, decides which email goes out. Someone who has never set a password can
 * only get back in through their booking request's magic link; someone with an account gets a link
 * to the conversation in the app. That's a property of the person, looked up here, rather than
 * something the caller has to know.
 */

// An artist replying four times in a row is one notification, not four. Slack, Intercom and every
// other tool that got this wrong once converge on the same idea: past the first message, the
// recipient already knows there's a conversation waiting.
//
// Fifteen minutes is a guess, and deliberately a single named constant rather than a number buried
// in a condition, so it's one edit if it turns out to be wrong.
const NOTIFY_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Has this recipient already been told about this conversation recently?
 *
 * The throttle resets when they read the thread: someone who has caught up and then receives a new
 * message is in exactly the same position as someone being told for the first time, and staying
 * quiet because we happened to email them ten minutes ago would drop a genuinely new notification.
 */
function shouldNotify(conversation, recipientId, now = new Date()) {
  const row = readRowFor(conversation, recipientId);
  if (!row || !row.lastNotifiedAt) {
    return true;
  }
  if (row.lastReadAt && row.lastReadAt > row.lastNotifiedAt) {
    return true;
  }
  return now - row.lastNotifiedAt >= NOTIFY_THROTTLE_MS;
}

/**
 * Notifies every member of a conversation except the sender.
 *
 * Returns a summary of what happened per recipient - { userId, outcome } where outcome is one of
 * 'sent' | 'throttled' | 'no-email' | 'failed'. Returned rather than logged because "we didn't
 * notify anyone" and "we tried and it failed" are different facts, and the previous code made them
 * identical: every failure was a console.warn inside a catch, so a broken notification path looked
 * exactly like a working one from anywhere except the server's stdout.
 *
 * Never throws. A notification failure must not fail the message send - the message is the thing
 * the person actually asked for, and losing it because an email bounced would be a much worse
 * trade. The difference from before is that the caller now gets told.
 */
async function notifyNewMessage({ conversationId, senderId }) {
  const results = [];
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return results;
  }

  const sender = await User.findById(senderId);
  const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'Someone';
  const now = new Date();

  const recipientIds = (conversation.members || []).filter(
    (memberId) => String(memberId) !== String(senderId),
  );

  for (const recipientId of recipientIds) {
    try {
      if (!shouldNotify(conversation, recipientId, now)) {
        results.push({ userId: String(recipientId), outcome: 'throttled' });
        continue;
      }

      const recipient = await User.findById(recipientId);
      if (!recipient || !recipient.email) {
        results.push({ userId: String(recipientId), outcome: 'no-email' });
        continue;
      }

      // Can this person actually log in? If they've never set a password, the app has no way in
      // for them and a "log in to view it" email is a dead end - their booking request's magic
      // link is the only door. Keyed off hasSetPassword rather than off role or userType, because
      // the question is literally "can they get in", and utils/guest-auth.js revokes the magic
      // link on exactly that field.
      let guestToken = null;
      if (!recipient.hasSetPassword) {
        const client = await Client.findOne({ userId: recipient._id }).select('_id');
        const bookingRequest = client
          ? await BookingRequest.findOne({ conversationId, clientId: client._id }).select(
              'guestToken',
            )
          : null;
        guestToken = bookingRequest ? bookingRequest.guestToken : null;
      }

      if (guestToken) {
        await sendNewMessageNotificationToGuest({
          to: recipient.email,
          firstName: recipient.firstName,
          artistName: senderName,
          guestToken,
        });
      } else {
        await sendNewMessageNotificationToArtist({
          to: recipient.email,
          artistFirstName: recipient.firstName,
          clientName: senderName,
          conversationId: String(conversationId),
        });
      }

      await markConversationNotified(conversationId, recipientId, now);
      results.push({ userId: String(recipientId), outcome: 'sent' });
    } catch (err) {
      // Recorded per recipient rather than aborting the loop: in a two-person conversation this
      // is academic, but a failure to reach one member is not a reason to skip the others.
      results.push({
        userId: String(recipientId),
        outcome: 'failed',
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = { notifyNewMessage, shouldNotify, NOTIFY_THROTTLE_MS };
