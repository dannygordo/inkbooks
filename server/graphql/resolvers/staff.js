const Staff = require('../../models/Staff');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { getShopIdsForUser } = require('../../utils/shop-membership');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could list every staff member (name, email, phone, address) at every shop on the platform.
    // SHOP_ADMIN-or-better still sees everyone - see the matching comment in resolvers/shops.js.
    // Staff/Artist callers only see staff at the shop(s) they're actually affiliated with.
    getStaff: withAuth(async (_, __, context, info, user) => {
      try {
        if (user.role <= Constants.ROLES.SHOP_ADMIN) {
          return await Staff.find().sort({ lastName: 1 });
        }
        const shopIds = await getShopIdsForUser(user.id);
        if (shopIds.length === 0) {
          return [];
        }
        return await Staff.find({ shopId: { $in: shopIds } }).sort({ lastName: 1 });
      } catch (err) {
        throw new Error(err);
      }
    }),
    getOneStaff: withAuth(async (_, { staffId }) => {
      try {
        const staff = await Staff.findById(staffId);
        if (staff) {
          return staff;
        } throw new Error('Staff not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
