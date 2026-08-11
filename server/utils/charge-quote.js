const { resolveSquareSettings, computeChargeBreakdown } = require('./square-pricing');

/**
 * What charging this appointment would come to, computed entirely from stored state.
 *
 * ---------------------------------------------------------------------------------------------
 * ONE FUNCTION, TWO CALLERS, ON PURPOSE. The quote the UI shows before the card is charged and the
 * amount actually charged come from here, so they cannot disagree. Computing the total in the
 * browser and charging a number the browser sent is the same bug written twice - the artist agrees
 * to one figure and a different one leaves the client's card, with nothing in the system able to
 * say which was right.
 *
 * THE SUBTOTAL COMES FROM THE SAVED APPOINTMENT, not from the request. The price of the work is
 * genuinely the artist's to set - that is not the part being guarded - but it has to be SAVED
 * before it can be charged, so that what was billed and what was recorded are the same number by
 * construction. It also means updateAppointment's own authorization is the only way that figure
 * moves, rather than every charge request being a second, weaker write path into it.
 *
 * What the caller still supplies, because stored state genuinely cannot know it:
 *
 *   - `applyFeeOffset` - the offset is presented as a choice before the card is charged and never
 *     applied silently (M5). The choice is the artist's; whether it is honoured is not.
 *   - `tipCents` - decided at the counter. Also the one caller-supplied figure that cannot move
 *     the shop's cut, since tips sit outside the cuttable base by construction (M2).
 * ---------------------------------------------------------------------------------------------
 */
async function quoteAppointmentCharge(appointment, { applyFeeOffset = false, tipCents = 0 } = {}) {
  if (!appointment) {
    throw new Error('There is no session to charge.');
  }
  if (!appointment.subtotalCents || appointment.subtotalCents <= 0) {
    // Refused rather than charging tax and a tip on a zero subtotal. A session with no price on it
    // is unfinished, not free, and the artist has a step left to do.
    throw new Error('Set and save this session\'s price before charging it.');
  }

  const settings = await resolveSquareSettings(appointment.userId);

  const breakdown = computeChargeBreakdown({
    subtotalCents: appointment.subtotalCents,
    hourlyRateCents: settings.hourlyRateCents,
    feeOffsetPerHourCents: settings.feeOffsetCents,
    taxRateBasisPoints: settings.taxRateBasisPoints,
    applyFeeOffset,
    // Already collected and already recognised as revenue at the consult that took it (M3). It
    // reduces what is COLLECTED here, not what is taxed.
    depositCreditCents: appointment.depositCreditCents || 0,
    // Gift cards are not built yet (M6). Passed explicitly at zero rather than omitted, so that
    // when they land there is one obvious line to change rather than a default to discover.
    giftCardCents: 0,
    tipCents,
  });

  return { settings, breakdown };
}

/**
 * What charging a PENDING DEPOSIT would come to.
 *
 * The amount comes from `depositCents` on the appointment, written by recordDeposit before the
 * card is reached for. Same principle as a session: the figure is stored first and charged from
 * storage, so what was billed and what was recorded cannot be two different numbers.
 *
 * TWO DIFFERENCES FROM A SESSION CHARGE, both derived from DECISIONS.md rather than invented:
 *
 *   - NO TAX. M8 fixes tax to the work, collected at the session, and says the deposit credit
 *     comes off the TOTAL rather than off the taxable base precisely because "tax on the work was
 *     already owed". Taxing the deposit at collection as well would charge the client tax twice on
 *     the same money - once here and again on the untouched taxable base at the sitting.
 *   - THE OFFSET STILL APPLIES. M5 is explicit that it is derived from the total rather than the
 *     booked duration so that it "works identically for hourly and flat-priced sessions and for
 *     deposits", and works the $200 keyed-deposit case through by hand.
 *
 * No deposit credit or gift card either: a deposit is the first money in, so there is nothing yet
 * to credit against it.
 */
async function quoteDepositCharge(appointment, { applyFeeOffset = false } = {}) {
  if (!appointment) {
    throw new Error('There is no deposit to charge.');
  }
  if (appointment.depositStatus !== 'pending') {
    throw new Error(
      appointment.depositStatus === 'available' || appointment.depositStatus === 'applied'
        ? 'This deposit has already been collected.'
        : 'Record the deposit amount before charging it.',
    );
  }
  if (!appointment.depositCents || appointment.depositCents <= 0) {
    throw new Error('Record the deposit amount before charging it.');
  }

  const settings = await resolveSquareSettings(appointment.userId);

  const breakdown = computeChargeBreakdown({
    subtotalCents: appointment.depositCents,
    hourlyRateCents: settings.hourlyRateCents,
    feeOffsetPerHourCents: settings.feeOffsetCents,
    // Zero, not settings.taxRateBasisPoints. See the note above - this is the one place the two
    // quote functions genuinely differ, so it is spelled out rather than parameterised.
    taxRateBasisPoints: 0,
    applyFeeOffset,
    depositCreditCents: 0,
    giftCardCents: 0,
    tipCents: 0,
  });

  return { settings, breakdown };
}

module.exports = { quoteAppointmentCharge, quoteDepositCharge };
