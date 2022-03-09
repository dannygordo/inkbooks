const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: {type: mongoose.Schema.Types.ObjectId, required: true},
	senderId: {type: mongoose.Schema.Types.ObjectId, required: true},
    message: {type: String},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true}
});
module.exports = mongoose.model('Message', MessageSchema);