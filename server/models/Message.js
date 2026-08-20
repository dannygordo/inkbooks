const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: {type: mongoose.Schema.Types.ObjectId, required: true},
	senderId: {type: mongoose.Schema.Types.ObjectId, required: true},
    message: {type: String},
    // Already-uploaded image URLs, same shape as FormResponse.answer.fileUrls - the upload itself
    // happens out-of-band via POST /message-uploads (routes/messageUploads.js, the same
    // uploadPublicFile()-backed pipeline form-uploads and booking-uploads already share), and this
    // just holds the URLs it returned. A message can be text-only, image-only, or both - `message`
    // stays optional for exactly that reason (unchanged from before this field existed).
    imageUrls: {type: [String], default: []},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true}
});

// Global search (utils/search.js) - see utils/search.js's own comment on why message search is
// scoped to conversations the caller is literally a member of, a narrower rule than
// canAccessConversation allows for opening one conversation directly.
MessageSchema.index({ message: 'text' }, { name: 'MessageTextIndex' });

module.exports = mongoose.model('Message', MessageSchema);