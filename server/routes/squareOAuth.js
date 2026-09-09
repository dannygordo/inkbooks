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

// `platform` decides where the callback lands the seller's browser once the handshake finishes -
// the web app (default) or a small "return to the app" page that opens mobile's own inkbooks://
// scheme (see respondToOAuthResult below). Defaulted to 'web' via the parameter default, which
// only applies when the caller passes `undefined` - exactly what an omitted optional GraphQL arg
// resolves to (see resolvers/shops.js's own getSquareAuthorizationUrl/getMySquareAuthorizationUrl).
function signState(ownerType, ownerId, platform = 'web') {
  if (ownerType !== 'SHOP' && ownerType !== 'ARTIST') {
    throw new Error(`Unknown Square account ownerType: ${ownerType}`);
  }
  if (platform !== 'web' && platform !== 'mobile') {
    throw new Error(`Unknown Square OAuth platform: ${platform}`);
  }
  return jwt.sign(
    { ownerType, ownerId: String(ownerId), platform, purpose: STATE_PURPOSE },
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
  // Unlike ownerType above, a missing/unrecognized platform claim defaults to 'web' rather than
  // rejecting the token outright - a token minted moments before this claim existed (mid-deploy)
  // should still land the seller on the web app, its only possible origin before this change,
  // rather than fail a handshake that was never mobile's to begin with.
  const platform = decoded.platform === 'mobile' ? 'mobile' : 'web';
  return { ownerType: decoded.ownerType, ownerId: decoded.ownerId, platform };
}

// Where to send the seller's browser once the handshake finishes. A shop admin belongs back on the
// shop's settings page; an independent artist has no shop page to return to, so they go to their
// own settings instead.
function webRedirectUrl(ownerType, ownerId, status) {
  const base = Constants.URLS.INKBOOKS_WEBAPP;
  return ownerType === 'SHOP'
    ? `${base}/shop/${ownerId}?square=${status}`
    : `${base}/settings?square=${status}`;
}

// The mobile equivalent of webRedirectUrl above, one scheme instead of one base URL - apps/mobile/
// app.json's own `scheme: "inkbooks"` (present since this app was scaffolded, never consumed by
// anything server-side until now). shop/[id].tsx is mobile's only screen today that reads a
// `square` param back (see that file's own header comment) - the `settings` target exists for
// parity with webRedirectUrl and for the artist-owned Square Config panel this port doesn't have
// yet (DECISIONS.md X31's own follow-up list), and is harmless to link to before that panel exists
// since expo-router simply has nothing there to read the param.
function mobileDeepLinkUrl(ownerType, ownerId, status) {
  return ownerType === 'SHOP'
    ? `inkbooks://shop/${ownerId}?square=${status}`
    : `inkbooks://settings?square=${status}`;
}

// A custom URL scheme (unlike a Universal Link/App Link) is not something a browser opens on its
// own - it has to be told to, via user interaction or script. A raw HTTP redirect (res.redirect)
// to inkbooks://... works in most mobile browsers (they prompt "Open in InkBooks?"), but fails
// ugly on desktop or if the app isn't installed ("Safari cannot open the page"). This tiny page
// instead attempts the deep link via a script, same as it would from a redirect, but ALSO shows a
// real button and a plain-text status message that render correctly regardless of whether the
// auto-redirect fires - the graceful-degradation version of the same idea.
function mobileReturnPageHtml(deepLinkUrl, status) {
  const message =
    status === 'connected'
      ? 'Square connected.'
      : status === 'denied'
        ? 'Square connection cancelled - nothing changed.'
        : 'Something went wrong connecting Square. Please try again from the app.';
  const escapedUrl = deepLinkUrl.replace(/"/g, '&quot;');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>InkBooks</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 64px 24px; color: #1a1a1a; }
  a.button { display: inline-block; margin-top: 24px; padding: 14px 28px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
</style>
</head>
<body>
  <p>${message}</p>
  <p>Return to the InkBooks app to continue.</p>
  <a class="button" href="${escapedUrl}">Open InkBooks</a>
  <script>window.location.href = ${JSON.stringify(deepLinkUrl)};</script>
</body>
</html>`;
}

// The one place both branches above are chosen between - every callback outcome (connected,
// denied, error) goes through this rather than calling res.redirect/res.send directly, so the
// platform check can never be duplicated (and forgotten in one spot) across the three call sites
// below.
function respondToOAuthResult(res, owner, status) {
  if (owner.platform === 'mobile') {
    return res.send(mobileReturnPageHtml(mobileDeepLinkUrl(owner.ownerType, owner.ownerId, status), status));
  }
  return res.redirect(webRedirectUrl(owner.ownerType, owner.ownerId, status));
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
    return respondToOAuthResult(res, owner, 'denied');
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

    return respondToOAuthResult(res, owner, 'connected');
  } catch (err) {
    reportError(err, { context: '[square-oauth] Failed to complete Square connection' });
    return respondToOAuthResult(res, owner, 'error');
  }
});

module.exports = { router, signState };
