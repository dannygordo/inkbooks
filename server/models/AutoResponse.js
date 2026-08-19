const mongoose = require('mongoose');

/**
 * A message template a shop or artist owns - aftercare instructions, a receipt note, an
 * out-of-studio notice. Either fired automatically on a lifecycle event (trigger !== 'MANUAL',
 * enabled: true) or kept purely as a library entry to attach/send by hand (see
 * utils/auto-responses.js's sendManualAutoResponse).
 *
 * ---------------------------------------------------------------------------------------------
 * OWNERSHIP matches Expense/Income/Form exactly (see utils/shop-membership.js's
 * resolveBusinessOwner/assertCanManageBusinessRecord, reused as-is): shopId XOR artistUserId,
 * never both, never neither. UNLIKE Expense/Income, a shop-connected artist does not choose one
 * scope over the other here - they own BOTH a personal set (artistUserId) and, through their
 * shop membership, see the shop's own set (shopId) at the same time. See
 * utils/auto-responses.js's resolveAutoResponseForTrigger for how the two coexist: the artist's
 * own enabled response for a trigger wins, the shop's fires only when the artist has none.
 *
 * WHY `enabled` IS FORCED FALSE FOR trigger: 'MANUAL' - a MANUAL row never fires on its own (see
 * the trigger enum below), so "enabled" has no automatic-firing meaning for one. Forcing it false
 * rather than letting it float also sidesteps a real MongoDB limitation: the uniqueness rule
 * below ("at most one ENABLED non-MANUAL response per owner per trigger") would otherwise need a
 * partialFilterExpression that excludes trigger: 'MANUAL', but partial indexes only support
 * $eq/$exists/$gt/$gte/$lt/$lte/$type/$and - no $ne, $in, or $or. Because MANUAL rows can never
 * be enabled, a plain `enabled: true` partial filter already excludes every one of them without
 * needing an operator Mongo doesn't offer.
 *
 * DEACTIVATED, NOT DELETED - same convention as ClientFlagType/ExpenseType/Form: an
 * AutoResponseLog row references one of these by id, so removing the document out from under it
 * would orphan the log. `active: false` removes it from both the settings list and the manual
 * send picker while every historical log entry still resolves back to it.
 *
 * trigger: 'MESSAGE_RECEIVED' - fires once per incoming client message on a conversation with
 * exactly one non-client (artist) member, same precedence rule as every other automatic trigger.
 * See utils/auto-responses.js's sendAutoResponseForIncomingMessage for the resolution/dedup logic
 * and mutations/messages.js's createMessage for the call site. Unlike the other two automatic
 * triggers, this one both posts a real Message into the thread (so the client sees the reply
 * in-app, same as a human reply) AND, per its own emailEnabled/smsEnabled toggles, sends a
 * standalone email/SMS - an away-message is meant to reach someone who isn't actively watching the
 * thread, which is exactly the case in-app-only can't cover.
 * ---------------------------------------------------------------------------------------------
 */

const AUTO_RESPONSE_TRIGGERS = ['SESSION_COMPLETED', 'PAYMENT_RECEIVED', 'MESSAGE_RECEIVED', 'MANUAL'];

const autoResponseSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
    artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true, trim: true },
    trigger: { type: String, required: true, enum: AUTO_RESPONSE_TRIGGERS },
    // Governs automatic firing only - see decision #8 in the plan this shipped from. A row stays
    // visible in the manual "Send a message" picker as long as `active` is true, regardless of
    // this flag. Always false for trigger: 'MANUAL' - see header comment.
    enabled: { type: Boolean, required: true, default: false },
    emailEnabled: { type: Boolean, required: true, default: true },
    smsEnabled: { type: Boolean, required: true, default: false },
    // Null means "use the built-in default" - same convention as ReminderSettings' own template
    // fields (see utils/auto-responses.js's DEFAULT_TEMPLATES). Merge fields:
    // {{clientFirstName}}, {{artistName}}, {{appointmentDate}}, {{appointmentTime}}.
    emailSubjectTemplate: { type: String, default: null },
    emailBodyTemplate: { type: String, default: null },
    smsTemplate: { type: String, default: null },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// Forced, not merely defaulted - a client that sends { trigger: 'MANUAL', enabled: true } would
// otherwise silently bypass the uniqueness guarantee below. See header comment for why this is
// the enforcement point rather than a $ne in the partial index.
autoResponseSchema.pre('validate', function forceManualDisabled() {
  if (this.trigger === 'MANUAL' && this.enabled) {
    this.enabled = false;
  }
});

// Decision #5: at most one ENABLED non-MANUAL response per owner per trigger. Enforced by the
// database, not just checked in the resolver - same belt-and-suspenders standard as every other
// uniqueness rule in this codebase (see models/Expense.js's recurringExpenseId+date index).
// `enabled: true` alone is sufficient to exclude every MANUAL row - see header comment.
autoResponseSchema.index(
  { shopId: 1, trigger: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' }, enabled: true } },
);
autoResponseSchema.index(
  { artistUserId: 1, trigger: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' }, enabled: true } },
);
// List queries - getAutoResponses scoped to one owner, active-only by default.
autoResponseSchema.index({ shopId: 1, active: 1 });
autoResponseSchema.index({ artistUserId: 1, active: 1 });

const AutoResponse = mongoose.model('AutoResponse', autoResponseSchema);

AutoResponse.TRIGGERS = AUTO_RESPONSE_TRIGGERS;

module.exports = AutoResponse;
