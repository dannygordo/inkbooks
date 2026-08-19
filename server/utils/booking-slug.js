const Artist = require('../models/Artist');
const Shop = require('../models/Shop');
const { UserInputError } = require('./errors');

/**
 * The artist's public booking handle - the one place a public-facing name for a person is
 * appropriate in this system.
 *
 * When User.username was deleted (email is the sole identity now), the one genuine use for a
 * handle that survived the cull was this: a URL an artist can print on a card or put in an
 * Instagram bio. That is a PROFILE concern, not an AUTH one, which is why it lives on Artist and
 * not on User - nothing here is ever accepted as a credential, and losing or changing a slug
 * costs an artist a stale link, not their account.
 *
 * The old /book/:artistId took a raw Mongo ObjectId. It worked, and it was unusable as something
 * a human hands to another human.
 */

// Deliberately conservative. Lowercase letters, digits and single internal hyphens - the subset
// that survives being read aloud, written on a business card, and typed on a phone keyboard
// without autocorrect fighting back. No underscores (invisible when a URL is underlined), no
// dots (reads as a domain boundary), no unicode (homograph lookalikes are a real impersonation
// risk when the whole point is identifying a specific artist).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MIN_LENGTH = 3;
const MAX_LENGTH = 40;

/**
 * Reserved words that can never be a slug.
 *
 * Two separate reasons, both real:
 *
 *   - Route collisions. These sit under the same path space as the app's own routes; a slug of
 *     "login" or "settings" is an ambiguity waiting to be resolved in whichever direction the
 *     router happens to prefer.
 *   - Impersonation. "admin", "support", "billing" and "official" are what somebody picks when
 *     they want a client to believe a message came from the platform rather than from an artist.
 *     A booking page reading /book/support is a phishing surface with the studio's own branding
 *     on it, which is worse than an ugly URL.
 */
const RESERVED_SLUGS = new Set([
  'admin', 'administrator', 'api', 'app', 'artist', 'artists', 'auth', 'billing', 'book',
  'booking', 'bookings', 'client', 'clients', 'contact', 'dashboard', 'help', 'home', 'inkbooks',
  'login', 'logout', 'me', 'messages', 'messenger', 'new', 'official', 'owner', 'payment',
  'payments', 'privacy', 'profile', 'project', 'projects', 'register', 'root', 'security',
  'session', 'sessions', 'settings', 'shop', 'shops', 'signin', 'signup', 'staff', 'support',
  'system', 'terms', 'test', 'undefined', 'null',
]);

/**
 * Best-effort slug from a name, for prefilling the field - NOT for assigning one silently.
 *
 * Suggested, never auto-applied. An auto-assigned handle nobody chose and nobody was shown is
 * precisely what the deleted username was, and it was invisible to the person it belonged to
 * right up until it locked them out. A suggestion the artist can see and overwrite is a different
 * thing entirely.
 *
 * Returns '' when there's nothing usable left (a name written entirely in a non-Latin script,
 * say), so the caller shows an empty field rather than a mystery string.
 */
function suggestSlug(firstName = '', lastName = '') {
  const raw = `${firstName || ''} ${lastName || ''}`
    .toLowerCase()
    .normalize('NFD')
    // Strip combining accents so "Renée" suggests "renee" rather than losing the letter.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const candidate = raw.slice(0, MAX_LENGTH).replace(/-+$/, '');

  // Run the suggestion through the SAME validator the write path uses, and give up rather than
  // return something that would be rejected. Two ways this bites, both found by testing rather
  // than by reading:
  //
  //   - "X Æ" reduces to "x" - one character, under the minimum. Prefilling it puts a value in
  //     the field that fails the moment the artist accepts it, which reads as the form being
  //     broken rather than as the name being unusable.
  //   - Somebody actually named e.g. Support reduces to a reserved word.
  //
  // Returning '' here means the caller shows an empty field and the artist types their own,
  // which is a normal outcome. A suggestion that can't be saved is not.
  return slugFormatError(candidate) ? '' : candidate;
}

