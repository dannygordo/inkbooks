const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');

module.exports = {
  Query: {
    getConversations: withAuth(async () => {
      try {
        const conversation = await Conversation.find().sort({ updatedAt: 1 });
        return conversation;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getConversationsByMemberId: withAuth(async (_, { memberId }) => {
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
    }),
    getConversationsByShopId: withAuth(async (_, { shopId }) => {
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
      }),
    getConversation: withAuth(async (_, { conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          return conversation;
        } throw new Error('Conversation not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
    getProjectConversation: withAuth(async (_, {artistId, clientId}) => {
      try {
        const conversation = await Conversation.findOne({$and: [{artistId: artistId, clientId: clientId}]});
        if(conversation) {
          return conversation;
        } throw new Error('Conversation not found');
      } catch(err) {
        throw new Error(err);
      }
    })
  },
};
