const Appointment = require('../../models/Appointment');
const withAuth = require('../../utils/with-auth');

module.exports = {
  Query: {
    getAppointmentsByShop: withAuth(async (_, { shopId }) => {
      try {
        const appointments = await Appointment.find({shopId: shopId}).sort({ appointmentDate: 1 });
        return appointments;
      } catch (err) {
        throw new Error(err);
      }
    }),
    getAppointmentsByArtist: withAuth(async (_, { userId }) => {
        try {
            const appointments = await Appointment.find({userId: userId}).sort({ updatedAt: 1 });
            return appointments;
        } catch (err) {
          throw new Error(err);
        }
      }),
    getAppointment: withAuth(async (_, { appointmentId }) => {
      try {
        const appointment = await Appointment.findById(appointmentId);
        if (appointment) {
          return appointment;
        } throw new Error('Appointment not found');
      } catch (err) {
        throw new Error(err);
      }
    }),
  },
};
