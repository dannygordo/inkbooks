const { UserInputError } = require('./errors');

/**
 * A form's own slug - the FIRST path segment of its public link
 * (/<formSlug>/<ownerHandle>, see resolvers/forms.js's public form resolver), where ownerHandle is
 * an artist's Artist.bookingSlug or a shop's Shop.formSlug (utils/booking-slug.js, utils/shop-slug.js).
 *
 * Deliberately its OWN small validator rather than a shared one, same reasoning as shop-slug.js's
 * own comment: this occupies a different path POSITION (first segment, not second) and so needs a
 * different reserved-word list - one drawn from this app's own top-level client routes
 * (client/src/constants/app.js's ROUTE_CONSTANTS), since a formSlug of "settings" or "clients"
 * would shadow a real page of the app, not another public link.
 *
 * UNIQUENESS IS SCOPED, not global: two different owners (two different shops, or a shop and an
 * unrelated artist) are free to both have a form slugged "consent" - the ownerHandle in the second
 * segment is what disambiguates them. See the compound partial indexes on models/Form.js
 * (formSlugShop/formSlugArtist) for the actual guarantee; isSlugAvailable below is the same
 * courtesy-check pattern as booking-slug.js/shop-slug.js.
 *
 * "book" is deliberately reserved here even though the seeded booking_request system form is
 * displayed with slug "book" - that form's PUBLIC URL is still the untouched, static
 * /book/:artistHandle route (see App.jsx; the pipeline stays byte-for-byte unchanged per explicit
 * decision), never routed through the generic /<formSlug>/<ownerHandle> resolver. The seed script
 * (utils/seed-default-forms.js) writes that slug directly rather than through assertSlugAvailable,
 * which is why this validator can safely refuse "book" to everyone else: a custom form slugged
 * "book" would be shadowed by the static route (React Router ranks static path segments above
 * dynamic ones at the same position) and would never actually be reachable.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 40;

const RESERVED_SLUGS = new Set([
  // Top-level client routes (client/src/constants/app.js's ROUTE_CONSTANTS), first segment only.
  'login', 'resetpassword', 'set-password', 'register', 'artists', 'artist', 'clients', 'client',
  'staff', 'staff-profile', 'projects', 'project', 'consult', 'shops', 'shop', 'settings',
  'expenses', 'income', 'forms', 'form', 'book', 'booking',
  // Generic reservations, same list booking-slug.js/shop-slug.js use for the same route-collision
  // and impersonation reasons.
  'admin', 'administrator', 'api', 'app', 'auth', 'billing', 'contact', 'dashboard', 'help',
  'home', 'inkbooks', 'logout', 'me', 'messages', 'messenger', 'new', 'official', 'owner',
  'payment', 'payments', 'privacy', 'profile', 'root', 'security', 'session', 'sessions',
  'signin', 'signup', 'support', 'system', 'terms', 'test', 'undefined', 'null',
]);

function normalizeSlug(slug) {
  return typeof slug === 'string' ? slug.trim().toLowerCase() : '';
}

function slugFormatError(slug) {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return 'Pick a link for this form.';
  }
  const value = slug.trim().toLowerCase();
  if (value.length < MIN_LENGTH) {
    return `Form links need at least ${MIN_LENGTH} characters.`;
  }
  if (value.length > MAX_LENGTH) {
    return `Form links can be at most ${MAX_LENGTH} characters.`;
  }
  if (!SLUG_PATTERN.test(value)) {
    return 'Use lowercase letters, numbers and hyphens only - no spaces, and no hyphen at either end.';
  }
  if (RESERVED_SLUGS.has(value)) {
    return 'That word is reserved for the app itself. Try something more specific to this form.';
  }
  return null;
}

/**
 * Is this slug free WITHIN THE SAME OWNER? Scoped by shopId XOR artistUserId - see the header
 * comment above on why this is intentionally not a global check. `exceptFormId` lets a form be
 * re-saved without its own slug reading as taken.
 */
async function isSlugAvailable(slug, { shopId = null, artistUserId = null, exceptFormId = null } = {}) {
  const value = normalizeSlug(slug);
  if (slugFormatError(value)) {
    return false;
  }
  // Lazy require - Form requires this file indirectly via seed/resolvers in some load orders;
  // requiring at call time rather than module scope avoids a circular-require footgun.
  const Form = require('../models/Form');
  const query = { slug: value, shopId, artistUserId };
  if (exceptFormId) {
    query._id = { $ne: exceptFormId };
  }
  return !(await Form.exists(query));
}

async function assertSlugAvailable(slug, opts = {}) {
  const value = normalizeSlug(slug);
  const formatError = slugFormatError(value);
  if (formatError) {
    throw new UserInputError('Errors', { errors: { slug: formatError } });
  }
  if (!(await isSlugAvailable(value, opts))) {
    throw new UserInputError('Errors', {
      errors: { slug: 'This owner already has a form using that link.' },
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
