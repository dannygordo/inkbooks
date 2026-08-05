const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { UserInputError, AuthenticationError, RateLimitError, rethrow } = require('../../utils/errors');
const {
  getShopIdsForUser,
  assertCanAccessShop,
} = require('../../utils/shop-membership');
const { excludeArchived, archiveFilter } = require('../../utils/archiving');
const { findArtistsForShops, getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { paginateArray, normalizePage } = require('../../utils/pagination');
const { checkRateLimit, getClientIp } = require('../../utils/rate-limit');
const {
  normalizeSlug,
  slugFormatError,
  isSlugAvailable,
} = require('../../utils/booking-slug');

// A caller with no shops still gets a well-formed page rather than a bare array, so the client has
// exactly one response shape to read whatever the answer turns out to be.
function emptyPage(page) {
  const { limit, offset } = normalizePage(page);
  return { items: [], pageInfo: { totalCount: 0, hasMore: false, limit, offset } };
}

module.exports = {
  Query: {
    // Public and unauthenticated, matching getPublicArtistProfile - the artist-creation wizard
    // needs this before the invited artist has an account, and the same information leaks from
    // /book/<slug> anyway (it either shows a profile or it doesn't), so requiring a token would
    // protect nothing while making the one form that needs it worse.
    //
    // Rate-limited because "is this slug taken" answered instantly and without limit is an
    // enumeration oracle: walk a dictionary, learn every artist's handle on the platform. Thirty
    // per minute is far more than a person typing into a debounced field will ever produce and
    // far less than a script wants.
    //
    // Returns a REASON, not just a boolean. "Unavailable" covers "someone has it", "too short"
    // and "that word is reserved" - three different things for the person typing to do next, and
    // a form that can't tell them apart makes them guess.
    async checkBookingSlugAvailable(_, { slug }, context) {
      const ip = getClientIp(context.req);
      const { allowed, retryAfterSeconds } = checkRateLimit(`${ip}:checkBookingSlugAvailable`, {
        windowMs: 60 * 1000,
        max: 30,
      });
      if (!allowed) {
        throw new RateLimitError(
          `Too many checks from this address. Try again in ${retryAfterSeconds} seconds.`,
        );
      }

      const value = normalizeSlug(slug);
      const formatError = slugFormatError(value);
      if (formatError) {
        return { slug: value, available: false, reason: formatError };
      }
      const free = await isSlugAvailable(value);
      return {
        slug: value,
        available: free,
        reason: free ? null : 'That booking link is already taken.',
      };
    },
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could list every artist at every shop on the platform. SHOP_ADMIN-or-better still sees
    // everyone - see the matching comment in resolvers/shops.js. Staff/Artist callers only see
    // artists at the shop(s) they're actually affiliated with. Like getArtistsByShop below (which
    // has the same limitation already), this only matches Artist's legacy single shopId field,
    // not the fuller ArtistShopConnection multi-shop model - not a new inconsistency introduced
    // here, just not fixed here either.
    // Now Staff-or-better (Admin 1 / Shop Admin 10 / Staff 15). Artists used to reach this - it
    // was scoped to their own shop, but "every artist at my shop" is still a management
    // directory, and the page it feeds (pages/artists/Artists.jsx -> Artist.jsx) mounts
    // ArtistPerformancePanel, i.e. a shop-mate's revenue, shop-cut ledger and appointment
    // history. Artists have no reason to see each other's books; they reach their own numbers
    // through Home.jsx's dashboard, which mounts the same panel scoped to themselves.
    // Shop-scoping for Staff is unchanged below.
    getArtists: withAuth(async (_, { includeArchived, page }, context, info, user) => {
      try {
        // No unscoped branch, for anyone - see utils/shop-membership.js's role rule.
        const shopIds = await getShopIdsForUser(user.id);
        if (shopIds.length === 0) {
          return emptyPage(page);
        }
        // Resolved through ArtistShopConnection, not Artist.shopId. Those were two separate
        // sources of truth and this query read the one that connectArtistToShop never writes -
        // so an artist connected through the real connect flow was authorized at the shop but
        // absent from its own directory. See utils/artist-shop.js.
        //
        // Archived artists drop out of the directory but keep every appointment, project and
        // dollar they earned - see utils/archiving.js.
        // Paged in memory rather than by Mongo. findArtistsForShops resolves the roster through
        // ArtistShopConnection first (see utils/artist-shop.js), so the set can't be expressed as
        // one Mongo filter over Artist - and a shop's roster is bounded by how many people work
        // there, which isn't a number that gets away from anyone. The directories over genuinely
        // unbounded collections - clients, projects - page in the database.
        const artists = await findArtistsForShops(shopIds, archiveFilter(includeArchived));
        artists.sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
        return paginateArray(artists, page);
      } catch (err) {
        rethrow(err);
      }
    }, Constants.ROLES.SHOP_STAFF),
    // Allowed: the artist themselves, or Staff-and-above affiliated with the same shop.
    //
    // Was "shop-admin-or-better, the artist themselves, or anyone affiliated with the same shop",
    // where "anyone" included other ARTIST-role users - so any artist could open any shop-mate's
    // page. That page (pages/artists/Artist.jsx) mounts ArtistPerformancePanel, which is a
    // revenue/shop-cut/appointment-history view. Peer artists are now excluded; the self check
    // below is what keeps an artist's own page reachable.
    getArtist: withAuth(async (_, { artistId }, context, info, user) => {
      try {
        const artist = await Artist.findById(artistId);
        if (!artist) {
          throw new UserInputError('Errors', { errors: { artistId: 'Artist not found.' } });
        }
        const isSelf = String(user.id) === String(artist.userId);
        if (!isSelf) {
          // Staff, but not Artists or Clients - and only Staff at this artist's own shop. Role
          // alone can't express "same shop", which is why both halves are checked. "This artist's
          // shop" comes from their active connection, not the old Artist.shopId field.
          const [shopIds, artistShopId] = await Promise.all([
            getShopIdsForUser(user.id),
            getActiveShopIdForArtist(artist.userId),
          ]);
          const sameShop = artistShopId && shopIds.map(String).includes(String(artistShopId));
          if (user.role > Constants.ROLES.SHOP_STAFF || !sameShop) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return artist;
      } catch (err) {
        rethrow(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could pass an arbitrary shopId and list every artist there. Real caller:
    // ibCalendar/Sidebar.jsx's shop calendar artist filter, used by Artist- and Staff-role users
    // viewing their own shop - same "not a flat role gate" reasoning as
    // resolvers/appointments.js's callerBelongsToShop.
    getArtistsByShop: withAuth(async (_, { shopId }, context, info, user) => {
      await assertCanAccessShop(user, shopId);
      try {
        // Deliberately no includeArchived here: this feeds the booking flow's artist picker
        // (ibCalendar/Sidebar's old filter, BookSessionDatesForm), and you should never be able to
        // book new work with someone who's been taken off the roster.
        const artists = await findArtistsForShops([shopId], excludeArchived());
        return artists.sort((a, b) =>
          String(a.firstName || '').localeCompare(String(b.firstName || '')),
        );
      } catch (err) {
        rethrow(err);
      }
    }),
  },
};
