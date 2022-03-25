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
        const appointment = Appointment.findById(appointmentId);
        //TODO: revisit rule that allows a user to delete an appointment.  Might want to inactive appointment instead of delete in order to prevent historical documents from breaking
  
        //if authenticated user is an admin then delete is permitted, otherwise an authentication error will be thrown
        if (appointment && (user.role === Constants.ROLES.ADMIN || user.id === appointment.userId)) {
          await appointment.deleteOne({ appointmentId });
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
        console.log('user');
        console.log(user);
        if (user.role <= Constants.ROLES.SHOP_ADMIN || user.id === appointment.userId) {
  
        console.log('fappointment');
        console.log(appointment);
          const res = await Appointment.findByIdAndUpdate({_id: appointment.id}, appointment, {new: true});
          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          throw new Error(err);
      }
    }
  };
  