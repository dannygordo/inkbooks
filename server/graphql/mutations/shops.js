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
        const shop = Shop.findById(shopId);
        //TODO: revisit rule that allows a user to delete an shop.  Might want to inactive shop instead of delete in order to prevent historical documents from breaking
  
        //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
        if (shop && user.role === Constants.ROLES.ADMIN) {
          await shop.deleteOne({ shopId });
          return 'Shop deleted successfully';
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
        throw new Error(err);
      }
    },
  };
  