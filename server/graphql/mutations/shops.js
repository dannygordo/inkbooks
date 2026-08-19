const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { assertCanAccessShop } = require('../../utils/shop-membership');
const { findAccountForOwner } = require('../../utils/square-account');
const { UserInputError, rethrow } = require('../../utils/errors');
const { normalizeSlug: normalizeShopSlug, assertSlugAvailable: assertShopSlugAvailable } = require('../../utils/shop-slug');
const { seedDefaultForms } = require('../../utils/seed-default-forms');

module.exports = {
    createShop: withAuth(async (
      _,
      {
        name,
        email,
        phone,
        address,
        city,
        state,
        zip,
        instagram,
        facebook,
        logo,
        website,
        shopMinimum,
        hourlyRate,
        billingType,
        status,
      },
      context,
      info,
      user,
    ) => {
      const newShop = new Shop({
        name,
        email,
        phone,
        address,
        city,
        state,
        zip,
        instagram,
        facebook,
        logo,
        website,
        shopMinimum,
        hourlyRate,
        billingType,
        status,
      });
      const shop = await newShop.save();
      // Every shop gets its own Booking Request + Consent forms from the moment it exists - see
      // utils/seed-default-forms.js's own header comment. registerAccount's shop branch (the more
      // common path) does the same thing for the same reason; this covers the other way a Shop
      // row comes into existence.
      await seedDefaultForms({ shopId: shop._id }, user.id);
      return shop;
    }, Constants.ROLES.SHOP_ADMIN),
    updateShop: withAuth(async (_, args, context, info, user) => {
      try{
        const shop = args.shop;
        // A shop admin editing a shop's name, rates, billing type and shop-cut percentage - which
        // must be their own shop. The minRole was the entire check before this.
        await assertCanAccessShop(user, shop.id);
        const res = await Shop.findByIdAndUpdate({_id: shop.id}, shop, {new: true});
        return res;
      } catch (err) {
          rethrow(err);
      }
    }, Constants.ROLES.SHOP_ADMIN),
    // Self-service - see typeDefs.js's comment on why this is separate from updateShop. Mirrors
    // updateMyBookingSlug (mutations/artists.js) shape-for-shape: courtesy-check via
    // assertSlugAvailable, empty string unsets, and the unique index on Shop.formSlug is the real
    // guarantee behind the courtesy check - two shop admins racing both pass assertSlugAvailable
    // and one lands in the catch below.
    updateMyShopFormSlug: withAuth(async (_, { shopId, slug }, context, info, user) => {
      // Same authority as updateShop: must be shop_admin-or-better OF THIS SHOP, not just anyone
      // holding the SHOP_ADMIN role at a different shop.
      await assertCanAccessShop(user, shopId);
      const value = normalizeShopSlug(slug);
      const update = value === ''
        ? { $unset: { formSlug: '' } }
        : { $set: { formSlug: await assertShopSlugAvailable(value, shopId) } };
      try {
        return await Shop.findByIdAndUpdate(shopId, update, { new: true });
      } catch (err) {
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.formSlug) {
          throw new UserInputError('Errors', {
            errors: { formSlug: 'That shop link is already taken.' },
          });
        }
        rethrow(err);
      }
    }, Constants.ROLES.SHOP_ADMIN),
    // Clears the stored Square connection - doesn't touch any Appointment already invoiced under
    // it (an in-flight Square invoice stays payable even after this; only *new* createShopCutInvoice
    // calls are blocked until the shop reconnects). Doesn't call Square's RevokeToken endpoint -
    // simplest correct behavior for this minimal slice is "InkBooks forgets this token"; the
    // seller can also revoke it directly from their own Square dashboard if they want it fully dead.
    disconnectShopSquare: withAuth(async (_, { shopId }, context, info, user) => {
      // Otherwise any shop admin could cut any other shop off from taking payment.
      await assertCanAccessShop(user, shopId);
      const shop = await Shop.findById(shopId);
      if (!shop) {
        throw new UserInputError('Errors', { errors: { shopId: 'Shop not found.' } });
      }
      // The connection lives on SquareAccount now (DECISIONS.md M9). CLEARED, not deleted: the row
      // is one per owner and a reconnect writes back into it, so removing it would only mean the
      // next connect has to recreate what we just threw away. Nothing here is a credential once
      // these fields are unset.
      const account = await findAccountForOwner('SHOP', shopId);
      if (account) {
        account.connected = false;
        account.merchantId = undefined;
        account.locationId = undefined;
        account.accessTokenEncrypted = undefined;
        account.refreshTokenEncrypted = undefined;
        account.tokenExpiresAt = undefined;
        await account.save();
      }
      return shop;
    }, Constants.ROLES.SHOP_ADMIN),
    // The artist's own counterpart. No id argument - like getMySquareAuthorizationUrl, it can only
    // ever act for the caller, so there is nothing to authorize beyond being signed in.
    //
    // Works for every artist, shop or no shop. It used to refuse anyone at a shop, which followed
    // from the account resolution being wrong: charges were routed to the shop, so a personal
    // account looked like something the artist should not be managing. They own it - it is the
    // account their clients pay into (M9).
    disconnectMySquare: withAuth(async (_, args, context, info, user) => {
      // Cleared, not deleted - same reasoning as disconnectShopSquare above.
      const account = await findAccountForOwner('ARTIST', user.id);
      if (account) {
        account.connected = false;
        account.merchantId = undefined;
        account.locationId = undefined;
        account.accessTokenEncrypted = undefined;
        account.refreshTokenEncrypted = undefined;
        account.tokenExpiresAt = undefined;
        await account.save();
      }
      return {
        source: 'artist',
        connected: false,
        locationId: null,
        connectedAt: null,
        ownerName: null,
      };
    }),
  };
