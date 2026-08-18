const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A form a shop or independent artist builds and sends to clients - a consent form, a waiver, a
 * custom intake questionnaire. Deliberately separate from BookingRequest (see
 * mutations/bookingRequests.js) - that pipeline is its own working, purpose-built flow
 * (client-lookup -> intake -> convert-to-appointment) and this feature doesn't touch it. "Booking
 * requests" as a form TYPE, mentioned when this was scoped, is not the same thing as the existing
 * BookingRequest model/mutations, and nothing here replaces or migrates that.
 *
 * OWNERSHIP matches Expense/Income exactly (see models/Expense.js and
 * utils/shop-membership.js's resolveBusinessOwner/assertCanManageBusinessRecord, reused as-is
 * here rather than re-implemented): shopId XOR artistUserId, never both, never neither. A form is
 * either a shop's (shared across every artist there, shop-admin managed) or an independent/
 * shop-affiliated artist's own.
 *
 * FIELDS ARE EMBEDDED, not a separate collection - a form's fields are only ever read and edited
 * together with the form itself, and nothing needs to query across all fields of all forms. Order
 * is the array's own order; there is no separate `order` number to keep in sync with it.
 *
 * EACH FIELD HAS A STABLE `key`, generated once and never reused - see FormResponse.js for why
 * this matters: a response's answers are keyed by this, not by array position or by the field's
 * current label, so re-labeling a field or reordering the form doesn't orphan or misattribute a
 * historical answer.
 */

const FORM_FIELD_TYPES = [
  'short_text',
  'paragraph',
  'single_choice',
  'multi_choice',
  'date',
  'file_upload',
  // A TYPED signature - full name + timestamp, captured and shown back to the signer before they
  // submit (see resolvers/forms.js's submitFormResponse). This is NOT a drawn/canvas signature
  // pad - deliberately deferred, see HANDOFF.md - so treat this as "meaningful e-signature
  // consent", not as strong biometric proof of identity.
  'signature',
];

const FORM_STATUSES = ['draft', 'published', 'archived'];

const FormFieldSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      default: () => crypto.randomUUID(),
    },
    type: { type: String, required: true, enum: FORM_FIELD_TYPES },
    label: { type: String, required: true },
    helpText: { type: String, default: '' },
    required: { type: Boolean, default: false },
    // Only meaningful for single_choice/multi_choice - see utils/validation.js's
    // formFieldInputSchema for where an empty list on a choice field is refused at write time.
    options: { type: [String], default: [] },
  },
  { _id: false },
);

const FormSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
    artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: { type: String, required: true, default: 'draft', enum: FORM_STATUSES },
    // When true, an unauthenticated visitor holding this form's publicToken (below) may submit a
    // response - the same "someone hasn't got an account yet" case createBookingRequest already
    // handles, via the same findOrCreateGuestClient (see resolvers/forms.js). When false, only an
    // authenticated caller (staff filling it out with a client present, or a client filling out
    // their own account's copy) may submit. Per-form, not per-shop - a shop can have both a public
    // waiver link and an internal-only intake form at the same time.
    allowGuestSubmissions: { type: Boolean, default: false },
    // Set once, the first time allowGuestSubmissions turns on (see setFormGuestAccess in
    // resolvers/forms.js) - not regenerated on every toggle, so a link already handed to a client
    // or printed on a card keeps working if guest access is turned off and back on later. Sparse
    // unique index: most forms never have one.
    publicToken: { type: String, default: null },
    fields: { type: [FormFieldSchema], default: [] },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true },
);

FormSchema.index({ shopId: 1, status: 1 });
FormSchema.index({ artistUserId: 1, status: 1 });
FormSchema.index(
  { publicToken: 1 },
  { unique: true, partialFilterExpression: { publicToken: { $type: 'string' } } },
);

const Form = mongoose.model('Form', FormSchema);

Form.FIELD_TYPES = FORM_FIELD_TYPES;
Form.STATUSES = FORM_STATUSES;
// Field types whose answer is a fixed set of choices, from the field's own `options` - shared
// between the write-time validator (a submitted value must be one of these) and the analytics
// resolver (which can count per-option, unlike a free-text field).
Form.CHOICE_FIELD_TYPES = ['single_choice', 'multi_choice'];

module.exports = Form;
