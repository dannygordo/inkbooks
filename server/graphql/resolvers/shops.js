const Shop = require('../../models/Shop');
const checkAuth = require('../../utils/check-auth');

module.exports = {
    Query: {
        getShops: async (_, args, context) => {
            checkAuth(context);
            try {
                const shops = await Shop.find().sort({ name: 1 });
                return shops;
            } catch (err) {
                throw new Error(err);
            }
        },
        getShop: async (_,{shopId}, context) => {
            checkAuth(context);
            try {
                const shop = await Shop.findById(shopId);
                if (shop) {
                  return shop;
                } throw new Error('Shop not found');
              } catch (err) {
                throw new Error(err);
            }
        }
    }
}