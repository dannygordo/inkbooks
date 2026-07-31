const Shop = require('../../models/Shop');
const withAuth = require('../../utils/with-auth');

module.exports = {
    Query: {
        getShops: withAuth(async () => {
            try {
                const shops = await Shop.find().sort({ name: 1 });
                return shops;
            } catch (err) {
                throw new Error(err);
            }
        }),
        getShop: withAuth(async (_,{shopId}) => {
            try {
                const shop = await Shop.findById(shopId);
                if (shop) {
                  return shop;
                } throw new Error('Shop not found');
              } catch (err) {
                throw new Error(err);
            }
        })
    }
}
