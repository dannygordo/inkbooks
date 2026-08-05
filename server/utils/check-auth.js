const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('./errors');
// Was require('../config') - server/config.js is gitignored (it holds the raw Mongo URI too)
// and never gets committed, so this would throw MODULE_NOT_FOUND the instant it runs anywhere
// that only has the git-tracked code, e.g. Render. SECRET_KEY is already in .env.development/
// .env.production (loaded via dotenv in index.js) exactly like MONGODB - reading it the same way
// closes that gap instead of leaving two parallel, inconsistent config mechanisms.
const SECRET_KEY = process.env.SECRET_KEY;

/**
 * Fields the JWT does NOT carry, wrapped so reading one throws instead of returning undefined.
 *
 * The token payload is {id, email, role} and always has been (see generateToken in
 * resolvers/users.js). `userType` is not on it. But `user.userType === 'artist'` reads perfectly,
 * compiles, passes review, and evaluates to `undefined === 'artist'` - permanently false - so the
 * resolver silently does the wrong thing forever and nothing anywhere errors.
 *
 * That has now happened THREE times in this codebase:
 *   - updateArtistRateSettings: broken from the day it was written. No artist had ever once saved
 *     their own rate, and there was no test, so nothing said so.
 *   - updateMyBookingSlug: written by copying the above, and only caught because it had tests.
 *   - attentionForUser: would have returned an empty list to every artist forever.
 *
 * Two of those were found by accident. A fourth is a matter of time, so this makes it impossible:
 * reading `userType` off a decoded token now throws at the moment it runs, with the answer in the
 * message. The correct question is a real database relationship - does this person have an Artist
 * profile - which is what utils/shop-membership.js has said all along.
 *
 * Only direct property access trips it. Spread and JSON.stringify walk OWN keys, and `userType`
 * isn't one, so nothing that serialises a token payload is affected.
 */
const FIELDS_NOT_IN_TOKEN = {
  userType:
    'The JWT payload is {id, email, role} - it has no userType, so this comparison would be ' +
    'silently false forever. Ask the database instead: `await Artist.exists({ userId: user.id })` ' +
    'for "is this an artist", or getShopIdsForUser() for shop membership. ' +
    'See utils/check-auth.js and NOTIFICATIONS_DESIGN.md.',
  userInfo:
    'userInfo is assembled by the login resolver for the client; it is not in the token. Load the ' +
    'Artist/Staff/Client record you actually need.',
  shopId:
    'Shop membership is never on the token and never a single value - an artist can be connected ' +
    'to a shop or not. Use getShopIdsForUser(user.id) (utils/shop-membership.js).',
};

function guardTokenPayload(payload) {
  return new Proxy(payload, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop in FIELDS_NOT_IN_TOKEN && !(prop in target)) {
        throw new Error(`user.${prop} is not on the JWT. ${FIELDS_NOT_IN_TOKEN[prop]}`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const checkAuth = (context) => {
  //console.log(context.req.headers.authorization);
  const authHeader = context.req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split('Bearer ')[1];
    if (token) {
      try {
        // Explicitly pin the allowed algorithm rather than relying on jsonwebtoken's default
        // (GHSA-qwph-4952-7xr6: older jsonwebtoken versions could accept a token signed with an
        // algorithm the caller never intended). We only ever sign with HS256 (see generateToken
        // in resolvers/users.js), so verify should only ever accept HS256, full stop.
        const user = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });
        return guardTokenPayload(user);
      } catch (err) {
        throw new AuthenticationError('Invalid/expired token');
      }
    }
    throw new Error(
      'Authentication token must be prefixed with the string: Bearer ',
    );
  }
  throw new Error(
    'Authentication header must be provided to perform this action',
  );
};

// Non-throwing variant - returns the decoded user, or null if there's no/an invalid token,
// instead of raising. Exists for resolvers that are deliberately public (no withAuth) but still
// want to behave differently for a caller who *happens* to be logged in - e.g.
// createBookingRequest's per-IP rate limit (see mutations/bookingRequests.js), which is sized to
// stop anonymous scripted abuse and would otherwise also throttle a shop's own front desk
// submitting walk-in requests all day from one IP through the same public form/mutation.
const tryCheckAuth = (context) => {
  try {
    return checkAuth(context);
  } catch (err) {
    return null;
  }
};

module.exports = checkAuth;
module.exports.tryCheckAuth = tryCheckAuth;
module.exports.guardTokenPayload = guardTokenPayload;
module.exports.FIELDS_NOT_IN_TOKEN = FIELDS_NOT_IN_TOKEN;
