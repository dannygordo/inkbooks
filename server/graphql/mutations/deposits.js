const { GraphQLError } = require('graphql');
const Appointment = require('../../models/Appointment');
const Project = require('../../models/Project');
const BookingRequest = require('../../models/BookingRequest');
const withAuth = require('../../utils/with-auth');
const { Constants } = require('../../utils/constants');
const { AuthenticationError, UserInputError } = require('../../utils/errors');
const { applyShopCut } = require('../../utils/shop-cut');

/**
 * Deposits.
 *
 * A deposit is taken at the consult and credited against a later session. The two operations here
 * are recording one and spending one, and the second is the one with teeth: a deposit must be
 * applicable exactly once, ever.
 *
 * That single-use guarantee is enforced by a conditional update on the deposit's own status - see
 * applyDeposit below - rather than by reading the status, deciding, and then writing. The
 * read-then-write version looks correct and is not: two clicks landing together both read
 * 'available', both decide it's fine, and the same $200 gets credited to two sessions. This is a
 * financial record; "unlikely" isn't a good enough answer there.
 */

// Resolves which client an appointment belongs to. A session gets there through its Project; a
// consult through the BookingRequest it came from. Appointment has no clientId of its own, which
// is why this exists at all rather than being a field read.
async function resolveClientId(appointment) {
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

// Admin, or the artist the appointment belongs to. Same ownership shape as
// loadOwnedAppointment in mutations/appointments.js.
async function loadOwnedAppointment(appointmentId, user, label) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new UserInputError('Errors', { errors: { [label]: 'Appointment not found' } });
  }
  if (
    user.role > Constants.ROLES.SHOP_ADMIN &&
    String(user.id) !== String(appointment.userId)
  ) {
    throw new AuthenticationError('Action not allowed');
  }
  return appointment;
}

module.exports = {
  /**
   * Records a deposit taken on an appointment - normally the consult.
   *
   * subtotalCents is set to the deposit amount as well, and that is not redundant. The shop cut
   * is computed from subtotalCents, and the agreed rule deducts an applied deposit from the
   * session it lands on. If the cut weren't taken here, at collection, the shop would end up
   * taking no cut at all on the deposit portion of every job. See utils/shop-cut.js.
   *
   * Re-recording on an appointment whose deposit has already been spent is refused rather than
   * silently overwriting - the applied credit on the other side would then disagree with the
   * amount recorded here, and a ledger that disagrees with itself is worse than one that says no.
   */
  recordDeposit: withAuth(async (_, { appointmentId, depositCents }, context, info, user) => {
    try {
      if (!Number.isInteger(depositCents) || depositCents <= 0) {
        throw new UserInputError('Errors', {
          errors: { depositCents: 'Deposit must be a positive whole number of cents' },
        });
      }
      const appointment = await loadOwnedAppointment(appointmentId, user, 'appointmentId');
      if (appointment.depositStatus === 'applied') {
        throw new UserInputError('Errors', {
          errors: {
            appointmentId:
              'This deposit has already been applied to a session and can no longer be changed.',
          },
        });
      }

      appointment.depositCents = depositCents;
      appointment.depositStatus = 'available';
      appointment.depositCollectedAt = appointment.depositCollectedAt || new Date();
      // The deposit IS the money taken at this appointment - so it's this appointment's subtotal
      // and its total. A consult that collected $200 is a $200 transaction; leaving those at zero
      // would make the deposit invisible to every revenue figure in the app, since analytics sums
      // totalCents.
      appointment.subtotalCents = depositCents;
      appointment.totalCents =
        depositCents + (appointment.taxCents || 0) + (appointment.feeCents || 0) + (appointment.tipCents || 0);
      await applyShopCut(appointment);
      await appointment.save();
      return appointment;
    } catch (err) {
      if (err instanceof GraphQLError) {
        throw err;
      }
      throw new Error(err);
    }
  }),

  /**
   * Spends an available deposit against a session.
   *
   * The single-use guarantee lives in the findOneAndUpdate below: the filter includes
   * `depositStatus: 'available'`, so the flip to 'applied' and the check that it was still
   * available are the same atomic operation. If a second concurrent call arrives, its filter
   * matches nothing and it gets a clean "already applied" error rather than a second credit.
   *
   * Deliberately NOT a read-check-write, which is what this obviously wants to be and which would
   * be wrong in exactly the case that costs money.
   */
  applyDeposit: withAuth(
    async (_, { depositAppointmentId, targetAppointmentId }, context, info, user) => {
      try {
        if (String(depositAppointmentId) === String(targetAppointmentId)) {
          throw new UserInputError('Errors', {
            errors: { targetAppointmentId: 'A deposit cannot be applied to itself.' },
          });
        }
        const target = await loadOwnedAppointment(targetAppointmentId, user, 'targetAppointmentId');
        const deposit = await Appointment.findById(depositAppointmentId);
        if (!deposit) {
          throw new UserInputError('Errors', {
            errors: { depositAppointmentId: 'Deposit not found' },
          });
        }
        if (target.depositCreditCents > 0) {
          throw new UserInputError('Errors', {
            errors: {
              targetAppointmentId: 'This session already has a deposit applied to it.',
            },
          });
        }
        if (deposit.depositStatus !== 'available' || !deposit.depositCents) {
          throw new UserInputError('Errors', {
            errors: {
              depositAppointmentId:
                deposit.depositStatus === 'applied'
                  ? 'That deposit has already been applied to a session.'
                  : 'That appointment has no deposit available to apply.',
            },
          });
        }

        // The deposit and the session have to belong to the same client. Without this, a deposit
        // is a transferable credit that any artist could move onto any client's session - which
        // is not a feature anyone asked for and is indistinguishable from a mistake after the
        // fact.
        const [depositClientId, targetClientId] = await Promise.all([
          resolveClientId(deposit),
          resolveClientId(target),
        ]);
        if (!depositClientId || !targetClientId || depositClientId !== targetClientId) {
          throw new UserInputError('Errors', {
            errors: {
              depositAppointmentId:
                "That deposit belongs to a different client and can't be applied here.",
            },
          });
        }

        // Atomic claim. See this mutation's comment - the status check and the write are one
        // operation precisely so two concurrent applications can't both succeed.
        const claimed = await Appointment.findOneAndUpdate(
          { _id: deposit._id, depositStatus: 'available' },
          {
            $set: {
              depositStatus: 'applied',
              depositAppliedToAppointmentId: target._id,
              depositAppliedAt: new Date(),
              depositAppliedBy: user.id,
            },
          },
          { new: true },
        );
        if (!claimed) {
          throw new UserInputError('Errors', {
            errors: {
              depositAppointmentId: 'That deposit has already been applied to a session.',
            },
          });
        }

        target.depositCreditCents = claimed.depositCents;
        target.depositCreditFromAppointmentId = claimed._id;
        // The client owes the session price minus what they already put down. Clamped at zero -
        // a deposit larger than the final sitting is a real case, and a negative total would be
        // the shop owing the client money, which this flow has no way to actually hand back.
        target.totalCents = Math.max(
          0,
          (target.subtotalCents || 0) +
            (target.taxCents || 0) +
            (target.feeCents || 0) +
            (target.tipCents || 0) -
            claimed.depositCents,
        );
        // Recomputed because the cut follows the reduced figure - see utils/shop-cut.js.
        await applyShopCut(target);
        await target.save();
        return target;
      } catch (err) {
        if (err instanceof GraphQLError) {
          throw err;
        }
        throw new Error(err);
      }
    },
  ),
};
