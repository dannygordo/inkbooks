const express = require('express');
const checkAuth = require('../utils/check-auth');
const square = require('../utils/square');
const SquareAccount = require('../models/SquareAccount');
const { resolveArtistChargeAccount } = require('../utils/square-account');
const { quoteAppointmentCharge, quoteDepositCharge } = require('../utils/charge-quote');
const { processSquarePaymentInputSchema, validate } = require('../utils/validation');
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

const router = express.Router();

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

    // Persist the breakdown the SERVER computed, not the caller's account of it.
    //
    // Stored as components rather than one figure, because they aren't recoverable from a total:
    // tax and processing fees aren't the artist's income, and the tip is the artist's alone and
    // is specifically excluded from the shop cut. Collapsing them into one number destroys
    // exactly the distinctions the ledger runs on.
    const { breakdown } = quote;
    const previousDepositStatus = appointment.depositStatus;
    const previousAppointmentStatus = appointment.appointmentStatus;

    if (isDeposit) {
      // The money has now arrived, so the pending record becomes a collected one. depositCents is
      // NOT rewritten - it is the figure this charge was computed from, and rewriting it here
      // would make the amount charged and the amount recorded two writes that could disagree,
      // which is the whole thing the pending state exists to prevent.
      appointment.depositStatus = 'available';
      appointment.depositCollectedAt = appointment.depositCollectedAt || new Date();
      appointment.depositPaymentMethod = 'square';
      appointment.depositSquarePaymentId = payment.id;
      // Tax and the offset are real money collected on top of the deposit (M11), so both are
      // recorded - but neither is part of the deposit's face value and neither must become
      // spendable credit. depositCents stays the deposit; taxCents and feeCents carry the rest.
      //
      // This is also what makes the session side add up: the deposit's face value is deducted from
      // the session subtotal BEFORE tax there (M8), so the tax collected here plus the tax
      // collected at the sitting covers the whole job exactly once.
      appointment.taxCents = breakdown.taxCents;
      appointment.feeCents = breakdown.feeOffsetCents;
      appointment.totalCents = breakdown.amountDueCents;
      // The cut was already applied at recordDeposit, against depositCents, and depositCents has
      // not moved. Reapplying here would recompute it against the same figure for no reason - and
      // subtotalCents is deliberately left alone for the same reason.
    } else {
      appointment.subtotalCents = breakdown.subtotalCents;
      appointment.taxCents = breakdown.taxCents;
      appointment.feeCents = breakdown.feeOffsetCents;
      appointment.tipCents = breakdown.tipCents;
      appointment.totalCents = breakdown.totalCents;
      appointment.squarePaymentId = payment.id;
      // A session paid by card, successfully, is done - there's no cash to hand over and no
      // separate "mark it closed" step left for the artist to remember. Same transition
      // mutations/appointments.js's updateAppointment makes when "Close Session" is clicked by
      // hand; this is the other caller that can produce it, and it never comes through that
      // mutation at all, so it has to be set here too.
      //
      // appointmentDate is stamped to THIS MOMENT for the same reason that resolver does it -
      // reports run off when the work was actually settled, not off whatever slot it was booked
      // into. A client charged today for a session booked (or rescheduled) some other day should
      // show up today.
      appointment.appointmentStatus = 'completed';
      appointment.appointmentDate = new Date();
      // Recomputed from the subtotal just written, so the cut reflects the money actually
      // collected. Tips excluded by construction - see utils/shop-cut.js. The subtotal is now a
      // figure the caller cannot influence, which is what makes the cut trustworthy.
      await applyShopCut(appointment);
    }
    await appointment.save();

    // Auto-Responses: a card charge auto-completing a session is the other way a
    // SESSION_COMPLETED transition happens (see mutations/appointments.js's own copy of this same
    // guard, for the "Close Session" button) - this path never goes through that mutation at all,
    // so it needs its own call. Best-effort: never undoes the payment/save that already happened.
    if (
      !isDeposit &&
      previousAppointmentStatus !== 'completed' &&
      appointment.appointmentType === 'session'
    ) {
      await sendAutoResponsesForTrigger({ trigger: 'SESSION_COMPLETED', appointment });
    }

    // PAYMENT_RECEIVED fires for BOTH branches - a receipt is owed for a deposit exactly as much
    // as for a session charge, and unlike SESSION_COMPLETED above it isn't reachable any other way
    // (there is no manual/cash equivalent call site for it yet). Safe to call unconditionally
    // here: the idempotency checks earlier in this route (depositSquarePaymentId/squarePaymentId)
    // already guarantee this success path runs at most once per appointment per charge type.
    await sendAutoResponsesForTrigger({ trigger: 'PAYMENT_RECEIVED', appointment });

    await recordEvent({
      entityType: 'Appointment',
      entityId: appointment._id,
      action: 'update',
      actorUserId: user.id,
      shopId: appointment.shopId,
      summary: isDeposit
        ? `Charged ${formatCents(breakdown.amountDueCents)} deposit via Square`
        : `Charged ${formatCents(breakdown.amountDueCents)} via Square, session closed`,
      changes: isDeposit
        ? [{ field: 'depositStatus', from: previousDepositStatus, to: appointment.depositStatus }]
        : [{ field: 'appointmentStatus', from: previousAppointmentStatus, to: appointment.appointmentStatus }],
    });

    // The person who took the payment is the actor. There IS one here - this route is
    // authenticated (checkAuth above), so unlike a Square webhook it never has to guess.
    //
    // If this ever moves to a webhook, the actor is the artist whose session was paid, NOT null.
    // notify() throws on a missing actorId precisely so that decision gets made rather than
    // defaulted into notifying everybody including the person who caused it.
    //
    // The deposit notification lives here rather than in recordDeposit, because this is the moment
    // the money actually arrives - recordDeposit only agreed an amount.
    await notifySafely({
      actorId: user.id,
      recipientIds: await moneyAudienceForArtist(appointment.userId),
      type: isDeposit ? 'deposit_collected' : 'session_charged',
      category: 'money',
      subjectType: 'appointment',
      subjectId: appointment._id,
      amountCents: breakdown.amountDueCents,
      title: isDeposit
        ? `${formatCents(appointment.depositCents)} deposit collected${appointment.title ? ` — ${appointment.title}` : ''}`
        : `${formatCents(breakdown.amountDueCents)} charged${appointment.title ? ` — ${appointment.title}` : ''}`,
      body: `Taken by ${await actorName(user.id)} by card.`,
    });

    return res.status(200).json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
      appointmentId: String(appointment.id),
      breakdown,
    });
  } catch (err) {
    reportError(err, { context: '[square-payment] Failed to process payment' });
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
