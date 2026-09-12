const express = require('express');
const checkAuth = require('../utils/check-auth');
const square = require('../utils/square');
const SquareAccount = require('../models/SquareAccount');
const GiftCard = require('../models/GiftCard');
const { resolveArtistChargeAccount } = require('../utils/square-account');
const { quoteAppointmentCharge, quoteDepositCharge } = require('../utils/charge-quote');
const { processSquarePaymentInputSchema, processReaderPaymentInputSchema, processGiftCardPaymentInputSchema, validate } = require('../utils/validation');
const { checkRateLimit, getClientIp } = require('../utils/rate-limit');
const Appointment = require('../models/Appointment');
const { applyShopCut } = require('../utils/shop-cut');
const { notifySafely } = require('../utils/notifications');
const { moneyAudienceForArtist } = require('../utils/notification-audience');
const { actorName } = require('../utils/notification-copy');
const { formatCents } = require('../utils/money');
const { Constants } = require('../utils/constants');
const { recordEvent } = require('../utils/event-log');
const { sendAutoResponsesForTrigger } = require('../utils/auto-responses');
const { reportError } = require('../utils/error-reporting');
const { getShopIdsForUser } = require('../utils/shop-membership');

const router = express.Router();

/**
 * Everything that happens to an Appointment once a card charge for it is confirmed collected -
 * shared between the nonce-based route (charges, then applies this) and the reader route
 * (verifies with Square, then applies this). Mechanically unchanged from what
 * /square/process-payment always did inline; moved here so the two routes cannot drift into
 * recording a collected charge two different ways.
 */
async function applyCollectedAppointmentCharge({
  appointment,
  isDeposit,
  breakdown,
  paymentId,
  paymentStatus,
  actorUserId,
}) {
  const previousDepositStatus = appointment.depositStatus;
  const previousAppointmentStatus = appointment.appointmentStatus;

  if (isDeposit) {
    appointment.depositStatus = 'available';
    appointment.depositCollectedAt = appointment.depositCollectedAt || new Date();
    appointment.depositPaymentMethod = 'square';
    appointment.depositSquarePaymentId = paymentId;
    appointment.taxCents = breakdown.taxCents;
    appointment.feeCents = breakdown.feeOffsetCents;
    appointment.totalCents = breakdown.amountDueCents;
  } else {
    appointment.subtotalCents = breakdown.subtotalCents;
    appointment.taxCents = breakdown.taxCents;
    appointment.feeCents = breakdown.feeOffsetCents;
    appointment.tipCents = breakdown.tipCents;
    appointment.totalCents = breakdown.totalCents;
    appointment.squarePaymentId = paymentId;
    appointment.appointmentStatus = 'completed';
    appointment.appointmentDate = new Date();
    await applyShopCut(appointment);
  }
  await appointment.save();

  if (
    !isDeposit &&
    previousAppointmentStatus !== 'completed' &&
    appointment.appointmentType === 'session'
  ) {
    await sendAutoResponsesForTrigger({ trigger: 'SESSION_COMPLETED', appointment });
  }

  await sendAutoResponsesForTrigger({ trigger: 'PAYMENT_RECEIVED', appointment });

  await recordEvent({
    entityType: 'Appointment',
    entityId: appointment._id,
    action: 'update',
    actorUserId,
    shopId: appointment.shopId,
    summary: isDeposit
      ? `Charged ${formatCents(breakdown.amountDueCents)} deposit via Square`
      : `Charged ${formatCents(breakdown.amountDueCents)} via Square, session closed`,
    changes: isDeposit
      ? [{ field: 'depositStatus', from: previousDepositStatus, to: appointment.depositStatus }]
      : [{ field: 'appointmentStatus', from: previousAppointmentStatus, to: appointment.appointmentStatus }],
  });

  await notifySafely({
    actorId: actorUserId,
    recipientIds: await moneyAudienceForArtist(appointment.userId),
    type: isDeposit ? 'deposit_collected' : 'session_charged',
    category: 'money',
    subjectType: 'appointment',
    subjectId: appointment._id,
    amountCents: breakdown.amountDueCents,
    title: isDeposit
      ? `${formatCents(appointment.depositCents)} deposit collected${appointment.title ? ` — ${appointment.title}` : ''}`
      : `${formatCents(breakdown.amountDueCents)} charged${appointment.title ? ` — ${appointment.title}` : ''}`,
    body: `Taken by ${await actorName(actorUserId)} by card.`,
  });

  return {
    success: true,
    paymentId,
    status: paymentStatus,
    appointmentId: String(appointment.id),
    breakdown,
  };
}


