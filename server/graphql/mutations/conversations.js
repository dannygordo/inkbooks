const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const { updateConversationInputSchema, createConversationInputSchema, validate } = require('../../utils/validation');
const { canAccessConversation } = require('../../utils/shop-membership');

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
    }, Constants.ROLES.SHOP_ADMIN)
  };
