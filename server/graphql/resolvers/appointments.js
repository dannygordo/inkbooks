const Appointment = require('../../models/Appointment');
const Staff = require('../../models/Staff');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError } = require('../../utils/errors');

// getAppointmentsByShop is called for real by Artist- and Staff-role users viewing their own
// shop's calendar (see client/src/components/ibCalendar/IBCalendar.jsx), not just Shop Admins -
// so this can't be a flat role gate the way getPendingShopCutConfirmations is. checkAuth's JWT
// payload only carries {id, email, username, role} (see utils/check-auth.js/generateToken), no
// userType, so this checks both possible ownership relationships directly rather than branching
// on a userType this function doesn't have.
async function callerBelongsToShop(user, shopId) {
  if (user.role <= Constants.ROLES.SHOP_ADMIN) {
    return true;
  }
  const [isStaffHere, isConnectedArtist] = await Promise.all([
    Staff.exists({ userId: user.id, shopId }),
    ArtistShopConnection.exists({ artistId: user.id, shopId }),
  ]);
  return Boolean(isStaffHere || isConnectedArtist);
}

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
    // Was withAuth with no role/ownership check at all - any authenticated user (including a
    // Client with no relationship to this shop at all) could pass an arbitrary shopId and read
    // that shop's entire appointment history, including total/tip/shopCutAmount for every artist
    // connected there. Found while building the artist dashboard (see PRODUCTION_ROADMAP.md) -
    // this financial data is exactly what that dashboard now surfaces prominently, which is what
    // made the gap worth fixing rather than just noting. Not a flat role gate - see
    // callerBelongsToShop above for why.
    getAppointmentsByShop: withAuth(async (_, { shopId }, context, info, user) => {
      if (!(await callerBelongsToShop(user, shopId))) {
        throw new AuthenticationError('Action not allowed');
      }
      try {
        const appointments = await Appointment.find({shopId: shopId}).sort({ appointmentDate: 1 });
        return appointments;
      } catch (err) {
        throw new Error(err);
      }
    }),
    // Was withAuth with no ownership check at all - any authenticated user could pass an
    // arbitrary userId and read that artist's entire appointment/financial history. Same
    // "the artist themselves, or shop-admin-or-better" convention already used by
    // getArtistShopConnections/getBookingRequests (see resolvers/artistShopConnections.js /
    // resolvers/bookingRequests.js) - not a new pattern invented for this fix.
    getAppointmentsByArtist: withAuth(async (_, { userId }, context, info, user) => {
        if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(userId)) {
          throw new AuthenticationError('Action not allowed');
        }
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
