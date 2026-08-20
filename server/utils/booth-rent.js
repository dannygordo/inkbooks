const BoothRentPlan = require('../models/BoothRentPlan');
const BoothRentCharge = require('../models/BoothRentCharge');
const ExpenseType = require('../models/ExpenseType');
const IncomeType = require('../models/IncomeType');
const { resolveCompensationModelAt } = require('./shop-cut');

/**
 * Booth rent - the flat-fee alternative to a percentage shop cut. See models/ShopCutRate.js's
 * compensationModel field (which model an artist is on, dated, the same append-only history as
 * the percentage itself) and models/BoothRentPlan.js/BoothRentCharge.js (what the flat fee
 * actually is, and the real monthly charges it generates). This file is the two things booth rent
 * needs that a percentage doesn't: a generator that turns a plan into real monthly charges, and
 * the resolution that finds which plan applied on a given date - the exact role
 * utils/shop-cut.js's resolveShopCutPercentAt/utils/recurring-expenses.js's
 * generateDueRecurringExpenses play for their own features, mirrored here because the shapes are
 * genuinely the same problem twice.
 */

// A safety valve, not a business rule - identical reasoning to utils/recurring-expenses.js's own
// MAX_OCCURRENCES_PER_TEMPLATE_PER_RUN. Nothing legitimate should ever need more than a few years
// of missed months caught up in one sweep; this exists so a corrupted history fails loudly by
// running out of budget rather than writing years of charges in a single tick.
const MAX_PERIODS_PER_PAIR_PER_RUN = 60;

function daysInMonthUTC(year, monthIndex) {
  // Day 0 of the FOLLOWING month is the last day of THIS month - a standard trick that sidesteps
  // hand-writing a leap-year table.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// The UTC first-of-month for a given year/month - what periodMonth always stores.
function periodStart(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex, 1));
}

// The next calendar month's period start, UTC. Deliberately built from Date.UTC's own month
// rollover (month 12 becomes January of the next year) rather than hand-rolled December logic.
function nextPeriod(periodMonth) {
  return new Date(Date.UTC(periodMonth.getUTCFullYear(), periodMonth.getUTCMonth() + 1, 1));
}

/**
 * A period's real due date for a given dueDayOfMonth - clamped to the month's own last day, so a
 * plan due "on the 31st" charges on the 28th/29th in February rather than rolling into March.
 */
function dueDateForPeriod(periodMonth, dueDayOfMonth) {
  const year = periodMonth.getUTCFullYear();
  const monthIndex = periodMonth.getUTCMonth();
  const day = Math.min(dueDayOfMonth, daysInMonthUTC(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day));
}

/**
 * Which BoothRentPlan applied for a given artist/shop, AS OF A DATE - the same "newest row with
 * effectiveFrom <= at" resolution as resolveShopCutPercentAt, for the same reason: a plan can
 * change without touching history, and a past period must keep resolving to the terms that
 * actually applied then.
 */
async function resolveBoothRentPlanAt(artistId, shopId, at = new Date()) {
  return BoothRentPlan.findOne({ artistId, shopId, effectiveFrom: { $lte: at } }).sort({
    effectiveFrom: -1,
  });
}

/**
 * Finds (or creates, on first use) the owned "Booth Rent" ExpenseType/IncomeType a confirmed
 * charge's ledger rows are logged against - see mutations/boothRentPayments.js's
 * confirmBoothRentPaid. Owned per-artist/per-shop like every other ExpenseType/IncomeType
 * (models/ExpenseType.js/IncomeType.js), not a platform-seeded category - "Booth Rent" is exactly
 * the kind of thing those models' own header comments describe: something a shop's books need a
 * name for, not a universal vocabulary this app ships.
 */
