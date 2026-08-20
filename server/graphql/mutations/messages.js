const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const { updateMessageInputSchema, createMessageInputSchema, validate } = require('../../utils/validation');
const { notifyNewMessage, logNotifyOutcomes } = require('../../utils/message-notifications');
const { canAccessConversation } = require('../../utils/shop-membership');
const { sendAutoResponseForIncomingMessage } = require('../../utils/auto-responses');
const { recordSharedImagesForMessage } = require('../../utils/shared-images');

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
      { conversationId, senderId, message, imageUrls },
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
      const { valid, errors, data } = validate(createMessageInputSchema, {
        conversationId,
        senderId,
        message,
        imageUrls,
      });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // Stamped HERE, ignoring whatever createdAt/updatedAt the caller sent.
      //
      // The arguments still exist on the schema so existing callers don't break, but they are no
      // longer written. A message's timestamp decides two things that must not be caller-
      // controlled: where it sits in the thread, and whether it counts as unread - unread is
      // `createdAt > my lastReadAt` (see models/Conversation.js). A client with a skewed clock, or
      // one simply choosing a value, could post a message that sorts into the middle of yesterday's
      // conversation and is born already-read, permanently invisible as a notification.
      //
      // Nobody was exploiting this; every real caller sent Date.now(). But "every caller currently
      // passes the right thing" is not a property the server should depend on, and it is exactly
      // the assumption that made client-supplied `role` an escalation bug in register().
      const now = new Date();
      const newMessage = new Message({
        conversationId,
        senderId,
        // From the validated/defaulted output, not the raw args - data.message is '' rather than
        // undefined for an image-only send, and data.imageUrls is always a real array.
        message: data.message,
        imageUrls: data.imageUrls,
        createdAt: now,
        updatedAt: now,
      });
      const msg = await newMessage.save();

      // Bumped so conversation lists can sort by real activity without a per-thread lookup of the
      // newest message. Also what the notification throttle reads.
      await Conversation.updateOne({ _id: conversationId }, { $set: { updatedAt: now } });

      // Tell the other side. This used to be inlined here and only covered one case: a booking
      // request whose sender was the artist. A client with a real account messaging about a
      // project was notified by nothing, and there was no throttle, and every failure was a
      // console.warn - so "we never tried" and "it failed" looked identical from everywhere except
      // the server's stdout. See utils/message-notifications.js.
      //
      // Still never throws - the message is what the person asked for and an email problem must
      // not lose it - but the outcome is now a value rather than a log line, so callers and tests
      // can see what actually happened.
      // Every outcome, not just failures - see logNotifyOutcomes on why logging only 'failed'
      // hid the two outcomes people actually report.
      // An image-only send has no text for the email subject's snippet to use - falls back to a
      // plain description rather than handing notifyNewMessage an empty string, which would just
      // fall through to ITS OWN fixed wording anyway but with no hint that a picture is what
      // actually arrived.
      const messageTextForNotify = data.message
        || (data.imageUrls.length > 0
          ? `Sent ${data.imageUrls.length === 1 ? 'an image' : `${data.imageUrls.length} images`}`
          : undefined);
      logNotifyOutcomes(
        'messages',
        conversationId,
        await notifyNewMessage({ conversationId, senderId, messageText: messageTextForNotify }),
      );

      // The MESSAGE_RECEIVED Auto-Response trigger (out-of-studio style away-replies) - see
      // utils/auto-responses.js's sendAutoResponseForIncomingMessage for the full resolution/dedup
      // logic. Same best-effort contract as notifyNewMessage above and never throws: this message
      // is what the client actually asked to send, and it must not be lost because an away-reply
      // couldn't be resolved or sent. A no-op for every message that isn't from a client (an
      // artist/staff reply, including the away-reply this itself posts, never re-triggers it).
      await sendAutoResponseForIncomingMessage({ conversationId, senderId, messageId: msg._id });

      // Indexes any attached images into the client-dashboard shared-images triage list - see
      // utils/shared-images.js and graphql/resolvers/sharedImages.js. Same best-effort contract
      // as the two calls above: this is a side effect of the message, not the message itself, and
      // must not be able to lose it.
      await recordSharedImagesForMessage({ conversation, message: msg });

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
        throw new UserInputError('Errors', { errors: { id: 'Message not found.' } });
      }
      const conversation = await Conversation.findById(existing.conversationId).select('members');
      if (!(await canAccessConversation(user, conversation))) {
        throw new AuthenticationError('Action not allowed');
      }
      try{
        const res = await Message.findByIdAndUpdate({_id: message.id}, message, {new: true});
        return res;
      } catch (err) {
          rethrow(err);
      }
    }, Constants.ROLES.SHOP_ADMIN)
  };
