const Artist = require('../models/Artist');
const Shop = require('../models/Shop');
const Form = require('../models/Form');
const { Constants } = require('./constants');
const { getShopIdsForUser } = require('./shop-membership');
const { normalizeSlug: normalizeFormSlug } = require('./form-slug');
const { normalizeSlug: normalizeOwnerHandle } = require('./booking-slug');

/**
 * Resolves the public link /<formSlug>/<ownerHandle> to a real Form - the one place both
 * getPublicFormBySlug (Query) and submitFormResponse (Mutation, the guest path) decide what a
 * stranger's link actually points at, so the two can never quietly disagree about whether a link
 * is live.
 *
 * A DELIBERATE DEPARTURE from getPublicForm's older publicToken mechanism: that one is a secret,
 * unguessable link minted on request (see models/Form.js's own comment on publicToken). This one
 * is the opposite on purpose - a predictable, shareable business link, the same shape
 * /book/:artistHandle already is, because these forms are meant to be openly discoverable (an
 * artist or shop puts them in a bio or a nav menu, not a DM). The actual gate on whether a guest
 * may SUBMIT stays exactly the same either way: Form.allowGuestSubmissions, re-checked by the
 * caller after this resolves - a predictable URL is not itself permission to write.
 *
 * ownerHandle is checked against Artist.bookingSlug FIRST, then Shop.formSlug - same order
 * getPublicArtistProfile's own slug-then-id fallback uses, because the large majority of these
 * links are artist links (every shop-owned, non-shopUseOnly form has one PER AFFILIATED ARTIST -
 * see the shopId branch below for why - so most resolvable handles belong to a person, not a
 * shop).
 *
 * Returns { state, form }. `form` is the real Mongoose document (not the public-safe shape) only
 * when state === 'ok' - callers still narrow it to typeDefs.js's PublicForm before it reaches
 * anyone unauthenticated; this function's job stops at "which document, if any."
 */
const STATES = {
  OK: 'ok',
  NOT_FOUND: 'not_found',
  INACTIVE: 'inactive',
  ARTIST_GONE: 'artist_gone',
};

async function resolvePublicFormBySlug(formSlug, ownerHandle) {
  const slug = normalizeFormSlug(formSlug);
  const handle = normalizeOwnerHandle(ownerHandle);
  if (!slug || !handle) {
    return { state: STATES.NOT_FOUND, form: null };
  }

  const artist = await Artist.findOne({ bookingSlug: handle });
  if (artist) {
    // Checked BEFORE looking for a form at all - a client holding a link to someone off the
    // roster has no use for "which form" once "which artist" has already failed. Only ARCHIVED
    // counts as gone: INACTIVE and BOOKS_CLOSED are both "still here, ask them directly" states
    // that createBookingRequest already lets through unchanged, and this shouldn't be stricter
    // than that pipeline for the exact same artist.
    if (artist.status === Constants.ARTIST_STATUS.ARCHIVED) {
      return { state: STATES.ARTIST_GONE, form: null };
    }

    // The artist's OWN form wins over their shop's when both happen to define the same slug -
    // more specific to this exact link beats "everyone at this shop shares one." Falls back to
    // the shop's own non-shopUseOnly form of that slug, which is what actually produces the
    // "one link per affiliated artist" behavior models/Form.js's shopUseOnly comment describes -
    // a shop-owned form was never copied per-artist, this resolver just answers as if it were.
    let form = await Form.findOne({ artistUserId: artist.userId, slug });
    if (!form) {
      const shopIds = await getShopIdsForUser(artist.userId);
      if (shopIds.length > 0) {
        form = await Form.findOne({ shopId: { $in: shopIds }, slug, shopUseOnly: false });
      }
    }
    if (!form) {
      return { state: STATES.NOT_FOUND, form: null };
    }
    if (form.status !== 'published') {
      return { state: STATES.INACTIVE, form: null };
    }
    return { state: STATES.OK, form };
  }

  const shop = await Shop.findOne({ formSlug: handle });
  if (shop) {
    // Only the shopUseOnly form of that slug answers to the shop's OWN handle - a normal
    // per-artist shop form has no "shop-wide" URL variant (see models/Form.js's own comment: an
    // artist-facing link always uses THAT ARTIST's own handle, never the shop's).
    const form = await Form.findOne({ shopId: shop._id, slug, shopUseOnly: true });
    if (!form) {
      return { state: STATES.NOT_FOUND, form: null };
    }
    if (form.status !== 'published') {
      return { state: STATES.INACTIVE, form: null };
    }
    return { state: STATES.OK, form };
  }

  return { state: STATES.NOT_FOUND, form: null };
}

module.exports = {
  STATES,
  resolvePublicFormBySlug,
};