/**
 * Validates shape only - says nothing about whether it's taken.
 *
 * Returns a specific reason rather than a boolean, because "that slug is not allowed" with no
 * explanation is the kind of form error people retry verbatim three times before giving up.
 *
 * Checks the NORMALISED value, so "Maya-Chen" is accepted and stored as "maya-chen" rather than
 * rejected for containing capitals. Same reasoning as User.email: a form that refuses a value it
 * could perfectly well clean up is making the person do the computer's job. Case is the only
 * thing forgiven this way - a space or an underscore is a real answer to "what is your link",
 * and silently rewriting those would hand back a URL the artist didn't choose.
 */
function slugFormatError(slug) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return 'Pick a booking link.';
  }
  const value = slug.trim().toLowerCase();
  if (value.length < MIN_LENGTH) {
    return `Booking links need at least ${MIN_LENGTH} characters.`;
  }
  if (value.length > MAX_LENGTH) {
    return `Booking links can be at most ${MAX_LENGTH} characters.`;
  }
  if (!SLUG_PATTERN.test(value)) {
    return 'Use lowercase letters, numbers and hyphens only - no spaces, and no hyphen at either end.';
  }
  if (RESERVED_SLUGS.has(value)) {
    return 'That word is reserved. Try adding your last name or your city.';
  }
  return null;
}

/**
 * Normalises to the stored form. Trim + lowercase, so "Maya-Chen " and "maya-chen" are the same
 * handle rather than two artists holding what everyone reads as one name.
 */
function normalizeSlug(slug) {
  return typeof slug === 'string' ? slug.trim().toLowerCase() : '';
}

/**
 * Is this slug free? `exceptArtistId` lets an artist re-save their own profile without their own
 * slug reading as taken.
 *
 * Also checks Shop.formSlug - added alongside Form.shopUseOnly's own shop-level link
 * (utils/shop-slug.js), since both an artist's bookingSlug and a shop's formSlug occupy the same
 * "second path segment" position in a form URL (/<formSlug>/<ownerHandle>). A real collision
 * between the two collections would make that URL silently resolve to the wrong owner - see
 * shop-slug.js's own matching check for the reverse direction. Same courtesy-check caveat as
 * always: the unique index on Artist.bookingSlug is the real guarantee for the Artist-vs-Artist
 * race; there's no race-safe guarantee available across two different Mongo collections.
 */
async function isSlugAvailable(slug, exceptArtistId = null) {
  const value = normalizeSlug(slug);
  if (slugFormatError(value)) {
    return false;
  }
  const query = { bookingSlug: value };
  if (exceptArtistId) {
    query._id = { $ne: exceptArtistId };
  }
  const [takenByArtist, takenByShop] = await Promise.all([
    Artist.exists(query),
    Shop.exists({ formSlug: value }),
  ]);
  return !takenByArtist && !takenByShop;
}

/**
 * Format + availability, throwing the way every other mutation in this codebase does.
 *
 * The uniqueness check here is a COURTESY, not the guarantee - it exists to produce a good error
 * message. Two artists claiming the same slug in the same instant both pass this check and one of
 * them then hits the unique index on Artist.bookingSlug, which is what actually enforces it. A
 * check-then-write is a race by construction; the index is not.
 */
async function assertSlugAvailable(slug, exceptArtistId = null) {
  const value = normalizeSlug(slug);
  const formatError = slugFormatError(value);
  if (formatError) {
    throw new UserInputError('Errors', { errors: { bookingSlug: formatError } });
  }
  if (!(await isSlugAvailable(value, exceptArtistId))) {
    throw new UserInputError('Errors', {
      errors: { bookingSlug: 'That booking link is already taken.' },
    });
  }
  return value;
}

module.exports = {
  SLUG_PATTERN,
  MIN_LENGTH,
  MAX_LENGTH,
  RESERVED_SLUGS,
  suggestSlug,
  slugFormatError,
  normalizeSlug,
  isSlugAvailable,
  assertSlugAvailable,
};
