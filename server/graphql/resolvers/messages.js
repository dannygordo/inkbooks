const Message = require('../../models/Message');
const withAuth = require('../../utils/with-auth');

module.exports = {
  Query: {
    getMessages: withAuth(async () => {
      try {
        const message = await Message.find().sort({ updatedAt: 1 });
        return message;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getMessagesByConversationId: withAuth(async (_, { conversationId }) => {
        try {
          const message = await Message.find({
              conversationId: conversationId
          }).sort({ updatedAt: 1 });
          return message;
        } catch (err) {
          throw new Error(err);
        }
      }),
    getMessage: withAuth(async (_, { messageId }) => {
      try {
        const message = await Message.findById(messageId);
        if (message) {
          return message;
        } throw new Error('Message not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
