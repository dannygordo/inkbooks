const mongoose = require('mongoose');

// 8 hours, then every 3 hours until answered - the defaults locked in when this feature shipped
// (see the plan's Feature 3 section). Named rather than inlined so utils/response-time.js and this
// model can't quietly drift to two different numbers.
const DEFAULT_INITIAL_THRESHOLD_MINUTES = 480;
const DEFAULT_REPEAT_INTERVAL_MINUTES = 180;

/**
 * How long a client's message may go unanswered before the artist gets nudged, and how often the
 * nudge repeats until they reply. Feature 3 - unanswered-message nudges. See
 * utils/response-time.js's resolveResponseTimeThresholds for the actual precedence rule and
 * utils/attention.js's unansweredMessages / utils/notification-jobs.js's sendMessageNudges for
 * where this is actually consumed.
 *
 * ---------------------------------------------------------------------------------------------
 * OWNERSHIP matches AutoResponse/Expense/Income/Form exactly: shopId XOR artistUserId, never both,
 * never neither (see utils/shop-membership.js's resolveBusinessOwner/assertCanManageBusinessRecord,
 * reused as-is). UNLIKE AutoResponse, this is a SINGLETON per owner rather than a list - one row
 * per shop, one row per artist, lazily created on first read or write, the same convention
 * ReminderSettings already uses (see that model's own header comment on why: there is no
 * provisioning step at signup, so the first visit to Settings > Messages is what creates the row).
 *
 * THE SHOP'S ROW IS A CEILING, NOT A DEFAULT THE ARTIST MERELY STARTS FROM. Decision, locked via
 * AskUserQuestion before this shipped: a shop admin sets a policy floor artists can tighten but
 * never loosen. This model only stores what each owner has explicitly set - the clamp between an
 * artist's row and their shop's is resolved entirely in utils/response-time.js, so the "which one
 * wins" question has exactly one place it can be gotten wrong, not one per reader of this model.
 * ---------------------------------------------------------------------------------------------
 */
const responseTimeSettingsSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, default: null },
    artistUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // How long a client's message may sit unanswered before it first counts as "unanswered" -
    // both in the passive inbox condition and to start the repeat-nudge clock. Minutes, matching
    // ReminderRule.offsetMinutes' own unit.
    initialThresholdMinutes: {
      type: Number,
      required: true,
      min: 5,
      default: DEFAULT_INITIAL_THRESHOLD_MINUTES,
    },
    // Once unanswered, how often the artist is re-notified until they reply.
    repeatIntervalMinutes: {
      type: Number,
      required: true,
      min: 5,
      default: DEFAULT_REPEAT_INTERVAL_MINUTES,
    },
    // Who last saved this row - an audit breadcrumb, same role as AutoResponseLog's
    // triggeredByUserId, not an authorization input to anything.
    setByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

// One row per owner - the singleton guarantee, enforced by the database rather than trusted to
// the upsert-by-owner-filter pattern the resolver already follows (see
// resolvers/responseTimeSettings.js) - same belt-and-suspenders standard as every other uniqueness
// rule in this codebase.
responseTimeSettingsSchema.index(
  { shopId: 1 },
  { unique: true, partialFilterExpression: { shopId: { $type: 'objectId' } } },
);
responseTimeSettingsSchema.index(
  { artistUserId: 1 },
  { unique: true, partialFilterExpression: { artistUserId: { $type: 'objectId' } } },
);

const ResponseTimeSettings = mongoose.model('ResponseTimeSettings', responseTimeSettingsSchema);

ResponseTimeSettings.DEFAULT_INITIAL_THRESHOLD_MINUTES = DEFAULT_INITIAL_THRESHOLD_MINUTES;
ResponseTimeSettings.DEFAULT_REPEAT_INTERVAL_MINUTES = DEFAULT_REPEAT_INTERVAL_MINUTES;

module.exports = ResponseTimeSettings;
