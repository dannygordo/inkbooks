const mongoose = require('mongoose');

const IBImage = new mongoose.Schema({
	url: {type: String, required: true},
    title: {type: String},
    uploadedByDisplayName: {type: String},
    avatar: {type: String},
	tags: {type: [String]}
}, {
	timestamps: true
});
module.exports = IBImage;
