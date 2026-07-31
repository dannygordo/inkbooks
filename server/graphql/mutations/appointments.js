const Appointment = require('../../models/Appointment');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { Constants } = require('../../utils/constants');
const { updateAppointmentInputSchema, createAppointmentInputSchema, validate } = require('../../utils/validation');

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
     ) => {
      const { valid, errors } = validate(createAppointmentInputSchema, {
        appointmentDate, projectId, shopId, userId, title, description, total, tip,
        shopCutStatus, appointmentType, appointmentStatus, createdAt, updatedAt,
      });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
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
          const res = await Appointment.findByIdAndUpdate({_id: appointment.id}, appointment, {new: true});
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
      }
    })
  };
