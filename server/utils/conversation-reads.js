const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { toObjectId } = require('./object-id');

/**
 * What "unread" means, in one place.
 *
 * A message is unread FOR YOU when:
 *   - it's newer than your lastReadAt for that conversation (or you've never opened it), AND
 *   - you didn't send it.
 *
 * That second clause is not a detail. Without it every message you send makes your own badge go
 * up, which is the single most obvious way a notification count loses people's trust - and it's
 * easy to miss, because you only see it by sending a message and looking at your own sidebar.
 *
 * Everything that counts, marks, or asks about unread goes through here. The badge, the per-thread
 * counts and the email throttle all need the same rule, and three copies of "newer than my
 * lastReadAt and not mine" is three places for the senderId clause to be forgotten in two of them.
 */

/** This member's read row, or null when they've never opened the thread. */
function readRowFor(conversation, userId) {
  return (
    (conversation.reads || []).find((r) => String(r.userId) === String(userId)) || null
  );
}

// Ids must be real ObjectIds here, not strings: unreadSummaryForUser AGGREGATES, and an
// aggregation pipeline does not cast. See utils/object-id.js - this is the exact bug it documents,
// and the reason the sidebar badge once counted your own messages against you.
/**
 * The Mongo filter for "messages in this conversation that are unread by this user".
 *
 * Returned as a filter rather than a count so callers can count, fetch, or aggregate with the
 * same definition.
 */
function unreadFilter(conversationId, userId, lastReadAt) {
  const filter = {
    conversationId: toObjectId(conversationId),
    // Never your own. See the header - this is the clause that keeps a badge honest.
    senderId: { $ne: toObjectId(userId) },
  };
  if (lastReadAt) {
    filter.createdAt = { $gt: lastReadAt };
  }
  // No lastReadAt at all means never opened, so every message from the other side is unread. No
  // date clause rather than a $gt: epoch - same result, and it doesn't invent a read event that
  // never happened.
  return filter;
}

/** Unread count for one conversation. */
async function unreadCountForConversation(conversation, userId) {
  const row = readRowFor(conversation, userId);
  return Message.countDocuments(
    unreadFilter(conversation._id, userId, row && row.lastReadAt),
  );
}

/**
 * Unread counts for every conversation this user belongs to, plus the total.
 *
 * One query for the conversations and one aggregation for the messages, rather than a count per
 * conversation - the sidebar badge renders on every page, and N+1 counting there is a query
 * storm on a component that is always mounted.
 *
 * Returns { total, byConversationId: Map<string, number> }.
 */
async function unreadSummaryForUser(userId, { only = null, excluding = null } = {}) {
  let conversations = await Conversation.find({ members: { $in: [String(userId)] } }).select(
    '_id reads',
  );

  // Scoped by the caller rather than by a rule written here, because "which conversations count"
  // is a routing question and routing has exactly one definition (utils/conversation-routing.js).
  // Encoding it here as well is how a badge ends up disagreeing with the list it labels.
  if (only) {
    const keep = new Set(only.map(String));
    conversations = conversations.filter((c) => keep.has(String(c._id)));
  }
  if (excluding) {
    const drop = new Set(excluding.map(String));
    conversations = conversations.filter((c) => !drop.has(String(c._id)));
  }

  if (conversations.length === 0) {
    return { total: 0, byConversationId: new Map() };
  }

  // One $or branch per conversation, each carrying that conversation's own cutoff. Mongo can use
  // the conversationId index for each branch, and it stays a single round trip.
  const branches = conversations.map((conversation) => {
    const row = readRowFor(conversation, userId);
    return unreadFilter(conversation._id, userId, row && row.lastReadAt);
  });

  const rows = await Message.aggregate([
    { $match: { $or: branches } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);

  const byConversationId = new Map(rows.map((r) => [String(r._id), r.count]));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return { total, byConversationId };
}

/**
 * Marks a conversation read up to now for this user.
 *
 * Two writes rather than one because Mongo can't upsert into an array element that may or may not
 * exist in a single statement: the positional update matches only when a row is already there, and
 * $push would duplicate the row if it is. Try the update first, add the row only if nothing
 * matched. Both are idempotent, so a double-click or a re-render costs nothing and can't produce
 * two read rows for one member.
 */
async function markConversationRead(conversationId, userId, at = new Date()) {
  const updated = await Conversation.updateOne(
    { _id: conversationId, 'reads.userId': userId },
    { $set: { 'reads.$.lastReadAt': at } },
  );
  if (updated.matchedCount === 0) {
    await Conversation.updateOne(
      // The userId guard makes the concurrent case safe: if another request added the row between
      // the update above and this push, this matches nothing instead of adding a second one.
      { _id: conversationId, 'reads.userId': { $ne: userId } },
      { $push: { reads: { userId, lastReadAt: at } } },
    );
  }
  return Conversation.findById(conversationId);
}

/** Records that we've emailed this member about this conversation, for the throttle. */
async function markConversationNotified(conversationId, userId, at = new Date()) {
  const updated = await Conversation.updateOne(
    { _id: conversationId, 'reads.userId': userId },
    { $set: { 'reads.$.lastNotifiedAt': at } },
  );
  if (updated.matchedCount === 0) {
    await Conversation.updateOne(
      { _id: conversationId, 'reads.userId': { $ne: userId } },
      // No lastReadAt at all - being emailed about a conversation is not reading it, and an epoch
      // date standing in for "never" would claim a read event that didn't happen. The field is
      // optional on the schema precisely so this row can exist without one.
      { $push: { reads: { userId, lastNotifiedAt: at } } },
    );
  }
}

module.exports = {
  readRowFor,
  unreadFilter,
  unreadCountForConversation,
  unreadSummaryForUser,
  markConversationRead,
  markConversationNotified,
};
