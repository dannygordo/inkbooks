const Message = require('../../models/Message');
const BookingRequest = require('../../models/BookingRequest');
const Client = require('../../models/Client');
const User = require('../../models/User');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError } = require('../../utils/errors');
const { updateMessageInputSchema, createMessageInputSchema, validate } = require('../../utils/validation');
const { sendNewMessageNotificationToGuest } = require('../../utils/email');

module.exports = {
    createMessage: withAuth(async (
      _,
      {
        conversationId,
        senderId,
        message,
        createdAt,
        updatedAt
      },
    ) => {
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
    deleteMessage: withAuth(async (_, { messageId }) => {
      try {
        const message = await Message.findById(messageId);
        //TODO: revisit rule that allows a user to delete an message.  Might want to inactive message instead of delete in order to prevent historical documents from breaking
        if (message) {
          await Message.deleteOne({ _id: messageId });
          return 'Message deleted successfully';
        }
        throw new Error('Message not found');
      } catch (err) {
        throw new Error(err);
      }
    }, Constants.ROLES.ADMIN),
    updateMessage: withAuth(async (_, args) => {
      const message = args.message;
      const { valid, errors } = validate(updateMessageInputSchema, message);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      try{
        const res = await Message.findByIdAndUpdate({_id: message.id}, message, {new: true});
        return res;
      } catch (err) {
          throw new Error(err);
      }
    }, Constants.ROLES.SHOP_ADMIN)
  };
