const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError } = require('../../utils/errors');
const { updateConversationInputSchema, createConversationInputSchema, validate } = require('../../utils/validation');

module.exports = {
    createConversation: withAuth(async (
      _,
      {
        members,
        createdAt,
        updatedAt
      },
    ) => {
      const { valid, errors } = validate(createConversationInputSchema, { members, createdAt, updatedAt });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const newConversation = new Conversation({
        members,
        createdAt,
        updatedAt
      });
      const conversation = await newConversation.save();
      return conversation;
    }),
    deleteConversation: withAuth(async (_, { conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        //TODO: revisit rule that allows a user to delete an conversation.  Might want to inactive conversation instead of delete in order to prevent historical documents from breaking
        if (conversation) {
          await Conversation.deleteOne({ _id: conversationId });
          return 'Conversation deleted successfully';
        }
        throw new Error('Conversation not found');
      } catch (err) {
        throw new Error(err);
      }
    }, Constants.ROLES.ADMIN),
    updateConversation: withAuth(async (_, args) => {
      const conversation = args.conversation;
      const { valid, errors } = validate(updateConversationInputSchema, conversation);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      try{
        const res = await Conversation.findByIdAndUpdate({_id: conversation.id}, conversation, {new: true});
        return res;
      } catch (err) {
          throw new Error(err);
      }
    }, Constants.ROLES.SHOP_ADMIN)
  };
