const crypto = require('crypto');
const Form = require('../models/Form');

/**
 * Auto-provisions the two forms every shop and every INDEPENDENT artist is meant to always have -
 * see models/Form.js's SYSTEM_KEYS comment. Called from two places, both of which create a new
 * owner:
 *
 *   - mutations/shops.js's createShop and resolvers/users.js's registerAccount (shop branch) -
 *     shopId scope.
 *   - resolvers/users.js's registerAccount (the NO-shop / independent-artist branch only) -
 *     artistUserId scope.
 *
 * NOT called for a shop-affiliated artist (mutations/artists.js's createArtist, or an
 * independent artist who later joins a shop) - a shop-affiliated artist is covered by the SHOP's
 * own forms already: a shop-owned, non-shopUseOnly form produces one public link PER AFFILIATED
 * ARTIST (see resolvers/forms.js's public form resolver), so there is nothing for a second,
 * artist-owned copy to do. Only a genuinely independent artist - one with no shop to inherit
 * defaults from - needs their own.
 *
 * IDEMPOTENT and additive-only: checks for an existing systemKey before writing, and never
 * touches a systemKey form that's already there. This is what makes it safe to call from both a
 * live signup path AND a one-off migration script (scripts/migrate-seed-default-forms.js) without
 * the two ever fighting or double-provisioning - the same guarantee the partial unique index on
 * {shopId/artistUserId, systemKey} (models/Form.js) enforces as the real backstop.
 */

// 'consent' fields only - see resolvers/forms.js's submitFormResponse and utils/validation.js's
// submitFormResponseInputSchema for why firstName/lastName/email/phone are NOT here: those are
// captured outside Form.fields, the same guest-client path createBookingRequest already uses.
// Everything below is the CONSENT-SPECIFIC part of thecopperwolf.com/pages/consent-form: proof of
// ID, and an e-signature. The site's own "checkbox agree" + "Date" pair is deliberately not
// reproduced as a separate field - Form's signature type already IS "typed name + timestamp,
// shown back to the signer before submit" (see models/Form.js's own comment on FORM_FIELD_TYPES),
// which covers the same ground without a second, redundant control.
const CONSENT_FORM_FIELDS = [
  {
    type: 'file_upload',
    label: "Photo of driver's license or government-issued ID",
    required: true,
  },
  {
    type: 'signature',
    label: 'Signature',
    required: true,
  },
];

// The full legal text from thecopperwolf.com/pages/consent-form, captured verbatim (researched
// directly from the live page - see HANDOFF.md). Stored with blank lines between the intro and
// each point so the client's white-space: pre-line rendering (see forms.css's
// formDescriptionText class) reproduces the site's own paragraph/bullet structure without this
// needing to be markdown or HTML.
const CONSENT_FORM_DESCRIPTION = [
  'I acknowledge by signing this agreement that I have been given the full opportunity to ask any and all questions which I might have about the obtaining of a tattoo and that all of my questions have been answered to my full satisfaction. I specifically acknowledge I have been advised of the facts and matters set forth below and I agree as follows:',
  '• If I have any condition that might affect the healing of this tattoo, I will advise my tattooer. I am not pregnant or nursing. I am not under the influence of alcohol or drugs.',
  '• I do not have medical or skin conditions such as but not limited to: acne, scarring (Keloid) eczema, psoriasis, freckles, moles or sunburn in the area to be tattooed that may interfere with said tattoo. If I have any type of infection or rash anywhere on my body, I will advise my tattooer.',
  '• I acknowledge it is not reasonably possible for the representatives and employees of this tattoo shop to determine whether I might have an allergic reaction to the pigments or processes used in my tattoo, and I agree to accept the risk that such a reaction is possible.',
  '• I acknowledge that infection is always possible as a result of the obtaining of a tattoo, particularly in the event that I do not take proper care of my tattoo. I have received aftercare instructions and I agree to follow them while my tattoo is healing. I agree that any touch-up work needed, due to my own negligence, will be done at my own expense.',
  '• I realize that variations in color and design may exist between any tattoo as selected by me and as ultimately applied to my body. I understand that if my skin color is dark, the colors will not appear as bright as they do on light skin.',
  '• I understand that if I have any skin treatments, laser hair removal, plastic surgery or other skin altering procedures, it may result in adverse changes to my tattoo.',
  '• I acknowledge that a tattoo is a permanent change to my appearance and that no representations have been made to me as to the ability to later change or remove my tattoo. To my knowledge, I do not have a physical, mental or medical impairment or disability which might affect my well being as a direct or indirect result of my decision to have a tattoo.',
  '• I acknowledge I am over the age of eighteen and that I have truthfully represented to my tattooer that the obtaining of a tattoo is by my choice alone. I consent to the application of the tattoo and to any actions or conduct of the representatives and employees of the tattoo shop reasonably necessary to perform the tattoo procedure.',
].join('\n\n');

