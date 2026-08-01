const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');

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
      return shop;
    }, Constants.ROLES.SHOP_ADMIN),
    deleteShop: withAuth(async (_, { shopId }) => {
      try {
        const shop = await Shop.findById(shopId);
        //TODO: revisit rule that allows a user to delete an shop.  Might want to inactive shop instead of delete in order to prevent historical documents from breaking
        if (shop) {
          await Shop.deleteOne({ _id: shopId });
          return 'Shop deleted successfully';
        }
        throw new Error('Shop not found');
      } catch (err) {
        throw new Error(err);
      }
    }, Constants.ROLES.ADMIN),
    updateShop: withAuth(async (_, args) => {
      try{
        const shop = args.shop;
        const res = await Shop.findByIdAndUpdate({_id: shop.id}, shop, {new: true});
        return res;
      } catch (err) {
          throw new Error(err);
      }
    }, Constants.ROLES.SHOP_ADMIN),
    // Clears the stored Square connection - doesn't touch any Appointment already invoiced under
    // it (an in-flight Square invoice stays payable even after this; only *new* createShopCutInvoice
    // calls are blocked until the shop reconnects). Doesn't call Square's RevokeToken endpoint -
    // simplest correct behavior for this minimal slice is "InkBooks forgets this token"; the
    // seller can also revoke it directly from their own Square dashboard if they want it fully dead.
    disconnectShopSquare: withAuth(async (_, { shopId }) => {
      const shop = await Shop.findById(shopId);
      if (!shop) {
        throw new Error('Shop not found');
      }
      shop.squareConnected = false;
      shop.squareMerchantId = undefined;
      shop.squareLocationId = undefined;
      shop.squareAccessTokenEncrypted = undefined;
      shop.squareRefreshTokenEncrypted = undefined;
      shop.squareTokenExpiresAt = undefined;
      await shop.save();
      return shop;
    }, Constants.ROLES.SHOP_ADMIN),
  };
