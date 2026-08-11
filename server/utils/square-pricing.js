const Artist = require('../models/Artist');
const Shop = require('../models/Shop');
const { getActiveShopIdForArtist } = require('./artist-shop');

/**
 * What a card charge actually comes to.
 *
 * ---------------------------------------------------------------------------------------------
 * PURE ARITHMETIC, SEPARATE FROM SQUARE. Nothing here talks to Square, and that is deliberate: the
 * numbers on a confirmation screen have to be checkable without a network call, a sandbox, or a
 * card. The Orders call that eventually charges these figures is a different concern.
 *
 * EVERYTHING IN INTEGER CENTS, and tax in BASIS POINTS. 9.4% is 940, not 0.094 - a float rate
 * multiplied into a total is exactly where rounding stops being academic, and this codebase already
 * pays that discipline everywhere else money is handled.
 * ---------------------------------------------------------------------------------------------
 */

/** Round half up, on integers. Math.round() rounds .5 toward +Infinity, which is what a till does. */
function roundCents(value) {
  return Math.round(value);
}

/**
 * Which tax rate and fee offset apply to this artist, and whose they are.
 *
 * SHOP FIRST, ARTIST ONLY WHEN INDEPENDENT. Tax is destination-based: a client is taxed where the
 * work happens, so it belongs to the shop's location rather than to the artist. Two artists in the
 * same room billing different tax rates would be wrong regardless of what either had configured.
 *
 * The fee offset follows the same owner for a duller reason - it is set alongside the tax rate in
 * one Square settings section, and splitting them would mean a shop artist whose tax came from the
 * shop and whose offset came from themselves, which nobody could reason about at the counter.
 *
 * Returns `source` so a UI can say whose settings these are. An artist looking at a number they
 * cannot change should be told why.
 */
/**
 * DOLLARS TO CENTS, at the boundary.
 *
 * Shop.hourlyRate and Artist.hourlyRate are stored in WHOLE DOLLARS - they are configuration a
 * human types, not transaction records, and were deliberately left in dollars when the money
 * migration moved everything else to cents (see client/src/utils/sessionRate.js, which converts at
 * the same boundary for the same reason).
 *
 * This conversion was missing. `hourlyRateCents: shop.hourlyRate` put 180 into a field every
 * consumer reads as 18000, and computeFeeOffsetCents divides the subtotal BY it: a one-hour
 * session at $180 implied 100 hours, so a $6 offset came out as $600 - and then got taxed, since
 * the offset joins the taxable base (M8). The unit is in the field name; the value has to match it.
 */
function dollarsToCents(dollars) {
  return Math.round((dollars || 0) * 100);
}

async function resolveSquareSettings(artistUserId) {
  const shopId = await getActiveShopIdForArtist(artistUserId);
  if (shopId) {
    const shop = await Shop.findById(shopId).select(
      'taxRateBasisPoints squareFeeOffsetCents hourlyRate',
    );
    return {
      source: 'shop',
      shopId,
      taxRateBasisPoints: shop?.taxRateBasisPoints || 0,
      // Already cents - squareFeeOffsetCents is declared in cents and has no dollars-denominated
      // input anywhere. Only hourlyRate needs converting.
      feeOffsetCents: shop?.squareFeeOffsetCents || 0,
      hourlyRateCents: dollarsToCents(shop?.hourlyRate),
    };
  }

  const artist = await Artist.findOne({ userId: artistUserId }).select(
    'taxRateBasisPoints squareFeeOffsetCents hourlyRate',
  );
  return {
    source: 'artist',
    shopId: null,
    taxRateBasisPoints: artist?.taxRateBasisPoints || 0,
    feeOffsetCents: artist?.squareFeeOffsetCents || 0,
    hourlyRateCents: dollarsToCents(artist?.hourlyRate),
  };
}

/**
 * The fee offset for a given total.
 *
 * ```
 * implied hours = subtotal / hourly rate
 * offset        = offset per hour x implied hours
 * ```
 *
 * DERIVED FROM THE TOTAL, NOT FROM THE BOOKED DURATION, and that is the whole reason it works
 * everywhere. A flat-priced session has no hours; a deposit has no hours; a session that ran long
 * has hours that disagree with what was charged. Dividing the money by the rate gives a consistent
 * answer for all three - a $540 flat session at $180/hr implies three hours, and a $100 deposit
 * implies about half of one.
 *
 * Returns 0 when either input is missing rather than throwing. An unconfigured offset is the normal
 * state, not an error, and a charge must not fail because nobody has filled in a settings field.
 *
 * The known limit, stated rather than hidden: a keyed deposit costs Square 3.5% + $0.15 - $7.15 on
 * $200 - where the implied-hours share of a per-hour offset is far less. It under-recovers there and
 * over-recovers on long sessions. Both are accepted (DECISIONS.md M5).
 */
function computeFeeOffsetCents({ subtotalCents, hourlyRateCents, feeOffsetPerHourCents }) {
  if (!subtotalCents || !hourlyRateCents || !feeOffsetPerHourCents) {
    return 0;
  }
  const impliedHours = subtotalCents / hourlyRateCents;
  return roundCents(feeOffsetPerHourCents * impliedHours);
}

/**
 * The full breakdown for a charge, with the offset either applied or not.
 *
 * `applyFeeOffset` is a CHOICE the caller passes, never inferred. The offset is presented before the
 * card is charged and the artist decides - it must not appear in a total nobody agreed to.
 *
 * ORDER MATTERS AND IS FIXED: the offset joins the taxable base, then tax is computed on that base,
 * then the deposit credit and any gift card come off the total. Two consequences worth naming:
 *
 *   - the offset is taxed, because it is part of the service price rather than a separate fee;
 *   - the deposit and gift card reduce what is COLLECTED, not what is taxed. The tax on the work
 *     was already owed; paying part of it with money taken earlier does not change what the state
 *     is due.
 *
 * @returns {{subtotalCents, feeOffsetCents, taxableCents, taxCents, totalCents,
 *            depositCreditCents, giftCardCents, amountDueCents}}
 */
function computeChargeBreakdown({
  subtotalCents = 0,
  hourlyRateCents = 0,
  feeOffsetPerHourCents = 0,
  taxRateBasisPoints = 0,
  applyFeeOffset = false,
  depositCreditCents = 0,
  giftCardCents = 0,
  tipCents = 0,
}) {
  const feeOffsetCents = applyFeeOffset
    ? computeFeeOffsetCents({ subtotalCents, hourlyRateCents, feeOffsetPerHourCents })
    : 0;

  const taxableCents = subtotalCents + feeOffsetCents;
  const taxCents = roundCents((taxableCents * taxRateBasisPoints) / 10000);

  // The tip sits outside the taxable base - it is not a service price - and outside the shop cut
  // (DECISIONS.md M2). It is added to what the card is charged and nowhere else.
  const totalCents = taxableCents + taxCents + tipCents;

  // Credits come off what is collected. Clamped so an over-large deposit or gift card produces a
  // zero bill rather than a negative one that would read as owing the client money.
  const credits = Math.max(0, depositCreditCents) + Math.max(0, giftCardCents);
  const amountDueCents = Math.max(0, totalCents - credits);

  return {
    subtotalCents,
    feeOffsetCents,
    taxableCents,
    taxCents,
    tipCents,
    totalCents,
    depositCreditCents,
    giftCardCents,
    amountDueCents,
  };
}

module.exports = {
  computeChargeBreakdown,
  computeFeeOffsetCents,
  resolveSquareSettings,
  roundCents,
};
