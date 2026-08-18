const crypto = require('crypto');
const Form = require('../../models/Form');
const FormResponse = require('../../models/FormResponse');
const Client = require('../../models/Client');
const withAuth = require('../../utils/with-auth');
const { UserInputError, AuthenticationError, RateLimitError } = require('../../utils/errors');
const { paginate } = require('../../utils/pagination');
const {
  resolveBusinessOwner,
  assertCanManageBusinessRecord,
  assertCanAccessClient,
  linkClientToUsersShops,
} = require('../../utils/shop-membership');
const { findOrCreateGuestClient } = require('../../utils/guest-client');
const { checkRateLimit, getClientIp } = require('../../utils/rate-limit');
const { tryCheckAuth } = require('../../utils/check-auth');
const { recordEvent } = require('../../utils/event-log');
const {
  createFormInputSchema,
  updateFormInputSchema,
  submitFormResponseInputSchema,
  validate,
} = require('../../utils/validation');

/**
 * Forms - consent forms, waivers, custom intake questionnaires. See models/Form.js and
 * models/FormResponse.js for the full design; this file follows the exact same two-step
 * authorization shape as resolvers/expenses.js:
 *
 *   CREATE - resolveBusinessOwner(user, input.shopId) decides and validates the owner in one call.
 *   READ/UPDATE/DELETE - the row already says whose it is; assertCanManageBusinessRecord re-checks
 *   the caller against THAT owner, every time.
 *
 * submitFormResponse is the one exception - it is NOT withAuth-wrapped, because it has to work for
 * an anonymous guest on a form that allows it, the same reason createBookingRequest
 * (mutations/bookingRequests.js) isn't either. See that mutation's own header comment for the
 * shared reasoning; this one copies its rate-limiting shape directly.
 */

// A read scoped by neither shopId nor artistUserId, or by both at once, isn't a real question -
// see typeDefs.js's own note that exactly one is required. Same helper as resolvers/expenses.js,
// duplicated rather than shared - it's four lines, and importing it would couple two otherwise
// independent features over something this small.
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

// Input fields -> the shape FormFieldSchema actually stores - shared between createForm and
// updateForm. `key` is passed through only when the caller supplied one (an edit to an existing
// field); omitted entirely for a new field, so Mongoose's own default (crypto.randomUUID() - see
// models/Form.js) generates it, rather than this function inventing a second id-generation path.
function fieldsFromInput(inputFields) {
  return inputFields.map((f) => ({
    ...(f.key ? { key: f.key } : {}),
    type: f.type,
    label: f.label,
    helpText: f.helpText || '',
    required: Boolean(f.required),
    options: f.type === 'single_choice' || f.type === 'multi_choice' ? f.options || [] : [],
  }));
}

// Does this answer actually contain something, for the field it's answering? Used only to decide
// whether a REQUIRED field has been satisfied - see assertAnswersMatchFields below. An empty
// string, an empty array, or a missing answer entirely are all "no", uniformly, regardless of
// which slot the field's type uses.
function answerHasContent(field, answer) {
  if (!answer) {
    return false;
  }
  switch (field.type) {
    case 'short_text':
    case 'paragraph':
      return Boolean(answer.textValue && answer.textValue.trim());
    case 'single_choice':
    case 'multi_choice':
      return Boolean(answer.selectedOptions && answer.selectedOptions.length > 0);
    case 'date':
      return Boolean(answer.dateValue);
    case 'file_upload':
      return Boolean(answer.fileUrls && answer.fileUrls.length > 0);
    case 'signature':
      return Boolean(answer.signedName && answer.signedName.trim());
    default:
      return false;
  }
}

/**
 * The server-side half of "fields should be allowed to be required or not" - a required field
 * with no real answer is refused HERE, not left to whatever the client's own form validation
 * happened to enforce. Also refuses an answer that doesn't correspond to any field on this form at
 * all (a stale key from an edited form, or a client bug), and a choice answer naming an option the
 * field doesn't actually have - both are loud failures rather than silently-stored garbage.
 */
