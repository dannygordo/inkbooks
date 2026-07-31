const { AuthenticationError } = require('apollo-server');
const Conversation = require('../../models/Conversation');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');


module.exports = {
    async createConversation(
      _,
      {
        members,
        createdAt,
        updatedAt
      },
      context,
    ) {
      const user = checkAuth(context);
      const newConversation = new Conversation({
        members,
        createdAt,
        updatedAt
      });
  
      console.log(user);
      const conversation = await newConversation.save();
      return conversation;
    },
    async deleteConversation(_, { conversationId }, context) {
      const user = checkAuth(context);
      try {
        const conversation = await Conversation.findById(conversationId);
        //TODO: revisit rule that allows a user to delete an conversation.  Might want to inactive conversation instead of delete in order to prevent historical documents from breaking

        //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
        if (conversation && user.role === Constants.ROLES.ADMIN) {
          await Conversation.deleteOne({ _id: conversationId });
          return 'Conversation deleted successfully';
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
        throw new Error(err);
      }
    },async updateConversation(_, args, context) {
      const user = checkAuth(context);
      try{
        const conversation = args.conversation;
        console.log('user');
        console.log(user);
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
  
        console.log('fconversation');
        console.log(conversation);
          const res = await Conversation.findByIdAndUpdate({_id: conversation.id}, conversation, {new: true});
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
      }
    }
  };
  