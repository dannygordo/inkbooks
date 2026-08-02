const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user could read every private
    // conversation on the platform. Not called anywhere in the client (grepped - no caller), so
    // there's no real feature relying on "every conversation" access; flat-gating to ADMIN closes
    // the hole without resurrecting a feature nobody uses. Worth a follow-up decision on whether
    // to just delete this resolver instead.
    getConversations: withAuth(async () => {
      try {
        const conversation = await Conversation.find().sort({ updatedAt: 1 });
        return conversation;
      } catch (err) {
        throw new Error(err);
      }
    }, Constants.ROLES.ADMIN),
    // Was withAuth with no ownership check at all - any authenticated user could pass an
    // arbitrary memberId and read that user's entire private message history. The one real
    // caller (Messenger.jsx) always passes the caller's own user.id, so this is strictly
    // self-only - no SHOP_ADMIN-or-better bypass, unlike the resource queries elsewhere in this
    // codebase. There's no existing "shop admin can read staff/client DMs" feature to preserve,
    // and inventing message-oversight access as a side effect of a security fix isn't this
    // change's call to make - flagging it as a real product decision if ever wanted.
    getConversationsByMemberId: withAuth(async (_, { memberId }, context, info, user) => {
      if (String(user.id) !== String(memberId)) {
        throw new AuthenticationError('Action not allowed');
      }
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
    // Was withAuth with no restriction at all. Also appears to be dead/broken already:
    // Conversation.members only ever holds user ids (see mutations/bookingRequests.js's
    // `members: [artist.id, clientUser.id]` - the one place a Conversation gets created), so a
    // shopId will never actually appear in a conversation's members array, and there's no caller
    // of this query anywhere in the client (grepped). Flat-gating to SHOP_ADMIN-or-better closes
    // the authorization hole without trying to resurrect or redesign the underlying (currently
    // non-functional) query logic in the same change.
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
      }, Constants.ROLES.SHOP_ADMIN),
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
    // Was withAuth with no restriction at all. Also appears to be dead/broken already: the
    // Conversation schema (models/Conversation.js) only has members/createdAt/updatedAt - there
    // is no artistId/clientId field on a Conversation document for this filter to ever match, and
    // there's no caller of this query anywhere in the client (grepped). Same minimal approach as
    // getConversationsByShopId above - flat-gate rather than rebuild dead logic in this change.
    getProjectConversation: withAuth(async (_, {artistId, clientId}) => {
      try {
        const conversation = await Conversation.findOne({$and: [{artistId: artistId, clientId: clientId}]});
        if(conversation) {
          return conversation;
        } throw new Error('Conversation not found');
      } catch(err) {
        throw new Error(err);
      }
    }, Constants.ROLES.SHOP_ADMIN)
  },
};
