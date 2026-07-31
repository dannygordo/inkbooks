const Appointment = require('../../models/Appointment');
const checkAuth = require('../../utils/check-auth');

module.exports = {
  Query: {
    async getAppointmentsByShop(_, { shopId }, context) {
      checkAuth(context);
      try {
        const appointments = await Appointment.find({shopId: shopId}).sort({ appointmentDate: 1 });
        return appointments;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getAppointmentsByArtist(_, { userId }, context) {
        checkAuth(context);
        try {
            const appointments = await Appointment.find({userId: userId}).sort({ updatedAt: 1 });
            return appointments;
        } catch (err) {
          throw new Error(err);
        }
      },
    async getAppointment(_, { appointmentId }, context) {
      checkAuth(context);
      try {
        const appointment = await Appointment.findById(appointmentId);
        if (appointment) {
          return appointment;
        } throw new Error('Appointment not found');
      } catch (err) {
        throw new Error(err);
      }
    },
  },
};
