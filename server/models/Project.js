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
	// DEPRECATED - whole dollars, from before money moved to integer cents, and no longer written
	// by anything. A real deposit is recorded on the appointment that collected it (see
	// models/Appointment.js's depositCents), because the money has a date and a payer and belongs
	// to the transaction that took it. Left in place only so existing documents keep validating;
	// nothing reads it for a decision. Remove once no stored project still carries one.
	depositAmount: {type: Number},
	// Set by convertBookingRequest when this Project is created from a booking request. Without
	// it there was no path from a Project back to the consult that collected its deposit - the
	// consult carries bookingRequestId and the Project carried nothing, so the two halves of the
	// same job couldn't find each other. That's what made a project's deposit unreportable.
	bookingRequestId: {type: mongoose.Schema.Types.ObjectId}

}, {
	timestamps: true
});
module.exports = mongoose.model('Project', ProjectSchema);
