const Conversation = require('../../models/Conversation');

module.exports = {
  Query: {
    async getConversations() {
      try {
        const conversation = await Conversation.find().sort({ updatedAt: 1 });
        return conversation;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getConversationsByMemberId(_, { memberId }) {
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
    async getConversationsByShopId(_, { shopId }) {
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
    async getConversation(_, { conversationId }) {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          return conversation;
        } throw new Error('Conversation not found');
      } catch (err) {
        throw new Error(err);
      }
    },
    async getProjectConversation(_, {artistId, clientId}) {
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
