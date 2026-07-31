const Staff = require('../../models/Staff');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');

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
  ) => {
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
  deleteStaff: withAuth(async (_, { staffId }) => {
    try {
      const staff = await Staff.findById(staffId);
      //TODO: revisit rule that allows a user to delete an staff.  Might want to inactive staff instead of delete in order to prevent historical documents from breaking
      if (staff) {
        await Staff.deleteOne({ _id: staffId });
        return 'Staff deleted successfully';
      }
      throw new Error('Staff not found');
    } catch (err) {
      throw new Error(err);
    }
  }, Constants.ROLES.ADMIN),
  updateStaff: withAuth(async (_, args) => {
    try{
      const staff = args.staff;
      const res = await Staff.findByIdAndUpdate({_id: staff.id}, staff, {new: true});
      return res;
    } catch (err) {
        throw new Error(err);
    }
  }, Constants.ROLES.SHOP_ADMIN)
};
