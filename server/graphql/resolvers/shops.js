const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const square = require('../../utils/square');
const { signState } = require('../../routes/squareOAuth');
const { getShopIdsForUser, assertCanAccessShop } = require('../../utils/shop-membership');
const { getActiveShopIdForArtist } = require('../../utils/artist-shop');
const { resolveArtistChargeAccount } = require('../../utils/square-account');
const { resolveSquareSettings } = require('../../utils/square-pricing');
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
        // EVERY artist connects their own account, shop or no shop (DECISIONS.md M9). A client pays
        // the artist for the work; what the artist owes the shop is settled afterwards through the
        // shop-cut ledger, the same way it would be with cash.
        //
        // This used to REFUSE an artist who was at a shop, on the reasoning that their charges
        // resolved to the shop's account. They did, and that was the bug: the shop was paid the
        // whole amount and then invoiced the artist for a cut of it.
        //
        // Separate from the shop's own handshake rather than a nullable shopId on it, because the
        // two have genuinely different authorization: that one asks "may you act for this shop",
        // this one only ever acts for the caller, so there is no id to check and nothing to pass in.
        getMySquareAuthorizationUrl: withAuth(async (_, args, context, info, user) => {
          return square.buildAuthorizationUrl(signState('ARTIST', user.id));
        }),
        // The tax rate and offset in force for the caller. Reads through resolveSquareSettings -
        // the same function every charge computes from - rather than looking the owner up again,
        // so the panel cannot show a figure the charge would not use.
        getMySquarePricingSettings: withAuth(async (_, args, context, info, user) => {
          const settings = await resolveSquareSettings(user.id);
          let ownerName = null;
          if (settings.source === 'shop') {
            const shop = await Shop.findById(settings.shopId).select('name');
            ownerName = shop ? shop.name : null;
          }
          return {
            source: settings.source,
            ownerName,
            taxRateBasisPoints: settings.taxRateBasisPoints,
            squareFeeOffsetCents: settings.feeOffsetCents,
            // An independent artist is their own admin (S2); at a shop, the rate belongs to the
            // shop's location and only an admin sets it.
            canEdit: settings.source === 'artist' || user.role <= Constants.ROLES.SHOP_ADMIN,
          };
        }),
        // THE CALLER'S OWN ACCOUNT, always. A client pays the artist for the work, so the account
        // a card is charged into is the artist's whether or not they work at a shop (M9).
        //
        // `source` is therefore always 'artist' here. It is kept on the type rather than removed
        // because the schema is shared with the pricing settings, where the shop/artist split is
        // real - tax is destination-based and does belong to the shop. Two questions with the same
        // shop attached to one of them is exactly what made this wrong the first time, so the
        // answer is spelled out rather than inferred.
        getMySquareConnection: withAuth(async (_, args, context, info, user) => {
          const account = await resolveArtistChargeAccount(user.id);
          return {
            source: 'artist',
            connected: SquareAccount.isUsable(account),
            locationId: account ? account.locationId || null : null,
            connectedAt: account ? account.connectedAt || null : null,
            ownerName: null,
          };
        }),
    }
}
