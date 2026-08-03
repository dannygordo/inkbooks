const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('./errors');
// Was require('../config') - server/config.js is gitignored (it holds the raw Mongo URI too)
// and never gets committed, so this would throw MODULE_NOT_FOUND the instant it runs anywhere
// that only has the git-tracked code, e.g. Render. SECRET_KEY is already in .env.development/
// .env.production (loaded via dotenv in index.js) exactly like MONGODB - reading it the same way
// closes that gap instead of leaving two parallel, inconsistent config mechanisms.
const SECRET_KEY = process.env.SECRET_KEY;

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
        return user;
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
