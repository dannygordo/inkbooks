const mongoose = require('mongoose');

/**
 * A booking confirmation owed to a client, waiting to be sent.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A QUEUE ROW AND NOT JUST AN EMAIL
 *
 * An artist booking a course of work enters four sittings in a row. Sending on each one means four
 * emails in ninety seconds, three of which are already out of date when they arrive - and the
 * client has to work out which is current. So the send is deferred and COALESCED: one row per
 * project, and booking another sitting pushes that row's deadline forward rather than adding a
 * second row.
 *
 * THE PROJECT IS THE COALESCING KEY, not the appointment and not the artist. The thing being
 * announced is "here is your schedule for this piece", and a schedule belongs to the piece.
 *
 * WHY NOTHING ABOUT THE CONTENT IS STORED HERE
 *
 * Only the ids. The email is rendered from live data at SEND time, which is the entire point - a
 * row written when sitting one was booked has to describe sittings one through four by the time it
 * goes out. This is deliberately the opposite of models/Notification.js, which stores its title and
 * body precisely so that a later copy change cannot rewrite what somebody was already told. The
 * difference is that a Notification records something that happened, and this promises something
 * that is still being assembled.
 * ---------------------------------------------------------------------------------------------
 */
const clientScheduleEmailSchema = new mongoose.Schema({
  // UNIQUE AMONG PENDING ROWS ONLY - see the partial index below.
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // Who is being told, and about whose work. Denormalised so a send needs no traversal back
  // through the project to find a recipient, and so a row remains sendable if the artist is later
  // reassigned - the person told is the person who was told.
  clientUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  artistUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // The intake form behind this work, for the "here is what you asked for" section. Nullable: a
  // project can exist without one.
  bookingRequestId: { type: mongoose.Schema.Types.ObjectId },

  // Pushed forward every time another sitting is booked. That push IS the debounce.
  sendAfter: { type: Date, required: true },

  status: {
    type: String,
    required: true,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
  },
  sentAt: { type: Date },
  error: { type: String },

  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

// The sweep's query: what is due, oldest deadline first.
clientScheduleEmailSchema.index({ status: 1, sendAfter: 1 });

/**
 * ONE PENDING ROW PER PROJECT, enforced by the database rather than by the code that writes it.
 *
 * PARTIAL, on status: 'pending', and that is the whole design. A plain unique index on projectId
 * would mean a project could only ever be announced ONCE - so a fifth sitting added three weeks
 * later, after the first email had gone, could never produce a second. Scoping uniqueness to the
 * pending rows says exactly what is meant: never two emails in flight for the same piece, always
 * able to send again later.
 *
 * The uniqueness matters because the queue function is an upsert. Under a race - two sittings saved
 * at the same instant - two upserts could both miss the existing row and both insert; the index is
 * what turns that into a duplicate-key error instead of two emails.
 */
clientScheduleEmailSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

const ClientScheduleEmail = mongoose.model('ClientScheduleEmail', clientScheduleEmailSchema);

// How long to wait after the LAST sitting is booked. Named, because it is a guess about how long
// an artist takes to enter the next one, and it should cost one edit when it turns out to be wrong.
ClientScheduleEmail.DEBOUNCE_MS = 3 * 60 * 1000;

module.exports = ClientScheduleEmail;
