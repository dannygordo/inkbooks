const Message = require('../../models/Message');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
    createMessage: withAuth(async (
      _,
      {
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      },
    ) => {
      const newMessage = new Message({
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      });
      const msg = await newMessage.save();
      return msg;
    }),
    deleteMessage: withAuth(async (_, { messageId }) => {
      try {
        const message = await Message.findById(messageId);
        //TODO: revisit rule that allows a user to delete an message.  Might want to inactive message instead of delete in order to prevent historical documents from breaking
        if (message) {
          await Message.deleteOne({ _id: messageId });
          return 'Message deleted successfully';
        }
        throw new Error('Message not found');
      } catch (err) {
        throw new Error(err);
      }
    }, Constants.ROLES.ADMIN),
    updateMessage: withAuth(async (_, args) => {
      try{
        const message = args.message;
        const res = await Message.findByIdAndUpdate({_id: message.id}, message, {new: true});
        return res;
      } catch (err) {
          throw new Error(err);
      }
    }, Constants.ROLES.SHOP_ADMIN)
  };