function assertAnswersMatchFields(fields, answerInputs) {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  const errors = {};

  for (const answer of answerInputs) {
    const field = fieldByKey.get(answer.fieldKey);
    if (!field) {
      errors[answer.fieldKey] = 'This question is not part of this form.';
      continue;
    }
    const isChoiceType = field.type === 'single_choice' || field.type === 'multi_choice';
    if (isChoiceType && answer.selectedOptions && answer.selectedOptions.length > 0) {
      const unknownOption = answer.selectedOptions.find((opt) => !field.options.includes(opt));
      if (unknownOption) {
        errors[answer.fieldKey] = `"${unknownOption}" is not one of this question's options.`;
      } else if (field.type === 'single_choice' && answer.selectedOptions.length > 1) {
        errors[answer.fieldKey] = 'This question only accepts one answer, not several.';
      }
    }
  }

  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    const answer = answerInputs.find((a) => a.fieldKey === field.key);
    if (!answerHasContent(field, answer)) {
      errors[field.key] = `"${field.label}" is required.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new UserInputError('Errors', { errors });
  }
}

// Validated answer inputs -> the shape FormAnswerSchema actually stores. Only the ONE slot each
// field's own type uses is ever written (see models/FormResponse.js's own comment on why exactly
// one is meaningful per answer) - a client sending a dateValue on a short_text field, say, has that
// silently dropped rather than stored somewhere it'll never be read back from.
function buildStoredAnswers(fields, answerInputs, submittedAt) {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));
  return answerInputs
    .filter((a) => fieldByKey.has(a.fieldKey))
    .map((a) => {
      const field = fieldByKey.get(a.fieldKey);
      const stored = { fieldKey: a.fieldKey };
      switch (field.type) {
        case 'short_text':
        case 'paragraph':
          stored.textValue = a.textValue || null;
          break;
        case 'single_choice':
        case 'multi_choice':
          stored.selectedOptions = a.selectedOptions || [];
          break;
        case 'date':
          stored.dateValue = a.dateValue ? new Date(a.dateValue) : null;
          break;
        case 'file_upload':
          stored.fileUrls = a.fileUrls || [];
          break;
        case 'signature':
          // signedAt is captured HERE, from the server's own clock at submission - never from
          // anything the client sent. See models/FormResponse.js's own comment on why a
          // client-supplied timestamp is never trusted for a consent record.
          stored.signature = a.signedName ? { signedName: a.signedName, signedAt: submittedAt } : null;
          break;
        default:
          break;
      }
      return stored;
    });
}

module.exports = {
  Query: {
    getForm: withAuth(async (_, { formId }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      return form;
    }),

    getForms: withAuth(async (_, { shopId, artistUserId, status, page }, context, info, user) => {
      requireOneOwnerArg(shopId, artistUserId);
      await assertCanManageBusinessRecord(user, { shopId, artistUserId });
      const filter = shopId ? { shopId } : { artistUserId };
      if (status) {
        filter.status = status;
      }
      return paginate(Form, filter, { sort: { createdAt: -1 }, page });
    }),

    // PUBLIC - see typeDefs.js's own comment on this query. Not withAuth; anyone with the link, or
    // nobody, may call this.
    async getPublicForm(_, { publicToken }) {
      if (!publicToken) {
        return null;
      }
      // Same three conditions checked at submission time (see submitFormResponse below) - a form
      // that's been unpublished or had guest access turned back off since the link was handed out
      // reads as "this link doesn't work" here too, not as a different, more informative error a
      // stranger holding the link has no use for anyway.
      return Form.findOne({ publicToken, status: 'published', allowGuestSubmissions: true });
    },

    getFormResponses: withAuth(async (_, { formId, page }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      return paginate(FormResponse, { formId }, { sort: { createdAt: -1 }, page });
    }),

    getFormResponse: withAuth(async (_, { formResponseId }, context, info, user) => {
      const response = await FormResponse.findById(formResponseId);
      if (!response) {
        throw new UserInputError('Errors', { errors: { formResponseId: 'Response not found' } });
      }
      await assertCanManageBusinessRecord(user, {
        shopId: response.shopId,
        artistUserId: response.artistUserId,
      });
      return response;
    }),

    // Deliberately modest for V1 - see typeDefs.js's own comment on FormAnalytics. Per-field
    // breakdown is driven by the LIVE form.fields, not by each response's own fieldsSnapshot - a
    // question the artist has since deleted from the form won't get its own row here even though
    // old responses still hold that answer in their own snapshot (getFormResponse/getFormResponses
    // still show it there). That's a real, known limitation of this view, not an oversight - see
    // HANDOFF.md.
    getFormAnalytics: withAuth(async (_, { formId }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });

      const responses = await FormResponse.find({ formId }).select('answers createdAt');

      // Bucketed in JS by UTC calendar day rather than a $dateToString aggregation - the response
      // count per form is not expected to be large enough for that to matter, and it avoids a
      // second round trip to Mongo for what's already an in-memory pass over `responses`. Worth
      // revisiting with a real aggregation pipeline if a shop's forms ever see enough volume for
      // this to show up as slow.
      const dayBuckets = new Map();
      for (const response of responses) {
        const dayKey = response.createdAt.toISOString().slice(0, 10);
        dayBuckets.set(dayKey, (dayBuckets.get(dayKey) || 0) + 1);
      }
      const responsesByDay = Array.from(dayBuckets.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([dayKey, count]) => ({ date: new Date(`${dayKey}T00:00:00.000Z`), count }));

      const fields = form.fields.map((field) => {
        let answeredCount = 0;
        const optionCounts =
          field.type === 'single_choice' || field.type === 'multi_choice'
            ? field.options.map((option) => ({ option, count: 0 }))
            : [];
        const optionIndex = new Map(optionCounts.map((row, i) => [row.option, i]));

        for (const response of responses) {
          const answer = response.answers.find((a) => a.fieldKey === field.key);
          if (!answerHasContent(field, answer)) {
            continue;
          }
          answeredCount += 1;
          if (optionIndex.size > 0 && answer.selectedOptions) {
            for (const option of answer.selectedOptions) {
              const idx = optionIndex.get(option);
              if (idx !== undefined) {
                optionCounts[idx].count += 1;
              }
            }
          }
        }

        return {
          fieldKey: field.key,
          label: field.label,
          type: field.type,
          answeredCount,
          optionCounts,
        };
      });

      return {
        formId: form.id,
        totalResponses: responses.length,
        responsesByDay,
        fields,
      };
    }),
  },

  Mutation: {
    createForm: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors, data } = validate(createFormInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const owner = await resolveBusinessOwner(user, data.shopId);
      const form = await new Form({
        ...owner,
        title: data.title,
        description: data.description || '',
        fields: fieldsFromInput(data.fields),
        createdByUserId: user.id,
      }).save();
      await recordEvent({
        entityType: 'Form',
        entityId: form._id,
        action: 'create',
        actorUserId: user.id,
        shopId: owner.shopId,
        summary: `Created the form "${form.title}"`,
      });
      return form;
    }),

    updateForm: withAuth(async (_, { input }, context, info, user) => {
      const { valid, errors, data } = validate(updateFormInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }
      const form = await Form.findById(data.formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      if (data.title !== undefined && data.title !== null) {
        form.title = data.title;
      }
      if (data.description !== undefined) {
        form.description = data.description || '';
      }
      if (data.fields) {
        form.fields = fieldsFromInput(data.fields);
      }
      await form.save();
      await recordEvent({
        entityType: 'Form',
        entityId: form._id,
        action: 'update',
        actorUserId: user.id,
        shopId: form.shopId,
        summary: `Edited the form "${form.title}"`,
      });
      return form;
    }),

    publishForm: withAuth(async (_, { formId }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      if (form.fields.length === 0) {
        throw new UserInputError('Errors', {
          errors: { formId: 'Add at least one field before publishing.' },
        });
      }
      form.status = 'published';
      await form.save();
      await recordEvent({
        entityType: 'Form',
        entityId: form._id,
        action: 'update',
        actorUserId: user.id,
        shopId: form.shopId,
        summary: `Published the form "${form.title}"`,
      });
      return form;
    }),

    archiveForm: withAuth(async (_, { formId }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      form.status = 'archived';
      await form.save();
      await recordEvent({
        entityType: 'Form',
        entityId: form._id,
        action: 'update',
        actorUserId: user.id,
        shopId: form.shopId,
        summary: `Archived the form "${form.title}"`,
      });
      return form;
    }),

    setFormGuestAccess: withAuth(async (_, { formId, allow }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      form.allowGuestSubmissions = Boolean(allow);
      // Minted once, kept forever after - see models/Form.js's own comment on why turning this off
      // and back on must not invalidate a link already handed to somebody.
      if (form.allowGuestSubmissions && !form.publicToken) {
        form.publicToken = crypto.randomBytes(24).toString('hex');
      }
      await form.save();
      await recordEvent({
        entityType: 'Form',
        entityId: form._id,
        action: 'update',
        actorUserId: user.id,
        shopId: form.shopId,
        summary: form.allowGuestSubmissions
          ? `Turned on the public link for "${form.title}"`
          : `Turned off the public link for "${form.title}"`,
      });
      return form;
    }),

    deleteForm: withAuth(async (_, { formId }, context, info, user) => {
      const form = await Form.findById(formId);
      if (!form) {
        return true;
      }
      await assertCanManageBusinessRecord(user, { shopId: form.shopId, artistUserId: form.artistUserId });
      const hasResponses = await FormResponse.exists({ formId: form._id });
      if (hasResponses) {
        throw new UserInputError('Errors', {
          errors: {
            formId: 'This form has responses on file and cannot be deleted - archive it instead.',
          },
        });
      }
      await Form.deleteOne({ _id: formId });
      await recordEvent({
        entityType: 'Form',
        entityId: form._id,
        action: 'delete',
        actorUserId: user.id,
        shopId: form.shopId,
        summary: `Deleted the form "${form.title}"`,
      });
      return true;
    }),

    // See this file's own header comment on why this is not withAuth-wrapped, and
    // mutations/bookingRequests.js's createBookingRequest for the rate-limiting shape this copies.
    async submitFormResponse(_, { input }, context) {
      const ip = getClientIp(context.req);
      const authenticatedCaller = tryCheckAuth(context);
      const rateLimitKey = authenticatedCaller
        ? `${ip}:submitFormResponse:auth`
        : `${ip}:submitFormResponse:anon`;
      const rateLimitOptions = authenticatedCaller
        ? { windowMs: 60 * 60 * 1000, max: 100 }
        : { windowMs: 60 * 60 * 1000, max: 10 };
      const { allowed, retryAfterSeconds } = checkRateLimit(rateLimitKey, rateLimitOptions);
      if (!allowed) {
        throw new RateLimitError(
          `Too many form submissions from this address. Try again in ${retryAfterSeconds} seconds.`,
        );
      }

      const { valid, errors, data } = validate(submitFormResponseInputSchema, input);
      if (!valid) {
        throw new UserInputError('Errors', { errors });
      }

      // Resolved by publicToken (the guest path - proof of holding the real shareable link, the
      // same role BookingRequest.guestToken plays) OR by formId (every authenticated path, where
      // the caller already has real access to ask "which form is this"). A guest is NEVER allowed
      // to resolve a form by formId alone - a Mongo ObjectId is guessable/enumerable in a way a
      // random publicToken deliberately isn't, and formId-only would let an anonymous caller
      // submit to any guest-allowed form without ever having seen its actual link.
      let form;
      if (data.publicToken) {
        form = await Form.findOne({
          publicToken: data.publicToken,
          status: 'published',
          allowGuestSubmissions: true,
        });
        if (!form) {
          throw new UserInputError('Errors', { errors: { publicToken: 'Invalid or expired link' } });
        }
      } else if (data.formId) {
        form = await Form.findById(data.formId);
        if (!form) {
          throw new UserInputError('Errors', { errors: { formId: 'Form not found' } });
        }
      } else {
        throw new UserInputError('Errors', { errors: { formId: 'A form is required' } });
      }

      if (form.status !== 'published') {
        throw new UserInputError('Errors', {
          errors: { formId: 'This form is not currently accepting responses.' },
        });
      }

      let clientDoc;
      let submittedByUserId;
      let source;

      if (!authenticatedCaller) {
        // The guest path. Only reachable at all via a real publicToken (see above), which already
        // proves allowGuestSubmissions - re-checked here anyway rather than trusted from the
        // lookup, the same defense-in-depth reasoning getAppointmentsByShop's own isPersonal
        // exclusion uses.
        if (!data.publicToken || !form.allowGuestSubmissions) {
          throw new AuthenticationError('Action not allowed');
        }
        if (!data.firstName || !data.lastName || !data.email) {
          throw new UserInputError('Errors', {
            errors: { email: 'Name and email are required to submit this form.' },
          });
        }
        const { user: guestUser, client } = await findOrCreateGuestClient({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
        });
        // Same reasoning as createBookingRequest's own linkClientToUsersShops call - a guest
        // submitting a shop's (or a shop-affiliated artist's) form is that shop's client from this
        // moment, before any project exists.
        await linkClientToUsersShops(client._id, form.createdByUserId);
        clientDoc = client;
        submittedByUserId = guestUser._id;
        source = 'guest_public';
      } else if (data.clientId) {
        // Staff (or the artist themselves) filling this out on a specific client's behalf - e.g.
        // handing a tablet to a client standing at the counter. Requires BOTH that this caller
        // manages the form's own scope AND has a real relationship to the named client - the first
        // check alone would let any staff member at a shop attach a response to a client they've
        // never actually worked with.
        await assertCanManageBusinessRecord(authenticatedCaller, {
          shopId: form.shopId,
          artistUserId: form.artistUserId,
        });
        const client = await Client.findById(data.clientId);
        if (!client) {
          throw new UserInputError('Errors', { errors: { clientId: 'Client not found' } });
        }
        await assertCanAccessClient(authenticatedCaller, client);
        clientDoc = client;
        submittedByUserId = authenticatedCaller.id;
        source = 'staff_entered';
      } else {
        // Self-service: the logged-in caller is filling out their own copy.
        const ownClient = await Client.findOne({ userId: authenticatedCaller.id });
        if (!ownClient) {
          throw new UserInputError('Errors', {
            errors: { formId: 'No client record found for this account.' },
          });
        }
        clientDoc = ownClient;
        submittedByUserId = authenticatedCaller.id;
        source = 'client_authenticated';
      }

      assertAnswersMatchFields(form.fields, data.answers);
      const now = new Date();
      const storedAnswers = buildStoredAnswers(form.fields, data.answers, now);

      const response = await new FormResponse({
        formId: form._id,
        shopId: form.shopId,
        artistUserId: form.artistUserId,
        formTitle: form.title,
        // A real snapshot copy, not a reference - see models/FormResponse.js's own header comment
        // on why. `.toObject()` strips Mongoose subdocument machinery so what's stored is plain
        // data, matching FormFieldSnapshotSchema exactly.
        fieldsSnapshot: form.fields.map((f) => f.toObject()),
        clientId: clientDoc._id,
        answers: storedAnswers,
        submittedByUserId,
        submitterIp: ip,
        source,
        createdAt: now,
      }).save();

      await recordEvent({
        entityType: 'FormResponse',
        entityId: response._id,
        action: 'create',
        actorUserId: submittedByUserId,
        shopId: form.shopId,
        summary: `Submitted "${form.title}"`,
      });

      return response;
    },
  },

  // Exported for direct unit testing (see test/unit/forms.test.js, once written) - these four are
  // pure functions with no DB dependency, and the required-field enforcement in particular is
  // exactly the kind of logic that deserves coverage that doesn't depend on mongodb-memory-server
  // being reachable. Harmless to export alongside Query/Mutation: nothing else reads these keys off
  // this module (see resolvers/index.js's `...formResolvers.Query`/`.Mutation` spreads, which only
  // ever pull those two).
  _internal: {
    requireOneOwnerArg,
    fieldsFromInput,
    answerHasContent,
    assertAnswersMatchFields,
    buildStoredAnswers,
  },
};
