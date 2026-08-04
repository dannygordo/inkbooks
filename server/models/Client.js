const mongoose = require('mongoose');
const IBNoteSchema = require('./IBNote');

const ClientSchema = new mongoose.Schema({
    firstName: {type: String, required: true},
    lastName: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    phone: {type: String, default: ""},
    address: {type: String, default: ""},
    city: {type: String, default: ""},
    state: {type: String, default: ""},
    zip: {type: String, default: ""},
    instagram: {type: String, default: ""},
    facebook: {type: String, default: ""},
    avatar: {type: String, default: ""},
    userId: {type: mongoose.Schema.Types.ObjectId, required: true},
    // Notes about the client, as opposed to Project.notes (about one piece of work) or
    // Appointment.sessionNotes (about one sitting). Same embedded IBNote sub-document those two
    // already use - allergies, how they handle long sittings, healing history, anything that
    // outlives a single project.
    //
    // Deliberately shop-side, not client-visible: see the note on Client.notes in
    // graphql/typeDefs.js. A shop needs to be able to write "cancels a lot" without that being a
    // message to the client.
    notes: {type: [IBNoteSchema]}

}, {
    timestamps: true
});
module.exports = mongoose.model('Client', ClientSchema);


