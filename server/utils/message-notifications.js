const Conversation = require('../models/Conversation');
const logger = require('./logger');
const User = require('../models/User');
const Client = require('../models/Client');
const BookingRequest = require('../models/BookingRequest');
const {
  sendNewMessageNotificationToGuest,
  sendNewMessageNotificationToArtist,
} = require('./email');
const { readRowFor, markConversationNotified } = require('./conversation-reads');
const { getActiveShopIdForArtist } = require('./artist-shop');

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

// Someone replying four times in a row is one notification, not four. Slack, Intercom and every
// other tool that got this wrong once converge on the same idea: past the first message, the
// recipient already knows there's a conversation waiting.
//
// APPLIES TO PEOPLE WITH ACCOUNTS ONLY. See the comment at the point of use - a guest whose only
// route back is the emailed magic link is emailed every single time, because for them a
// suppressed email is a suppressed message.
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
 * 'sent' | 'throttled' | 'no-email' | 'provider-rejected' | 'failed' | 'no-conversation'.
 *
 * 'sent' and 'provider-rejected' are the pair worth being careful about: the mail layer signals a
 * rejection by RETURNING NULL rather than throwing, so a version of this that only caught
 * exceptions reported a rejected message as sent. That is not a small inaccuracy - it is a log
 * line that actively argues against the thing the person in front of the app is telling you.
 *
 * Returned rather than logged because "we didn't
 * notify anyone" and "we tried and it failed" are different facts, and the previous code made them
 * identical: every failure was a console.warn inside a catch, so a broken notification path looked
 * exactly like a working one from anywhere except the server's stdout.
 *
 * Never throws. A notification failure must not fail the message send - the message is the thing
 * the person actually asked for, and losing it because an email bounced would be a much worse
 * trade. The difference from before is that the caller now gets told.
 */
