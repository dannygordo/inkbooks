const Conversation = require('../models/Conversation');

// Shared helper for every place that needs "the conversation between exactly this set of
// people" - currently Project.conversation (resolvers/index.js) and getProjectConversation
// (resolvers/conversations.js). Conversation.members is the only real relationship a
// Conversation has (see models/Conversation.js - no artistId/clientId/shopId fields exist on the
// stored document), so this is deliberately membership-based rather than trying to reintroduce
// fields that were never actually persisted.
//
// Finds an existing conversation whose member set is exactly memberIds (order-independent, no
// extra/missing members), or creates one if none exists yet. Reuses a conversation that already
// exists between the same two people - e.g. an artist/client pair who already have a
// booking-request conversation (see mutations/bookingRequests.js) get that same thread surfaced
// as their Project's conversation too, rather than a disconnected duplicate.
async function findOrCreateConversationForMembers(memberIds) {
  const sortedIds = Array.from(new Set(memberIds.map(String))).sort();
  let conversation = await Conversation.findOne({
    members: { $all: sortedIds, $size: sortedIds.length },
  });
  if (!conversation) {
    const now = new Date();
    conversation = await new Conversation({
      members: sortedIds,
      createdAt: now,
      updatedAt: now,
    }).save();
  }
  return conversation;
}

module.exports = { findOrCreateConversationForMembers };
