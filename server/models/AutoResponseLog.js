const mongoose = require('mongoose');

/**
 * One row per Auto-Response send attempt - both the dedup key for an automatic send and the
 * audit trail for both automatic and manual ones. Mirrors ReminderLog.js's own shape and
 * reasoning almost exactly (see that model's header comment for the fuller case for
 * claim-before-send); the differences below are just what Auto-Responses needs that a fixed
 * appointment-reminder schedule didn't.
 *
 * ---------------------------------------------------------------------------------------------
 * appointmentId IS NULLABLE, UNLIKE ReminderLog's. A manual send (triggeredByUserId set) is not
 * always tied to one appointment - "Send a message" from a client's own page has no appointment
 * in play at all. But a manual send made FROM a session page (SessionDetail.jsx) legitimately
 * carries an appointmentId too, purely for audit context - so the unique dedup index below can't
 * just key off "does appointmentId exist," or a manual send with an appointmentId would collide
 * with a real automatic send (or with a second manual send for the same appointment). It's
 * additionally scoped to triggeredByUserId being null, which is only ever true for the automatic
 * path (sendAutoResponsesForTrigger never sets it) - so a manual send has no dedup constraint at
 * all regardless of whether it carries an appointmentId, matching decision #7/#8 in the plan this
 * shipped from: every manual send is a deliberate action, never something to collapse against a
 * previous one.
 *
 * ownerType RECORDS WHICH SET ACTUALLY FIRED, not which set the appointment's artist happens to
 * belong to. Once resolveAutoResponseForTrigger's precedence rule is in play (the artist's own
 * enabled response wins over the shop's), this is the only place that answers "did the shop's
 * policy fire, or the artist's own override?" after the fact.
 *
 * messageId IS THE THIRD DEDUP KEY, alongside appointmentId - one per incoming client message
 * (trigger: 'MESSAGE_RECEIVED'), same "claim before send" shape as appointmentId's own index just
 * below, just keyed to a Message instead of an Appointment. A client sending several messages in a
 * row gets a reply to each ONE of them, not one reply for the whole burst - see
 * sendAutoResponseForIncomingMessage's own comment on why that's the chosen behavior (matches a
 * real email out-of-office responder, which answers every inbound message, not once per
 * correspondent per day).
 *
 * channel: 'thread' IS NOT A DELIVERY CHANNEL IN THE EMAIL/SMS SENSE - it's the claim for "posted
 * this Auto-Response into the conversation itself," logged the same way so the exact same
 * claim-before-send protection applies to it (a retried mutation must not double-post the away
 * message into the thread any more than it should double-email it).
 * ---------------------------------------------------------------------------------------------
 */
const autoResponseLogSchema = new mongoose.Schema({
  autoResponseId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ownerType: { type: String, required: true, enum: ['SHOP', 'ARTIST'] },
  channel: { type: String, required: true, enum: ['email', 'sms', 'thread'] },
  status: { type: String, required: true, enum: ['sending', 'sent', 'skipped', 'failed'] },
  error: { type: String },
  sentAt: { type: Date },
  // Present for an automatic send (the appointment whose completion triggered it); null for a
  // manual one.
  appointmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  // Present for a MESSAGE_RECEIVED automatic send (the client message that triggered it); null
  // otherwise. Mutually exclusive with appointmentId in practice (a send is triggered by one event
  // or the other, never both), but not enforced as such here - nothing reads both at once.
  messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  // Present for a manual send (whoever picked the template and hit send); null for an automatic
  // one.
  triggeredByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
});

// THE dedup guarantee for the automatic (appointment-triggered) path - a second insert attempt for
// the same (response, appointment, channel) fails with a duplicate-key error, which
// sendAutoResponsesForTrigger reads as "already handled" and moves on. Partial on appointmentId
// existing AND triggeredByUserId being null, so it only ever matches a genuinely automatic row -
// see header comment for why "appointmentId exists" alone isn't a safe enough filter (a manual
// send can carry one too).
autoResponseLogSchema.index(
  { autoResponseId: 1, appointmentId: 1, channel: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appointmentId: { $type: 'objectId' },
      triggeredByUserId: { $eq: null },
    },
  },
);
// THE dedup guarantee for the message-triggered automatic path - same shape as the appointmentId
// index above, keyed to messageId instead. No triggeredByUserId exclusion needed here: nothing
// else in this file ever sets both messageId and triggeredByUserId, so there's no manual-send case
// this could wrongly collide with the way appointmentId's index has to guard against.
autoResponseLogSchema.index(
  { autoResponseId: 1, messageId: 1, channel: 1 },
  { unique: true, partialFilterExpression: { messageId: { $type: 'objectId' } } },
);
// The audit-trail read path - "every send this Auto-Response has made," most recent first.
autoResponseLogSchema.index({ autoResponseId: 1, createdAt: -1 });

module.exports = mongoose.model('AutoResponseLog', autoResponseLogSchema);
