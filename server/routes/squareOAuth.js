const express = require('express');
const jwt = require('jsonwebtoken');
const Shop = require('../models/Shop');
const Artist = require('../models/Artist');
const tokenCrypto = require('../utils/token-crypto');
const square = require('../utils/square');
const { getOrCreateAccountForOwner } = require('../utils/square-account');
const { Constants } = require('../utils/constants');
const logger = require('../utils/logger');
const { reportError } = require('../utils/error-reporting');

const router = express.Router();

// Short-lived, signed `state` token binding a Square OAuth authorization attempt to a specific
// OWNER - reuses the same SECRET_KEY/jsonwebtoken already used for login sessions (see
// utils/check-auth.js), with its own `purpose` claim so a login token can't be replayed here and
// vice versa. Square returns `state` back to the callback unmodified; without signing it, a
// tampered owner in that param would let anyone connect their own Square account to someone
// else's shop - or to another artist.
//
// It used to carry a bare shopId. It now carries ownerType + ownerId (DECISIONS.md M9), and BOTH
// are inside the signature. Signing only the id and passing the type alongside would let an
// attacker flip a legitimately-signed SHOP state into an ARTIST one and land the connection on a
// different row - the pair is what identifies an owner, so the pair is what has to be sealed.
const STATE_PURPOSE = 'square_oauth_state';

function signState(ownerType, ownerId) {
  if (ownerType !== 'SHOP' && ownerType !== 'ARTIST') {
    throw new Error(`Unknown Square account ownerType: ${ownerType}`);
  }
  return jwt.sign(
    { ownerType, ownerId: String(ownerId), purpose: STATE_PURPOSE },
    process.env.SECRET_KEY,
    { expiresIn: '15m' },
  );
}

function verifyState(state) {
  const decoded = jwt.verify(state, process.env.SECRET_KEY);
  if (decoded.purpose !== STATE_PURPOSE) {
    throw new Error('Invalid state token purpose');
  }
  // Rejects a token minted before the ownerType claim existed rather than assuming 'SHOP' for it.
  // Those tokens live 15 minutes, so at most one deploy's worth of in-flight handshakes fail and
  // are retried - cheaper than a defaulting rule that quietly survives in the code for years.
  if (decoded.ownerType !== 'SHOP' && decoded.ownerType !== 'ARTIST') {
    throw new Error('State token is missing a valid ownerType');
  }
  return { ownerType: decoded.ownerType, ownerId: decoded.ownerId };
}

// Where to send the seller's browser once the handshake finishes. A shop admin belongs back on the
// shop's settings page; an independent artist has no shop page to return to, so they go to their
// own settings instead.
function settingsRedirectUrl(ownerType, ownerId, status) {
  const base = Constants.URLS.INKBOOKS_WEBAPP;
  return ownerType === 'SHOP'
    ? `${base}/shop/${ownerId}?square=${status}`
    : `${base}/settings?square=${status}`;
}

// Confirms the owner named in the state token still exists before writing credentials against it.
// An ARTIST ownerId is the artist's own User._id, matching the convention in
// models/SquareAccount.js - so the lookup is by userId, not by _id.
async function ownerExists(ownerType, ownerId) {
  if (ownerType === 'SHOP') {
    return Boolean(await Shop.exists({ _id: ownerId }));
  }
  return Boolean(await Artist.exists({ userId: ownerId }));
}

// GET, not POST - this is the redirect target Square's hosted authorization page sends the
// seller's browser back to after they approve or deny the connection, not an API call InkBooks
// itself initiates.
router.get('/square/oauth/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  let owner;
  try {
    owner = verifyState(state);
  } catch (err) {
    logger.warn({ err }, '[square-oauth] Rejected callback with invalid/expired state');
    return res.status(400).send('This connection link has expired or is invalid. Please try connecting again from InkBooks.');
  }

  if (oauthError) {
    // The seller denied the authorization request on Square's page - not a bug, just don't
    // connect anything.
    return res.redirect(settingsRedirectUrl(owner.ownerType, owner.ownerId, 'denied'));
  }

  try {
    if (!(await ownerExists(owner.ownerType, owner.ownerId))) {
      return res.status(404).send('Account not found.');
    }

    const tokenResponse = await square.exchangeCodeForToken(code);

    // Square's OAuth token response doesn't include a location id directly - fetch this seller's
    // locations with the new access token and default to their first one. A seller with multiple
    // Square locations picking a specific one is a real gap (see PRODUCTION_ROADMAP.md) - out of
    // scope for this minimal slice, which assumes one location per connected account.
    const locationsResponse = await square.squareFetchLocations(tokenResponse.access_token);
    const defaultLocationId =
      locationsResponse.locations && locationsResponse.locations.length > 0
        ? locationsResponse.locations[0].id
        : null;

    // Upsert, because disconnecting clears this row rather than deleting it - a reconnect finds
    // the old, emptied document waiting and a plain insert would collide on the unique index.
    const account = await getOrCreateAccountForOwner(owner.ownerType, owner.ownerId);
    account.connected = true;
    account.merchantId = tokenResponse.merchant_id;
    account.locationId = defaultLocationId;
    account.accessTokenEncrypted = tokenCrypto.encrypt(tokenResponse.access_token);
    account.refreshTokenEncrypted = tokenCrypto.encrypt(tokenResponse.refresh_token);
    account.tokenExpiresAt = new Date(tokenResponse.expires_at);
    account.connectedAt = new Date();
    await account.save();

    return res.redirect(settingsRedirectUrl(owner.ownerType, owner.ownerId, 'connected'));
  } catch (err) {
    reportError(err, { context: '[square-oauth] Failed to complete Square connection' });
    return res.redirect(settingsRedirectUrl(owner.ownerType, owner.ownerId, 'error'));
  }
});

module.exports = { router, signState };