// The fixed, non-extensible set of BookingRequestInput's optional intake slots (typeDefs.js) -
// reordered/relabeled/required-toggled/hidden through a purpose-built restricted editor, never a
// generic FormBuilder - see models/Form.js's SYSTEM_KEYS comment for why this form exists at all
// despite the real BookingRequest pipeline staying completely untouched. `key` is fixed to the
// exact BookingRequestInput argument name on purpose: that's what lets the untouched
// createBookingRequest resolver and this display config agree on which slot is which without
// either one knowing about the other.
const BOOKING_REQUEST_FORM_FIELDS = [
  { key: 'placement', type: 'short_text', label: 'Placement', required: false },
  { key: 'size', type: 'short_text', label: 'Approximate size', required: false },
  { key: 'budget', type: 'short_text', label: 'Budget', required: false },
  { key: 'availability', type: 'short_text', label: 'Availability', required: false },
  { key: 'howHeard', type: 'short_text', label: 'How did you hear about us?', required: false },
  {
    key: 'isCoverUp',
    type: 'single_choice',
    label: 'Is this a cover-up?',
    required: false,
    options: ['Yes', 'No'],
  },
  { key: 'referenceImages', type: 'file_upload', label: 'Reference images', required: false },
];

// slug is set here directly (bypassing utils/form-slug.js's assertSlugAvailable/reserved-word
// check on purpose) - 'book' is deliberately reserved to everyone ELSE precisely so only this
// seed can use it. See utils/form-slug.js's own header comment.
const DEFAULT_FORM_DEFS = [
  {
    systemKey: 'booking_request',
    slug: 'book',
    title: 'Booking Request',
    // Published from the moment it's seeded - there is no draft period for a form standing in
    // for a pipeline that's already live the instant the owner exists.
    status: 'published',
    description:
      'Controls the order, labels and visibility of the optional questions on your booking request '
      + 'page. This does not change what booking requests do - see the fixed fields below.',
    fields: BOOKING_REQUEST_FORM_FIELDS,
  },
  {
    systemKey: 'consent',
    slug: 'consent',
    title: 'Consent Form',
    status: 'published',
    // On by default, unlike a form created through the normal FormBuilder (allowGuestSubmissions
    // defaults false there - see models/Form.js) - a consent form that a walk-in client can't
    // actually reach without an account isn't the feature the person asked for. setFormGuestAccess
    // stays the way to turn it back OFF for a shop that wants consent collected in-person only.
    allowGuestSubmissions: true,
    description: CONSENT_FORM_DESCRIPTION,
    fields: CONSENT_FORM_FIELDS,
  },
];

/**
 * Creates whichever of the two default forms this owner doesn't already have. Owner is exactly
 * one of shopId/artistUserId - same XOR contract as everywhere else in this feature.
 *
 * Returns the forms actually created (empty array on a call where both already existed) so a
 * caller - namely the migration script - can log something meaningful.
 */
async function seedDefaultForms({ shopId = null, artistUserId = null }, createdByUserId) {
  if (!shopId && !artistUserId) {
    throw new Error('seedDefaultForms requires a shopId or an artistUserId');
  }
  if (shopId && artistUserId) {
    throw new Error('seedDefaultForms takes only one of shopId or artistUserId, not both');
  }

  const ownerFilter = shopId ? { shopId } : { artistUserId };
  const existingKeys = new Set(
    (await Form.find({ ...ownerFilter, systemKey: { $ne: null } }, 'systemKey')).map((f) => f.systemKey),
  );

  const created = [];
  for (const def of DEFAULT_FORM_DEFS) {
    if (existingKeys.has(def.systemKey)) {
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const form = await new Form({
        shopId,
        artistUserId,
        systemKey: def.systemKey,
        slug: def.slug,
        title: def.title,
        status: def.status,
        allowGuestSubmissions: Boolean(def.allowGuestSubmissions),
        // Minted whenever guest access starts on, mirroring setFormGuestAccess's own side effect
        // (resolvers/forms.js) - so the older publicToken-based /form/:publicToken link works for
        // this form too, not just the new slug-based one, from the moment it's seeded.
        publicToken: def.allowGuestSubmissions ? crypto.randomBytes(24).toString('hex') : undefined,
        description: def.description,
        fields: def.fields,
        createdByUserId,
      }).save();
      created.push(form);
    } catch (err) {
      // The partial unique index on {shopId/artistUserId, systemKey} is the real guarantee - two
      // concurrent calls for the same brand-new owner (shouldn't happen, since owner creation
      // itself isn't concurrent with itself, but costs nothing to guard) both pass the
      // existingKeys check above and one lands here. Swallowed, not rethrown: the other call's
      // write is the one that "won", and that's a fine outcome for an idempotent seed.
      if (err && err.code === 11000) {
        continue;
      }
      throw err;
    }
  }
  return created;
}

module.exports = {
  seedDefaultForms,
  DEFAULT_FORM_DEFS,
};
