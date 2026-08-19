const AutoResponse = require('../../models/AutoResponse');
const withAuth = require('../../utils/with-auth');
const { UserInputError } = require('../../utils/errors');
const {
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
} = require('../../utils/shop-membership');
const { recordEvent } = require('../../utils/event-log');
const { sendManualAutoResponse } = require('../../utils/auto-responses');
const {
  createAutoResponseInputSchema,
  updateAutoResponseInputSchema,
  sendAutoResponseNowInputSchema,
  validate,
} = require('../../utils/validation');

/**
 * Auto-Responses - see models/AutoResponse.js and utils/auto-responses.js for the data shape and
 * send logic, and typeDefs.js's own header comment on this section for the ownership model. Same
 * two-step authorization shape as resolvers/expenses.js:
 *
 *   CREATE - resolveBusinessOwner(user, input.shopId) decides and validates the owner in one call.
 *   READ/UPDATE/ARCHIVE - the row (or the shopId/artistUserId args, for a list) already says
 *   whose it is; assertCanManageBusinessRecord re-checks the caller against THAT owner, every
 *   time.
 */

// A read scoped by neither shopId nor artistUserId, or by both at once, isn't a real question -
// same helper as resolvers/expenses.js/forms.js, duplicated rather than imported since neither of
// those files exposes it as shared utility.
function requireOneOwnerArg(shopId, artistUserId) {
  if (!shopId && !artistUserId) {
    throw new UserInputError('Errors', {
      errors: { shopId: 'Provide a shopId or an artistUserId' },
    });
  }
  if (shopId && artistUserId) {
    throw new UserInputError('Errors', {
      errors: { shopId: 'Provide only one of shopId or artistUserId, not both' },
    });
  }
}

