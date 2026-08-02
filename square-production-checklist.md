# Square Production Access Checklist — InkBooks Shop-Cut Ledger

Compiled August 2, 2026, sourced directly from Square's current developer docs (not from memory —
see links inline). This only covers what's needed for InkBooks' own OAuth application to move from
Sandbox to Production. It does not include submitting to Square's public App Marketplace, which
InkBooks doesn't need (see PRODUCTION_ROADMAP.md's shop-cut ledger section — that requirement was
already researched and ruled out as unnecessary).

I can't submit any of this myself — it requires signing into your own Square Developer account and
entering business details. This is the exact list to work through.

## Why this is lower-stakes than it sounds

InkBooks itself never touches money in the design you already built (Option B — Square Invoices).
Each *shop* connects its own Square account via OAuth and money lands directly in the shop's own
account; InkBooks only creates and sends invoices on the shop's behalf. That means:
- No PCI/money-transmitter exposure for InkBooks itself.
- The "business verification" Square asks about is scoped to *your* developer account and
  application, not a Marketplace listing.

## 1. Activate your own Square account for production API access

Per Square's docs: "you must activate your Square account at
[squareup.com/activation](https://squareup.com/activation)" before production credentials work for
real API calls. Do this first if you haven't already — it's the account-level gate everything else
sits behind.

## 2. Get production credentials from the Developer Console

In the [Developer Console](https://developer.squareup.com/apps), open the InkBooks application →
**Credentials** page → switch the toggle from Sandbox to **Production**:
- Copy the **Production Application ID** → becomes `SQUARE_APPLICATION_ID` in Render.
- Copy the **Production Application Secret** (OAuth page) → becomes `SQUARE_APPLICATION_SECRET`.

## 3. OAuth production requirements (Square's "Move OAuth to Production" checklist)

Straight from [developer.squareup.com/docs/oauth-api/movetoprod](https://developer.squareup.com/docs/oauth-api/movetoprod):

- **Redirect URL must be HTTPS.** `SQUARE_OAUTH_REDIRECT_URL` needs to point at
  `https://api.inkbooks.net/...` (whatever `routes/squareOAuth.js`'s callback path is) — not
  localhost. Update this in Render's env vars.
- **`client_id` must be the production Application ID** in the authorization URL — this is handled
  automatically once you swap `SQUARE_APPLICATION_ID` in step 2, since `utils/square.js`'s
  `buildAuthorizationUrl` reads it from that env var.
- **Only request in-scope permissions.** InkBooks currently requests `INVOICES_WRITE/READ`,
  `ORDERS_WRITE/READ`, `CUSTOMERS_WRITE/READ`, `PAYMENTS_READ`, `MERCHANT_PROFILE_READ` (confirmed
  directly in `utils/square.js`'s `OAUTH_SCOPES`) — worth a quick check that this list still
  matches what the app actually calls before going live. Requesting a scope you don't use is
  flagged by Square as a security smell, not just a technicality.
- **`session=false`** — forces the shop admin to explicitly sign into their own Square account
  during Connect, rather than silently using whatever Square session happens to be active in their
  browser (relevant since a shop admin could have a personal Square account logged in too). Worth
  double-checking this parameter is set in the authorization URL.
- **User-friendly failure page** — already built (`Shop.jsx`'s `SQUARE_REDIRECT_MESSAGES` banner
  for connected/denied/error). Nothing to do here.
- **CSRF `state` parameter** — already built (`routes/squareOAuth.js` signs a JWT with `shopId` +
  purpose as `state`). Nothing to do here.

## 4. Token handling — already built, just confirm the production key

Square requires encrypted storage, periodic refresh (every 7 days or less, tokens expire at 30),
and secure key management. All of this is already implemented
(`utils/token-crypto.js`/`utils/square.js`'s `refreshAccessToken`/`ensureFreshAccessToken`-style
logic). The one action item: generate a **new, different** `TOKEN_ENCRYPTION_KEY` for production —
don't reuse the Sandbox one. Generate with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 5. Create a separate Production webhook subscription

The Sandbox webhook subscription you already verified does *not* carry over. In the Developer
Console's **Webhooks** page, under Production (not Sandbox):
- Create a new Webhook Subscription pointed at your real `SQUARE_WEBHOOK_NOTIFICATION_URL`.
- Subscribe to `invoice.payment_made` (same event as Sandbox).
- Copy its signing key → becomes the production `SQUARE_WEBHOOK_SIGNATURE_KEY` in Render.

This is the exact gotcha you already hit once in Sandbox ("first launch the seller test account...")
— the production side has its own separate webhook subscription that's easy to forget since it's
not the same UI screen as Sandbox.

## 6. Update Render's environment variables

Once you have the production values from steps 2, 3, and 5:

| Variable | New value |
|---|---|
| `SQUARE_ENVIRONMENT` | `production` |
| `SQUARE_APPLICATION_ID` | production Application ID |
| `SQUARE_APPLICATION_SECRET` | production Application Secret |
| `SQUARE_OAUTH_REDIRECT_URL` | `https://api.inkbooks.net/...` (HTTPS, real domain) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | production webhook subscription's signing key |
| `SQUARE_WEBHOOK_NOTIFICATION_URL` | same, confirm it's the real HTTPS domain |
| `TOKEN_ENCRYPTION_KEY` | freshly generated, different from Sandbox's |

## 7. Verify end-to-end, once, in production

Repeat the same cycle already verified in Sandbox (per PRODUCTION_ROADMAP.md): connect a real shop's
Square account → send a real invoice → confirm gross-up math → pay it for real (small amount) →
confirm the webhook flips the ledger to `paid`. This is a real dollar transaction, unlike Sandbox —
budget a few dollars for the test.

## What I couldn't verify from docs alone

Square's own account-verification requirements for enabling production API traffic (identity/
business checks tied to squareup.com/activation) are handled inside Square's own flow and aren't
fully documented in the developer docs I could fetch — you'll see exactly what's asked for when you
go through step 1. If Square's activation flow asks for something unexpected (e.g., additional
business verification specific to your account), that's a Square-side requirement I can't predict
from here.

---

Sources:
- [Access Tokens and Other Credentials](https://developer.squareup.com/docs/build-basics/access-tokens)
- [Move OAuth from the Sandbox to Production](https://developer.squareup.com/docs/oauth-api/movetoprod)
