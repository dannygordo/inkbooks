const Staff = require('../../models/Staff');

module.exports = {
  Query: {
    async getStaff() {
      try {
        const staff = await Staff.find().sort({ lastName: 1 });
        return staff;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getOneStaff(_, { staffId }) {
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