// This is the route client/src/components/IBSquarePayments/squareConfig.js's PROCESS_URL points
// at. Takes the source id (nonce/token) the client's Web Payments SDK produced and charges it via
// Square's Payments API, into the OWNER'S connected account (DECISIONS.md M9).
//
// Authenticated (any logged-in user, same floor as createProject) rather than open to the public -
// this is meant to be triggered from inside the app (e.g. a client/artist paying a project
// deposit), not a public checkout page. Rate-limited per caller as a defense-in-depth measure on
// top of that, the same pattern already used for the public booking-request endpoints.
//
// ---------------------------------------------------------------------------------------------
// THE SERVER DECIDES WHAT THE CHARGE IS. Two things changed here and they are load-bearing on each
// other:
//
//   - The amount and its breakdown are DERIVED from stored rates (resolveSquareSettings +
//     computeChargeBreakdown), not read from the request. They used to be request fields, written
//     straight onto the Appointment, with the shop's cut then computed from the subtotal the
//     caller had just supplied. That let a caller lower their own cut and made the recorded
//     figures the caller's account of the transaction rather than the transaction.
//   - The money settles to the connected seller rather than to one platform sandbox account.
//
// Neither is sufficient alone: computing the right number and charging it into InkBooks' account
// is still wrong, and charging into the seller's account an amount the caller chose is still
// wrong.
// ---------------------------------------------------------------------------------------------
/**
 * The credentials the browser needs to tokenize a card, served from the SAME env vars the charge
 * below uses.
 *
 * This exists because those two things drifted. The application id was a hardcoded literal in
 * client/src/config.js and the access token came from .env - two different Square applications, as
 * it turned out. The browser minted a nonce with app A, the server charged it with app B's token,
 * and Square refused with "Card nonce not found in this application environment", which is a
 * precise description of the problem and reads like nonsense until you know to compare two values
 * that live in different repos-worth of file.
 *
 * A nonce is only chargeable by the application that minted it, so these are not two settings that
 * happen to be related - they are one setting, and the only safe number of places to write it down
 * is one. Serving it means the browser cannot be configured wrongly; there is nothing to configure.
 *
 * Public and unauthenticated: Square documents the application and location ids as public
 * identifiers that necessarily ship to the browser. The access token, which is the actual secret,
 * never leaves this process.
 */
router.get('/square/config', (req, res) => {
  const applicationId =
    process.env.SQUARE_SANDBOX_APPLICATION_ID || process.env.SQUARE_APPLICATION_ID;
  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID;
  if (!applicationId || !locationId) {
    return res.status(500).json({
      error:
        'Square is not configured on the server. Set SQUARE_SANDBOX_APPLICATION_ID and ' +
        'SQUARE_SANDBOX_LOCATION_ID in .env.development - both from the SAME app in your Square ' +
        'Developer Dashboard as SQUARE_SANDBOX_ACCESS_TOKEN.',
    });
  }
  return res.status(200).json({ applicationId, locationId });
});

