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
	// depositAmount (whole dollars, pre-integer-cents) used to sit here, deprecated and unwritten.
	// "Deprecated but harmless" turned out to be wrong: three separate UI reads were still
	// pointing at it - the project page's deposit readout, the projects list's deposit column, and
	// the calendar's project selection - and since nothing had written it in a long time, all
	// three confidently reported that no deposit had been taken while the money sat correctly on
	// the consult appointment and showed up correctly on the dashboard. A field that can only
	// produce a wrong answer is worse than a missing one, which is why it's gone rather than
	// commented. The real figures are Project.depositCollectedCents / depositAvailableCents,
	// resolved from the appointment that took the money (see graphql/resolvers/index.js).
	// Set by convertBookingRequest when this Project is created from a booking request. Without
	// it there was no path from a Project back to the consult that collected its deposit - the
	// consult carries bookingRequestId and the Project carried nothing, so the two halves of the
	// same job couldn't find each other. That's what made a project's deposit unreportable.
	bookingRequestId: {type: mongoose.Schema.Types.ObjectId}

}, {
	timestamps: true
});

// Global search (utils/search.js). Title weighted highest since it's the piece's own name and the
// thing someone searching for a project almost always remembers; tags next (deliberate, chosen
// labels); description and placement lowest, as free text that's more likely to match by accident.
ProjectSchema.index(
	{ title: 'text', description: 'text', tags: 'text', placement: 'text' },
	{ weights: { title: 10, tags: 5, description: 2, placement: 1 }, name: 'ProjectTextIndex' }
);

module.exports = mongoose.model('Project', ProjectSchema);