async function notifyNewMessage({
  conversationId,
  senderId,
  // The message text, used only for the subject line. Optional - a caller that doesn't pass it
  // gets the old fixed wording rather than an error, since a missing preview should degrade the
  // email, not lose it.
  messageText,
  // Injected so this can be tested at all.
  //
  // sendEmail() no-ops and returns null when RESEND_API_KEY isn't set, so a test asserting "the
  // client was emailed" would pass or fail depending on whether the machine running it happened to
  // have mail credentials - which means in practice it would just be omitted, which is exactly what
  // happened: before this parameter existed, no test in the suite named this function. The email
  // half of messaging shipped untested, and the first report of it not working came from a person
  // rather than from the runner.
  //
  // Same seam, and the same reasoning, as sendDueEmails({ send }) in utils/notification-jobs.js.
  sendToGuest = sendNewMessageNotificationToGuest,
  sendToArtist = sendNewMessageNotificationToArtist,
} = {}) {
  const results = [];
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    // Distinguished from "nobody to notify" - an unreachable conversation is a bug somewhere
    // upstream, and returning a bare [] made it indistinguishable from a message to a thread with
    // no other members.
    return [{ userId: null, outcome: 'no-conversation' }];
  }

  const sender = await User.findById(senderId);
  const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'Someone';
  const now = new Date();

  const recipientIds = (conversation.members || []).filter(
    (memberId) => String(memberId) !== String(senderId),
  );

  for (const recipientId of recipientIds) {
    try {
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
      // Looked up UNCONDITIONALLY now, not just for people without a password.
      //
      // It used to be inside `if (!recipient.hasSetPassword)`, which quietly made the whole
      // behaviour depend on a field that is true more often than it looks. findOrCreateGuestClient
      // REUSES an existing User when the intake email matches one - so a client whose address
      // already has an account (the overwhelmingly likely case when testing with your own inbox)
      // arrives here with hasSetPassword: true, gets the "log in to InkBooks" email instead of
      // their magic link, and gets throttled after the first one.
      const clientRecord = await Client.findOne({ userId: recipient._id }).select('_id');

      let guestToken = null;
      if (!recipient.hasSetPassword && clientRecord) {
        const bookingRequest = await BookingRequest.findOne({
          conversationId,
          clientId: clientRecord._id,
        }).select('guestToken');
        guestToken = bookingRequest ? bookingRequest.guestToken : null;
      }

      // NEVER THROTTLE A CLIENT.
      //
      // Keyed off being a client rather than off having a magic link, because those came apart in
      // exactly the case above. The principle is the same one that picks which email to send - what
      // does this person actually have besides the email - but stated in terms that survive a
      // client who happens to also hold an account.
      //
      // An artist or staff member who misses one email still has a bell, a nav badge, a per-thread
      // count and an inbox; suppressing their fourth email in ten minutes costs them nothing. A
      // client is not living in this app. For them a suppressed email is not a suppressed
      // notification about a message, it is a suppressed message.
      const isClient = !!clientRecord;
      if (!isClient && !shouldNotify(conversation, recipientId, now)) {
        results.push({ userId: String(recipientId), outcome: 'throttled' });
        continue;
      }

      // Feature 2 (manageable system-generated text) - whose template wording applies. Guest
      // direction: the SENDER is the artist speaking to their client, so their (or their shop's)
      // override applies. Artist direction: the RECIPIENT is the artist being notified, so
      // theirs applies instead - same "whoever is the artist in this exchange" resolution
      // sendAutoResponseForIncomingMessage already uses for MESSAGE_RECEIVED. Best-effort and
      // harmless either way: an id that isn't actually a connected artist just resolves to no
      // shop and no override, falling through to the built-in default.
      const templateArtistUserId = guestToken ? senderId : recipientId;
      // eslint-disable-next-line no-await-in-loop
      const templateShopId = await getActiveShopIdForArtist(templateArtistUserId);

      const via = guestToken ? 'guest-link' : 'app-link';
      const delivery = guestToken
        ? await sendToGuest({
            to: recipient.email,
            firstName: recipient.firstName,
            artistName: senderName,
            guestToken,
            messagePreview: messageText,
            artistUserId: templateArtistUserId,
            shopId: templateShopId,
          })
        : await sendToArtist({
            to: recipient.email,
            artistFirstName: recipient.firstName,
            clientName: senderName,
            conversationId: String(conversationId),
            messagePreview: messageText,
            artistUserId: templateArtistUserId,
            shopId: templateShopId,
          });

      // sendEmail() returns null rather than throwing when the provider rejects the message or
      // isn't configured (see utils/email.js) - the same convention notification-jobs.js and
      // digest.js already check for. Not checking it here is why 'sent' could appear in the log
      // for a message that never left the building: the outcome recorded that nothing had THROWN,
      // which is not the same claim at all and is the weaker one by a mile.
      if (!delivery) {
        results.push({ userId: String(recipientId), outcome: 'provider-rejected', via });
        // Deliberately NOT marked notified. Recording a failed send as a notification would start
        // the throttle on the strength of it and buy fifteen minutes of silence for a message
        // nobody received.
        continue;
      }

      await markConversationNotified(conversationId, recipientId, now);
      // 'sent' now means the provider accepted it. Still not "delivered" - nothing this side of a
      // webhook can promise that - but it is a claim about the mail layer rather than about our
      // own control flow.
      results.push({ userId: String(recipientId), outcome: 'sent', via });
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

/**
 * Logs what notifyNewMessage actually did, every time, for every recipient.
 *
 * Both call sites previously logged ONLY the 'failed' outcome. So of the five things that can
 * happen, four were silent - and the two that a person actually reports ("I didn't get an email")
 * are 'throttled' and 'no-email', both of which looked exactly like success from the server's
 * stdout. The one outcome that was logged is the one least likely to occur.
 *
 * A quiet log line per message is cheap. Not being able to tell "we deliberately said nothing"
 * from "we tried and it vanished" costs an hour of reading code that turns out to be correct.
 */
function logNotifyOutcomes(scope, conversationId, results) {
  if (!results || results.length === 0) {
    logger.warn(`[${scope}] conversation ${conversationId}: notified nobody (no other members)`);
    return;
  }
  // `via` is in here because its absence cost a debugging round trip. "sent" alone cannot
  // distinguish the guest magic link from the "log in to InkBooks" email, and those two going to
  // the same person mean completely different things - one of them is a door a guest can open and
  // the other is a dead end.
  const summary = results
    .map(
      (r) =>
        `${r.userId || '-'}=${r.outcome}` +
        `${r.via ? `[${r.via}]` : ''}` +
        `${r.error ? ` (${r.error})` : ''}`,
    )
    .join(', ');
  const notified = results.some((r) => r.outcome === 'sent');
  // warn rather than log when nobody was reached, so it survives a log level that hides chatter.
  const write = notified ? logger.info.bind(logger) : logger.warn.bind(logger);
  write(`[${scope}] conversation ${conversationId}: ${summary}`);
}

module.exports = {
  notifyNewMessage,
  shouldNotify,
  logNotifyOutcomes,
  NOTIFY_THROTTLE_MS,
};
