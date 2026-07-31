const Staff = require('../../models/Staff');
const checkAuth = require('../../utils/check-auth');

module.exports = {
  Query: {
    async getStaff(_, args, context) {
      checkAuth(context);
      try {
        const staff = await Staff.find().sort({ lastName: 1 });
        return staff;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getOneStaff(_, { staffId }, context) {
      checkAuth(context);
      try {
        const staff = await Staff.findById(staffId);
        if (staff) {
          return staff;
        } throw new Error('Staff not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  },
};
