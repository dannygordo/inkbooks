const mongoose = require('mongoose');

/**
 * One submitted, filled-out copy of a Form - see models/Form.js for the field definitions this
 * answers against.
 *
 * ---------------------------------------------------------------------------------------------
 * shopId/artistUserId ARE DENORMALIZED FROM THE FORM AT SUBMISSION TIME, not read through formId
 * on every access - same reasoning as every Expense row carrying its own shopId/artistUserId
 * rather than joining back through expenseTypeId. It means assertCanManageBusinessRecord (see
 * utils/shop-membership.js) works on a FormResponse exactly the way it already works on an
 * Expense, with no special-cased "look up the parent Form first" path, and a response's ownership
 * can never silently change out from under it if a Form were ever reassigned (it currently can't
 * be - there's no reassignment mutation - but this doesn't rely on that staying true).
 *
 * fieldsSnapshot IS A COPY OF Form.fields AS THEY WERE AT THE MOMENT OF SUBMISSION, not a live
 * reference. This is the load-bearing decision for a WAIVER specifically: what somebody agreed to
 * is whatever the form said the day they signed it, and answers.fieldKey values are matched
 * against THIS snapshot, never against the live Form - so editing a form's wording, options, or
 * which fields are required later can never retroactively change what an already-submitted
 * response is interpreted as having asked. getForm always returns the live Form for someone
 * building/re-sending it; getFormResponse always resolves display labels through its own
 * fieldsSnapshot, not through Form.findById.
 *
 * clientId IS ALWAYS SET, even for a guest submission - a form filled out with no prior account
 * still goes through findOrCreateGuestClient (see utils/guest-client.js, and
 * resolvers/forms.js's submitFormResponse), the same real find-or-create-by-email BookingRequest
 * already relies on, rather than this model inventing a second, parallel notion of "a person with
 * no Client record." `source` below is what actually distinguishes how it was collected.
 * ---------------------------------------------------------------------------------------------
 */

const FormAnswerSchema = new mongoose.Schema(
  {
    // Matches a key in fieldsSnapshot below, NOT necessarily a key still present on the live
    // Form - see this file's own header comment.
    fieldKey: { type: String, required: true },
    // Exactly one of these is meaningful per answer, chosen by the matching field's type - see
    // resolvers/forms.js's submitFormResponse for where a value lands in the wrong slot (e.g. a
    // date on a short_text field) is refused rather than silently accepted into the wrong column.
    textValue: { type: String, default: null },
    // Holds the selected option(s) for BOTH single_choice (one entry) and multi_choice (one or
    // more) - one shape for "this field's answer is a subset of its options" rather than two
    // near-identical fields differing only in how many entries are allowed.
    selectedOptions: { type: [String], default: [] },
    dateValue: { type: Date, default: null },
    fileUrls: { type: [String], default: [] },
    // A TYPED signature only - see models/Form.js's own note on 'signature' under FORM_FIELD_TYPES
    // for why this is not a drawn/canvas signature, and HANDOFF.md for the deferred upgrade.
    // signedName is what the signer typed, shown back to them before submitting; signedAt is
    // captured server-side (Date.now at submission), never trusted from the client - a
    // client-supplied timestamp on a legal consent record is exactly the kind of fact this app
    // must be the source of truth for, not the browser.
    signature: {
      signedName: { type: String, default: null },
      signedAt: { type: Date, default: null },
    },
  },
  { _id: false },
);

// The same shape as Form.js's own FormFieldSchema, duplicated rather than imported. Deliberately:
// importing Form's live schema here would make a snapshot only AS static as Form.js's schema
// happens to stay - the whole point of a snapshot is that it doesn't move when the original does.
// A future field added to Form's field definition (say, a per-field placeholder string) should
// not silently start appearing on old snapshots that were never asked about it.
const FormFieldSnapshotSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String, required: true },
    helpText: { type: String, default: '' },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
  },
  { _id: false },
);

const FormResponseSchema = new mongoose.Schema(
  {
    formId: { type: mongoose.Schema.Types.ObjectId, required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
    artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Copied from Form.title at submission time, for the same reason fieldsSnapshot exists - a
    // response list/export should still show a real title even if the Form it came from is later
    // renamed, archived, or (see resolvers/forms.js's deleteForm - refused once responses exist)
    // was somehow removed.
    formTitle: { type: String, required: true },
    fieldsSnapshot: { type: [FormFieldSnapshotSchema], default: [] },
    clientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    answers: { type: [FormAnswerSchema], default: [] },
    // Who actually typed the answers in, distinct from whose Client record this is filed under
    // (almost always the same person, but not necessarily - staff can fill out an intake form
    // while the client is standing at the counter). Set from the resolved caller/guest User._id.
    submittedByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Captured the same way routes/bookingUploads.js/createBookingRequest already capture an
    // anonymous caller's address (see utils/rate-limit.js's getClientIp) - part of the audit trail
    // for a signature field specifically; not used for anything else.
    submitterIp: { type: String, default: null },
    // UI-categorization only, mirroring BookingRequest.source's own comment on why it exists and
    // why it's trusted rather than enforced: staff_entered (typed in by shop staff on the client's
    // behalf), client_authenticated (the client, logged into their own account), guest_public (a
    // public link, no account existed yet until findOrCreateGuestClient ran).
    source: {
      type: String,
      required: true,
      enum: ['staff_entered', 'client_authenticated', 'guest_public'],
    },
    createdAt: { type: Date, required: true, default: Date.now },
  },
);

FormResponseSchema.index({ formId: 1, createdAt: -1 });
FormResponseSchema.index({ shopId: 1, createdAt: -1 });
FormResponseSchema.index({ artistUserId: 1, createdAt: -1 });
FormResponseSchema.index({ clientId: 1 });

module.exports = mongoose.model('FormResponse', FormResponseSchema);
