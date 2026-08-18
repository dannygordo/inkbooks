const Appointment = require('../../models/Appointment');
const ArtistShopConnection = require('../../models/ArtistShopConnection');
const withAuth = require('../../utils/with-auth');
const { AuthenticationError, UserInputError, rethrow } = require('../../utils/errors');
const { updateAppointmentInputSchema, createAppointmentInputSchema, appointmentIdInputSchema, validate } = require('../../utils/validation');
const { applyShopCut } = require('../../utils/shop-cut');
const { queueProjectScheduleEmail } = require('../../utils/client-booking-emails');
const { syncNoShowFlag } = require('../../utils/client-flags');
const { canManageArtist, assertCanManageArtist } = require('../../utils/shop-membership');
const { recordEvent, diffFields } = require('../../utils/event-log');

// Fields worth an audit-trail line when they change on an Appointment - see
// models/EventLog.js's own comment on why this is a deliberate subset rather than every field.
// Timer state (timerStatus/timerStartedAt/accumulatedSeconds) and sessionNotes are left out on
// purpose: those are live working state and freeform text, not the money/schedule facts this log
// exists to answer "who changed this, and when" about.
const APPOINTMENT_AUDIT_FIELDS = [
  'title',
  'description',
  'appointmentDate',
  'appointmentStatus',
  'appointmentType',
  'shopId',
  'subtotalCents',
  'taxCents',
  'feeCents',
  'tipCents',
  'totalCents',
  'shopCutStatus',
  'shopCutCents',
];

