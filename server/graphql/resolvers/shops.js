const Shop = require('../../models/Shop');

module.exports = {
    Query: {
        getShops: async () => {
            try {
                const shops = await Shop.find().sort({ name: 1 });
                return shops;
            } catch (err) {
                throw new Error(err);
            }
        },
        getShop: async (_,{shopId}, context) => {
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