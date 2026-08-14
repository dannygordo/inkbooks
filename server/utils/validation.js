const { z } = require('zod');

// Replaces the hand-rolled utils/validators.js. That file had a real, silent bug: register()
// called validateRegisterInput(...) with 10 arguments (including tagColor), but the function's
// signature only accepted 9 - the extra argument was dropped with no error, and tagColor went
// completely unvalidated. A schema-based approach like this doesn't have that failure mode: an
// unexpected/extra field either has an explicit place in the schema or it doesn't exist at all.

// Email is the identity - there is no username. See models/User.js.
//
// Deliberately NOT .email() here. A login form should say "invalid email or password", not
// "that's not a well-formed address" - the second tells someone which half they got wrong, and
// on the way there it confirms whether a malformed string could ever have been an account.
const loginInputSchema = z.object({
  email: z.string().trim().min(1, 'Email must not be empty'),
  password: z.string().min(1, 'Password must not be empty'),
});

// NOTE: role/userType are deliberately not part of this schema. Public self-registration always
// hardcodes both to Client server-side (see resolvers/users.js register()) - see
// PRODUCTION_ROADMAP.md Phase 1, item 3 for why that's a security fix, not an oversight.
const registerInputSchema = z
  .object({
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

/**
 * Public signup: a shop, or an independent artist.
 *
 * accountType is validated against the enum here rather than trusted, and it is the ONLY thing the
 * caller gets to say about who they are. Role and userType are derived from it server-side - see
 * registerAccount in resolvers/users.js. A public form that let the caller name their own role is
 * the escalation bug this codebase already fixed once.
 */
const registerAccountInputSchema = z
  .object({
    accountType: z.enum(['shop', 'artist'], {
      errorMap: () => ({ message: 'Choose whether you are signing up as a shop or an artist.' }),
    }),
    email: z
      .string()
      .trim()
      .min(1, 'Email must not be empty.')
      .email('Email must be a valid email address, e.g. jonsnow@kingofthenorth.com'),
    firstName: z.string().trim().min(1, 'First name must not be empty'),
    lastName: z.string().trim().min(1, 'Last name must not be empty'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    // Only meaningful for a shop. Checked by the refine below rather than made required outright,
    // so an artist isn't asked for a shop name they don't have.
    shopName: z.string().trim().optional(),
    // The public booking handle, chosen at signup by BOTH paths - a shop owner is an artist too
    // and needs a link of their own. Shape, reserved words and availability are all the server's
    // answer (utils/booking-slug.js); this only says the field exists and is optional. An account
    // without one still has a working /book/<id> page.
    bookingSlug: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.accountType !== 'shop' || Boolean(data.shopName), {
    message: 'Your shop needs a name.',
    path: ['shopName'],
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
  // Was z.array(z.string()) from when bodyImages stored bare URLs - now IBImage objects, same
  // shape as referenceImages/designImages (see typeDefs.js's Project.bodyImages comment).
  bodyImages: z.array(z.any()).nullish(),
  designImages: z.array(z.any()).nullish(),
  materialsUsed: z.array(z.string()).nullish(),
  notes: z.array(z.any()).nullish(),
  tags: z.array(z.string()).nullish(),
  status: z.enum(['open', 'in_progress', 'waitlist', 'cancelled', 'completed']),
});

const updateAppointmentInputSchema = z.object({
  id: objectIdSchema,
  appointmentDate: dateLikeSchema,
  projectId: objectIdSchema.nullish(),
  userId: objectIdSchema.nullish(),
  shopId: objectIdSchema.nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  // Integer CENTS - see utils/money.js. `.int()` is load-bearing, not decoration: a fractional
  // cent is not a representable amount of money, and letting one through here is how a rounding
  // discrepancy gets persisted instead of caught.
  subtotalCents: z.number().int().nonnegative().nullish(),
  taxCents: z.number().int().nonnegative().nullish(),
  feeCents: z.number().int().nonnegative().nullish(),
  tipCents: z.number().int().nonnegative().nullish(),
  totalCents: z.number().int().nonnegative().nullish(),
  shopCutStatus: z
    .enum(['none', 'unpaid', 'invoice_sent', 'pending_confirmation', 'paid', 'received'])
    .nullish(),
  // shopCutAmount is gone from both input schemas: the shop cut is computed server-side from
  // subtotalCents and the configured percentage (utils/shop-cut.js), never accepted from a
  // client. zod strips unrecognized keys, so anything still sending it is silently dropped
  // rather than trusted.
  appointmentType: z.enum(['consult', 'session', 'other']).nullish(),
  appointmentStatus: z
    .enum(['scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show'])
    .nullish(),
  createdAt: dateLikeSchema.nullish(),
  updatedAt: dateLikeSchema.nullish(),
  // A plain autosaved textarea, not timer state - see models/Appointment.js's comment on why this
  // one field is editable through the generic update path while timerStatus/timerStartedAt/
  // accumulatedSeconds deliberately aren't (and aren't even on this schema at all).
  sessionNotes: z.string().nullish(),
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
  // Nullish so the model's type-aware default applies when a caller doesn't care - a consult and a
  // session get different sensible lengths (see models/Appointment.js). Bounded at both ends when
  // it IS given: `.int().positive()` because a zero-length or fractional-minute appointment is not
  // a thing, and a day's ceiling because a duration in the thousands is a typo (someone entering
  // minutes where they meant hours), and the conflict checker would then mark a whole week busy.
  durationMinutes: z.number().int().positive().max(24 * 60).nullish(),
  projectId: objectIdSchema.nullish(),
  userId: objectIdSchema.nullish(),
  shopId: objectIdSchema.nullish(),
  // Only ever set server-side by convertBookingRequest, never by a client directly - see
  // models/Appointment.js's own comment. Included here so it actually survives this schema's
  // validation (zod strips unrecognized keys) rather than silently getting dropped before the
  // save.
  bookingRequestId: objectIdSchema.nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  // Integer CENTS - see utils/money.js. `.int()` is load-bearing, not decoration: a fractional
  // cent is not a representable amount of money, and letting one through here is how a rounding
  // discrepancy gets persisted instead of caught.
  subtotalCents: z.number().int().nonnegative().nullish(),
  taxCents: z.number().int().nonnegative().nullish(),
  feeCents: z.number().int().nonnegative().nullish(),
  tipCents: z.number().int().nonnegative().nullish(),
  totalCents: z.number().int().nonnegative().nullish(),
  // shopCutStatus is nullish here now, not required - Appointment.js's Mongoose schema itself
  // dropped `required: true` on this field (see that file's comment) so independent artists with
  // no shopId aren't forced to send a throwaway value. Defaults to 'none' at the Mongoose layer.
  shopCutStatus: z
    .enum(['none', 'unpaid', 'invoice_sent', 'pending_confirmation', 'paid', 'received'])
    .nullish(),
  // shopCutAmount is gone from both input schemas: the shop cut is computed server-side from
  // subtotalCents and the configured percentage (utils/shop-cut.js), never accepted from a
  // client. zod strips unrecognized keys, so anything still sending it is silently dropped
  // rather than trusted.
  appointmentType: z.enum(['consult', 'session', 'other']),
  appointmentStatus: z.enum(['scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show']),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
  sessionNotes: z.string().nullish(),
});

const createConversationInputSchema = z.object({
  // Conversation.js's Mongoose schema doesn't actually require `members` - but a conversation
  // with zero members isn't a meaningful conversation, so this matches the same min(1) already
  // applied to updateConversationInputSchema above rather than leaving create less strict than
  // update.
  members: z.array(objectIdSchema).min(1, 'A conversation must have at least one member'),
  // No createdAt/updatedAt. Server-stamped - see mutations/conversations.js, and the same
  // reasoning that took them off createMessage.
});

const createMessageInputSchema = z.object({
  conversationId: objectIdSchema,
  senderId: objectIdSchema,
  // GraphQL's `message: String!` only guarantees non-null, not non-empty - an empty string ""
  // passes GraphQL fine. Message.js's Mongoose schema doesn't require this field at all.
  message: z.string().trim().min(1, 'Message cannot be empty'),
  // No createdAt/updatedAt. They used to be required here AND ignored by the resolver, which
  // stamps its own (see mutations/messages.js on why a client-supplied message timestamp is
  // unsound). Validating a field as required and then throwing it away is the worst of both:
  // callers must supply something, and whatever they supply means nothing.
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
  // Defaults to 'public_form' at the resolver level when omitted (see
  // mutations/bookingRequests.js) - see BookingRequest.js's own comment on what this
  // distinguishes and why.
  source: z.enum(['public_form', 'artist_created']).nullish(),
});

const guestMessageInputSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty'),
});

const convertBookingRequestInputSchema = z.object({
  outcome: z.enum(['consult_booked', 'session_booked', 'declined', 'not_booked']),
  // Only actually required when outcome is session_booked (checked at the resolver level, not
  // here, since zod's cross-field conditionals get awkward) - see mutations/bookingRequests.js.
  // Which *current* statuses each outcome is even reachable from (e.g. not_booked only makes
  // sense following consult_booked) is also enforced at the resolver level, not here - zod
  // validates the shape of this one call's input, not the BookingRequest's existing state.
  projectTitle: z.string().trim().min(1).nullish(),
});

// Forwarding a pending request to a shop-mate - see mutations/bookingRequests.js's
// reassignBookingRequest for the full authorization/same-shop check this only validates shape for.
const reassignBookingRequestInputSchema = z.object({
  bookingRequestId: objectIdSchema,
  newArtistId: objectIdSchema,
});

// --- Artist-shop connection schema ---
// See PRODUCTION_ROADMAP.md's "Artist-centric tenancy model" section - this is the minimal slice
// needed to unblock Appointment.shopId authorization, not the full connection lifecycle.
const artistShopConnectionInputSchema = z.object({
  artistId: objectIdSchema,
  shopId: objectIdSchema,
  // Only meaningful on connect: the caller has been told which shop this artist is leaving and
  // has said to go ahead. Optional so a first-time connect (nothing to leave) needs no ceremony -
  // see connectArtistToShop in graphql/mutations/artistShopConnections.js.
  confirmTransfer: z.boolean().nullish(),
});

// Which side's rate an artist's sessions bill against at a given shop - see
// models/ArtistShopConnection.js's rateSource field.
const setRateSourceInputSchema = z.object({
  artistId: objectIdSchema,
  shopId: objectIdSchema,
  rateSource: z.enum(['shop', 'own']),
});

// Artist's own rate settings (Artist.hourlyRate/flatRate/billingType) - a settings-page update,
// deliberately narrower than the full ArtistInput used by EditArtist.js, since this is meant to
// be self-service (the artist editing their own rate, not an admin editing arbitrary artist
// fields).
const updateArtistRateSettingsInputSchema = z.object({
  hourlyRate: z.number().nonnegative().nullish(),
  flatRate: z.number().nonnegative().nullish(),
  billingType: z.enum(['hourly', 'flat_rate']),
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

// Batch version of createShopCutInvoiceInputSchema above - see mutations/shopCutPayments.js's
// createBatchShopCutInvoice, used by the artist-dashboard payout list (client/src/components/
// artistDashboard/ShopCutPayoutList.jsx) to combine several completed sessions' shop cuts into
// one Square invoice instead of sending one per session. min(1) since an empty selection isn't a
// real batch; the resolver itself enforces same-shop/same-artist/unpaid-only on top of this.
const createBatchShopCutInvoiceInputSchema = z.object({
  appointmentIds: z.array(objectIdSchema).min(1),
  paymentMethod: z.enum(['ach', 'card']).nullish(),
});

// --- Direct card payment (deposit checkout) schema ---
// See PRODUCTION_ROADMAP.md's Phase 4 section and routes/squarePayments.js. sourceId is the
// nonce/token the client's Web Payments SDK produces (tokenizeCard()'s token field) - a plain
// string, not a Mongo ObjectId, so it doesn't reuse objectIdSchema. amountCents mirrors how
// Square's own amount_money.amount field works (an integer number of the currency's smallest
// unit) rather than a float dollar amount, to avoid floating-point rounding entirely.
/**
 * What the browser is allowed to say about a charge.
 *
 * NOTE WHAT IS NOT HERE: subtotalCents, taxCents, feeCents and amountCents. They used to be, and
 * the server wrote them straight onto the Appointment and then computed the shop's cut from the
 * subtotal the caller had just sent it. An artist posting a smaller subtotal than they charged
 * paid a smaller cut, and the books recorded the number that was sent rather than the number
 * Square took.
 *
 * This schema validated their TYPES, which is not the same as validating that they are true. The
 * fix is not a tighter schema - there is no assertion about a number that makes a client entitled
 * to assert it. The server now derives every figure from stored rates via resolveSquareSettings
 * and computeChargeBreakdown (DECISIONS.md M8), and the client sends only the four things it
 * legitimately knows:
 *
 *   - which appointment is being charged;
 *   - whether the artist accepted the fee offset, which IS the artist's choice to make (M5);
 *   - the tip, which the client decides and no stored rate can predict;
 *   - an idempotency key, so a retry is the same charge rather than a second one.
 *
 * The tip is the one money figure still supplied by the caller, and that is correct - it is
 * genuinely input. It is also the one figure that cannot move the shop's cut, since tips sit
 * outside the cuttable base by construction (M2).
 */
/**
 * Tax rate and fee offset, in their stored units.
 *
 * BASIS POINTS AND CENTS CROSS THE BOUNDARY, not percentages and dollars. The UI converts on the
 * way in and out - that is a display concern - but a percentage travelling as a float is exactly
 * where 9.4 stops being representable, and this codebase keeps money and rates in integers for
 * that reason (M8).
 *
 * Capped at 10000bp (100%) and $100/hr of offset. Neither is a real configuration; both are what a
 * mistyped entry looks like, and a tax rate of 9400% silently applied to every charge is not
 * something to discover from a customer.
 */
const squarePricingSettingsInputSchema = z.object({
  taxRateBasisPoints: z
    .number()
    .int('Tax rate must be a whole number of basis points')
    .min(0)
    .max(10000, 'Tax rate cannot exceed 100%'),
  squareFeeOffsetCents: z
    .number()
    .int('The offset must be a whole number of cents')
    .min(0)
    .max(10000, 'The offset cannot exceed $100 an hour'),
});

const processSquarePaymentInputSchema = z.object({
  sourceId: z.string().trim().min(1, 'sourceId must not be empty'),
  // Generated by the browser per Pay-button press and resent unchanged on retry. Square treats a
  // repeat of the same key as the same payment, which is what stops a double-click being two
  // charges. Bounded because Square's own limit is 45 characters.
  idempotencyKey: z.string().trim().min(1).max(45),
  note: z.string().trim().max(500).nullish(),
  appointmentId: objectIdSchema,
  // Which transaction this is against that appointment - a consult can take a deposit and later
  // be charged for work. The caller knows which button was pressed; it does not get to say what
  // either one costs. Defaults to a session charge.
  chargeType: z.enum(['session', 'deposit']).nullish(),
  applyFeeOffset: z.boolean().nullish(),
  tipCents: z.number().int().nonnegative().nullish(),
});

/**
 * One appointment-reminder rule: how long before the appointment it fires. See
 * models/ReminderSettings.js for why this is minutes rather than hours (a same-day "30 minutes
 * before" nudge needs a finer unit than hours would give it) and why it's capped at 30 days - a
 * rule further out than that is really "remind me a month early", which is a different feature
 * than an appointment reminder.
 */
const reminderRuleInputSchema = z.object({
  offsetMinutes: z
    .number()
    .int('Must be a whole number of minutes')
    .min(5, 'Must fire at least 5 minutes before the appointment')
    .max(43200, 'Must fire within 30 days of the appointment'),
  enabled: z.boolean(),
});

// Every field optional - see resolvers/reminders.js: a caller sends only what changed, same
// pattern as updateNotificationSettings. Templates are nullable rather than merely optional so
// the client can explicitly reset one back to the built-in default (null) as opposed to leaving
// it untouched (omitted) - see models/ReminderSettings.js's own comment on that distinction.
const updateReminderSettingsInputSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  rules: z
    .array(reminderRuleInputSchema)
    .max(10, 'Ten rules is plenty - simplify rather than add more.')
    .optional(),
  emailSubjectTemplate: z.string().trim().max(200).nullish(),
  emailBodyTemplate: z.string().trim().max(4000).nullish(),
  // Kept short deliberately - a template this long is several SMS segments before any merge field
  // even expands, and each segment is a separate cost/carrier hop.
  smsTemplate: z.string().trim().max(1000).nullish(),
});

// --- Gift cards --- See DECISIONS.md M6 and graphql/resolvers/giftCards.js.
//
// Neither create schema takes issuerArtistId/soldByUserId - those come from the authenticated
// caller (mutations/giftCards.js), never from the request, the same reasoning M10 applies to a
// charge: no assertion about who gets credited/billed belongs to the caller to make. shopId is
// likewise never accepted on the artist-issued schema - it's resolved server-side from the
// caller's own active connection (or left null for an independent artist, per M6) - only the
// shop-issued schema takes one, because a shop admin's own shop genuinely isn't derivable any
// other way (an admin's Staff row can reference more than the one shop being sold for, in theory,
// so the caller has to say which - the resolver still checks they actually belong to it).
const createArtistGiftCardInputSchema = z.object({
  faceValueCents: z.number().int().positive('A gift card needs a face value above zero'),
  applyFeeOffset: z.boolean().nullish(),
});

const createShopGiftCardInputSchema = z.object({
  shopId: objectIdSchema,
  faceValueCents: z.number().int().positive('A gift card needs a face value above zero'),
  applyFeeOffset: z.boolean().nullish(),
});

// code is free text at this layer - normalizeGiftCardCode (utils/gift-card.js) is what actually
// compares it against a stored code, so this only guards against an empty string.
const redeemGiftCardInputSchema = z.object({
  appointmentId: objectIdSchema,
  code: z.string().trim().min(1, 'Enter the gift card code'),
  amountCents: z.number().int().positive('Enter an amount above zero to redeem'),
});

const giftCardIdInputSchema = z.object({
  giftCardId: objectIdSchema,
});

const createGiftCardShopCutInvoiceInputSchema = z.object({
  giftCardId: objectIdSchema,
  paymentMethod: z.enum(['ach', 'card']).nullish(),
});

module.exports = {
  loginInputSchema,
  registerInputSchema,
  registerAccountInputSchema,
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
  reassignBookingRequestInputSchema,
  artistShopConnectionInputSchema,
  setRateSourceInputSchema,
  updateArtistRateSettingsInputSchema,
  createShopCutInvoiceInputSchema,
  createBatchShopCutInvoiceInputSchema,
  appointmentIdInputSchema,
  processSquarePaymentInputSchema,
  squarePricingSettingsInputSchema,
  reminderRuleInputSchema,
  updateReminderSettingsInputSchema,
  createArtistGiftCardInputSchema,
  createShopGiftCardInputSchema,
  redeemGiftCardInputSchema,
  giftCardIdInputSchema,
  createGiftCardShopCutInvoiceInputSchema,
  validate,
};
