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
    // Which shops have worked with this person. Append-only, many-to-many, and deliberately NOT a
    // single `shopId`.
    //
    // `email` above is unique across the whole collection, so there is exactly one Client row per
    // person for the entire platform - a person tattooed at two shops shares one record, and
    // literally cannot have a second. A singular shopId on a globally-unique record would be wrong
    // the moment a second shop worked with them, and would also contradict the artist-centric
    // model, where a client follows the ARTIST between shops rather than belonging to a shop.
    //
    // This exists to answer "is this your client?" without falling back to a bare role check. It
    // is not the only answer: an independent artist has no shop at all, so their clients are
    // reached through the shared-Project join instead. See canAccessClient in
    // utils/shop-membership.js - both paths are real, neither is a fallback for the other.
    //
    // Appended wherever a client first meets a shop: the client wizard, the public booking form,
    // and project creation. Never removed - a shop that has worked with someone keeps the ability
    // to see their own history with them.
    shopIds: {type: [mongoose.Schema.Types.ObjectId], default: []},
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


