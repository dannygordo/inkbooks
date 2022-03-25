const Appointment = require('../../models/Appointment');

module.exports = {
  Query: {
    async getAppointmentsByShop(_, { shopId }) {
      try {
        const appointments = await Appointment.find({shopId: shopId}).sort({ appointmentDate: 1 });
        return appointments;
      } catch (err) {
        throw new Error(err);
      }
    },
    async getAppointmentsByArtist(_, { userId }) {
        try {
            const appointments = await Appointment.find({userId: userId}).sort({ updatedAt: 1 });
            return appointments;
        } catch (err) {
          throw new Error(err);
        }
      },
    async getAppointment(_, { appointmentId }) {
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
