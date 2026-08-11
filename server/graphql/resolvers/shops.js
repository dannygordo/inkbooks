const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const square = require('../../utils/square');
const { signState } = require('../../routes/squareOAuth');
const { getShopIdsForUser, assertCanAccessShop } = require('../../utils/shop-membership');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { resolveSquareAccountFor } = require('../../utils/square-account');
const SquareAccount = require('../../models/SquareAccount');
const { UserInputError, rethrow } = require('../../utils/errors');

module.exports = {
    Query: {
        // Was withAuth with no restriction at all - any authenticated user, including a Client
        // with no relationship to any shop, could list every shop on the platform (name, email,
        // phone, address, Square connection status). SHOP_ADMIN-or-better still sees every shop -
        // matching the existing, already-documented "no owning-User field on Shop yet to scope a
        // SHOP_ADMIN to just their own shop" limitation noted in resolvers/artistShopConnections.js,
        // not a new gap introduced here. Everyone else only sees the shop(s) they're actually
        // affiliated with, via Staff/Artist/ArtistShopConnection - see utils/shop-membership.js.
        getShops: withAuth(async (_, __, context, info, user) => {
            try {
                // No unscoped branch, for anyone. Every caller sees exactly the shops they are
                // assigned to; a caller assigned to none sees none.
                const shopIds = await getShopIdsForUser(user.id);
                if (shopIds.length === 0) {
                    return [];
                }
                return await Shop.find({ _id: { $in: shopIds } }).sort({ name: 1 });
            } catch (err) {
                rethrow(err);
            }
        }),
        // Was withAuth with no restriction at all - any authenticated user could pass an
        // arbitrary shopId and read that shop's full contact/Square-connection details. Same
        // "own the resource, or shop-admin-or-better" convention as getShops above.
        getShop: withAuth(async (_, { shopId }, context, info, user) => {
            // Outside the try: the catch below rewraps everything as a generic Error, and an
            // authorization failure shouldn't be reported as if the lookup broke.
            await assertCanAccessShop(user, shopId);
            try {
                const shop = await Shop.findById(shopId);
                if (shop) {
                  return shop;
                } throw new UserInputError('Errors', { errors: { shopId: 'Shop not found.' } });
              } catch (err) {
                rethrow(err);
            }
        }),
        // Shop-admin-or-better only, same convention as everywhere else in this file - see
        // PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. Returns a one-time authorization URL
        // pointing at Square's hosted consent page; `state` is a signed, 15-minute token binding
        // this attempt to shopId (see routes/squareOAuth.js) so the eventual callback can't be
        // pointed at a different shop.
        getSquareAuthorizationUrl: withAuth(async (_, { shopId }, context, info, user) => {
          // The role gate alone let a shop admin start an OAuth handshake against a shop they
          // have nothing to do with. The signed `state` binds the callback to this shopId, so
          // without this check that binding is to someone else's shop.
          await assertCanAccessShop(user, shopId);
          const shop = await Shop.findById(shopId);
          if (!shop) {
            throw new UserInputError('Errors', { errors: { shopId: 'Shop not found.' } });
          }
          return square.buildAuthorizationUrl(signState('SHOP', shopId));
        }, Constants.ROLES.SHOP_ADMIN),
        // The independent artist's route to the same handshake (DECISIONS.md M9, S2). Separate
        // from the shop one rather than a nullable shopId on it, because the two have genuinely
        // different authorization: that one asks "may you act for this shop", this one only ever
        // acts for the caller themselves, so there is no id to check and nothing to pass in.
        //
        // Refuses an artist who is currently at a shop. Not a permission problem - under M8 their
        // tax rate and fee offset already resolve to the shop, so a personal Square account would
        // be a connection nothing routes to, sitting there looking like it works.
        getMySquareAuthorizationUrl: withAuth(async (_, args, context, info, user) => {
          const shopId = await getActiveShopIdForArtist(user.id);
          if (shopId) {
            throw new UserInputError('Errors', {
              errors: {
                square:
                  'Your shop holds the Square connection for your sessions - a shop admin connects it.',
              },
            });
          }
          return square.buildAuthorizationUrl(signState('ARTIST', user.id));
        }),
        // Where the caller's sessions actually charge, resolved through the same owner rule as
        // their tax rate. An artist at a shop gets source 'shop' and the shop's connection state,
        // even though they have no control over it - because that is the true answer to "where
        // does my money go", and a panel that showed them their own empty account instead would be
        // inviting them to build a connection nothing routes to.
        getMySquareConnection: withAuth(async (_, args, context, info, user) => {
          const { source, ownerType, ownerId, account } = await resolveSquareAccountFor(user.id);
          let ownerName = null;
          if (ownerType === 'SHOP') {
            const shop = await Shop.findById(ownerId).select('name');
            ownerName = shop ? shop.name : null;
          }
          return {
            source,
            connected: SquareAccount.isUsable(account),
            locationId: account ? account.locationId || null : null,
            connectedAt: account ? account.connectedAt || null : null,
            ownerName,
          };
        }),
    }
}
