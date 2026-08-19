const Shop = require('../models/Shop');
const Artist = require('../models/Artist');
const { UserInputError } = require('./errors');

/**
 * A shop's own public link handle - the shop-level equivalent of Artist.bookingSlug (see
 * utils/booking-slug.js's own header comment on the design; this mirrors it deliberately rather
 * than sharing code with it, since the two live on different collections and this file's extra
 * job - cross-checking against Artist.bookingSlug - would otherwise have to live awkwardly inside
 * booking-slug.js, a file that has no reason to know Shop exists).
 *
 * Exists for Form.shopUseOnly: a form flagged shop-use-only gets ONE shop-wide public link
 * (/<formSlug>/<shop's own formSlug>) rather than a link per artist - see resolvers/forms.js.
 *
 * SAME FORMAT RULES as an artist's bookingSlug (lowercase letters/digits/hyphens, 3-40 chars) -
 * duplicated rather than imported for the same reason suggestSlug is duplicated on the client
 * (utils/bookingSlug.js's own comment): these two are allowed to drift apart later without an
 * import coupling two independent concepts together, and today they're small enough that keeping
 * them byte-identical isn't worth the coupling.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 40;

// Same reserved set as an artist's bookingSlug (utils/booking-slug.js) plus nothing shop-specific
// needs adding - both slugs occupy the exact same "second path segment" position in a form URL
// (/<formSlug>/<ownerHandle>), so the same route-collision and impersonation reasoning applies
// unchanged.
const RESERVED_SLUGS = new Set([
  'admin', 'administrator', 'api', 'app', 'artist', 'artists', 'auth', 'billing', 'book',
  'booking', 'bookings', 'client', 'clients', 'contact', 'dashboard', 'help', 'home', 'inkbooks',
  'login', 'logout', 'me', 'messages', 'messenger', 'new', 'official', 'owner', 'payment',
  'payments', 'privacy', 'profile', 'project', 'projects', 'register', 'root', 'security',
  'session', 'sessions', 'settings', 'shop', 'shops', 'signin', 'signup', 'staff', 'support',
  'system', 'terms', 'test', 'undefined', 'null',
]);

function normalizeSlug(slug) {
  return typeof slug === 'string' ? slug.trim().toLowerCase() : '';
}

function slugFormatError(slug) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return 'Pick a shop link.';
  }
  const value = slug.trim().toLowerCase();
  if (value.length < MIN_LENGTH) {
    return `Shop links need at least ${MIN_LENGTH} characters.`;
  }
  if (value.length > MAX_LENGTH) {
    return `Shop links can be at most ${MAX_LENGTH} characters.`;
  }
  if (!SLUG_PATTERN.test(value)) {
    return 'Use lowercase letters, numbers and hyphens only - no spaces, and no hyphen at either end.';
  }
  if (RESERVED_SLUGS.has(value)) {
    return 'That word is reserved. Try adding a location or "tattoo".';
  }
  return null;
}

/**
 * Is this slug free? Checks BOTH Shop.formSlug and Artist.bookingSlug - the two collections share
 * the same URL position, so a shop claiming a slug an artist already holds (or vice versa - see
 * booking-slug.js's own matching check) would make /<formSlug>/<that-string> ambiguous. This is a
 * COURTESY check, same caveat as booking-slug.js's own: the unique index on Shop.formSlug is the
 * real guarantee for the Shop-vs-Shop race; there is no way to get a race-safe guarantee across two
 * different Mongo collections, so this is the best available protection for the Shop-vs-Artist case.
 */
async function isSlugAvailable(slug, exceptShopId = null) {
  const value = normalizeSlug(slug);
  if (slugFormatError(value)) {
    return false;
  }
  const shopQuery = { formSlug: value };
  if (exceptShopId) {
    shopQuery._id = { $ne: exceptShopId };
  }
  const [takenByShop, takenByArtist] = await Promise.all([
    Shop.exists(shopQuery),
    Artist.exists({ bookingSlug: value }),
  ]);
  return !takenByShop && !takenByArtist;
}

async function assertSlugAvailable(slug, exceptShopId = null) {
  const value = normalizeSlug(slug);
  const formatError = slugFormatError(value);
  if (formatError) {
    throw new UserInputError('Errors', { errors: { formSlug: formatError } });
  }
  if (!(await isSlugAvailable(value, exceptShopId))) {
    throw new UserInputError('Errors', {
      errors: { formSlug: 'That shop link is already taken.' },
    });
  }
  return value;
}

module.exports = {
  SLUG_PATTERN,
  MIN_LENGTH,
  MAX_LENGTH,
  RESERVED_SLUGS,
  slugFormatError,
  normalizeSlug,
  isSlugAvailable,
  assertSlugAvailable,
};
