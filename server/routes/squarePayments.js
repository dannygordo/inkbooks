const express = require('express');
const crypto = require('crypto');
const checkAuth = require('../utils/check-auth');
const square = require('../utils/square');
const { processSquarePaymentInputSchema, validate } = require('../utils/validation');
const { checkRateLimit, getClientIp } = require('../utils/rate-limit');
const Appointment = require('../models/Appointment');
const { applyShopCut } = require('../utils/shop-cut');
const { Constants } = require('../utils/constants');

const router = express.Router();

// This is the route client/src/components/IBSquarePayments/squareConfig.js's PROCESS_URL points
// at (previously a dead end - nothing in this codebase handled that path at all, see
// PRODUCTION_ROADMAP.md's Phase 4 write-up). Takes the source id (nonce/token) the client's Web
// Payments SDK produced and charges it via Square's Payments API.
//
// Authenticated (any logged-in user, same floor as createProject) rather than open to the public -
// this is meant to be triggered from inside the app (e.g. a client/artist paying a project
// deposit), not a public checkout page. Rate-limited per caller as a defense-in-depth measure on
// top of that, the same pattern already used for the public booking-request endpoints.
//
// Deliberately sandbox-only right now - see utils/square.js's createSandboxPayment, which always
// targets Square's sandbox host/token regardless of any other Square-related env var. Do not wire
// this to a production access token until Phase 4's full checklist (real production access, real
// credentials, a real decision about who the money actually settles to) is done - see
// PRODUCTION_ROADMAP.md.
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
  let appointment = null;
  if (req.body.appointmentId) {
    appointment = await Appointment.findById(req.body.appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (user.role > Constants.ROLES.SHOP_ADMIN && String(user.id) !== String(appointment.userId)) {
      return res.status(403).json({ error: 'Action not allowed' });
    }
  }

  try {
    const payment = await square.createSandboxPayment({
      sourceId: req.body.sourceId,
      amountCents: req.body.amountCents,
      // Ties retries of the same logical charge (e.g. a client double-clicking Pay) to the same
      // idempotency key would require the client to generate and resend one - it doesn't today,
      // so each request is treated as a distinct charge attempt. Worth revisiting if this becomes
      // a real, frequently-used checkout flow rather than a first pass.
      idempotencyKey: crypto.randomUUID(),
      note: req.body.note || `InkBooks payment - user ${user.id}`,
    });
    // Persist the transaction breakdown against the session.
    //
    // Previously this endpoint charged the card and returned - the session Appointment recorded
    // nothing at all about the money, so the amount an artist actually collected existed only in
    // Square's dashboard. That made the shop cut uncomputable from InkBooks' own data and made
    // "how much did I make in tips this year" unanswerable.
    //
    // Stored as components rather than one figure, because they aren't recoverable from a total:
    // tax and processing fees aren't the artist's income, and the tip is the artist's alone and
    // is specifically excluded from the shop cut. Collapsing them into one number destroys
    // exactly the distinctions the ledger runs on.
    if (appointment) {
      const subtotalCents = req.body.subtotalCents ?? 0;
      const taxCents = req.body.taxCents ?? 0;
      const feeCents = req.body.feeCents ?? 0;
      const tipCents = req.body.tipCents ?? 0;
      appointment.subtotalCents = subtotalCents;
      appointment.taxCents = taxCents;
      appointment.feeCents = feeCents;
      appointment.tipCents = tipCents;
      // The authoritative figure is what Square actually charged, not the sum of the components
      // the client sent - those are the caller's account of the split, this is the transaction.
      // If they disagree, the charge is the fact.
      appointment.totalCents = req.body.amountCents;
      // Recomputed from the subtotal that was just written, so the cut always reflects the money
      // actually collected rather than whatever estimate existed beforehand. Tips excluded by
      // construction - see utils/shop-cut.js.
      await applyShopCut(appointment);
      await appointment.save();
    }

    return res.status(200).json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
      appointmentId: appointment ? String(appointment.id) : null,
    });
  } catch (err) {
    console.error('[square-payment] Failed to process payment:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
