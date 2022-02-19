const { AuthenticationError } = require('apollo-server');
const Staff = require('../../models/Staff');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  async createStaff(
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
  ) {
    const user = checkAuth(context);
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
    if(user.role <= Constants.ROLES.SHOP_ADMIN) {
      const staff = await newStaff.save();
      return staff;
    }
    throw new AuthenticationError('Action not allowed');
  },
  async deleteStaff(_, { staffId }, context) {
    const user = checkAuth(context);
    try {
      const staff = Staff.findById(staffId);
      //TODO: revisit rule that allows a user to delete an staff.  Might want to inactive staff instead of delete in order to prevent historical documents from breaking

      //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
      if (staff && user.role === Constants.ROLES.ADMIN) {
        await staff.deleteOne({ staffId });
        return 'Staff deleted successfully';
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
      throw new Error(err);
    }
  },
  async updateStaff(_, args, context) {
    const user = checkAuth(context);
    try{
      const staff = args.staff;
      console.log('user');
      console.log(user);
      if (user.role <= Constants.ROLES.SHOP_ADMIN) {

      console.log('fstaff');
      console.log(staff);
        const res = await Staff.findByIdAndUpdate({_id: staff.id}, staff, {new: true});
        return res;
      }
      throw new AuthenticationError('Action not allowed');
    } catch (err) {
        throw new Error(err);
    }
  }
};
