const Conversation = require('../../models/Conversation');
const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');
const { getShopIdsForUser, getArtistIdsForShops, getMemberUserIdsForShop } = require('../../utils/shop-membership');
const { findOrCreateConversationForMembers } = require('../../utils/conversations');

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
    // Was matching `members: {$in: [shopId]}` - Conversation.members only ever holds real User
    // ids (see mutations/bookingRequests.js's `members: [artist.id, clientUser.id]`), so a shopId
    // never actually appeared there and this always returned an empty list, regardless of
    // permissions. Not called anywhere in the client (grepped), so there's no live UI feature
    // this could have broken - but "fix the Conversation logic" means making this actually work,
    // not just gating a query that silently did nothing. Fixed to match any conversation with at
    // least one member who is Staff or an Artist at this shop (see
    // utils/shop-membership.js's getMemberUserIdsForShop). Ownership: shop-admin-or-better, or a
    // caller who is themselves affiliated with this specific shop - same "not a flat gate"
    // reasoning as getArtistsByShop (resolvers/artists.js).
    getConversationsByShopId: withAuth(async (_, { shopId }, context, info, user) => {
        try {
          if (user.role > Constants.ROLES.SHOP_ADMIN) {
            const shopIds = await getShopIdsForUser(user.id);
            if (!shopIds.map(String).includes(String(shopId))) {
              throw new AuthenticationError('Action not allowed');
            }
          }
          const memberIds = await getMemberUserIdsForShop(shopId);
          if (memberIds.length === 0) {
            return [];
          }
          const conversation = await Conversation.find({
              members: {
                  $in: memberIds
              }
          }).sort({ updatedAt: 1 });
          return conversation;
        } catch (err) {
          console.log(err);
          throw new Error(err);
        }
      }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // conversationId and read someone else's private message thread. Allowed: shop-admin-or-
    // better, or a real member of that conversation (Conversation.members is the only field that
    // actually identifies who's in it - see the comment on getConversationsByShopId above for why
    // there's no separate artistId/clientId/shopId field to check instead).
    getConversation: withAuth(async (_, { conversationId }, context, info, user) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          throw new Error('Conversation not found');
        }
        if (
          user.role > Constants.ROLES.SHOP_ADMIN &&
          !(conversation.members || []).some((memberId) => String(memberId) === String(user.id))
        ) {
          throw new AuthenticationError('Action not allowed');
        }
        return conversation;
      } catch (err) {
        throw new Error(err);
      }
    }),
    // Was Conversation.findOne({artistId, clientId}) - same broken filter as the old
    // Project.conversation resolver (see resolvers/index.js's Project.conversation for the full
    // explanation of why those fields never exist on a stored Conversation document). Fixed to
    // find-or-create by membership, matching Project.conversation's fix and reusing the same
    // shared helper - the two should always agree on "the conversation for this artist/client
    // pair" since they resolve to the identical member set. `clientId` here follows the same
    // convention as Project.clientId (the Client sub-document's own _id, not the client's User.
    // _id - see MessengerService.js's docstring on this query), so this resolves the client's
    // real User._id first, same as Project.conversation does. Allowed: shop-admin-or-better, the
    // artist themselves, the client themselves, or a staff member of the artist's shop.
    getProjectConversation: withAuth(async (_, { artistId, clientId }, context, info, user) => {
      try {
        const client = await Client.findById(clientId).select('userId');
        if (!client) {
          throw new Error('Client not found');
        }
        if (
          user.role > Constants.ROLES.SHOP_ADMIN &&
          String(user.id) !== String(artistId) &&
          String(user.id) !== String(client.userId)
        ) {
          const shopIds = await getShopIdsForUser(user.id);
          const artistIds = await getArtistIdsForShops(shopIds);
          if (!artistIds.map(String).includes(String(artistId))) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return await findOrCreateConversationForMembers([artistId, client.userId]);
      } catch(err) {
        throw new Error(err);
      }
    })
  },
};
