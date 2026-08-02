const express = require('express');
const crypto = require('crypto');
const checkAuth = require('../utils/check-auth');
const square = require('../utils/square');
const { processSquarePaymentInputSchema, validate } = require('../utils/validation');
const { checkRateLimit, getClientIp } = require('../utils/rate-limit');

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
    return res.status(200).json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
    });
  } catch (err) {
    console.error('[square-payment] Failed to process payment:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
