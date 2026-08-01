const { z } = require('zod');

// Replaces the hand-rolled utils/validators.js. That file had a real, silent bug: register()
// called validateRegisterInput(...) with 10 arguments (including tagColor), but the function's
// signature only accepted 9 - the extra argument was dropped with no error, and tagColor went
// completely unvalidated. A schema-based approach like this doesn't have that failure mode: an
// unexpected/extra field either has an explicit place in the schema or it doesn't exist at all.

const loginInputSchema = z.object({
  username: z.string().trim().min(1, 'Username must not be empty'),
  password: z.string().min(1, 'Password must not be empty'),
});

// NOTE: role/userType are deliberately not part of this schema. Public self-registration always
// hardcodes both to Client server-side (see resolvers/users.js register()) - see
// PRODUCTION_ROADMAP.md Phase 1, item 3 for why that's a security fix, not an oversight.
const registerInputSchema = z
  .object({
    username: z.string().trim().min(1, 'Username must not be empty'),
    email: z
      .string()
      .trim()
      .min(1, 'Email must not be empty.')
      .email('Email must be a valid email address, e.g. jonsnow@kingofthenorth.com'),
    firstName: z.string().trim().min(1, 'First name must not be empty'),
    lastName: z.string().trim().min(1, 'Last name must not be empty'),
    avatar: z.string().optional(),
    // The old validator never enforced a minimum password length at all - only a cosmetic
    // minLength="6" on the client's HTML input, which does nothing against a direct API call.
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    tagColor: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });

const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password must not be empty'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// --- Update-mutation schemas (updateProject, updateAppointment, updateConversation,
// updateMessage) ---
//
// NOTE on what these do and don't protect against: GraphQL's own type system already rejects any
// field not declared on ProjectInput/AppointmentInput/ConversationInput/MessageInput before a
// resolver ever runs - a client can't smuggle in an arbitrary key (role, __proto__, a Mongo
// operator) through a typed input object the way it could through an untyped REST body. So this
// isn't closing an arbitrary-key-injection hole; there wasn't one at the GraphQL layer.
// What *is* missing, and what these schemas actually fix: (1) update mutations don't re-run the
// non-empty-string checks create mutations do (e.g. updateProject never re-checks that title
// isn't blank the way createProject does), and (2) status/type-like fields (status,
// appointmentType, appointmentStatus, shopCutStatus) are plain, unconstrained strings at both the
// GraphQL and Mongoose layers - nothing stops a client from writing a value the UI's dropdowns
// would never produce. The enums below mirror client/src/constants/app.js's dropdown options.

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');
const dateLikeSchema = z.union([z.date(), z.string()]);

const updateProjectInputSchema = z.object({
  id: objectIdSchema,
  title: z.string().trim().min(1, 'Title cannot be empty'),
  description: z.string().trim().min(1, 'Description cannot be empty'),
  placement: z.string().nullish(),
  size: z.string().nullish(),
  palette: z.enum(['black', 'color']).nullish(),
  artistId: objectIdSchema,
  clientId: objectIdSchema,
  referenceImages: z.array(z.any()).nullish(),
  bodyImages: z.array(z.string()).nullish(),
  designImages: z.array(z.any()).nullish(),
  materialsUsed: z.array(z.string()).nullish(),
  notes: z.array(z.any()).nullish(),
  tags: z.array(z.string()).nullish(),
  status: z.enum(['open', 'in_progress', 'waitlist', 'cancelled', 'completed']),
  depositAmount: z.number().int().nonnegative().nullish(),
});

const updateAppointmentInputSchema = z.object({
  id: objectIdSchema,
  appointmentDate: dateLikeSchema,
  projectId: objectIdSchema.nullish(),
  userId: objectIdSchema.nullish(),
  shopId: objectIdSchema.nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  total: z.number().nonnegative().nullish(),
  tip: z.number().nonnegative().nullish(),
  shopCutStatus: z
    .enum(['none', 'unpaid', 'invoice_sent', 'pending_confirmation', 'paid', 'received'])
    .nullish(),
  shopCutAmount: z.number().nonnegative().nullish(),
  appointmentType: z.enum(['consult', 'session', 'other']).nullish(),
  appointmentStatus: z
    .enum(['scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show'])
    .nullish(),
  createdAt: dateLikeSchema.nullish(),
  updatedAt: dateLikeSchema.nullish(),
});

const updateConversationInputSchema = z.object({
  id: objectIdSchema,
  members: z.array(objectIdSchema).min(1, 'A conversation must have at least one member'),
  createdAt: dateLikeSchema.nullish(),
  updatedAt: dateLikeSchema.nullish(),
});

const updateMessageInputSchema = z.object({
  id: objectIdSchema,
  conversationId: objectIdSchema,
  senderId: objectIdSchema,
  message: z.string().trim().min(1, 'Message cannot be empty'),
  createdAt: dateLikeSchema.nullish(),
  updatedAt: dateLikeSchema.nullish(),
});

// --- Create-mutation schemas ---
//
// Same value-level validation as the update schemas above (enums, non-empty strings, non-negative
// numbers), just without `id` (nothing exists yet to reference) and with required-ness matched to
// what each Mongoose model already enforces via `required: true` - so a request missing one of
// those fields was already going to fail before this existed, just as an unhandled Mongoose
// ValidationError instead of a clean UserInputError with a field-specific message.

