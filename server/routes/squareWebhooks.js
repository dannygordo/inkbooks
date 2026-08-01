const express = require('express');
const Appointment = require('../models/Appointment');
const square = require('../utils/square');

const router = express.Router();

// Square's `x-square-hmacsha256-signature` verification needs the *raw*, unparsed request body -
// see utils/square.js's verifyWebhookSignature. This router must be mounted in index.js BEFORE
// the global express.json() middleware, using express.raw() here instead, or the signature check
// will always fail (the body would already be parsed/reserialized differently by then). Same
// ordering concern already noted for routes/bookingUploads.js.
router.post(
  '/webhooks/square',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body.toString('utf8');
    const signatureHeader = req.headers['x-square-hmacsha256-signature'];
    // Must exactly match the notification URL configured for this webhook subscription in the
    // Square Developer Console - the signature is computed over url + body, so any mismatch
    // (trailing slash, http vs https, wrong host) makes every signature check fail even though
    // the request genuinely came from Square.
    const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;

    let isValid = false;
    try {
      isValid = square.verifyWebhookSignature({ notificationUrl, rawBody, signatureHeader });
    } catch (err) {
      console.error('[square-webhook] Signature verification error:', err.message);
      return res.status(500).send();
    }
    if (!isValid) {
      console.warn('[square-webhook] Rejected event with invalid signature.');
      return res.status(403).send();
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      return res.status(400).send();
    }

    // Only invoice.payment_made actually completes the shop-cut ledger flow - other invoice/
    // payment events (created, updated mid-flight, refunded) aren't handled by this minimal slice
    // yet (see PRODUCTION_ROADMAP.md). Acknowledge everything else with 200 so Square doesn't
    // retry events this endpoint deliberately ignores.
    if (event.type === 'invoice.payment_made') {
      try {
        const invoice = event.data && event.data.object && event.data.object.invoice;
        if (invoice && invoice.status === 'PAID') {
          const appointment = await Appointment.findOne({
            shopCutSquareInvoiceId: invoice.id,
          });
          if (appointment && appointment.shopCutStatus !== 'paid') {
            appointment.shopCutStatus = 'paid';
            await appointment.save();
          }
        }
      } catch (err) {
        // Don't 500 here - Square will retry on non-2xx, and a transient DB error shouldn't
        // spiral into repeated retries indefinitely. Logged for manual follow-up instead.
        console.error('[square-webhook] Failed to process invoice.payment_made:', err.message);
      }
    }

    return res.status(200).send();
  },
);

module.exports = router;