async function findOrCreateBoothRentExpenseType(artistUserId) {
  return ExpenseType.findOneAndUpdate(
    { artistUserId, name: 'Booth Rent' },
    {
      $setOnInsert: {
        artistUserId,
        shopId: null,
        name: 'Booth Rent',
        description: 'Rent paid to the shop.',
        active: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function findOrCreateBoothRentIncomeType(shopId) {
  return IncomeType.findOneAndUpdate(
    { shopId, name: 'Booth Rent' },
    {
      $setOnInsert: {
        shopId,
        artistUserId: null,
        name: 'Booth Rent',
        description: 'Rent collected from booth-rent artists.',
        active: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Generates every BoothRentCharge currently due, across every artist/shop pair currently on the
 * BOOTH_RENT compensation model.
 *
 * ELIGIBILITY IS RE-CHECKED EVERY RUN, NOT CACHED ON THE PLAN - an artist can switch back to
 * PERCENTAGE (a new ShopCutRate row) without anyone touching BoothRentPlan at all, and generation
 * must stop the moment that happens. Distinct {artistId, shopId} pairs come from BoothRentPlan
 * (only pairs that ever had a plan can possibly be due), but whether a pair is ACTUALLY due right
 * now is decided by resolveCompensationModelAt against ShopCutRate - the same source of truth
 * Settings itself reads.
 *
 * CATCH-UP, exactly like generateDueRecurringExpenses: a pair with no charge in months gets one
 * per missed period, not one for "now", capped by MAX_PERIODS_PER_PAIR_PER_RUN.
 *
 * IDEMPOTENT via BoothRentCharge's unique index on {artistId, periodMonth} - a duplicate write (a
 * retried tick) is caught here as a no-op, not an error.
 */
async function generateDueBoothRentCharges({ now = new Date() } = {}) {
  const pairs = await BoothRentPlan.aggregate([
    { $group: { _id: { artistId: '$artistId', shopId: '$shopId' } } },
  ]);

  let pairsProcessed = 0;
  let generated = 0;
  let skippedDuplicate = 0;
  let skippedNotOnBoothRent = 0;

  for (const { _id: pairId } of pairs) {
    const { artistId, shopId } = pairId;
    // eslint-disable-next-line no-await-in-loop
    const model = await resolveCompensationModelAt(artistId, shopId, now);
    if (model !== 'BOOTH_RENT') {
      skippedNotOnBoothRent += 1;
      continue;
    }
    pairsProcessed += 1;

    // Where to start: the period after the newest existing charge for this artist at this shop,
    // or - if none exists yet - the period containing the EARLIEST plan row's effectiveFrom, since
    // rent is owed from when the plan actually started, not from whenever this sweep first ran.
    // eslint-disable-next-line no-await-in-loop
    const [latestCharge, earliestPlan] = await Promise.all([
      BoothRentCharge.findOne({ artistId, shopId }).sort({ periodMonth: -1 }).select('periodMonth'),
      BoothRentPlan.findOne({ artistId, shopId }).sort({ effectiveFrom: 1 }).select('effectiveFrom'),
    ]);
    if (!earliestPlan) {
      // Can't actually happen - this pair came from a BoothRentPlan aggregate - but no plan means
      // nothing to charge, so skip rather than assume.
      continue;
    }

    let cursor = latestCharge
      ? nextPeriod(latestCharge.periodMonth)
      : periodStart(earliestPlan.effectiveFrom.getUTCFullYear(), earliestPlan.effectiveFrom.getUTCMonth());

    let iterations = 0;
    while (iterations < MAX_PERIODS_PER_PAIR_PER_RUN) {
      // Which plan governs THIS period - resolved from the period's own start, not its due date,
      // so a plan that takes effect mid-month simply doesn't cover the month it started in (its
      // first real charge is the following period) rather than resolving to nothing at all.
      // eslint-disable-next-line no-await-in-loop
      const plan = await resolveBoothRentPlanAt(artistId, shopId, cursor);
      if (!plan) {
        // This period predates every plan row for this pair - nothing was owed for it yet.
        // Advance past it rather than generating a charge with no terms behind it.
        cursor = nextPeriod(cursor);
        iterations += 1;
        continue;
      }
      const dueDate = dueDateForPeriod(cursor, plan.dueDayOfMonth);
      if (dueDate > now) {
        // Not due yet - stop catching up here, this pair is otherwise current.
        break;
      }
      iterations += 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        await new BoothRentCharge({
          artistId,
          shopId,
          amountCents: plan.amountCents,
          periodMonth: cursor,
          dueDate,
          status: 'due',
        }).save();
        generated += 1;
      } catch (err) {
        if (err && err.code === 11000) {
          // Already generated - a previous run got here first. Not a failure; keep advancing.
          skippedDuplicate += 1;
        } else {
          throw err;
        }
      }
      cursor = nextPeriod(cursor);
    }
  }

  return { pairsProcessed, generated, skippedDuplicate, skippedNotOnBoothRent };
}

module.exports = {
  resolveBoothRentPlanAt,
  findOrCreateBoothRentExpenseType,
  findOrCreateBoothRentIncomeType,
  generateDueBoothRentCharges,
  dueDateForPeriod,
  nextPeriod,
  periodStart,
};
