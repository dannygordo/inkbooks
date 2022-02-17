const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
	title: {type: String, required: true},
	description: {type: String, required: true},
	artistId: {type: mongoose.Schema.Types.ObjectId, required: true},
	clientId: {type: mongoose.Schema.Types.ObjectId, required: true},
	referenceImages: {type: [String]},
	bodyImages: {type: [String]},
	designImages: {type: [String]},
	materialsUsed: {type: [String]},
	notes: {type: [String]},
	tags: {type: [String]},
	status: {type: String, required: true},
	depositAmount: {type: Number}

}, {
	timestamps: true
});
module.exports = mongoose.model('Project', ProjectSchema);
