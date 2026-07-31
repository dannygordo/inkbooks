const checkAuth = require('./check-auth');
const { AuthenticationError } = require('./errors');

/**
 * Wraps a GraphQL resolver so it always requires a valid authenticated session, and optionally
 * a minimum role, before it runs.
 *
 * This exists because of exactly how Phase 1's worst bug happened: every Query resolver called
 * checkAuth(context) by hand (or, originally, didn't call it at all), which meant remembering to
 * add that one line to every new resolver was the only thing standing between "authenticated
 * API" and "anyone can read your entire database." Wrapping resolvers here means a resolver
 * that forgets this simply doesn't get written that way - there's no line to forget.
 *
 * Role values are numeric and *lower is more privileged* (see utils/constants.js: ADMIN=1,
 * SHOP_ADMIN=10, SHOP_STAFF=15, ARTIST=20, CLIENT=30) - matching the rest of this codebase's
 * existing convention (e.g. `user.role <= Constants.ROLES.SHOP_ADMIN`). Passing `minRole` means
 * "the caller's role must be at least this privileged (numerically <= minRole)".
 *
 * Usage:
 *   getArtists: withAuth(resolverFn)                          // any authenticated user
 *   deleteArtist: withAuth(resolverFn, Constants.ROLES.ADMIN)  // Admin only
 *
 * The wrapped resolver receives the authenticated user as a 5th argument, so it doesn't need to
 * call checkAuth itself. Resolvers that need additional logic beyond a flat role check (e.g.
 * "Admin, OR the specific artist assigned to this project") still add that check themselves,
 * using the `user` argument this wrapper provides - this wrapper only guarantees "authenticated,
 * and at least this privileged," not every possible ownership rule.
 */
function withAuth(resolverFn, minRole = null) {
  return async (parent, args, context, info) => {
    const user = checkAuth(context);
    if (minRole !== null && user.role > minRole) {
      throw new AuthenticationError('Action not allowed');
    }
    return resolverFn(parent, args, context, info, user);
  };
}

module.exports = withAuth;
