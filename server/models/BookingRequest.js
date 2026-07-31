const mongoose = require('mongoose');
const IBImageSchema = require('./IBImage');

// See PRODUCTION_ROADMAP.md's "Booking request & guest correspondence" section for the full
// design this implements.
//
// artistId stores the artist's *User* _id, not the Artist collection's own _id - matching the
// same convention Project.artistId already uses (see the note in mutations/projects.js).
//
// guestToken is the client's only way into this conversation - no login, no app. It stays valid
// indefinitely UNLESS the underlying User has since set a real password (hasSetPassword becomes
// true), at which point it must stop working and the person should log in normally instead - see
// utils/guest-auth.js for where that check actually happens. It intentionally has no separate
// time-based expiry: it keeps working even after the request converts into a real
// Project/Appointment, so the same conversation can continue (e.g. aftercare questions) without
// the client needing a second link.
const BookingRequestSchema = new mongoose.Schema(
  {
    artistId: { type: mongoose.Schema.Types.ObjectId, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    guestToken: { type: String, required: true, unique: true },
    // pending -> consult_booked | session_booked | declined. Deliberately not reusing Project's
    // status enum (open/in_progress/waitlist/cancelled/completed) - a booking request that's
    // still being discussed isn't a project yet, and forcing it into that enum has no good fit.
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: ['pending', 'consult_booked', 'session_booked', 'declined'],
    },
    description: { type: String, required: true },
    referenceImages: { type: [IBImageSchema] },
    placement: { type: String },
    size: { type: String },
    budget: { type: String },
    availability: { type: String },
    isCoverUp: { type: Boolean, default: false },
    howHeard: { type: String },
    // Set once the artist converts this request into a real Appointment (consult or session).
    resultingAppointmentId: { type: mongoose.Schema.Types.ObjectId },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('BookingRequest', BookingRequestSchema);
