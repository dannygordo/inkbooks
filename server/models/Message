const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
	fromUserId: {type: mongoose.Schema.Types.ObjectId, required: true},
    toUserId: {type: mongoose.Schema.Types.ObjectId, required: true},
    msg: {type: String},
    projectId: {type: mnongoose.Schema.Types.ObjectId}
}, {
	timestamps: true
});
module.exports = mongoose.model('Message', MessageSchema);