// Same ownership shape as updateAppointment/deleteAppointment below - Admin/SHOP_ADMIN-or-better,
// or the appointment's own artist. Shared by all three session-timer mutations so that check is
// written once, not copy-pasted three times.
async function loadOwnedAppointment(appointmentId, user) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
  }
  // The appointment's own artist, or a shop admin at that artist's shop. Was `role <= SHOP_ADMIN`,
  // which let a shop admin start, stop and price another shop's sessions.
  await assertCanManageArtist(user, appointment.userId);
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
            isPersonal,
            title,
            description,
            subtotalCents,
            taxCents,
            feeCents,
            tipCents,
            totalCents,
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
        appointmentDate, projectId, shopId, userId, isPersonal, title, description,
        subtotalCents, taxCents, feeCents, tipCents, totalCents,
        shopCutStatus, appointmentType, appointmentStatus, createdAt, updatedAt,
      });
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      // A personal-calendar entry is mutually exclusive with a shop or a project - it's the
      // user's own private calendar, never a shop's ledger or a project's session (see
      // models/Appointment.js). Rejected outright rather than silently dropped, so a caller
      // sending both learns immediately rather than getting a "shop" appointment back that they
      // asked to be personal.
      if (isPersonal && (shopId || projectId)) {
        throw new UserInputError('Errors', {
          errors: {
            isPersonal: 'A personal calendar entry cannot be attributed to a shop or a project.',
          },
        });
      }
      // Forced to the CALLER, not whatever userId was sent - unlike a shop appointment (which a
      // shop admin/staff member can legitimately book on another artist's behalf, e.g.
      // ProjectSessionsList), nobody should be able to create a "personal" appointment attributed
      // to someone else. That would mean two people can see it (the creator and, per the field's
      // whole purpose, ONLY the owner) - a contradiction this stops at the source.
      const effectiveUserId = isPersonal ? user.id : userId;
      // shopId is optional - a fully independent artist's appointment has no shop involved at
      // all, and that's a valid, unauthorized-free case. The check only applies once a shopId is
      // actually being attributed to someone. Never reached for a personal entry - shopId is
      // already guaranteed falsy by the check above.
      if (shopId) {
        await assertHasShopConnection(user.id, shopId);
      }
      const newAppointment = new Appointment({
        appointmentDate,
        projectId,
        shopId,
        userId: effectiveUserId,
        isPersonal: Boolean(isPersonal),
        title,
        description,
        subtotalCents,
        taxCents,
        feeCents,
        tipCents,
        totalCents,
        shopCutStatus,
        appointmentType,
        appointmentStatus,
        createdAt,
        updatedAt
      });
      // The shop cut is derived here, not accepted from the client - it's a financial obligation
      // between the artist and the shop, and letting the party who owes it choose the number
      // isn't a real ledger. Computed from subtotalCents only, so tips are never included; see
      // utils/shop-cut.js. A no-op when there's no shopId (independent artist) or no configured
      // percentage.
      await applyShopCut(newAppointment);
      const appt = await newAppointment.save();

      await recordEvent({
        entityType: 'Appointment',
        entityId: appt._id,
        action: 'create',
        actorUserId: user.id,
        shopId: appt.shopId,
        summary: `Created ${appt.appointmentType || 'appointment'}${appt.title ? ` — ${appt.title}` : ''}`,
      });

      // THE SITTINGS AFTER THE FIRST COME THROUGH HERE, and this is the trigger that is easy to
      // miss. convertBookingRequest books sitting one and creates the Project; every additional
      // date on that project - BookSessionDatesForm's second, third and fourth, and the appointment
      // wizard adding to an existing project later - is an ordinary createAppointment.
      //
      // Wiring only the conversion would have produced a confirmation listing ONE session out of
      // four, sent three minutes after the first was entered, which is worse than sending nothing:
      // it is a schedule the client would act on.
      //
      // Queueing here is also what makes the deadline restart, since queueProjectScheduleEmail
      // pushes the existing pending row forward rather than adding a second one.
      //
      // Consults are excluded: they are announced immediately at the point of booking and have no
      // project to coalesce on.
      if (appt.appointmentType === 'session' && appt.projectId) {
        await queueProjectScheduleEmail(appt.projectId);
      }
      return appt;
    }),
    /**
     * Deletes an appointment that never happened - cancelling a booking, or clearing a slot put
     * in by mistake.
     *
     * The other seven delete* mutations were removed outright (see the note on the Mutation type
     * in typeDefs.js). This one stays because it has two real callers and a real button behind
     * each: the calendar event modal (UpdateEventDialog.jsx) and the session view
     * (SessionDetail.jsx). Taking it away would have broken both.
     *
     * But it refuses anything carrying history. A scheduled slot holds nothing; a completed one
     * holds the session total, the tip, the shop's cut, the Square invoice it was billed under,
     * and any deposit applied to it. Deleting that doesn't remove a calendar entry, it removes a
     * transaction - the artist's earnings and the shop's ledger both change, silently, and there
     * is nothing left to reconcile against. Appointment.appointmentStatus already has 'cancelled'
     * and 'no_show' for the cases where something was scheduled and then didn't happen; those are
     * the honest record and the right answer here.
     */
    deleteAppointment: withAuth(async (_, { appointmentId }, context, info, user) => {
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
      }
      // The appointment's own artist, or a shop admin at their shop.
      if (!(await canManageArtist(user, appointment.userId))) {
        throw new AuthenticationError('Action not allowed');
      }

      // Each of these means real money or a real record is attached. Checked as a list rather
      // than just `appointmentStatus === 'completed'` because they come apart: a consult can hold
      // a deposit while still being 'scheduled', and a session can be invoiced for the shop cut
      // before anyone marks it complete.
      const blockers = [];
      if (appointment.appointmentStatus === 'completed') {
        blockers.push('it is marked completed');
      }
      if (appointment.totalCents > 0 || appointment.subtotalCents > 0 || appointment.tipCents > 0) {
        blockers.push('money has been recorded against it');
      }
      if (appointment.depositCents > 0) {
        blockers.push('a deposit was taken on it');
      }
      if (appointment.depositCreditCents > 0) {
        blockers.push('a deposit was applied to it');
      }
      if (appointment.shopCutStatus && appointment.shopCutStatus !== 'none') {
        blockers.push('the shop cut is in progress or settled');
      }
      if (blockers.length > 0) {
        throw new UserInputError('Errors', {
          errors: {
            appointmentId:
              `This appointment can't be deleted because ${blockers[0]}. ` +
              'Set its status to cancelled or no-show instead, so the record stays intact.',
          },
        });
      }

      await Appointment.deleteOne({ _id: appointmentId });

      await recordEvent({
        entityType: 'Appointment',
        entityId: appointment._id,
        action: 'delete',
        actorUserId: user.id,
        shopId: appointment.shopId,
        summary: `Deleted ${appointment.appointmentType || 'appointment'}${appointment.title ? ` — ${appointment.title}` : ''}`,
      });

      return 'Appointment deleted successfully';
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
          (await canManageArtist(user, existingAppointment.userId))
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
            // requires, since this is the same class of action. Also refused for an existing
            // personal appointment - see the isPersonal check just below, which fires first.
            await assertHasShopConnection(user.id, appointment.shopId);
          }

          // isPersonal is immutable once set - same class of change as shopId above, and a more
          // sensitive one. Personal-to-shop would silently surface a previously-private appointment
          // to the shop admin who has no idea it exists; shop-to-personal would let a real,
          // financially-real appointment disappear from the shop's calendar and ledger entirely.
          // Neither is a normal edit, so both are refused outright rather than allowed through the
          // generic update path. Only checked when the caller's payload actually includes the key
          // (an `in` check, matching the shopId convention above) - a save that doesn't mention
          // isPersonal at all must not be blocked by it.
          if (
            'isPersonal' in appointment &&
            Boolean(appointment.isPersonal) !== Boolean(existingAppointment.isPersonal)
          ) {
            throw new UserInputError(
              "An appointment's calendar (shop or personal) cannot be changed after it's created.",
            );
          }

          // Captured BEFORE the write - syncNoShowFlag needs to know what changed, and after
          // findByIdAndUpdate the old status is gone.
          const previousStatus = existingAppointment.appointmentStatus;

          // CLOSING A SESSION STAMPS IT WITH THE MOMENT IT WAS CLOSED, not whatever date/time was
          // sitting in the form. A session worked earlier or later than its booked slot - or
          // closed days after the fact - needs to report on the day the work (and the money) were
          // actually settled, not on the day it happened to be scheduled for. Only fires on the
          // TRANSITION into 'completed' - a caller re-saving an already-completed appointment
          // (there is no such caller today, but the check is what makes that safe if one ever
          // exists) must not keep sliding its date forward on every unrelated edit.
          //
          // The same rule applies to a card charge closing a session automatically - see
          // routes/squarePayments.js, which stamps appointmentDate the same way for the same
          // reason, since that path never comes through this mutation at all.
          if (
            'appointmentStatus' in appointment &&
            appointment.appointmentStatus === 'completed' &&
            previousStatus !== 'completed'
          ) {
            appointment.appointmentDate = new Date();
          }

          const res = await Appointment.findByIdAndUpdate({_id: appointment.id}, appointment, {new: true});

          // Marking a session no-show raises a NO_SHOWED flag on the client; moving it off no-show
          // RESOLVES that flag rather than deleting it (DECISIONS.md C2). This is the only place
          // the flag is raised, which is what makes it trustworthy as an automatic record - a flag
          // that claims to be system-generated but could also be typed in says nothing about
          // whether the client actually missed a sitting.
          //
          // Best-effort by contract: the appointment save has already happened and must not be
          // undone because a flag could not be written. syncNoShowFlag returns its outcome rather
          // than throwing, and warns on the way past.
          if ('appointmentStatus' in appointment) {
            await syncNoShowFlag({
              appointment: res,
              previousStatus,
              actingUserId: user.id,
            });
          }
          // Recompute the shop cut whenever the figure it's derived from changes. Only on an
          // actual subtotalCents change - not on every save - because applyShopCut is a write to
          // a ledger field, and a notes-only or date-only save has no business touching what an
          // artist owes. applyShopCut itself declines to touch an appointment whose cut has
          // already been invoiced or paid, so a late price correction can't silently contradict
          // an invoice already sitting in the artist's inbox.
          if ('subtotalCents' in appointment) {
            await applyShopCut(res);
            await res.save();
          }

          const changes = diffFields(existingAppointment, res, APPOINTMENT_AUDIT_FIELDS);
          if (changes.length > 0) {
            await recordEvent({
              entityType: 'Appointment',
              entityId: res._id,
              action: 'update',
              actorUserId: user.id,
              shopId: res.shopId,
              summary: `Updated ${res.appointmentType || 'appointment'}${res.title ? ` — ${res.title}` : ''}`,
              changes,
            });
          }

          return res;
        }
        throw new AuthenticationError('Action not allowed');
      } catch (err) {
          // Was unconditionally `rethrow(err)` - that rewraps AuthenticationError/
          // UserInputError into a plain Error, stripping the extensions.code the client relies
          // on (see utils/errors.js's own comment on this). Pre-existing bug, surfaced now
          // because the new shopId checks above would otherwise lose their error type the same
          // way the pre-existing 'Action not allowed' throw already was.
          rethrow(err);
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
