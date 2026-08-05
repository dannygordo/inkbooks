const Appointment = require('../../models/Appointment');
const Project = require('../../models/Project');
const BookingRequest = require('../../models/BookingRequest');
const withAuth = require('../../utils/with-auth');
const { assertCanManageArtist } = require('../../utils/shop-membership');

/**
 * Which deposits can be applied to a given session.
 *
 * Answering this needs a join Appointment can't do on its own: it has no clientId. A session
 * reaches its client through its Project, a consult through its BookingRequest. So this resolves
 * the target's client first, then finds every unspent deposit belonging to that same client.
 *
 * Scoped by CLIENT rather than by project on purpose. A deposit is usually taken at a consult
 * before the project exists, and a client may well have more than one piece of work in flight -
 * restricting to "deposits on this project" would hide the deposit in the single most common
 * case, which is the one where a consult became this very project.
 */
async function clientIdForAppointment(appointment) {
  if (appointment.projectId) {
    const project = await Project.findById(appointment.projectId).select('clientId');
    return project ? String(project.clientId) : null;
  }
  if (appointment.bookingRequestId) {
    const bookingRequest = await BookingRequest.findById(appointment.bookingRequestId).select(
      'clientId',
    );
    return bookingRequest ? String(bookingRequest.clientId) : null;
  }
  return null;
}

module.exports = {
  Query: {
    getAvailableDeposits: withAuth(
      async (_, { appointmentId }, context, info, user) => {
        const target = await Appointment.findById(appointmentId);
        if (!target) {
          return [];
        }
        // The appointment's own artist, or a shop admin at their shop. `role <= SHOP_ADMIN`
        // alone let a shop admin see which unspent deposits an artist at another shop is holding.
        await assertCanManageArtist(user, target.userId);

        const clientId = await clientIdForAppointment(target);
        if (!clientId) {
          return [];
        }

        // Every unspent deposit this artist holds. Narrowed to the caller's own appointments
        // first so the client-matching pass below runs over a small set rather than the whole
        // collection - and so one artist can never see another's deposits, even before the
        // client check applies.
        const candidates = await Appointment.find({
          userId: target.userId,
          depositStatus: 'available',
          depositCents: { $gt: 0 },
          _id: { $ne: target._id },
        }).sort({ depositCollectedAt: 1 });

        const matches = await Promise.all(
          candidates.map(async (candidate) => {
            const candidateClientId = await clientIdForAppointment(candidate);
            return candidateClientId === clientId ? candidate : null;
          }),
        );
        return matches.filter(Boolean);
      },
    ),
  },
};
