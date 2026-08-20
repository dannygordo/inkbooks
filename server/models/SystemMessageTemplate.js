const mongoose = require('mongoose');

/**
 * Feature 2 - "all content within a message that is auto generated or responded to in the
 * system should be manageable." An owner-editable override for one of the app's hardcoded
 * outbound emails - see utils/system-message-templates.js for the built-in defaults every key
 * falls back to and the precedence rule, and DECISIONS.md for the two identity/security emails
 * (account invite, password reset) that were deliberately left OUT of this system entirely - see
 * that file for why.
 *
 * ---------------------------------------------------------------------------------------------
 * OWNERSHIP matches AutoResponse/ResponseTimeSettings: shopId XOR artistUserId, never both, never
 * neither (see utils/shop-membership.js's resolveBusinessOwner/assertCanManageBusinessRecord,
 * reused as-is).
 *
 * UNLIKE ResponseTimeSettings, THIS IS NOT LAZILY CREATED WITH DEFAULTS ON READ. A row here means
 * "this owner has actually overridden this key" - its absence IS the built-in default, not a
 * value waiting to be filled in. Resetting a key back to the built-in default therefore deletes
 * the row (see resolvers/systemMessageTemplates.js's resetSystemMessageTemplate) rather than
 * writing null fields onto it - simpler than AutoResponse's null-means-default-per-field
 * convention, and correct here because every field on this model is *only* ever an override.
 *
 * ONE ROW PER (owner, key) - an owner can override BOOKING_REQUEST_RECEIVED without touching
 * NEW_MESSAGE_TO_ARTIST, so the key is part of the uniqueness, not a separate document per owner
 * the way ResponseTimeSettings is.
 * ---------------------------------------------------------------------------------------------
 */
const SYSTEM_MESSAGE_KEYS = [
  'BOOKING_REQUEST_RECEIVED',
  'NEW_MESSAGE_TO_GUEST',
  'NEW_MESSAGE_TO_ARTIST',
  'NEW_BOOKING_REQUEST_TO_ARTIST',
  'SHOP_CUT_MARKED_PAID',
  'SHOP_CUT_CONFIRMED',
  'BOOKING_CONFIRMATION',
];

const systemMessageTemplateSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
    artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    key: { type: String, required: true, enum: SYSTEM_MESSAGE_KEYS },
    // Null/omitted means "use the built-in default for this field" - same convention as
    // AutoResponse's own template fields. BOOKING_CONFIRMATION only ever uses
    // emailSubjectTemplate + extraNoteTemplate (see utils/client-booking-emails.js's own comment
    // on why its body stays code-generated) - the other keys use emailSubjectTemplate +
    // emailBodyTemplate and leave extraNoteTemplate null.
    emailSubjectTemplate: { type: String, default: null },
    emailBodyTemplate: { type: String, default: null },
    extraNoteTemplate: { type: String, default: null },
    setByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

// One row per (owner, key) - enforced by the database, same belt-and-suspenders standard as
// every other uniqueness rule in this codebase.
systemMessageTemplateSchema.index(
  { shopId: 1, key: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } },
);
systemMessageTemplateSchema.index(
  { artistUserId: 1, key: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' } } },
);
// The settings screen's list query - every override an owner has, in one query.
systemMessageTemplateSchema.index({ shopId: 1 });
systemMessageTemplateSchema.index({ artistUserId: 1 });

const SystemMessageTemplate = mongoose.model('SystemMessageTemplate', systemMessageTemplateSchema);

SystemMessageTemplate.KEYS = SYSTEM_MESSAGE_KEYS;

module.exports = SystemMessageTemplate;
