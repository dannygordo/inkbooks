const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const BookingRequest = require('../../models/BookingRequest');
const Client = require('../../models/Client');
const User = require('../../models/User');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError } = require('../../utils/errors');
const { updateMessageInputSchema, createMessageInputSchema, validate } = require('../../utils/validation');
const { sendNewMessageNotificationToGuest } = require('../../utils/email');
const { canAccessConversation } = require('../../utils/shop-membership');

module.exports = {
    // Had no ownership check at all - any authenticated user could pass an arbitrary
    // conversationId and senderId, posting a message as any user into any conversation
    // (impersonation), regardless of whether they had any real connection to it. Every real
    // caller (IBChatBox.jsx, ArtistBookingRequests.jsx) always passes the caller's own user.id as
    // senderId, so this now requires that, plus real membership in the target conversation - no
    // shop-admin-or-better bypass, since sending as someone else is a step further than reading
    // (see getConversationsByMemberId's comment on the same "no message-oversight feature to
    // preserve" reasoning).
    createMessage: withAuth(async (
      _,
      {
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      },
      context,
      info,
      user,
    ) => {
      if (String(user.id) !== String(senderId)) {
        throw new AuthenticationError('Action not allowed');
      }
      const conversation = await Conversation.findById(conversationId).select('members');
      const isMember = conversation && (conversation.members || []).some(
        (memberId) => String(memberId) === String(user.id),
      );
      if (!isMember) {
        throw new AuthenticationError('Action not allowed');
      }
      const { valid, errors } = validate(createMessageInputSchema, { conversationId, senderId, message, createdAt, updatedAt });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const newMessage = new Message({
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      });
      const msg = await newMessage.save();

      // If this conversation belongs to a booking request, the other side may be a guest with
      // no way to know a reply arrived except by email - see
      // PRODUCTION_ROADMAP.md's "Booking request & guest correspondence" section. Best-effort:
      // a lookup/send failure here shouldn't fail the message send itself.
      try {
        const bookingRequest = await BookingRequest.findOne({ conversationId });
        if (bookingRequest && String(bookingRequest.artistId) === String(senderId)) {
          const bookingClient = await Client.findById(bookingRequest.clientId);
          const guestUser = bookingClient ? await User.findById(bookingClient.userId) : null;
          const artist = await User.findById(bookingRequest.artistId);
          if (guestUser && artist) {
            await sendNewMessageNotificationToGuest({
              to: guestUser.email,
              firstName: guestUser.firstName,
              artistName: artist.firstName,
              guestToken: bookingRequest.guestToken,
            });
          }
        }
      } catch (notifyErr) {
        console.warn('[messages] Failed to notify guest of new message:', notifyErr.message);
      }

      return msg;
    }),
    updateMessage: withAuth(async (_, args, context, info, user) => {
      const message = args.message;
      const { valid, errors } = validate(updateMessageInputSchema, message);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // The minRole was the whole check - any shop admin could edit anyone's message text.
      const existing = await Message.findById(message.id).select('conversationId');
      if (!existing) {
        throw new Error('Message not found');
      }
      const conversation = await Conversation.findById(existing.conversationId).select('members');
      if (!(await canAccessConversation(user, conversation))) {
        throw new AuthenticationError('Action not allowed');
      }
      try{
        const res = await Message.findByIdAndUpdate({_id: message.id}, message, {new: true});
        return res;
      } catch (err) {
          throw new Error(err);
      }
    }, Constants.ROLES.SHOP_ADMIN)
  };
