const Staff = require('../../models/Staff');
const withAuth = require('../../utils/with-auth');
const { UserInputError, AuthenticationError, rethrow } = require('../../utils/errors');
const { getShopIdsForUser } = require('../../utils/shop-membership');
const { archiveFilter } = require('../../utils/archiving');

module.exports = {
  Query: {
    // Was withAuth with no restriction at all - any authenticated user, including a Client,
    // could list every staff member (name, email, phone, address) at every shop on the platform.
    // SHOP_ADMIN-or-better still sees everyone - see the matching comment in resolvers/shops.js.
    // Staff/Artist callers only see staff at the shop(s) they're actually affiliated with.
    getStaff: withAuth(async (_, { includeArchived }, context, info, user) => {
      try {
        // No unscoped branch, for anyone - see utils/shop-membership.js's role rule.
        const shopIds = await getShopIdsForUser(user.id);
        if (shopIds.length === 0) {
          return [];
        }
        return await Staff.find(
          archiveFilter(includeArchived, { shopId: { $in: shopIds } }),
        ).sort({ lastName: 1 });
      } catch (err) {
        rethrow(err);
      }
    }),
    // Was withAuth with no restriction at all - any authenticated user could pass an arbitrary
    // staffId and read that person's contact info. Allowed: shop-admin-or-better, the staff
    // member themselves, or anyone affiliated with that same shop.
    getOneStaff: withAuth(async (_, { staffId }, context, info, user) => {
      try {
        const staff = await Staff.findById(staffId);
        if (!staff) {
          throw new UserInputError('Errors', { errors: { staffId: 'Staff not found.' } });
        }
        if (String(user.id) !== String(staff.userId)) {
          const shopIds = await getShopIdsForUser(user.id);
          if (!shopIds.map(String).includes(String(staff.shopId))) {
            throw new AuthenticationError('Action not allowed');
          }
        }
        return staff;
      } catch (err) {
        rethrow(err);
      }
    }),
  },
};
