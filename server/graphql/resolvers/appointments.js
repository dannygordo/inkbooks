const Appointment = require('../../models/Appointment');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');

module.exports = {
  Query: {
    // Shop-admin-or-better, same loose convention as getShopArtistConnections (Shop has no
    // owning-User field yet to check a caller belongs to *this specific* shop - see
    // resolvers/artistShopConnections.js's comment on the same gap).
    getPendingShopCutConfirmations: withAuth(async (_, { shopId }) => {
      return Appointment.find({ shopId, shopCutStatus: 'pending_confirmation' }).sort({
        shopCutMarkedPaidAt: 1,
      });
    }, Constants.ROLES.SHOP_ADMIN),
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
