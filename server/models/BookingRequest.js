const mongoose = require('mongoose');

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
    // pending -> consult_booked -> session_booked | not_booked, or pending -> session_booked
    // directly (some sessions get booked with no separate consult), or pending -> declined.
    // Deliberately not reusing Project's status enum (open/in_progress/waitlist/cancelled/
    // completed) - a booking request that's still being discussed isn't a project yet, and
    // forcing it into that enum has no good fit.
    //
    // declined vs not_booked are deliberately separate terminal states, not one shared "closed"
    // value: declined means the artist never even had the consult (turned the request away
    // outright); not_booked means the consult happened and the client chose not to move forward
    // afterward. Same practical effect (nothing further happens with this request), but different
    // enough in the real-world funnel - "declined before a consult" vs. "had a consult, went
    // cold" - that collapsing them would lose information an artist would want when reviewing
    // their own booking-request history. See mutations/bookingRequests.js's convertBookingRequest
    // for the actual transition guard that enforces which of these are reachable from which.
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: ['pending', 'consult_booked', 'session_booked', 'declined', 'not_booked'],
    },
    description: { type: String, required: true },
    // Plain URL strings, not [IBImageSchema] - see the matching comment in graphql/typeDefs.js
    // (BookingRequest.referenceImages) for why: IBImage requires a real userId, which doesn't
    // exist yet at the point a guest uploads these, before their User/Client record is created.
    referenceImages: { type: [String] },
    placement: { type: String },
    size: { type: String },
    budget: { type: String },
    availability: { type: String },
    isCoverUp: { type: Boolean, default: false },
    howHeard: { type: String },
    // Set once the artist converts this request into a real Appointment (consult or session).
    resultingAppointmentId: { type: mongoose.Schema.Types.ObjectId },
    // Distinguishes a genuine public-intake-form submission from a BookingRequest the
    // createBookingRequest/convertBookingRequest pipeline generates internally when an artist
    // schedules a consult or brand-new-project session directly from their own calendar
    // (AppointmentWizard.jsx) - both go through the exact same mutations for one consistent
    // find-or-create-client + convert-to-Appointment/Project code path, but only the former
    // should ever show up in the artist's own "Booking Requests" inbox (see
    // resolvers/bookingRequests.js's getBookingRequests, which filters on this) - an artist
    // manually creating their own appointment shouldn't see it echoed back at them as if a
    // stranger had submitted it. Not a security boundary (an artist could tag their own
    // submission either way with no consequence beyond which of their own dashboard lists it
    // shows up in) - just a UI-categorization field, so the client is trusted to set it honestly.
    source: {
      type: String,
      required: true,
      default: 'public_form',
      enum: ['public_form', 'artist_created'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('BookingRequest', BookingRequestSchema);
