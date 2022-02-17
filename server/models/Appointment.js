const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
	appointmentDate: {type: Date, required: true},
	projectId: {type: mongoose.Schema.Types.ObjectId, required: true},
	artistUserId: {type: mongoose.Schema.Types.ObjectId, required: true},
	clientUserId: {type: mongoose.Schema.Types.ObjectId, required: true},
	total: {type: Number, default: 0},
	tip: {type: Number, default: 0},
	shopCutStatus: {type: Number, required: true},
	appointmentType: {type: String, required: true},
	appointmentStatus: {type: String, required: true}

}, {
	timestamps: true
});
module.exports = mongoose.model('Appointment', AppointmentSchema);