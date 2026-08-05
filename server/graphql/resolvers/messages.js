const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, rethrow } = require('../../utils/errors');
const { canAccessConversation } = require('../../utils/shop-membership');

module.exports = {
  Query: {
    // getMessages (every message on the platform) was deleted - see the note on getUsers in
    // resolvers/users.js. The real read path is the Conversation.messages field resolver, reached
    // only through an already ownership-checked query.
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // conversationId and read that entire thread's messages. Allowed: shop-admin-or-better, or a
    // real member of that conversation - same rule as getConversation
    // (resolvers/conversations.js).
    getMessagesByConversationId: withAuth(async (_, { conversationId }, context, info, user) => {
        try {
          // Same rule as getConversation (resolvers/conversations.js), via the same helper -
          // a member, or a shop admin at a member's own shop. It used to be any shop admin
          // anywhere.
          const conversation = await Conversation.findById(conversationId).select('members');
          if (!(await canAccessConversation(user, conversation))) {
            throw new AuthenticationError('Action not allowed');
          }
          const message = await Message.find({
              conversationId: conversationId
          }).sort({ updatedAt: 1 });
          return message;
        } catch (err) {
          rethrow(err);
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
        const conversation = await Conversation.findById(message.conversationId).select('members');
        if (!(await canAccessConversation(user, conversation))) {
          throw new AuthenticationError('Action not allowed');
        }
        return message;
      } catch (err) {
        rethrow(err);
      }
    }),
  },
};
