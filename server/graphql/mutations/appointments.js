const { AuthenticationError } = require('apollo-server');
const Appointment = require('../../models/Appointment');
const checkAuth = require('../../utils/check-auth');
const { Constants } = require('../../utils/constants');


module.exports = {
    async createAppointment(
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
     ) {
      const user = checkAuth(context);
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
    },
    async deleteAppointment(_, { appointmentId }, context) {
      const user = checkAuth(context);
      try {
        const appointment = await Appointment.findById(appointmentId);
        //TODO: revisit rule that allows a user to delete an appointment.  Might want to inactive appointment instead of delete in order to prevent historical documents from breaking

        //if authenticated user is an admin, or the appointment's own artist/user, delete is permitted
        if (appointment && (user.role === Constants.ROLES.ADMIN || String(user.id) === String(appointment.userId))) {
          await Appointment.deleteOne({ _id: appointmentId });
          return 'Appointment deleted successfully';
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
        throw new Error(err);
      }
    },async updateAppointment(_, args, context) {
      const user = checkAuth(context);
      try{
        const appointment = args.appointmentInput;
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
    }
  };
  