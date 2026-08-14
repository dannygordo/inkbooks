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
 *   - `subtotalCentsOverride` - PREVIEW ONLY, never used to charge. SessionDetail.jsx quotes as
 *     the artist types, before the price is saved, so the on-screen tax/fee/total update live
 *     instead of only after a save. routes/squarePayments.js never passes this - the actual charge
 *     still reads subtotalCents from the saved appointment exactly as before, which is what keeps
 *     "what was billed" and "what was recorded" the same number. A caller that passed this to
 *     charge real money would defeat the entire point of the SAVE-FIRST rule above.
 * ---------------------------------------------------------------------------------------------
 */
async function quoteAppointmentCharge(
  appointment,
  { applyFeeOffset = false, tipCents = 0, subtotalCentsOverride } = {},
) {
  if (!appointment) {
    throw new Error('There is no session to charge.');
  }
  const subtotalCents =
    subtotalCentsOverride !== undefined && subtotalCentsOverride !== null
      ? subtotalCentsOverride
      : appointment.subtotalCents;
  if (!subtotalCents || subtotalCents <= 0) {
    // Refused rather than charging tax and a tip on a zero subtotal. A session with no price on it
    // is unfinished, not free, and the artist has a step left to do.
    throw new Error('Set and save this session\'s price before charging it.');
  }

  const settings = await resolveSquareSettings(appointment.userId);

  const breakdown = computeChargeBreakdown({
    subtotalCents,
    hourlyRateCents: settings.hourlyRateCents,
    feeOffsetPerHourCents: settings.feeOffsetCents,
    taxRateBasisPoints: settings.taxRateBasisPoints,
    applyFeeOffset,
    // Already collected and already recognised as revenue at the consult that took it (M3). It
    // reduces what is COLLECTED here, not what is taxed.
    depositCreditCents: appointment.depositCreditCents || 0,
    // Real lookup, replacing the hardcoded 0 this line used to carry (see the comment that used to
    // sit here, and DECISIONS.md M6). redeemGiftCard (mutations/giftCards.js via
    // resolvers/giftCards.js) is the only writer of giftCardCreditCents - it validates the card,
    // enforces the issuer lock, decrements the card's balance and records the redemption ledger
    // row BEFORE this field is ever read, so by the time a charge is quoted the credit is real
    // money already spoken for, not a caller's assertion. Whole-session gift card money, both
    // issuer types - see models/Appointment.js's own comment on why this is a different field from
    // artistIssuedGiftCardCreditCents, which applyShopCut reads instead.
    giftCardCents: appointment.giftCardCreditCents || 0,
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
 * A DEPOSIT IS ITS OWN TRANSACTION, AND IT IS TAXED (DECISIONS.md M11). It is not a down payment
 * held against a future bill - it is money taken for work, at the moment it is taken, with the
 * shop's cut recognised then too (M3). Taxing it here is what makes the session side correct: the
 * deposit is deducted from the session subtotal BEFORE tax at the sitting (M8), so the two
 * transactions between them tax the whole job exactly once.
 *
 * The offset applies, per M5's "identically for hourly and flat-priced sessions and for deposits",
 * and joins the taxable base here the same way it does on a session.
 *
 * No deposit credit or gift card: a deposit is the first money in, so there is nothing yet to
 * credit against it.
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
    taxRateBasisPoints: settings.taxRateBasisPoints,
    applyFeeOffset,
    depositCreditCents: 0,
    giftCardCents: 0,
    tipCents: 0,
  });

  return { settings, breakdown };
}

module.exports = { quoteAppointmentCharge, quoteDepositCharge };
