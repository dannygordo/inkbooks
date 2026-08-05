const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const { updateConversationInputSchema, createConversationInputSchema, validate } = require('../../utils/validation');
const { canAccessConversation } = require('../../utils/shop-membership');
const { markConversationRead } = require('../../utils/conversation-reads');

module.exports = {
    // Not called anywhere in the client (grepped - real conversations are created directly via
    // the Conversation model, either by mutations/bookingRequests.js or by
    // utils/conversations.js's findOrCreateConversationForMembers). Had no restriction preventing
    // a caller from creating a conversation they aren't even part of, which would show up as a
    // new, unsolicited thread in two unrelated users' Messenger inboxes. Added a minimal
    // safeguard even though this mutation currently has no real caller - "fix the Conversation
    // logic" shouldn't mean "except the parts nothing uses yet."
    createConversation: withAuth(async (
      _,
      {
        members,
        createdAt,
        updatedAt
      },
      context,
      info,
      user,
    ) => {
      const { valid, errors } = validate(createConversationInputSchema, { members, createdAt, updatedAt });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      if (!(members || []).some((memberId) => String(memberId) === String(user.id))) {
        throw new AuthenticationError('Action not allowed');
      }
      const newConversation = new Conversation({
        members,
        createdAt,
        updatedAt
      });
      const conversation = await newConversation.save();
      return conversation;
    }),
    updateConversation: withAuth(async (_, args, context, info, user) => {
      const conversation = args.conversation;
      const { valid, errors } = validate(updateConversationInputSchema, conversation);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // The minRole was the whole check - any shop admin could rewrite any thread in the system.
      const existing = await Conversation.findById(conversation.id).select('members');
      if (!(await canAccessConversation(user, existing))) {
        throw new AuthenticationError('Action not allowed');
      }
      try{
        const res = await Conversation.findByIdAndUpdate({_id: conversation.id}, conversation, {new: true});
        return res;
      } catch (err) {
          rethrow(err);
      }
    }, Constants.ROLES.SHOP_ADMIN),

    /**
     * Marks a conversation read for the caller, as of now.
     *
     * Membership, not role. A shop admin marking someone else's thread read would silently clear
     * that person's badge - which is worse than it sounds, because the messages stay unread in
     * every sense that matters and the only signal that they exist is gone. Reading is something
     * only the reader can do.
     *
     * Idempotent, so the client can call it on every thread open and every focus without
     * bookkeeping.
     */
    markConversationRead: withAuth(async (_, { conversationId }, context, info, user) => {
      const conversation = await Conversation.findById(conversationId).select('members');
      if (!conversation) {
        throw new UserInputError('Errors', {
          errors: { conversationId: 'Conversation not found.' },
        });
      }
      const isMember = (conversation.members || []).some(
        (memberId) => String(memberId) === String(user.id),
      );
      if (!isMember) {
        throw new AuthenticationError('Action not allowed');
      }
      return markConversationRead(conversationId, user.id);
    }),
  };
