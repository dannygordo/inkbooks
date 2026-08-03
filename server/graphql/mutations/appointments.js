const { GraphQLError } = require('graphql');
const Appointment = require('../../models/Appointment');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { updateAppointmentInputSchema, createAppointmentInputSchema, appointmentIdInputSchema, validate } = require('../../utils/validation');

// Same ownership shape as updateAppointment/deleteAppointment below - Admin/SHOP_ADMIN-or-better,
// or the appointment's own artist. Shared by all three session-timer mutations so that check is
// written once, not copy-pasted three times.
async function loadOwnedAppointment(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
  }
  if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(appointment.userId)) {
    throw new AuthenticationError('Action not allowed');
  }
  return appointment;
}

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
          //
          // Only enforced when the caller's payload actually *includes* a shopId key - a plain
          // JS `in` check, not just `appointment.shopId` being falsy, matters here: this mutation
          // is also used for partial-field saves (see AppointmentService.UPDATE_SESSION_DETAILS,
          // used by SessionDetail.jsx's timer/notes/total save, which deliberately never sends
          // shopId/title/description/etc at all - see that query's own comment on why). Treating
          // "the caller didn't send shopId this time" the same as "the caller is trying to null it
          // out" broke every save on any appointment already attributed to a shop the instant
          // convertBookingRequest started actually setting shopId correctly (see that resolver's
          // own fix) - previously this never fired in practice because shopId was never set to
          // begin with. FindById/findByIdAndUpdate below already only apply the keys actually
          // present in `appointment`, so omitting shopId here correctly leaves it untouched.
          if ('shopId' in appointment && existingAppointment.shopId) {
            const incomingShopId = appointment.shopId;
            if (String(incomingShopId || '') !== String(existingAppointment.shopId)) {
              throw new UserInputError(
                'shopId cannot be changed once an appointment has been attributed to a shop.',
              );
            }
          } else if ('shopId' in appointment && appointment.shopId) {
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
    }),
    startSessionTimer: withAuth(async (_, args, context, info, user) => {
      const { valid, errors } = validate(appointmentIdInputSchema, args);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const appointment = await loadOwnedAppointment(args.appointmentId, user);
      // Starting an already-running timer would stomp timerStartedAt and silently lose whatever
      // time had already elapsed in the current interval - a no-op is the safe behavior here,
      // not an error, since a double-click of a "Start" button is the realistic trigger.
      if (appointment.timerStatus !== 'running') {
        appointment.timerStatus = 'running';
        appointment.timerStartedAt = new Date();
        await appointment.save();
      }
      return appointment;
    }),
    stopSessionTimer: withAuth(async (_, args, context, info, user) => {
      const { valid, errors } = validate(appointmentIdInputSchema, args);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const appointment = await loadOwnedAppointment(args.appointmentId, user);
      // Stopping an already-stopped timer is a no-op for the same reason as above - nothing to
      // bank, and there's no timerStartedAt to safely compute an elapsed interval from.
      if (appointment.timerStatus === 'running' && appointment.timerStartedAt) {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((Date.now() - appointment.timerStartedAt.getTime()) / 1000),
        );
        appointment.accumulatedSeconds = (appointment.accumulatedSeconds || 0) + elapsedSeconds;
        appointment.timerStatus = 'stopped';
        appointment.timerStartedAt = null;
        await appointment.save();
      }
      return appointment;
    }),
    resetSessionTimer: withAuth(async (_, args, context, info, user) => {
      const { valid, errors } = validate(appointmentIdInputSchema, args);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const appointment = await loadOwnedAppointment(args.appointmentId, user);
      appointment.accumulatedSeconds = 0;
      appointment.timerStatus = 'stopped';
      appointment.timerStartedAt = null;
      await appointment.save();
      return appointment;
    }),
  };
