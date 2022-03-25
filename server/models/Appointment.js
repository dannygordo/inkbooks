const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
	appointmentDate: {type: Date, required: true},
	projectId: {type: mongoose.Schema.Types.ObjectId},
	shopId: {type: mongoose.Schema.Types.ObjectId},
	userId: {type: mongoose.Schema.Types.ObjectId},
	title: {type: String},
	description: {type: String},
	total: {type: Number, default: 0},
	tip: {type: Number, default: 0},
	shopCutStatus: {type: String, required: true},
	appointmentType: {type: String, required: true},
	appointmentStatus: {type: String, required: true},
    createdAt: {type: Date, required: true},
    updatedAt: {type: Date, required: true}

});
module.exports = mongoose.model('Appointment', AppointmentSchema);