// createProject takes the same shape as updateProject minus `id` - reuse it directly rather than
// re-declaring every field.
const createProjectInputSchema = updateProjectInputSchema.omit({ id: true });

const createAppointmentInputSchema = z.object({
  appointmentDate: dateLikeSchema,
  projectId: objectIdSchema.nullish(),
  userId: objectIdSchema.nullish(),
  shopId: objectIdSchema.nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  total: z.number().nonnegative().nullish(),
  tip: z.number().nonnegative().nullish(),
  // shopCutStatus is nullish here now, not required - Appointment.js's Mongoose schema itself
  // dropped `required: true` on this field (see that file's comment) so independent artists with
  // no shopId aren't forced to send a throwaway value. Defaults to 'none' at the Mongoose layer.
  shopCutStatus: z
    .enum(['none', 'unpaid', 'invoice_sent', 'pending_confirmation', 'paid', 'received'])
    .nullish(),
  shopCutAmount: z.number().nonnegative().nullish(),
  appointmentType: z.enum(['consult', 'session', 'other']),
  appointmentStatus: z.enum(['scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show']),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

const createConversationInputSchema = z.object({
  // Conversation.js's Mongoose schema doesn't actually require `members` - but a conversation
  // with zero members isn't a meaningful conversation, so this matches the same min(1) already
  // applied to updateConversationInputSchema above rather than leaving create less strict than
  // update.
  members: z.array(objectIdSchema).min(1, 'A conversation must have at least one member'),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

const createMessageInputSchema = z.object({
  conversationId: objectIdSchema,
  senderId: objectIdSchema,
  // GraphQL's `message: String!` only guarantees non-null, not non-empty - an empty string ""
  // passes GraphQL fine. Message.js's Mongoose schema doesn't require this field at all.
  message: z.string().trim().min(1, 'Message cannot be empty'),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

/**
 * Runs a zod schema against input and returns { valid, errors } - the same shape
 * utils/validators.js used to produce by hand, and the shape the client already expects to read
 * off err.graphQLErrors[0].extensions.errors (see client/src/pages/register/Register.js). Keeps
 * every call site that used the old validators working the same way; only the validation logic
 * itself changed.
 */
function validate(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) {
    return { valid: true, errors: {}, data: result.data };
  }
  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] || 'general';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { valid: false, errors, data: null };
}

// --- Booking request / guest correspondence schemas ---
// See PRODUCTION_ROADMAP.md's "Booking request & guest correspondence" section.

const createBookingRequestInputSchema = z.object({
  artistId: objectIdSchema,
  firstName: z.string().trim().min(1, 'First name must not be empty'),
  lastName: z.string().trim().min(1, 'Last name must not be empty'),
  email: z
    .string()
    .trim()
    .min(1, 'Email must not be empty.')
    .email('Email must be a valid email address'),
  phone: z.string().nullish(),
  description: z.string().trim().min(1, 'Please describe what you have in mind'),
  // Plain URL strings returned by POST /booking-uploads (routes/bookingUploads.js), not free-form
  // objects - matches the [String] shape in typeDefs.js/BookingRequest.js. Capped at 5 to match
  // that route's own MAX_FILES limit; enforced again here since this schema is the actual
  // security boundary for the mutation, not the upload route (which only controls what a client
  // *can* attach, not what this mutation *accepts*).
  referenceImages: z.array(z.string().trim().url('Each reference image must be a valid URL')).max(5).nullish(),
  placement: z.string().nullish(),
  size: z.string().nullish(),
  budget: z.string().nullish(),
  availability: z.string().nullish(),
  isCoverUp: z.boolean().nullish(),
  howHeard: z.string().nullish(),
});

const guestMessageInputSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty'),
});

const convertBookingRequestInputSchema = z.object({
  outcome: z.enum(['consult_booked', 'session_booked', 'declined']),
});

// --- Artist-shop connection schema ---
// See PRODUCTION_ROADMAP.md's "Artist-centric tenancy model" section - this is the minimal slice
// needed to unblock Appointment.shopId authorization, not the full connection lifecycle.
const artistShopConnectionInputSchema = z.object({
  artistId: objectIdSchema,
  shopId: objectIdSchema,
});

// --- Shop-cut ledger schemas ---
// See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. paymentMethod defaults to 'ach' at the
// resolver level (see mutations/shopCutPayments.js) - only validated here as an optional override.
const createShopCutInvoiceInputSchema = z.object({
  appointmentId: objectIdSchema,
  paymentMethod: z.enum(['ach', 'card']).nullish(),
});

const appointmentIdInputSchema = z.object({
  appointmentId: objectIdSchema,
});

module.exports = {
  loginInputSchema,
  registerInputSchema,
  changePasswordInputSchema,
  updateProjectInputSchema,
  updateAppointmentInputSchema,
  updateConversationInputSchema,
  updateMessageInputSchema,
  createProjectInputSchema,
  createAppointmentInputSchema,
  createConversationInputSchema,
  createMessageInputSchema,
  createBookingRequestInputSchema,
  guestMessageInputSchema,
  convertBookingRequestInputSchema,
  artistShopConnectionInputSchema,
  createShopCutInvoiceInputSchema,
  appointmentIdInputSchema,
  validate,
};
