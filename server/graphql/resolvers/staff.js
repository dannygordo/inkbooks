const Staff = require('../../models/Staff');
const withAuth = require('../../utils/with-auth');

module.exports = {
  Query: {
    getStaff: withAuth(async () => {
      try {
        const staff = await Staff.find().sort({ lastName: 1 });
        return staff;
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
