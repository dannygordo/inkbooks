const Staff = require('../../models/Staff');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { assertCanAccessShop } = require('../../utils/shop-membership');

module.exports = {
  createStaff: withAuth(async (
    _,
    {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      userId,
      status,
      title,
      shopId
    },
    context,
    info,
    user,
  ) => {
    // A shop admin can only add staff to their own shop.
    await assertCanAccessShop(user, shopId);
    const newStaff = new Staff({
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      instagram,
      facebook,
      avatar,
      userId,
      status,
      title,
      shopId
    });
    const staff = await newStaff.save();
    return staff;
  }, Constants.ROLES.SHOP_ADMIN),
  updateStaff: withAuth(async (_, args, context, info, user) => {
    try{
      const staff = args.staff;
      const existing = await Staff.findById(staff.id).select('shopId');
      if (!existing) {
        throw new Error('Staff not found');
      }
      await assertCanAccessShop(user, existing.shopId);
      const res = await Staff.findByIdAndUpdate({_id: staff.id}, staff, {new: true});
      return res;
    } catch (err) {
        throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN)
};
