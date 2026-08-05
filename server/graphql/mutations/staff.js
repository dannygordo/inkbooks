const Staff = require('../../models/Staff');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { assertCanAccessShop } = require('../../utils/shop-membership');
const { assertNoArchiveTransition } = require('../../utils/archiving');
const { UserInputError } = require('../../utils/errors');

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
  // Same shape as archiveArtist - see the note there. Scoped by the staff member's own shopId
  // rather than by shared artists, since Staff.shopId is a direct relationship.
  archiveStaff: withAuth(async (_, { staffId }, context, info, user) => {
    const staff = await Staff.findById(staffId);
    if (!staff) {
      throw new Error('Staff not found');
    }
    await assertCanAccessShop(user, staff.shopId);
    staff.status = Constants.STAFF_STATUS.ARCHIVED;
    await staff.save();
    return staff;
  }, Constants.ROLES.SHOP_ADMIN),
  unarchiveStaff: withAuth(async (_, { staffId }, context, info, user) => {
    const staff = await Staff.findById(staffId);
    if (!staff) {
      throw new Error('Staff not found');
    }
    await assertCanAccessShop(user, staff.shopId);
    staff.status = Constants.STAFF_STATUS.ACTIVE;
    await staff.save();
    return staff;
  }, Constants.ROLES.SHOP_ADMIN),
  updateStaff: withAuth(async (_, args, context, info, user) => {
    // Outside the try - see the matching note in mutations/artists.js on why.
    const staff = args.staff;
    const existing = await Staff.findById(staff.id).select('shopId status');
    if (!existing) {
      throw new UserInputError('Errors', { errors: { id: 'Staff not found' } });
    }
    await assertCanAccessShop(user, existing.shopId);
    assertNoArchiveTransition(existing, staff.status, 'archiveStaff');
    try{
      const res = await Staff.findByIdAndUpdate({_id: staff.id}, staff, {new: true});
      return res;
    } catch (err) {
        throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN)
};
