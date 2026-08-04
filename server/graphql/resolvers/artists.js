const Artist = require('../../models/Artist');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');
const { getShopIdsForUser } = require('../../utils/shop-membership');

module.exports = {
  Query: {
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
    getArtists: withAuth(async (_, __, context, info, user) => {
      try {
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
          return await Artist.find().sort({ startDate: 1 });
        }
        const shopIds = await getShopIdsForUser(user.id);
        if (shopIds.length === 0) {
          return [];
        }
        return await Artist.find({ shopId: { $in: shopIds } }).sort({ startDate: 1 });
      } catch (err) {
        throw new Error(err);
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
          throw new Error('Artist not found');
        }
        const isSelf = String(user.id) === String(artist.userId);
        if (!isSelf && user.role > Constants.ROLES.SHOP_ADMIN) {
          // Staff, but not Artists or Clients - and only Staff at this artist's own shop. Role
          // alone can't express "same shop", which is why both halves are checked.
          const shopIds = await getShopIdsForUser(user.id);
          const sameShop =
            artist.shopId && shopIds.map(String).includes(String(artist.shopId));
          if (user.role > Constants.ROLES.SHOP_STAFF || !sameShop) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return artist;
      } catch (err) {
        throw new Error(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could pass an arbitrary shopId and list every artist there. Real caller:
    // ibCalendar/Sidebar.jsx's shop calendar artist filter, used by Artist- and Staff-role users
    // viewing their own shop - same "not a flat role gate" reasoning as
    // resolvers/appointments.js's callerBelongsToShop.
    getArtistsByShop: withAuth(async (_, { shopId }, context, info, user) => {
      try {
        if (user.role > Constants.ROLES.SHOP_ADMIN) {
          const shopIds = await getShopIdsForUser(user.id);
          if (!shopIds.map(String).includes(String(shopId))) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        const artists = await Artist.find({ shopId: shopId }).sort({ firstName: 1 });
        if (artists) {
          return artists;
        } throw new Error('Artists not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