module.exports = {
  Query: {
    getAutoResponses: withAuth(
      async (_, { shopId, artistUserId, includeInactive }, context, info, user) => {
        requireOneOwnerArg(shopId, artistUserId);
        await assertCanManageBusinessRecord(user, { shopId, artistUserId });
        const filter = shopId ? { shopId } : { artistUserId };
        if (!includeInactive) {
          filter.active = true;
        }
        return AutoResponse.find(filter).sort({ trigger: 1, name: 1 });
      },
    ),
  },

  Mutation: {
    createAutoResponse: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(createAutoResponseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, input.shopId);
      try {
        const autoResponse = await new AutoResponse({
          ...owner,
          name: input.name,
          trigger: input.trigger,
          enabled: Boolean(input.enabled),
          emailEnabled: input.emailEnabled !== undefined && input.emailEnabled !== null
            ? input.emailEnabled
            : true,
          smsEnabled: Boolean(input.smsEnabled),
          emailSubjectTemplate: input.emailSubjectTemplate || null,
          emailBodyTemplate: input.emailBodyTemplate || null,
          smsTemplate: input.smsTemplate || null,
        }).save();
        await recordEvent({
          entityType: 'AutoResponse',
          entityId: autoResponse._id,
          action: 'create',
          actorUserId: user.id,
          shopId: owner.shopId,
          summary: `Added Auto-Response "${autoResponse.name}"`,
        });
        return autoResponse;
      } catch (err) {
        // The partial unique index on {shopId|artistUserId, trigger} (enabled: true only) - see
        // models/AutoResponse.js.
        if (err && err.code === 11000) {
          throw new UserInputError('Errors', {
            errors: {
              enabled:
                'Another response for this trigger is already enabled - turn that one off first.',
            },
          });
        }
        throw err;
      }
    }),

    updateAutoResponse: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors } = validate(updateAutoResponseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const autoResponse = await AutoResponse.findById(input.autoResponseId);
      if (!autoResponse) {
        throw new UserInputError('Errors', {
          errors: { autoResponseId: 'Auto-Response not found' },
        });
      }
      await assertCanManageBusinessRecord(user, {
        shopId: autoResponse.shopId,
        artistUserId: autoResponse.artistUserId,
      });

      if (input.name !== undefined && input.name !== null) autoResponse.name = input.name;
      if (input.enabled !== undefined && input.enabled !== null) autoResponse.enabled = input.enabled;
      if (input.emailEnabled !== undefined && input.emailEnabled !== null) {
        autoResponse.emailEnabled = input.emailEnabled;
      }
      if (input.smsEnabled !== undefined && input.smsEnabled !== null) {
        autoResponse.smsEnabled = input.smsEnabled;
      }
      // Nullable template fields: applied whenever the key is present at all - an explicit null
      // resets to the built-in default, distinct from omitting the key entirely. Same convention
      // as updateReminderSettings (resolvers/reminders.js).
      if ('emailSubjectTemplate' in input) autoResponse.emailSubjectTemplate = input.emailSubjectTemplate || null;
      if ('emailBodyTemplate' in input) autoResponse.emailBodyTemplate = input.emailBodyTemplate || null;
      if ('smsTemplate' in input) autoResponse.smsTemplate = input.smsTemplate || null;
      if (input.active !== undefined && input.active !== null) autoResponse.active = input.active;

      try {
        await autoResponse.save();
      } catch (err) {
        if (err && err.code === 11000) {
          throw new UserInputError('Errors', {
            errors: {
              enabled:
                'Another response for this trigger is already enabled - turn that one off first.',
            },
          });
        }
        throw err;
      }
      await recordEvent({
        entityType: 'AutoResponse',
        entityId: autoResponse._id,
        action: 'update',
        actorUserId: user.id,
        shopId: autoResponse.shopId,
        summary: `Edited Auto-Response "${autoResponse.name}"`,
      });
      return autoResponse;
    }),

    archiveAutoResponse: withAuth(async (_, { autoResponseId }, context, info, user) => {
      const autoResponse = await AutoResponse.findById(autoResponseId);
      if (!autoResponse) {
        throw new UserInputError('Errors', {
          errors: { autoResponseId: 'Auto-Response not found' },
        });
      }
      await assertCanManageBusinessRecord(user, {
        shopId: autoResponse.shopId,
        artistUserId: autoResponse.artistUserId,
      });
      // Deactivate, never delete - AutoResponseLog rows keep referencing this by id. Also turns
      // off automatic firing, same as any other enabled: false save, since an archived response
      // has no business still auto-firing.
      autoResponse.active = false;
      autoResponse.enabled = false;
      await autoResponse.save();
      await recordEvent({
        entityType: 'AutoResponse',
        entityId: autoResponse._id,
        action: 'update',
        actorUserId: user.id,
        shopId: autoResponse.shopId,
        summary: `Deactivated Auto-Response "${autoResponse.name}"`,
      });
      return autoResponse;
    }),

    sendAutoResponseNow: withAuth(async (_, args, context, info, user) => {
      const { valid, errors, data } = validate(sendAutoResponseNowInputSchema, args);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const autoResponse = await AutoResponse.findById(data.autoResponseId);
      if (!autoResponse) {
        throw new UserInputError('Errors', {
          errors: { autoResponseId: 'Auto-Response not found' },
        });
      }
      // A manual send is authorized the same way editing the template is - whoever may manage
      // this owner's Auto-Responses may also send one by hand. This does NOT re-check
      // canAccessClient - see PRODUCTION_ROADMAP.md-style follow-up note: a shop admin or artist
      // who can manage this response is trusted with the send action itself, same floor as every
      // other business-record mutation in this file.
      await assertCanManageBusinessRecord(user, {
        shopId: autoResponse.shopId,
        artistUserId: autoResponse.artistUserId,
      });

      const result = await sendManualAutoResponse({
        autoResponseId: data.autoResponseId,
        clientId: data.clientId,
        appointmentId: data.appointmentId || null,
        triggeredByUserId: user.id,
      });
      await recordEvent({
        entityType: 'AutoResponse',
        entityId: autoResponse._id,
        action: 'update',
        actorUserId: user.id,
        shopId: autoResponse.shopId,
        summary: `Sent "${autoResponse.name}" to a client`,
      });
      return result.ok;
    }),
  },
};
