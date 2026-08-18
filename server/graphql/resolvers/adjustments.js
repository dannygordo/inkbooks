const Appointment = require('../../models/Appointment');
const Adjustment = require('../../models/Adjustment');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const { recordAdjustmentInputSchema, validate } = require('../../utils/validation');
const { assertCanManageArtist } = require('../../utils/shop-membership');
const { recordEvent } = require('../../utils/event-log');

/**
 * recordAdjustment - DECISIONS.md M4.
 *
 * See models/Adjustment.js for what this is (a documented record of a reversal already performed
 * by hand in Square) and what it deliberately is not (nothing here calls Square's refund API, and
 * nothing here rewrites the appointment's own totalCents/tipCents/shopCutCents).
 *
 * AUTHORIZATION is assertCanManageArtist(user, appointment.userId) at its default floor
 * (SHOP_ADMIN) - the appointment's own artist passes for themselves regardless of shop, and
 * otherwise only a shop admin who shares a shop with that artist passes. That is exactly M4's
 * rule ("shop-admin only where there is a shop; an unaffiliated artist adjusts their own") without
 * writing a second version of it here - see utils/shop-membership.js's own comment on why this
 * helper checks self first.
 */
module.exports = {
  Mutation: {
    recordAdjustment: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(recordAdjustmentInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }

      const appointment = await Appointment.findById(input.appointmentId);
      if (!appointment) {
        throw new UserInputError('Errors', { errors: { appointmentId: 'Appointment not found' } });
      }
      await assertCanManageArtist(user, appointment.userId);

      const adjustment = await new Adjustment({
        appointmentId: appointment._id,
        shopId: appointment.shopId || null,
        artistUserId: appointment.userId,
        amountCents: input.amountCents,
        reason: input.reason,
        createdByUserId: user.id,
      }).save();

      await recordEvent({
        entityType: 'Adjustment',
        entityId: adjustment._id,
        action: 'create',
        actorUserId: user.id,
        shopId: appointment.shopId || null,
        summary: `Recorded a $${(input.amountCents / 100).toFixed(2)} adjustment: ${input.reason}`,
      });

      return adjustment;
    }),
  },
};
