const crypto = require('crypto');
const tokenCrypto = require('./token-crypto');

// Thin REST client around the pieces of Square's API this feature needs: OAuth (connect a shop's
// account), Invoices (bill the artist for their shop cut without InkBooks ever touching the
// money), and webhook signature verification. No `square` SDK dependency - this is a small,
// specific slice of their API surface, plain `fetch` (Node 20+, already required by
// package.json's engines field) keeps this self-contained with nothing new to `npm install`.
//
// IMPORTANT - not yet verified against a live Square account: everything here was built against
// Square's published REST docs (OAuth, Invoices, Orders, Customers, webhook signature scheme -
// see PRODUCTION_ROADMAP.md's "Shop-cut ledger" section for the exact pages), but this sandbox has
// no real Square developer credentials to test against. Before this goes live: connect a real
// Square sandbox account and walk through connect -> createShopCutInvoice -> pay the sandbox
// invoice -> confirm the webhook fires and the Appointment flips to 'paid'.

function getEnvironment() {
  return process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
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

// Minimum scopes for the Invoices-only flow this feature uses - deliberately does NOT include
// PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS, since InkBooks never touches the money here (see the
// design discussion in PRODUCTION_ROADMAP.md - that permission is only needed for the automatic
// app_fee_allocations split, which was decided against in favor of this ledger + Invoices model).
const OAUTH_SCOPES = [
  'INVOICES_WRITE',
  'INVOICES_READ',
  'ORDERS_WRITE',
  'ORDERS_READ',
  'CUSTOMERS_WRITE',
  'CUSTOMERS_READ',
  'PAYMENTS_READ',
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

// Square tokens expire every 30 days; Square recommends refreshing every 7 days or less so a
// token never goes stale from inactivity alone. Returns a valid, decrypted access token, mutating
// and saving `shop` in place if a refresh happened.
async function getValidAccessToken(shop) {
  if (!shop.squareConnected || !shop.squareAccessTokenEncrypted) {
    throw new Error('This shop has not connected a Square account yet.');
  }
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const needsRefresh = !shop.squareTokenExpiresAt || shop.squareTokenExpiresAt < sevenDaysFromNow;
  if (!needsRefresh) {
    return tokenCrypto.decrypt(shop.squareAccessTokenEncrypted);
  }
  const refreshToken = tokenCrypto.decrypt(shop.squareRefreshTokenEncrypted);
  const refreshed = await refreshAccessToken(refreshToken);
  shop.squareAccessTokenEncrypted = tokenCrypto.encrypt(refreshed.access_token);
  shop.squareRefreshTokenEncrypted = tokenCrypto.encrypt(refreshed.refresh_token);
  shop.squareTokenExpiresAt = new Date(refreshed.expires_at);
  await shop.save();
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

async function findOrCreateCustomer(shop, accessToken, { emailAddress, givenName, familyName }) {
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
async function createAndPublishShopCutInvoice({
  shop,
  artistEmail,
  artistFirstName,
  artistLastName,
  targetAmountCents,
  description,
  paymentMethod = 'ach',
}) {
  if (!shop.squareLocationId) {
    throw new Error('This shop is missing a Square location id - reconnect Square.');
  }
  const accessToken = await getValidAccessToken(shop);
  const grossedUpAmountCents = computeGrossedUpAmountCents(targetAmountCents, paymentMethod);

  const customer = await findOrCreateCustomer(shop, accessToken, {
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
        location_id: shop.squareLocationId,
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
        location_id: shop.squareLocationId,
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

// --- Direct card payments (deposit checkout) ---
// Separate, simpler feature from the OAuth/Invoices shop-cut ledger above: this charges a card
// directly to InkBooks' own Square (sandbox) account via the Payments API, using the nonce/token
// the client's Web Payments SDK produces - see routes/squarePayments.js and
// client/src/components/IBSquarePayments/. No per-shop OAuth connection involved.
//
// Deliberately hardcoded to Square's sandbox host, independent of SQUARE_ENVIRONMENT/getBaseUrl()
// above (which only governs the OAuth/shop-cut-invoices flow) - so changing that setting for the
// other feature can never accidentally point this one at real money. See PRODUCTION_ROADMAP.md's
// Phase 4 checklist for what has to happen (real production access/credentials, this hardcoding
// deliberately revisited) before this can ever run against a live card.
const SQUARE_SANDBOX_BASE_URL = 'https://connect.squareupsandbox.com';
// Square's REST API is date-versioned or (see developer.squareup.com/docs/build-basics/
// versioning-overview) - pin one explicitly rather than silently riding whatever the account
// default happens to be. Current as of when this was written; bump periodically.
const SQUARE_API_VERSION = '2026-07-15';

function getSandboxAccessToken() {
  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'SQUARE_SANDBOX_ACCESS_TOKEN is not set. Get one from your Square Developer Dashboard ' +
        '(developer.squareup.com/apps -> your app -> Sandbox tab -> Sandbox Access Token) and ' +
        'add it to .env.development. This is separate from SQUARE_APPLICATION_SECRET, which is ' +
        'only used for the OAuth/shop-cut-ledger flow above.',
    );
  }
  return token;
}

function getSandboxLocationId() {
  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID;
  if (!locationId) {
    throw new Error(
      'SQUARE_SANDBOX_LOCATION_ID is not set - find it under your Square Developer Dashboard\'s ' +
        'sandbox seller account Locations (the same LOCATION_ID already used client-side in ' +
        'client/src/config.js\'s SQUARE.SANDBOX block).',
    );
  }
  return locationId;
}

/**
 * Charges a card via Square's Payments API using a source id (nonce/token) the client's Web
 * Payments SDK produced. Always targets the sandbox host/token - see the module-level comment
 * above. Throws (with .status/.squareErrors set, same shape as squareFetch's errors) on failure.
 */
async function createSandboxPayment({ sourceId, amountCents, idempotencyKey, note }) {
  const accessToken = getSandboxAccessToken();
  const locationId = getSandboxLocationId();

  const response = await fetch(`${SQUARE_SANDBOX_BASE_URL}/v2/payments`, {
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
  createSandboxPayment,
};
