const Client = require('../models/Client');
const Artist = require('../models/Artist');
const SharedImage = require('../models/SharedImage');

/**
 * Best-effort recording of a client-artist conversation's shared images, for the client-dashboard
 * triage list (graphql/resolvers/sharedImages.js). Called from createMessage right after a
 * message with imageUrls is saved - same "never throws, the message itself must not be lost"
 * contract as notifyNewMessage/sendAutoResponseForIncomingMessage in that same call path
 * (mutations/messages.js).
 *
 * A no-op for any conversation that isn't a genuine one-client-one-artist thread (a staff-only
 * or group conversation) - mirrors sendAutoResponseForIncomingMessage's own
 * "artistMembers.length !== 1" guard in utils/auto-responses.js, for the same reason: there is no
 * single client/artist pair here to attribute the images to.
 */
async function recordSharedImagesForMessage({ conversation, message }) {
  try {
    if (!conversation || !message.imageUrls || message.imageUrls.length === 0) {
      return;
    }
    const memberIds = conversation.members || [];
    const clients = (
      await Promise.all(memberIds.map((memberId) => Client.findOne({ userId: memberId })))
    ).filter(Boolean);
    const artists = (
      await Promise.all(memberIds.map((memberId) => Artist.findOne({ userId: memberId })))
    ).filter(Boolean);
    if (clients.length !== 1 || artists.length !== 1) {
      return;
    }
    const [clientMember] = clients;
    const [artistMember] = artists;

    await SharedImage.insertMany(
      message.imageUrls.map((url) => ({
        url,
        conversationId: conversation._id,
        messageId: message._id,
        clientId: clientMember._id,
        artistId: artistMember.userId,
        senderId: message.senderId,
      })),
      // ordered: false so one duplicate (a retried call hitting the model's own {messageId, url}
      // unique index) doesn't stop every OTHER image in the same message from being recorded -
      // see the model's own comment on why that index exists.
      { ordered: false },
    );
  } catch (err) {
    // Covers the expected, harmless retry-duplicate case too - insertMany with ordered: false
    // still inserts every non-duplicate document even though the call itself rejects, so there is
    // nothing to recover here either way. Logged rather than silent so a genuinely new failure
    // mode doesn't hide forever.
    console.warn(`[shared-images] recordSharedImagesForMessage: ${err.message}`);
  }
}

module.exports = { recordSharedImagesForMessage };
