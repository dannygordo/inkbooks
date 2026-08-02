const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user could read every private
    // message on the platform. Not called anywhere in the client (grepped - the real message-
    // reading path is the Conversation.messages field resolver, reached only through an already
    // ownership-checked Conversation/Project/getConversationsByMemberId query - see
    // resolvers/index.js). Flat-gating to ADMIN closes the hole without resurrecting a feature
    // nobody uses.
    getMessages: withAuth(async () => {
      try {
        const message = await Message.find().sort({ updatedAt: 1 });
        return message;
      } catch (err) {
        throw new Error(err);
      }
    }, Constants.ROLES.ADMIN),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // conversationId and read that entire thread's messages. Allowed: shop-admin-or-better, or a
    // real member of that conversation - same rule as getConversation
    // (resolvers/conversations.js).
    getMessagesByConversationId: withAuth(async (_, { conversationId }, context, info, user) => {
        try {
          if (user.role > Constants.ROLES.SHOP_ADMIN) {
            const conversation = await Conversation.findById(conversationId).select('members');
            const isMember = conversation && (conversation.members || []).some(
              (memberId) => String(memberId) === String(user.id),
            );
            if (!isMember) {
              throw new AuthenticationError('Action not allowed');
            }
          }
          const message = await Message.find({
              conversationId: conversationId
          }).sort({ updatedAt: 1 });
          return message;
        } catch (err) {
          throw new Error(err);
        }
      }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // messageId and read someone else's private message. Allowed: shop-admin-or-better, or a
    // real member of the conversation this message belongs to.
    getMessage: withAuth(async (_, { messageId }, context, info, user) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) {
          throw new Error('Message not found');
        }
        if (user.role > Constants.ROLES.SHOP_ADMIN) {
          const conversation = await Conversation.findById(message.conversationId).select('members');
          const isMember = conversation && (conversation.members || []).some(
            (memberId) => String(memberId) === String(user.id),
          );
          if (!isMember) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return message;
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
