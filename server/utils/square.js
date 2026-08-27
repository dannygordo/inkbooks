const crypto = require('crypto');
const tokenCrypto = require('./token-crypto');

// Thin REST client around the pieces of Square's API this feature needs: OAuth (connect a shop's
// account), Invoices (bill the artist for their shop cut without InkBooks ever touching the
// money), and webhook signature verification. No `square` SDK dependency - this is a small,
// specific slice of their API surface, plain `fetch` (Node 20+, already required by
// package.json's engines field) keeps this self-contained with nothing new to `npm install`.
//
// VERIFIED AGAINST A REAL SQUARE SANDBOX SELLER, 2026-08-11, as far as the Payments call:
// authorization URL -> consent -> token exchange -> encrypted storage -> decrypt -> POST /v2/payments
// all work end to end against Square rather than against these docs. The charge itself was refused
// for a missing scope (see OAUTH_SCOPES below), which is a permission granted at authorization -
// so it proves the whole handshake ran and the stored token was genuinely usable.
//
// STILL UNVERIFIED: a payment that actually succeeds, and everything downstream of it -
// createShopCutInvoice, publishing that invoice, and the webhook flipping an Appointment to 'paid'.
// The rest of this file was built against Square's published REST docs (OAuth, Invoices, Orders,
// Customers, webhook signature scheme - see PRODUCTION_ROADMAP.md's "Shop-cut ledger" section).

