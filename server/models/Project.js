const mongoose = require('mongoose');
const IBImageSchema = require('./IBImage');
const IBNoteSchema = require('./IBNote');

const ProjectSchema = new mongoose.Schema({
	title: {type: String, required: true},
	description: {type: String, required: true},
	placement: {type: String},
	size: {type: String},
	palette: {type: String},
	artistId: {type: mongoose.Schema.Types.ObjectId, required: true},
	clientId: {type: mongoose.Schema.Types.ObjectId, required: true},
	referenceImages: {type: [IBImageSchema]},
	bodyImages: {type: [IBImageSchema]},
	designImages: {type: [IBImageSchema]},
	materialsUsed: {type: [String]},
	notes: {type: [IBNoteSchema]},
	tags: {type: [String]},
	status: {type: String, required: true},
	depositAmount: {type: Number}

}, {
	timestamps: true
});
module.exports = mongoose.model('Project', ProjectSchema);
