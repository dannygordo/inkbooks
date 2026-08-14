const mongoose = require('mongoose');

/**
 * The audit trail: who did what, to which record, and when.
 *
 * SCOPE IS DELIBERATE, NOT ACCIDENTAL. This does not capture every CRUD operation on every model -
 * that would be mostly noise (a notification preference toggle, a session-timer start/stop) and
 * would cost real storage forever on data nobody is ever going to look up. It captures the three
 * categories worth being able to answer "who changed this, and when" about: money (deposits, shop
 * cuts, Square charges), appointments, and client records. Widening this later is a one-line
 * decision at each new call site - see utils/event-log.js's recordEvent() - not a schema change.
 *
 * APPEND-ONLY. Nothing in this codebase ever updates or deletes a row here - an audit record that
 * could itself be silently edited after the fact isn't an audit record. There is deliberately no
 * `updatedAt`.
 *
 * WHY entityType/entityId RATHER THAN A REFERENCE PER MODEL: one collection, one index shape, one
 * query path for "show me everything that happened to this record" regardless of which kind of
 * record it is - a `getEventLogs(filter: { entityType, entityId ... })` doesn't need a different
 * resolver per entity kind. entityType is a plain string naming the Mongoose model ('Appointment',
 * 'Client', 'ShopCutRate'), not a Mongoose ref - there is no single collection every entityId could
 * point into.
 *
 * WHY `changes` INSTEAD OF STORING THE WHOLE BEFORE/AFTER DOCUMENT: a full snapshot on every save
 * duplicates the entire record (including large, sensitive fields like Client.notes) into a second
 * collection nobody meant to be a second copy of the data. A field-level diff says exactly what
 * changed and nothing else - and callers writing about sensitive freeform text (client notes, a
 * redaction) can and do log a summary with no diff at all rather than duplicate the content here.
 * See mutations/clients.js's updateClientNotes/redactClient for that decision made explicitly.
 */
const eventLogChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    // Mixed on purpose - a changed field can be a string, a number (money, in cents), a date, or
    // an id. Stored as whatever diffFields() was handed, unconverted - a viewer needs the real
    // type to format money/dates correctly, not a pre-stringified value. See diffFields()'s own
    // comment on how two values are compared for equality without changing what gets stored.
    from: { type: mongoose.Schema.Types.Mixed },
    to: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const eventLogSchema = new mongoose.Schema({
  // The Mongoose model name this event is about - 'Appointment', 'Client', 'ShopCutRate', etc.
  // A plain string, not a Mongoose ref: there is no single collection entityId always points into.
  entityType: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, required: true, enum: ['create', 'update', 'delete'] },
  // Who did it. Denormalized to actorName at write time (see event-log.js) rather than resolved
  // via a GraphQL field on read, so a viewer's name change or later deletion doesn't rewrite what
  // history says they did - the same reasoning models/Notification.js already documents for its
  // own stored title/body.
  actorUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorName: { type: String, required: true },
  // Which shop this event belongs to, for shop-scoped queries (a shop admin sees their own shop's
  // history, not the platform's). Absent for an independent artist's own data - there is no shop
  // to scope to, the same "no shop, no admin above them" fact utils/shop-membership.js's
  // hasAdminAuthority already treats as first-class rather than as a missing value.
  shopId: { type: mongoose.Schema.Types.ObjectId },
  // A human-readable one-liner - "Marked shop cut paid manually", "Charged $85.00 via Square card
  // payment" - for actions that are more than a flat field diff, and as a readable label even when
  // there is one. Required so a viewer never renders a bare, unexplained diff.
  summary: { type: String, required: true },
  changes: { type: [eventLogChangeSchema], default: [] },
  createdAt: { type: Date, required: true, default: Date.now },
});

// The two questions this collection actually gets asked: "what happened to this one record" and
// "what happened at this shop, most recently first".
eventLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
eventLogSchema.index({ shopId: 1, createdAt: -1 });
eventLogSchema.index({ actorUserId: 1, createdAt: -1 });

module.exports = mongoose.model('EventLog', eventLogSchema);
