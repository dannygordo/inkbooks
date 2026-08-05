const Conversation = require('../../models/Conversation');
const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const {
  getShopIdsForUser,
  getArtistIdsForShops,
  getMemberUserIdsForShop,
  assertCanAccessShop,
  canAccessConversation,
} = require('../../utils/shop-membership');
const { findOrCreateConversationForMembers } = require('../../utils/conversations');

module.exports = {
  Query: {
    // What the sidebar badge shows. Self-only by construction - it takes no argument, so there is
    // no id to tamper with and no ownership check to get wrong. Contrast getConversationsByMemberId
    // below, which takes a memberId and therefore needs a guard.
    getUnreadMessageCount: withAuth(async (_, args, context, info, user) => {
      const summary = await context.loaders.unread.summaryFor(user.id);
      return summary.total;
    }),
    // getConversations (every private thread on the platform) was deleted - see the note on
    // getUsers in resolvers/users.js for why these three went rather than getting scoped. Reading
    // messages goes through getConversationsByMemberId or the Conversation.messages field
    // resolver, both of which check who's asking.
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
        rethrow(err);
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
          await assertCanAccessShop(user, shopId);
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
          rethrow(err);
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
          throw new UserInputError('Errors', { errors: { conversationId: 'Conversation not found.' } });
        }
        // A member, or a shop admin at the shop one of the members works at. The old check let
        // any shop admin anywhere read any thread in the system; these are private messages
        // between an artist and their client. See canAccessConversation for how a Conversation -
        // which has no shopId - gets attached to a shop at all.
        if (!(await canAccessConversation(user, conversation))) {
          throw new AuthenticationError('Action not allowed');
        }
        return conversation;
      } catch (err) {
        rethrow(err);
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
          throw new UserInputError('Errors', { errors: { clientId: 'Client not found.' } });
        }
        if (
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
        rethrow(err);
      }
    })
  },
};
