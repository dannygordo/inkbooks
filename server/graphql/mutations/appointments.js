const { GraphQLError } = require('graphql');
const Appointment = require('../../models/Appointment');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { updateAppointmentInputSchema, createAppointmentInputSchema, validate } = require('../../utils/validation');

// Nothing previously verified that the caller attributing an Appointment to a shopId actually
// has a real relationship with that shop - anyone could set any shopId on any appointment,
// corrupting that shop's compliance/revenue records. "Current or historical" is deliberate: a
// disconnected connection still counts (see models/ArtistShopConnection.js) - disconnecting stops
// *future* data flow, it doesn't retroactively invalidate a shopId already written under a
// connection that was real at the time.
async function assertHasShopConnection(artistId, shopId) {
  const hasConnection = await ArtistShopConnection.exists({ artistId, shopId });
  if (!hasConnection) {
    throw new AuthenticationError(
      'No connection exists between you and this shop - connect with them first before attributing an appointment to them.',
    );
  }
}

module.exports = {
    createAppointment: withAuth(async (
      _,
      {
        appointmentInput: {
            appointmentDate,
            projectId,
            shopId,
            userId,
            title,
            description,
            total,
            tip,
            shopCutStatus,
            appointmentType,
            appointmentStatus,
            createdAt,
            updatedAt
        }
    },
      context,
      info,
      user,
     ) => {
      const { valid, errors } = validate(createAppointmentInputSchema, {
        appointmentDate, projectId, shopId, userId, title, description, total, tip,
        shopCutStatus, appointmentType, appointmentStatus, createdAt, updatedAt,
      });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // shopId is optional - a fully independent artist's appointment has no shop involved at
      // all, and that's a valid, unauthorized-free case. The check only applies once a shopId is
      // actually being attributed to someone.
      if (shopId) {
        await assertHasShopConnection(user.id, shopId);
      }
      const newAppointment = new Appointment({
        appointmentDate,
        projectId,
        shopId,
        userId,
        title,
        description,
        total,
        tip,
        shopCutStatus,
        appointmentType,
        appointmentStatus,
        createdAt,
        updatedAt
      });
      const appt = await newAppointment.save();
      return appt;
    }),
    // Ownership check here (Admin, or the appointment's own artist/user) can't be expressed as a
    // single withAuth minRole, so it stays inline using the `user` withAuth provides.
    deleteAppointment: withAuth(async (_, { appointmentId }, context, info, user) => {
      try {
        const appointment = await Appointment.findById(appointmentId);
        //TODO: revisit rule that allows a user to delete an appointment.  Might want to inactive appointment instead of delete in order to prevent historical documents from breaking
        if (appointment && (user.role === Constants.ROLES.ADMIN || String(user.id) === String(appointment.userId))) {
          await Appointment.deleteOne({ _id: appointmentId });
          return 'Appointment deleted successfully';
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
        throw new Error(err);
      }
    }),
    updateAppointment: withAuth(async (_, args, context, info, user) => {
      const appointment = args.appointmentInput;
      const { valid, errors } = validate(updateAppointmentInputSchema, appointment);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      try{
        const existingAppointment = await Appointment.findById(appointment.id);
        if (
          existingAppointment &&
          (user.role <= Constants.ROLES.SHOP_ADMIN || String(user.id) === String(existingAppointment.userId))
        ) {
          // shopId, once written, is a permanent attribution - see PRODUCTION_ROADMAP.md's
          // "Known gap" note under the tenancy model. An appointment already tied to a shop can
          // never be re-tied to a different one (or un-tied) after the fact - that's exactly the
          // corruption-of-compliance-records scenario this whole check exists to prevent.
          if (existingAppointment.shopId) {
            const incomingShopId = appointment.shopId;
            if (String(incomingShopId || '') !== String(existingAppointment.shopId)) {
              throw new UserInputError(
                'shopId cannot be changed once an appointment has been attributed to a shop.',
              );
            }
          } else if (appointment.shopId) {
            // Being attributed to a shop for the first time - same authorization createAppointment
            // requires, since this is the same class of action.
            await assertHasShopConnection(user.id, appointment.shopId);
          }

          const res = await Appointment.findByIdAndUpdate({_id: appointment.id}, appointment, {new: true});
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          // Was unconditionally `throw new Error(err)` - that rewraps AuthenticationError/
          // UserInputError into a plain Error, stripping the extensions.code the client relies
          // on (see utils/errors.js's own comment on this). Pre-existing bug, surfaced now
          // because the new shopId checks above would otherwise lose their error type the same
          // way the pre-existing 'Action not allowed' throw already was.
          if (err instanceof GraphQLError) {
            throw err;
          }
          throw new Error(err);
      }
    })
  };
