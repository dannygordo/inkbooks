const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
    members: {type: Array},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true}
});
module.exports = mongoose.model('Conversation', ConversationSchema);