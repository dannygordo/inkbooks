const express = require('express');
const jwt = require('jsonwebtoken');
const Shop = require('../models/Shop');
const tokenCrypto = require('../utils/token-crypto');
const square = require('../utils/square');
const { Constants } = require('../utils/constants');

const router = express.Router();

// Short-lived, signed `state` token binding a Square OAuth authorization attempt to a specific
// shopId - reuses the same SECRET_KEY/jsonwebtoken already used for login sessions (see
// utils/check-auth.js), with its own `purpose` claim so a login token can't be replayed here and
// vice versa. Square returns `state` back to the callback unmodified; without signing it, a
// tampered shopId in that param would let anyone connect their own Square account to someone
// else's shop.
const STATE_PURPOSE = 'square_oauth_state';

function signState(shopId) {
  return jwt.sign({ shopId, purpose: STATE_PURPOSE }, process.env.SECRET_KEY, {
    expiresIn: '15m',
  });
}

function verifyState(state) {
  const decoded = jwt.verify(state, process.env.SECRET_KEY);
  if (decoded.purpose !== STATE_PURPOSE) {
    throw new Error('Invalid state token purpose');
  }
  return decoded.shopId;
}

function shopSettingsRedirectUrl(shopId, status) {
  return `${Constants.URLS.INKBOOKS_WEBAPP}/shop/${shopId}?square=${status}`;
}

// GET, not POST - this is the redirect target Square's hosted authorization page sends the
// seller's browser back to after they approve or deny the connection, not an API call InkBooks
// itself initiates.
router.get('/square/oauth/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  let shopId;
  try {
    shopId = verifyState(state);
  } catch (err) {
    console.warn('[square-oauth] Rejected callback with invalid/expired state:', err.message);
    return res.status(400).send('This connection link has expired or is invalid. Please try connecting again from InkBooks.');
  }

  if (oauthError) {
    // The seller denied the authorization request on Square's page - not a bug, just don't
    // connect anything.
    return res.redirect(shopSettingsRedirectUrl(shopId, 'denied'));
  }

  try {
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).send('Shop not found.');
    }

    const tokenResponse = await square.exchangeCodeForToken(code);

    // Square's OAuth token response doesn't include a location id directly - fetch this seller's
    // locations with the new access token and default to their first one. A shop with multiple
    // Square locations picking a specific one is a real gap (see PRODUCTION_ROADMAP.md) - out of
    // scope for this minimal slice, which assumes one location per connected shop.
    const locationsResponse = await square.squareFetchLocations(tokenResponse.access_token);
    const defaultLocationId =
      locationsResponse.locations && locationsResponse.locations.length > 0
        ? locationsResponse.locations[0].id
        : null;

    shop.squareConnected = true;
    shop.squareMerchantId = tokenResponse.merchant_id;
    shop.squareLocationId = defaultLocationId;
    shop.squareAccessTokenEncrypted = tokenCrypto.encrypt(tokenResponse.access_token);
    shop.squareRefreshTokenEncrypted = tokenCrypto.encrypt(tokenResponse.refresh_token);
    shop.squareTokenExpiresAt = new Date(tokenResponse.expires_at);
    shop.squareConnectedAt = new Date();
    await shop.save();

    return res.redirect(shopSettingsRedirectUrl(shopId, 'connected'));
  } catch (err) {
    console.error('[square-oauth] Failed to complete Square connection:', err.message);
    return res.redirect(shopSettingsRedirectUrl(shopId, 'error'));
  }
});

module.exports = { router, signState };