function getEnvironment() {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

// A single kill switch in front of the only two places this file ever moves or requests real
// money: a direct card charge (createPaymentForAccount) and a shop-cut invoice
// (createAndPublishShopCutInvoice). Everything else in here - OAuth, token refresh, webhook
// verification - stays live either way, so Settings' Square panel keeps working for connect/
// disconnect while this is off.
//
// Defaults to enabled (unset behaves exactly as before this existed) - set
// SQUARE_PAYMENTS_ENABLED=false in Render/`.env.*` to turn real charges off without touching code
// or redeploying anything else. The thrown error carries both `.status` (the REST route at
// routes/squarePayments.js already forwards `err.status` unchanged) and `.code` (so the GraphQL
// side, shopCutPayments.js, can catch this one condition specifically and re-throw it as a
// UserInputError instead of letting it fall through to formatError as an unexpected failure).
function assertPaymentsEnabled() {
  if (process.env.SQUARE_PAYMENTS_ENABLED === 'false') {
    const error = new Error(
      'Real Square payments are turned off in this environment (SQUARE_PAYMENTS_ENABLED=false). ' +
        'Set it to true (or unset it) to take a real charge or send a real invoice.',
    );
    error.status = 503;
    error.code = 'SQUARE_PAYMENTS_DISABLED';
    throw error;
  }
}

function getBaseUrl() {
  return getEnvironment() === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

// Square's hosted OAuth authorization page lives on the same per-environment host as the REST
// API itself (see Square's "Move OAuth to Production" docs' base-URL note).
function getAuthorizeBaseUrl() {
  return getBaseUrl();
}

function getAppCredentials() {
  const applicationId = process.env.SQUARE_APPLICATION_ID;
  const applicationSecret = process.env.SQUARE_APPLICATION_SECRET;
  if (!applicationId || !applicationSecret) {
    throw new Error(
      'SQUARE_APPLICATION_ID / SQUARE_APPLICATION_SECRET are not set - Square OAuth/Invoices ' +
        'features are unavailable until these are configured.',
    );
  }
  return { applicationId, applicationSecret };
}

// The scopes a connected seller has to grant.
//
// PAYMENTS_WRITE is what lets an artist's own account CHARGE A CARD. It was missing: this list was
// written for the Invoices-only flow, back when the only thing an OAuth token did was raise a
// shop-cut invoice and card charges went through a separate platform sandbox token. Once client
// charges moved onto the artist's own connection (DECISIONS.md M9), the token needed a permission
// nobody had asked the seller for, and Square refused at charge time with "The merchant has not
// given your application sufficient permissions".
//
// Still deliberately absent: PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS. That is a different permission,
// needed only for Square's automatic app_fee_allocations split, which was decided against in favour
// of the ledger + Invoices model (see PRODUCTION_ROADMAP.md). InkBooks never takes a share of a
// payment as it passes through.
//
// ADDING A SCOPE DOES NOT UPGRADE AN EXISTING TOKEN. Scopes are granted by the seller at
// authorization and a refresh returns the same set - so every account connected before this line
// changed has to disconnect and reconnect. See getValidAccessToken's caller for the error that
// says so.
const OAUTH_SCOPES = [
  'PAYMENTS_WRITE',
  'PAYMENTS_READ',
  'INVOICES_WRITE',
  'INVOICES_READ',
  'ORDERS_WRITE',
  'ORDERS_READ',
  'CUSTOMERS_WRITE',
  'CUSTOMERS_READ',
  'MERCHANT_PROFILE_READ',
];

function getRedirectUrl() {
  const redirectUrl = process.env.SQUARE_OAUTH_REDIRECT_URL;
  if (!redirectUrl) {
    throw new Error(
      'SQUARE_OAUTH_REDIRECT_URL is not set - must match the redirect URL configured for this ' +
        'application in the Square Developer Console exactly.',
    );
  }
  return redirectUrl;
}

// `state` should be a signed/opaque token the caller generates (see routes/squareOAuth.js),
// not a raw shopId - Square returns it unmodified to the callback, and it's the only thing
// standing between "the shop that clicked connect" and CSRF/parameter tampering.
function buildAuthorizationUrl(state) {
  const { applicationId } = getAppCredentials();
  const params = new URLSearchParams({
    client_id: applicationId,
    scope: OAUTH_SCOPES.join(' '),
    // Forces the seller to choose/sign into a Square account explicitly rather than silently
    // reusing whatever Square session happens to be active in their browser - sellers commonly
    // have multiple Square accounts (see Square's own OAuth Best Practices on this exact point).
    session: 'false',
    state,
    redirect_uri: getRedirectUrl(),
  });
  return `${getAuthorizeBaseUrl()}/oauth2/authorize?${params.toString()}`;
}

async function squareFetch(path, { method = 'GET', accessToken, body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    // Only the OAuth token-exchange/refresh calls don't carry a seller access token - they
    // authenticate with the application's own client_id/client_secret in the body instead.
  }
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && data.errors && data.errors.map((e) => e.detail).join('; ')) ||
      `Square API request to ${path} failed with status ${response.status}`;
    const error = new Error(message);
    error.squareErrors = data && data.errors;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function exchangeCodeForToken(code) {
  const { applicationId, applicationSecret } = getAppCredentials();
  return squareFetch('/oauth2/token', {
    method: 'POST',
    body: {
      client_id: applicationId,
      client_secret: applicationSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUrl(),
    },
  });
}

// Used once, right after OAuth token exchange, to pick a default location for the newly
// connected shop - Square's OAuth token response itself doesn't include a location id.
async function squareFetchLocations(accessToken) {
  return squareFetch('/v2/locations', { method: 'GET', accessToken });
}

async function refreshAccessToken(refreshToken) {
  const { applicationId, applicationSecret } = getAppCredentials();
  return squareFetch('/oauth2/token', {
    method: 'POST',
    body: {
      client_id: applicationId,
      client_secret: applicationSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
  });
}

/**
 * Reads a stored token, turning "we cannot read our own credentials" into something a person can
 * act on.
 *
 * tokenCrypto.decrypt throws a developer-facing message on a malformed value or a key that no
 * longer matches - and that reached the payment route as a bare 500 at the moment a card was being
 * charged, which tells the person at the counter nothing and the shop owner less. The condition is
 * real and not rare: a rotated TOKEN_ENCRYPTION_KEY, a restored backup, or a hand-edited row all
 * produce it, and the fix is always the same - reconnect Square.
 *
 * `status` is set so the route surfaces it as a 400 rather than a server error. It IS a server-side
 * problem, but it is one with an action attached, and 500 is the code that means "no idea".
 */
function decryptStoredToken(encrypted) {
  try {
    return tokenCrypto.decrypt(encrypted);
  } catch (err) {
    const error = new Error(
      'Square credentials for this account could not be read - reconnect Square in Settings. ' +
        `(${err.message})`,
    );
    error.status = 400;
    throw error;
  }
}

// Square tokens expire every 30 days; Square recommends refreshing every 7 days or less so a
// token never goes stale from inactivity alone. Returns a valid, decrypted access token, mutating
// and saving `account` in place if a refresh happened.
//
// Takes a SquareAccount, not a Shop (DECISIONS.md M9). The connection belongs to an owner, which
// may be a shop or an independent artist, and this function has no business knowing which - it
// needs credentials and somewhere to write refreshed ones back to. The error message says "this
// account" rather than "this shop" for the same reason: an independent artist reading "this shop
// has not connected a Square account" would reasonably conclude the problem was somewhere else.
async function getValidAccessToken(account) {
  if (!account || !account.connected || !account.accessTokenEncrypted) {
    throw new Error('This account has not connected Square yet.');
  }
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const needsRefresh = !account.tokenExpiresAt || account.tokenExpiresAt < sevenDaysFromNow;
  if (!needsRefresh) {
    return decryptStoredToken(account.accessTokenEncrypted);
  }
  const refreshToken = decryptStoredToken(account.refreshTokenEncrypted);
  const refreshed = await refreshAccessToken(refreshToken);
  account.accessTokenEncrypted = tokenCrypto.encrypt(refreshed.access_token);
  account.refreshTokenEncrypted = tokenCrypto.encrypt(refreshed.refresh_token);
  account.tokenExpiresAt = new Date(refreshed.expires_at);
  await account.save();
  return refreshed.access_token;
}

// --- Gross-up math ---
// See PRODUCTION_ROADMAP.md's "Shop-cut ledger" section for the full derivation. Square deducts
// its processing fee from the invoice total before the shop sees any of it, so if we invoice for
// exactly the amount owed, the shop nets less than that. These solve backward for the invoice
// total X such that, after Square's fee, the shop nets the original target amount.
//
// Conservative on purpose: uses Square's Free-plan rates (the worst case for the payer), since
// this app has no reliable way to know which Square plan tier a connected shop is on - see
// Square's Invoices pricing page. On a paid plan this slightly overshoots (the artist pays a few
// cents more than the exact fee), which is preferable to undershooting and leaving the shop short.

const ACH_FEE_RATE = 0.01; // 1%, no cap on Free plan
const CARD_FEE_RATE = 0.033; // 3.3% (Free plan; 2.9% on paid plans)
const CARD_FEE_FIXED_CENTS = 30; // + 30 cents, all plans

function computeGrossedUpAmountCents(targetAmountCents, paymentMethod) {
  if (paymentMethod === 'card') {
    return Math.ceil((targetAmountCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_RATE));
  }
  // Default: ACH - cheaper for both sides on essentially any InkBooks-scale invoice amount.
  return Math.ceil(targetAmountCents / (1 - ACH_FEE_RATE));
}

// --- Invoices ---

// The seller's own Square customer directory is scoped by the access token, so this needs nothing
// else to identify whose directory to search. It used to take a `shop` first argument that no line
// of the body referenced - removed rather than migrated to a SquareAccount, since passing an owner
// it does not use would suggest the search is scoped by one.
async function findOrCreateCustomer(accessToken, { emailAddress, givenName, familyName }) {
  const searchResult = await squareFetch('/v2/customers/search', {
    method: 'POST',
    accessToken,
    body: { query: { filter: { email_address: { exact: emailAddress } } } },
  });
  if (searchResult.customers && searchResult.customers.length > 0) {
    return searchResult.customers[0];
  }
  const createResult = await squareFetch('/v2/customers', {
    method: 'POST',
    accessToken,
    body: { given_name: givenName, family_name: familyName, email_address: emailAddress },
  });
  return createResult.customer;
}

// Creates and publishes a Square invoice, billed to the artist, payable directly into the shop's
// own connected Square account - InkBooks is never a party to the money movement (no
// app_fee_money/app_fee_allocations anywhere in this call). Returns { invoiceId, publicUrl }.
//
// Takes the shop's SquareAccount (DECISIONS.md M9) rather than the Shop itself, because the only
// things it ever needed from the shop were the location id and the credentials, and both now live
// on the account. This remains a shop-shaped operation regardless: a shop cut is money an artist
// owes a shop, so an independent artist has no shop cut to invoice and never reaches here.
async function createAndPublishShopCutInvoice({
  account,
  artistEmail,
  artistFirstName,
  artistLastName,
  targetAmountCents,
  description,
  paymentMethod = 'ach',
}) {
  assertPaymentsEnabled();
  if (!account || !account.locationId) {
    throw new Error('This Square connection is missing a location id - reconnect Square.');
  }
  const accessToken = await getValidAccessToken(account);
  const grossedUpAmountCents = computeGrossedUpAmountCents(targetAmountCents, paymentMethod);

  const customer = await findOrCreateCustomer(accessToken, {
    emailAddress: artistEmail,
    givenName: artistFirstName,
    familyName: artistLastName,
  });

  const orderResult = await squareFetch('/v2/orders', {
    method: 'POST',
    accessToken,
    body: {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: account.locationId,
        customer_id: customer.id,
        line_items: [
          {
            name: description || 'Shop cut',
            quantity: '1',
            base_price_money: { amount: grossedUpAmountCents, currency: 'USD' },
          },
        ],
      },
    },
  });

  const invoiceResult = await squareFetch('/v2/invoices', {
    method: 'POST',
    accessToken,
    body: {
      idempotency_key: crypto.randomUUID(),
      invoice: {
        location_id: account.locationId,
        order_id: orderResult.order.id,
        primary_recipient: { customer_id: customer.id },
        payment_requests: [
          {
            request_type: 'BALANCE',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          },
        ],
        delivery_method: 'EMAIL',
        accepted_payment_methods: {
          card: paymentMethod === 'card',
          bank_account: paymentMethod === 'ach',
          square_gift_card: false,
          buy_now_pay_later: false,
          cash_app_pay: false,
        },
        // Line item already includes the gross-up estimate for Square's processing fee - see
        // computeGrossedUpAmountCents above - so the invoice description makes that visible to
        // the artist rather than silently inflating the number.
        title: 'Shop cut',
        description:
          `${description || 'Shop cut'} (includes an estimated processing fee so the shop ` +
          `receives the full amount owed)`,
      },
    },
  });

  const publishResult = await squareFetch(
    `/v2/invoices/${invoiceResult.invoice.id}/publish`,
    {
      method: 'POST',
      accessToken,
      body: { version: invoiceResult.invoice.version, idempotency_key: crypto.randomUUID() },
    },
  );

  return {
    invoiceId: publishResult.invoice.id,
    publicUrl: publishResult.invoice.public_url,
    grossedUpAmountCents,
  };
}

// --- Webhook signature verification ---
// Square's scheme (see Webhooks > Verify and Validate an Event Notification): HMAC-SHA256 of
// (notification URL + raw request body), keyed by the subscription's signature key, base64
// encoded, compared against the `x-square-hmacsha256-signature` header. Must use a constant-time
// comparison (crypto.timingSafeEqual) - Square's own docs flag the timing-attack risk otherwise.
function verifyWebhookSignature({ notificationUrl, rawBody, signatureHeader }) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!signatureKey) {
    throw new Error('SQUARE_WEBHOOK_SIGNATURE_KEY is not set - cannot verify webhook signatures.');
  }
  if (!signatureHeader) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', signatureKey)
    .update(notificationUrl + rawBody)
    .digest('base64');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

// --- Direct card payments (session and deposit checkout) ---
// The same OAuth connection as the shop-cut ledger above, not a separate one. This charges a card
// using the nonce/token the client's Web Payments SDK produces (see routes/squarePayments.js and
// client/src/components/IBSquarePayments/) into the connected seller's own account.
//
// IT USED TO BE A SEPARATE FEATURE, with its own hardcoded sandbox host and its own platform-wide
// SQUARE_SANDBOX_ACCESS_TOKEN, charging every payment in the app into InkBooks' own Square account.
// The hardcoding was a deliberate safety fence around exactly that: money settling to the wrong
// party is a problem you contain rather than ship. Per-owner credentials (DECISIONS.md M9) remove
// the reason for the fence - a connected seller's token settles to that seller by construction,
// and a sandbox token only works against the sandbox host, so SQUARE_ENVIRONMENT is now the one
// switch for both flows and there is nothing left for the two to disagree about.
//
// The browser still needs an application id to tokenize with. That is per-ENVIRONMENT, not per
// seller - see the /square/config route.

// Square's REST API is date-versioned (see developer.squareup.com/docs/build-basics/
// versioning-overview) - pin one explicitly rather than silently riding whatever the account
// default happens to be. Current as of when this was written; bump periodically.
const SQUARE_API_VERSION = '2026-07-15';

/**
 * Charges a card into the ARTIST'S OWN Square account.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CLIENT IS PAYING THE ARTIST. `account` comes from resolveArtistChargeAccount and is always
 * the artist's own, shop or no shop (DECISIONS.md M9). What the artist owes the shop is a separate
 * transaction settled afterwards - see createAndPublishShopCutInvoice below, which bills the artist
 * and is payable into the shop's account. Two transactions, in that order, exactly as it works with
 * cash. InkBooks is never a party to either.
 *
 * It briefly resolved to the SHOP's account for a shop artist, by analogy with the tax rate (M8).
 * The result was that the shop received the whole payment and then invoiced the artist for a cut of
 * it - paid twice, with the artist paid nothing.
 *
 * This replaces createSandboxPayment, which charged every payment through ONE platform access
 * token (SQUARE_SANDBOX_ACCESS_TOKEN) into a hardcoded sandbox location. Every charge in the app
 * settled to InkBooks' own Square account, which is the exact opposite of what the shop-cut ledger
 * design says and the reason that route was fenced off as sandbox-only. Per-owner credentials are
 * what unfences it.
 *
 * The sandbox/production split now comes from SQUARE_ENVIRONMENT, the same variable the OAuth flow
 * reads, rather than from a separate hardcoded host - a connected sandbox seller's token only works
 * against the sandbox host, so the two must agree and there is no reason for two switches.
 *
 * `idempotencyKey` comes from the CALLER, not from crypto.randomUUID() here. Generating it inside
 * this function makes every retry a distinct charge, which is precisely what idempotency exists to
 * prevent: a double-clicked Pay button was two payments.
 *
 * Throws (with .status/.squareErrors set, same shape as squareFetch's errors) on failure.
 */
/**
 * Is this Square's "you were never granted that permission" refusal?
 *
 * Square's exact wording, observed against the sandbox: "The merchant has not given your
 * application sufficient permissions to do that. The merchant must authorize your application for
 * the following scopes: PAYMENTS_WRITE".
 *
 * Matched on the CODE where Square gives one and on that phrasing otherwise, and deliberately NOT
 * gated on the HTTP status. The status for this is 403 today; gating on it would mean a future
 * Square that returns 401 silently stops being recognised, and the cost of that is an artist
 * staring at a message they cannot act on. The phrasing is specific enough to stand alone - no
 * ordinary decline or validation failure talks about authorizing scopes.
 */
function isInsufficientScopeError(data) {
  const errors = (data && data.errors) || [];
  return errors.some(
    (e) =>
      e.code === 'INSUFFICIENT_SCOPES' ||
      /sufficient permissions/i.test(e.detail || '') ||
      /authorize your application for the following scopes/i.test(e.detail || ''),
  );
}

async function createPaymentForAccount({ account, sourceId, amountCents, idempotencyKey, note }) {
  assertPaymentsEnabled();
  if (!account || !account.locationId) {
    throw new Error('This Square connection is missing a location id - reconnect Square.');
  }
  // Refreshes the token in place if it is close to expiry, and throws if the account holds no
  // usable credentials at all.
  const accessToken = await getValidAccessToken(account);
  const locationId = account.locationId;

  const response = await fetch(`${getBaseUrl()}/v2/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify({
      source_id: sourceId,
      idempotency_key: idempotencyKey,
      amount_money: { amount: amountCents, currency: 'USD' },
      location_id: locationId,
      note,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && data.errors && data.errors.map((e) => e.detail).join('; ')) ||
      `Square Payments API request failed with status ${response.status}`;

    // A CONNECTION THAT PREDATES PAYMENTS_WRITE. Square's own wording - "The merchant has not given
    // your application sufficient permissions" - is accurate and gives the artist nothing to do:
    // they authorized this connection themselves and nothing in InkBooks looks broken. The fix is
    // non-obvious and one-time, because a refresh returns the scopes originally granted rather than
    // the ones now requested, so the only way to gain one is to disconnect and connect again.
    if (isInsufficientScopeError(data)) {
      const error = new Error(
        'This Square connection was authorized before card payments were supported. Disconnect ' +
          'and reconnect Square in Settings to grant permission to take payments.',
      );
      error.squareErrors = data && data.errors;
      error.status = 400;
      throw error;
    }

    const error = new Error(message);
    error.squareErrors = data && data.errors;
    error.status = response.status;
    throw error;
  }
  return data.payment;
}

module.exports = {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  squareFetchLocations,
  getValidAccessToken,
  computeGrossedUpAmountCents,
  createAndPublishShopCutInvoice,
  verifyWebhookSignature,
  getEnvironment,
  createPaymentForAccount,
};
