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

// The two forms every shop and independent artist is auto-provisioned with (see
// utils/seed-default-forms.js) - non-deletable (deleteForm refuses any systemKey-marked form) and
// always present in a forms list even though nobody explicitly created them.
//
// 'booking_request' does NOT drive the real BookingRequest pipeline (createBookingRequest, the
// BookingRequest model, /book/:artistHandle) - that stays completely untouched, byte for byte, per
// explicit decision. This systemKey exists only so the pipeline's fixed set of optional intake
// fields (placement/size/budget/availability/howHeard/isCoverUp/referenceImages) can be reordered,
// relabeled, required-toggled and hidden through a RESTRICTED editor - see resolvers/forms.js's
// updateBookingRequestFields (not updateForm, which allows adding/removing/retyping fields the
// real pipeline has no way to honor).
const SYSTEM_KEYS = ['booking_request', 'consent'];

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
    // NOT settable through the generic createForm/updateForm (FormFieldInput has no hidden
    // argument at all) - a generic form's only way to remove a field is to actually remove it.
    // This exists ONLY for the booking_request system form's fixed 7-slot set, where deletion
    // isn't possible (the real BookingRequestInput always has all seven), so "don't ask this
    // question" has to mean something other than "the field is gone" - see resolvers/forms.js's
    // updateBookingRequestFields, the one write path that ever sets this to true.
    hidden: { type: Boolean, default: false },
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
    // The first path segment of this form's public link (/<slug>/<ownerHandle>) - see
    // utils/form-slug.js's own header comment for the full design, including why "inactive" is
    // just any non-'published' status rather than a separate field: setFormStatus (publishForm/
    // archiveForm) is already the single lever, and a second flag would only be able to disagree
    // with it. Validated + scoped-uniqueness-checked via utils/form-slug.js. Not required at the
    // schema level - a brand-new draft form has nothing to link to yet, and forced to pick one
    // before writing a single field would just be friction with no form behind it yet.
    slug: { type: String, default: null, lowercase: true, trim: true },
    // True only on a shop-owned form (shopId set). Excludes the form from every affiliated
    // artist's own forms list/links (see resolvers/forms.js's getForms), and gives it ONE
    // shop-wide public link (/<slug>/<Shop.formSlug>) instead of one per artist - the shop's own
    // waiver-at-the-front-desk case, where there is no single artist to attach the link to.
    // Meaningless (and left false) on an artist-owned form.
    shopUseOnly: { type: Boolean, default: false },
    // Marks one of the two forms every shop/artist is auto-provisioned with (utils/
    // seed-default-forms.js) - null for every ordinary form a shop or artist builds themselves.
    // deleteForm refuses any form with a systemKey set (resolvers/forms.js) - these two are not
    // deletable, only editable, per explicit decision. See FORM_STATUSES/SYSTEM_KEYS comment above
    // for why 'booking_request' does not touch the real BookingRequest pipeline.
    systemKey: { type: String, default: null, enum: [...SYSTEM_KEYS, null] },
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
// Scoped slug uniqueness - TWO partial indexes, not one, because ownership is XOR (shopId is null
// on every artist-owned form and vice versa) and a single compound index across both fields can't
// express "unique within whichever of these two is actually set." See utils/form-slug.js's own
// header comment for why this is scoped per-owner rather than global. The real guarantee behind
// utils/form-slug.js's isSlugAvailable courtesy check - same pattern as publicToken above.
FormSchema.index(
  { shopId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' }, slug: { $type: 'string' } } },
);
FormSchema.index(
  { artistUserId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' }, slug: { $type: 'string' } } },
);
// One booking_request and one consent form per owner - guards the seed script (utils/
// seed-default-forms.js) against ever double-provisioning either default, the same way the slug
// indexes above guard against two forms colliding on a link.
FormSchema.index(
  { shopId: 1, systemKey: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' }, systemKey: { $type: 'string' } } },
);
FormSchema.index(
  { artistUserId: 1, systemKey: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' }, systemKey: { $type: 'string' } } },
);

const Form = mongoose.model('Form', FormSchema);

Form.FIELD_TYPES = FORM_FIELD_TYPES;
Form.STATUSES = FORM_STATUSES;
// Field types whose answer is a fixed set of choices, from the field's own `options` - shared
// between the write-time validator (a submitted value must be one of these) and the analytics
// resolver (which can count per-option, unlike a free-text field).
Form.CHOICE_FIELD_TYPES = ['single_choice', 'multi_choice'];
Form.SYSTEM_KEYS = SYSTEM_KEYS;

module.exports = Form;
