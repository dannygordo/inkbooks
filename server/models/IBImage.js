const mongoose = require('mongoose');

const IBImage = new mongoose.Schema({
	url: {type: String, required: true},
    title: {type: String},
    uploadedByDisplayName: {type: String},
    userId: {type: mongoose.Schema.Types.ObjectId, required: true},
    avatar: {type: String},
	tags: {type: [String]},
    updatedAt: {type: Date},
    createdAt: {type: Date}
});
module.exports = IBImage;
