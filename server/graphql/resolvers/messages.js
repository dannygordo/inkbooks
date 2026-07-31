const Message = require('../../models/Message');
const checkAuth = require('../../utils/check-auth');

module.exports = {
  Query: {
    async getMessages(_, args, context) {
      checkAuth(context);
      try {
        const message = await Message.find().sort({ updatedAt: 1 });
        return message;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getMessagesByConversationId(_, { conversationId }, context) {
        checkAuth(context);
        try {
          const message = await Message.find({
              conversationId: conversationId
          }).sort({ updatedAt: 1 });
          return message;
        } catch (err) {
          throw new Error(err);
        }
      },
    async getMessage(_, { messageId }, context) {
      checkAuth(context);
      try {
        const message = await Message.findById(messageId);
        if (message) {
          return message;
        } throw new Error('Message not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  },
};
