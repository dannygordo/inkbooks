const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: {type: mongoose.Schema.Types.ObjectId, required: true},
	senderId: {type: mongoose.Schema.Types.ObjectId, required: true},
    message: {type: String},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true}
});

// Global search (utils/search.js) - see utils/search.js's own comment on why message search is
// scoped to conversations the caller is literally a member of, a narrower rule than
// canAccessConversation allows for opening one conversation directly.
MessageSchema.index({ message: 'text' }, { name: 'MessageTextIndex' });

module.exports = mongoose.model('Message', MessageSchema);