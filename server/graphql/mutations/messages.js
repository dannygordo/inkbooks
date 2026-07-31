const { AuthenticationError } = require('apollo-server');
const Message = require('../../models/Message');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');


module.exports = {
    async createMessage(
      _,
      {
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      },
      context,
    ) {
      const user = checkAuth(context);
      const newMessage = new Message({
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      });
  
      console.log(user);
      const msg = await newMessage.save();
      return msg;
    },
    async deleteMessage(_, { messageId }, context) {
      const user = checkAuth(context);
      try {
        const message = await Message.findById(messageId);
        //TODO: revisit rule that allows a user to delete an message.  Might want to inactive message instead of delete in order to prevent historical documents from breaking

        //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
        if (message && user.role === Constants.ROLES.ADMIN) {
          await Message.deleteOne({ _id: messageId });
          return 'Message deleted successfully';
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
        throw new Error(err);
      }
    },async updateMessage(_, args, context) {
      const user = checkAuth(context);
      try{
        const message = args.message;
        console.log('user');
        console.log(user);
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
  
        console.log('fmessage');
        console.log(message);
          const res = await Message.findByIdAndUpdate({_id: message.id}, message, {new: true});
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
      }
    }
  };
  