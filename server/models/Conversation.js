const mongoose = require('mongoose');

/**
 * Per-member read state.
 *
 * ONE TIMESTAMP PER MEMBER, not a read flag per message. Unread is then
 * `message.createdAt > my lastReadAt AND message.senderId != me` - an indexed count against a
 * single scalar, and opening a thread is one small write however long the thread is. The
 * alternative (Message.readBy: [userId]) costs a write per message per reader, so opening a
 * 500-message conversation is 500 array updates, and a partial failure leaves the thread
 * half-read with no way to tell.
 *
 * This is exact for the question a badge asks - how many messages arrived since I last looked -
 * and it depends entirely on message timestamps being trustworthy. They weren't: createMessage
 * took createdAt from the caller, so a message could be born with a past timestamp, sort into the
 * middle of an old thread, and land behind the reader's lastReadAt as permanently already-read.
 * Timestamps are now stamped server-side (see mutations/messages.js). Those two changes are really
 * one change; this model is only correct because of that one.
 *
 * What this deliberately cannot do: per-message read receipts ("Seen"), or marking a single
 * message unread again. Both need readBy, and neither is worth a second record of the same fact -
 * this codebase has paid for that pattern repeatedly (Artist.shopId vs. ArtistShopConnection,
 * Project.depositAmount vs. the appointment actually holding the money).
 */
const ConversationReadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // NOT required. A member can have a read row because we emailed them (lastNotifiedAt) while
    // never having opened the thread, and the honest representation of that is an absent
    // lastReadAt rather than an epoch date standing in for one. Both count identically - every
    // message is newer than either - but only one of them doesn't claim a read that didn't happen.
    lastReadAt: { type: Date },
    // When this member was last emailed about this conversation. It lives next to lastReadAt
    // because it answers a closely related question and is read at the same moment: an artist
    // sending four messages in a row should produce one email, not four. See
    // utils/message-notifications.js.
    lastNotifiedAt: { type: Date },
  },
  { _id: false },
);

const ConversationSchema = new mongoose.Schema({
    members: {type: Array},
    // Absent for a member who has never opened the thread, which correctly reads as "everything is
    // unread" rather than as "read at the epoch". A missing subdocument and a date of 1970 count
    // the same, but only one of them is honest about not knowing.
    reads: {type: [ConversationReadSchema], default: []},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true}
});

// The badge asks "which of my conversations have unread messages" on every render, which starts by
// finding the conversations this user is in and their read rows.
ConversationSchema.index({ members: 1 });
ConversationSchema.index({ 'reads.userId': 1 });

module.exports = mongoose.model('Conversation', ConversationSchema);
