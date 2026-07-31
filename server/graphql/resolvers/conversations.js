const Conversation = require('../../models/Conversation');
const checkAuth = require('../../utils/check-auth');

module.exports = {
  Query: {
    async getConversations(_, args, context) {
      checkAuth(context);
      try {
        const conversation = await Conversation.find().sort({ updatedAt: 1 });
        return conversation;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getConversationsByMemberId(_, { memberId }, context) {
      checkAuth(context);
      try {
        const conversation = await Conversation.find({
            members: {
                $in:[memberId]
            }
        }).sort({ updatedAt: 1 });
        return conversation;
      } catch (err) {
        console.log(err);
        throw new Error(err);
      }
    },
    async getConversationsByShopId(_, { shopId }, context) {
        checkAuth(context);
        try {
          const conversation = await Conversation.find({
              members: {
                  $in:[shopId]
              }
          }).sort({ updatedAt: 1 });
          return conversation;
        } catch (err) {
          console.log(err);
          throw new Error(err);
        }
      },
    async getConversation(_, { conversationId }, context) {
      checkAuth(context);
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          return conversation;
        } throw new Error('Conversation not found');
      } catch (err) {
        throw new Error(err);
      }
    },
    async getProjectConversation(_, {artistId, clientId}, context) {
      checkAuth(context);
      try {
        const conversation = await Conversation.findOne({$and: [{artistId: artistId, clientId: clientId}]});
        if(conversation) {
          return conversation;
        } throw new Error('Conversation not found');
      } catch(err) {
        throw new Error(err);
      }
    }
  },
};
