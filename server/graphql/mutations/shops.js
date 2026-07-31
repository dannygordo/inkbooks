const { AuthenticationError } = require('apollo-server');
const Shop = require('../../models/Shop');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');


module.exports = {
    async createShop(
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
    ) {
      const user = checkAuth(context);
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
  
      console.log(user);
      const shop = await newShop.save();
      return shop;
    },
    async deleteShop(_, { shopId }, context) {
      const user = checkAuth(context);
      try {
        const shop = await Shop.findById(shopId);
        //TODO: revisit rule that allows a user to delete an shop.  Might want to inactive shop instead of delete in order to prevent historical documents from breaking

        //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
        if (shop && user.role === Constants.ROLES.ADMIN) {
          await Shop.deleteOne({ _id: shopId });
          return 'Shop deleted successfully';
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
        throw new Error(err);
      }
    },async updateShop(_, args, context) {
      const user = checkAuth(context);
      try{
        const shop = args.shop;
        console.log('user');
        console.log(user);
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
  
        console.log('fshop');
        console.log(shop);
          const res = await Shop.findByIdAndUpdate({_id: shop.id}, shop, {new: true});
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
      }
    }
  };
  