router.post('/square/process-payment', express.json(), async (req, res) => {
  let user;
  try {
    user = checkAuth({ req });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(
    `${getClientIp(req)}:processSquarePayment`,
    { windowMs: 60 * 1000, max: 10 },
  );
  if (!allowed) {
    return res
      .status(429)
      .json({ error: `Too many payment attempts. Try again in ${retryAfterSeconds}s.` });
  }

  const { valid, errors } = validate(processSquarePaymentInputSchema, req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid request', errors });
  }

  // Loaded and authorized BEFORE the charge, not after. If this request names an appointment the
  // caller doesn't own, that has to fail without money moving - discovering it afterwards leaves
  // a real charge on a client's card with no record of what it was for.
  const appointment = await Appointment.findById(req.body.appointmentId);
  if (!appointment) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(appointment.userId)) {
    return res.status(403).json({ error: 'Action not allowed' });
  }

  // A deposit and a session charge are different transactions against the same appointment - a
  // consult can take a deposit and, later, be charged for work. Which one this is comes from the
  // caller because only the caller knows which button was pressed; WHAT either costs does not.
  const isDeposit = req.body.chargeType === 'deposit';

  // Already charged. Without these, re-posting a settled appointment takes the money again under a
  // fresh idempotency key - Square would have no way to know, since as far as it is concerned this
  // is a different payment. Idempotency keys cover a retry of the same request, not a second
  // deliberate one.
  if (isDeposit && appointment.depositSquarePaymentId) {
    return res.status(409).json({ error: 'This deposit has already been paid.' });
  }
  if (!isDeposit && appointment.squarePaymentId) {
    return res.status(409).json({ error: 'This session has already been paid.' });
  }

  let quote;
  try {
    quote = isDeposit
      ? await quoteDepositCharge(appointment, {
          applyFeeOffset: Boolean(req.body.applyFeeOffset),
        })
      : await quoteAppointmentCharge(appointment, {
          applyFeeOffset: Boolean(req.body.applyFeeOffset),
          tipCents: req.body.tipCents ?? 0,
        });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (quote.breakdown.amountDueCents <= 0) {
    // A session fully covered by a deposit or gift card owes nothing. Charging zero is an error at
    // Square's end anyway, and silently charging something else would be worse.
    return res.status(400).json({
      error: isDeposit
        ? 'This deposit has no amount to collect.'
        : 'There is nothing left to collect on this session.',
    });
  }

  // THE ARTIST'S OWN ACCOUNT, always - never the shop's, even for a shop artist (M9). The client
  // is paying the artist for the work; what the artist owes the shop is settled separately,
  // afterwards, through the shop-cut ledger.
  const account = await resolveArtistChargeAccount(appointment.userId);
  if (!SquareAccount.isUsable(account)) {
    return res.status(400).json({
      error: 'Connect Square in Settings before taking a card payment.',
    });
  }

  try {
    const payment = await square.createPaymentForAccount({
      account,
      sourceId: req.body.sourceId,
      amountCents: quote.breakdown.amountDueCents,
      // The CALLER'S key, resent unchanged on retry, so a double-clicked Pay button is one
      // payment. Generating one here made every retry a distinct charge, which is the precise
      // failure idempotency keys exist to prevent.
      idempotencyKey: req.body.idempotencyKey,
      note: req.body.note || `InkBooks payment - user ${user.id}`,
    });

    const result = await applyCollectedAppointmentCharge({
      appointment,
      isDeposit,
      breakdown: quote.breakdown,
      paymentId: payment.id,
      paymentStatus: payment.status,
      actorUserId: user.id,
    });

    return res.status(200).json(result);
  } catch (err) {
    reportError(err, { context: '[square-payment] Failed to process payment' });
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// The Mobile Payments SDK's card-reader route. The mobile app's own reader integration
// (apps/mobile/src/services/squareReader.ts) authorizes the SDK on-device with this artist's own
// Square access token (getMySquareMobileCredentials, resolvers/shops.js) and pairs a physical
// Square reader over Bluetooth - both happen entirely on the phone, never through this server.
// By the time this route is called, startPayment() has already finished: the card was tapped,
// inserted or swiped, and Square has already completed a real charge. See
// utils/square.js's getPaymentForAccount for why that flips the safety model from "decide the
// amount, then charge it" to "decide what SHOULD have been charged, then verify Square's own
// record of what was".
router.post('/square/process-reader-payment', express.json(), async (req, res) => {
  let user;
  try {
    user = checkAuth({ req });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(
    `${getClientIp(req)}:processReaderPayment`,
    { windowMs: 60 * 1000, max: 10 },
  );
  if (!allowed) {
    return res
      .status(429)
      .json({ error: `Too many payment attempts. Try again in ${retryAfterSeconds}s.` });
  }

  const { valid, errors } = validate(processReaderPaymentInputSchema, req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid request', errors });
  }

  const appointment = await Appointment.findById(req.body.appointmentId);
  if (!appointment) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(appointment.userId)) {
    return res.status(403).json({ error: 'Action not allowed' });
  }

  const isDeposit = req.body.chargeType === 'deposit';

  if (isDeposit && appointment.depositSquarePaymentId) {
    return res.status(409).json({ error: 'This deposit has already been paid.' });
  }
  if (!isDeposit && appointment.squarePaymentId) {
    return res.status(409).json({ error: 'This session has already been paid.' });
  }

  // REPLAY GUARD, specific to this route. The nonce-based route above can't be handed a payment id
  // that already belongs to a different appointment or gift card - Square mints a fresh id from a
  // fresh sourceId every time. This route is handed a payment id BY THE CLIENT, and a client that
  // is buggy or malicious could send the same completed payment id against a second appointment,
  // asking this route to record one real Square payment as if it paid for two separate things.
  const alreadyRecordedElsewhere = await Appointment.findOne({
    _id: { $ne: appointment._id },
    $or: [
      { depositSquarePaymentId: req.body.paymentId },
      { squarePaymentId: req.body.paymentId },
    ],
  });
  if (alreadyRecordedElsewhere) {
    return res.status(409).json({ error: 'This payment has already been recorded elsewhere.' });
  }

  let quote;
  try {
    quote = isDeposit
      ? await quoteDepositCharge(appointment, {
          applyFeeOffset: Boolean(req.body.applyFeeOffset),
        })
      : await quoteAppointmentCharge(appointment, {
          applyFeeOffset: Boolean(req.body.applyFeeOffset),
          tipCents: req.body.tipCents ?? 0,
        });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (quote.breakdown.amountDueCents <= 0) {
    return res.status(400).json({
      error: isDeposit
        ? 'This deposit has no amount to collect.'
        : 'There is nothing left to collect on this session.',
    });
  }

  const account = await resolveArtistChargeAccount(appointment.userId);
  if (!SquareAccount.isUsable(account)) {
    return res.status(400).json({
      error: 'Connect Square in Settings before taking a card payment.',
    });
  }

  try {
    const payment = await square.getPaymentForAccount({
      account,
      paymentId: req.body.paymentId,
    });

    if (!payment) {
      return res.status(404).json({ error: 'Square has no record of that payment.' });
    }
    // COMPLETED is Square's terminal success state for a card-present payment - APPROVED alone
    // means authorized but not yet captured, which is not money InkBooks can treat as collected.
    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({
        error: `This payment has not completed on Square's side yet (status: ${payment.status}).`,
      });
    }
    if (payment.location_id !== account.locationId) {
      // A real payment id, but not one made against THIS seller's own connected location - either
      // a stale credential on the device or a client sending a payment id it has no business
      // naming. Refused rather than recorded: this is exactly the class of mismatch
      // getPaymentForAccount exists to catch.
      return res.status(400).json({ error: 'This payment does not belong to your account.' });
    }

    const chargedAmountCents = payment.amount_money && payment.amount_money.amount;
    if (chargedAmountCents !== quote.breakdown.amountDueCents) {
      // FAIL CLOSED ON A MISMATCH, DELIBERATELY. The money has already moved - Square says so -
      // but what Square says was charged and what this appointment currently owes disagree, most
      // likely because something about the appointment changed in the gap between the reader
      // quoting a total and this request arriving (a price edit, a second charge attempt, a
      // clock/rate change). Auto-applying the payment to the ledger anyway would let a stale
      // amount silently become the recorded truth. Refusing to auto-apply does not lose the
      // payment - it is real, on Square's own dashboard, and reportError below puts it in front
      // of a person - it just stops this route from writing a number to the appointment that
      // doesn't match what was actually quoted.
      reportError(new Error('Reader payment amount does not match the current quote'), {
        context: '[square-reader-payment] amount mismatch - needs manual reconciliation',
        paymentId: payment.id,
        appointmentId: String(appointment.id),
        chargedAmountCents,
        expectedAmountCents: quote.breakdown.amountDueCents,
      });
      return res.status(409).json({
        error:
          "The reader charged a card, but the amount doesn't match what's currently owed on " +
          'this appointment. Nothing has been recorded here - the charge is on your Square ' +
          'dashboard, and this needs a manual look before it can be applied.',
        paymentId: payment.id,
      });
    }

    const result = await applyCollectedAppointmentCharge({
      appointment,
      isDeposit,
      breakdown: quote.breakdown,
      paymentId: payment.id,
      paymentStatus: payment.status,
      actorUserId: user.id,
    });

    return res.status(200).json(result);
  } catch (err) {
    reportError(err, { context: '[square-reader-payment] Failed to record reader payment' });
    return res.status(err.status || 500).json({ error: err.message });
  }
});


// This is the route a gift-card sale form's IBGiftCardPaymentForm points at (see
// apps/web/src/components/IBSquarePayments/IBGiftCardPaymentForm.jsx). Mirrors
// /square/process-payment above closely, but a gift card sale is simpler in one load-bearing way:
// there is no equivalent of tax/tip/a fee-offset choice re-made at charge time. The offset choice
// (M5/M6) was already made and priced into feeOffsetCents when createArtistGiftCard/
// createShopGiftCard recorded the pending card - what gets charged here is exactly
// faceValueCents + feeOffsetCents, read verbatim off that stored, already-validated document,
// the same "the pending record is what gives the charge a stored figure to read, not one the
// browser sends alongside the card" principle recordDeposit/quoteDepositCharge established.
router.post('/square/process-gift-card-payment', express.json(), async (req, res) => {
  let user;
  try {
    user = checkAuth({ req });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const { allowed, retryAfterSeconds } = checkRateLimit(
    `${getClientIp(req)}:processGiftCardPayment`,
    { windowMs: 60 * 1000, max: 10 },
  );
  if (!allowed) {
    return res
      .status(429)
      .json({ error: `Too many payment attempts. Try again in ${retryAfterSeconds}s.` });
  }

  const { valid, errors, data } = validate(processGiftCardPaymentInputSchema, req.body);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid request', errors });
  }

  // Loaded and authorized BEFORE the charge - same reasoning as the appointment route above: a
  // request naming a card the caller doesn't own has to fail without money moving.
  const giftCard = await GiftCard.findById(data.giftCardId);
  if (!giftCard) {
    return res.status(404).json({ error: 'Gift card not found' });
  }
  if (giftCard.issuerType === 'ARTIST') {
    // Same "no argument for who this acts for" shape as createArtistGiftCard itself - only the
    // artist who started this sale can finish charging it.
    if (String(user.id) !== String(giftCard.issuerArtistId)) {
      return res.status(403).json({ error: 'Action not allowed' });
    }
  } else {
    // Same floor createShopGiftCard itself uses (SHOP_ADMIN-or-better, genuinely shop-level, no
    // "session owner" bypass) plus real membership in the shop this card belongs to.
    const shopIds = await getShopIdsForUser(user.id);
    if (
      user.role > Constants.ROLES.SHOP_ADMIN ||
      !shopIds.map(String).includes(String(giftCard.shopId))
    ) {
      return res.status(403).json({ error: 'Action not allowed' });
    }
  }

  // Idempotency guard, same shape as the deposit/session checks above - re-posting an
  // already-completed sale takes the money a second time under a fresh key, since as far as
  // Square is concerned this is a different payment.
  if (giftCard.saleStatus !== 'pending') {
    return res.status(409).json({ error: 'This gift card has already been paid for.' });
  }

  const amountDueCents = giftCard.faceValueCents + giftCard.feeOffsetCents;

  // THE SELLER'S OWN ACCOUNT, always - an artist-issued card into the issuing artist's account,
  // a shop-issued card into whichever admin actually rang it up (soldByUserId) - never the shop's
  // own account, since only an artist's own connected account can take a client's card (M6/M9).
  // The shop's cut on a shop-issued card is settled afterwards through the shop-cut ledger, same
  // as everywhere else in this app.
  const chargeAccountUserId =
    giftCard.issuerType === 'ARTIST' ? giftCard.issuerArtistId : giftCard.soldByUserId;
  const account = await resolveArtistChargeAccount(chargeAccountUserId);
  if (!SquareAccount.isUsable(account)) {
    return res.status(400).json({
      error: 'Connect Square in Settings before taking a card payment.',
    });
  }

  try {
    const payment = await square.createPaymentForAccount({
      account,
      sourceId: req.body.sourceId,
      amountCents: amountDueCents,
      idempotencyKey: req.body.idempotencyKey,
      note: req.body.note || `InkBooks gift card ${giftCard.code}`,
    });

    const previousSaleStatus = giftCard.saleStatus;
    giftCard.saleStatus = 'complete';
    giftCard.squarePaymentId = payment.id;
    await giftCard.save();

    await recordEvent({
      entityType: 'GiftCard',
      entityId: giftCard._id,
      action: 'update',
      actorUserId: user.id,
      shopId: giftCard.shopId,
      summary: `Charged ${formatCents(amountDueCents)} via Square for a gift card sale`,
      changes: [{ field: 'saleStatus', from: previousSaleStatus, to: giftCard.saleStatus }],
    });

    // No notification here - see resolvers/giftCards.js's own header comment on why gift card
    // events are deliberately not wired into notifications yet (a NOTIFICATIONS_DESIGN.md
    // decision this feature shipped without, same restraint that applies to sale/redemption
    // there).

    return res.status(200).json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
      giftCardId: String(giftCard.id),
    });
  } catch (err) {
    reportError(err, { context: '[square-gift-card-payment] Failed to process payment' });
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
