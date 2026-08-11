const Appointment = require('../../models/Appointment');
const Project = require('../../models/Project');
const BookingRequest = require('../../models/BookingRequest');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError, rethrow } = require('../../utils/errors');
const { applyShopCut } = require('../../utils/shop-cut');
const { assertCanManageArtist } = require('../../utils/shop-membership');
const { notifySafely } = require('../../utils/notifications');
const { moneyAudienceForArtist } = require('../../utils/notification-audience');
const { actorName } = require('../../utils/notification-copy');
const { formatCents } = require('../../utils/money');

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
  await assertCanManageArtist(user, appointment.userId);
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
  recordDeposit: withAuth(async (
    _,
    { appointmentId, depositCents, paymentMethod, squarePaymentId, pending },
    context,
    info,
    user,
  ) => {
    try {
      if (!Number.isInteger(depositCents) || depositCents <= 0) {
        throw new UserInputError('Errors', {
          errors: { depositCents: 'Deposit must be a positive whole number of cents' },
        });
      }
      if (!['cash', 'square'].includes(paymentMethod)) {
        throw new UserInputError('Errors', {
          errors: { paymentMethod: 'Choose how the deposit was taken - cash or Square.' },
        });
      }
      // A 'square' deposit with no payment id is an assertion that a card was charged, with
      // nothing behind it - which is exactly the state the old free-text amount box left every
      // deposit in. Cash is allowed to be an assertion, because cash IS one; card is not,
      // because there is a system of record for it and it should agree.
      //
      // Unless it is being recorded as PENDING, which is the opposite claim: an amount agreed,
      // no money taken yet, waiting for routes/squarePayments.js to charge exactly this figure
      // and fill the id in. That is the whole point of the pending state - it is what gives the
      // charge a stored amount to read instead of one the browser sends alongside the card.
      if (paymentMethod === 'square' && !squarePaymentId && !pending) {
        throw new UserInputError('Errors', {
          errors: { squarePaymentId: 'A Square deposit needs the payment it was collected by.' },
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
      appointment.depositStatus = pending ? 'pending' : 'available';
      // Only stamped when money has actually arrived. A pending deposit has no collection date
      // because nothing has been collected - and "collected at" on an uncollected deposit is
      // exactly the kind of field that reads as true a year later.
      if (!pending) {
        appointment.depositCollectedAt = appointment.depositCollectedAt || new Date();
      }
      appointment.depositPaymentMethod = paymentMethod;
      // Cleared rather than left behind when a deposit is re-recorded as cash - a stale Square id
      // on a cash deposit would point reconciliation at a payment that has nothing to do with it.
      appointment.depositSquarePaymentId =
        paymentMethod === 'square' ? squarePaymentId : undefined;
      // The deposit IS the money taken at this appointment - so it's this appointment's subtotal
      // and its total. A consult that collected $200 is a $200 transaction; leaving those at zero
      // would make the deposit invisible to every revenue figure in the app, since analytics sums
      // totalCents.
      //
      // Written for a pending deposit too, because that is precisely what the charge route reads
      // to know what to charge (see utils/charge-quote.js). The shop cut is applied here as well:
      // M3 takes the cut at collection, and a deposit that is charged moments later would
      // otherwise need a second place that knows to apply it.
      appointment.subtotalCents = depositCents;
      appointment.totalCents =
        depositCents + (appointment.taxCents || 0) + (appointment.feeCents || 0) + (appointment.tipCents || 0);
      await applyShopCut(appointment);
      await appointment.save();

      // The artist who took it is NOT told - they were standing there. Their shop admin is, because
      // money arrived at their shop and they weren't present for it. This is the founding example
      // in NOTIFICATIONS_DESIGN.md §1, and the actor filter in notify() enforces it even if this
      // recipient list were wrong.
      //
      // An independent artist has no shop, so the audience is empty and nothing is written. That is
      // the shop-versus-solo distinction falling out of the data rather than out of a branch.
      // Not for a pending deposit. "$200 deposit collected" is a claim about money that has not
      // arrived, and the charge route sends this same notification once it has - so announcing it
      // here would either be premature or duplicated.
      if (!pending) {
        await notifySafely({
          actorId: user.id,
          recipientIds: await moneyAudienceForArtist(appointment.userId),
          type: 'deposit_collected',
          category: 'money',
          subjectType: 'appointment',
          subjectId: appointment._id,
          amountCents: depositCents,
          title: `${formatCents(depositCents)} deposit collected${appointment.title ? ` — ${appointment.title}` : ''}`,
          body: `Taken by ${await actorName(user.id)} in ${paymentMethod === 'square' ? 'card' : 'cash'}.`,
        });
      }

      return appointment;
    } catch (err) {
      rethrow(err);
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
        rethrow(err);
      }
    },
  ),
};
