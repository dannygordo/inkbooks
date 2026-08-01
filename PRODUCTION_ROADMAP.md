
# InkBooks — Production Readiness Roadmap

Prepared July 31, 2026. Scope: pre-launch app, no live customer data yet, "fix and harden in place" (not a rewrite), hosting stack not yet chosen.

This roadmap assumes one thing above all: nothing here needs to happen gracefully around live users, because there aren't any yet. That's the single biggest asset you have right now — use it. Every fix below can be a breaking change if it needs to be.

---

## Phase 0 — Stop the bleeding (do this before anything else, no code changes required)

These are credential rotations and account-security items, not engineering work. They take an afternoon, not a sprint.

1. **Rotate the MongoDB Atlas password** for user `zewolve`. The current password is sitting in git history on two GitHub accounts.
2. **Rotate the JWT `SECRET_KEY`.** This invalidates every existing session — fine, since there are no real users to disrupt yet.
3. **Rotate the shared Firebase account** (`firebase@inkbooks.net`) password, or better, eliminate the pattern entirely (see Phase 2, Firebase Auth section).
4. **Decide on git history.** The `.env.production`/`.env.development` files are in the history of both the `cognitronic` and `dannygordo` repos. Since you're pre-launch, the simplest fix is: rotate every credential (done above), add proper `.gitignore` entries, and don't worry about scrubbing history — the old values are dead the moment you rotate them. If you want a clean repo anyway, `git filter-repo --path server/.env.production --path server/.env.development --invert-paths` rewrites history to remove them, but every collaborator needs to re-clone afterward.
5. **Confirm whether `dannygordo/inkbooks` is public or private**, and set it to private if it isn't already, at least until Phase 1 closes the open endpoints below.

---

## Phase 1 — Fix the actual vulnerabilities (highest priority engineering work, ~1 week)

This is the part that matters most. In order of severity:

### 1. Full account takeover via `forgotPassword` (most severe finding, worse than everything else combined)

`server/graphql/resolvers/users.js` — `forgotPassword(username, password)` looks up a user by username and sets their password directly, with **no verification that the caller owns the account**. No email, no token, no current-password check. The public `/resetPassword` route (outside any auth guard) renders `IBUpdatePassword` with `isPublic={true}`, which asks for nothing but username + new password.

Chained with finding #2 below (unauthenticated `getUsers`, which returns every username in the system), this is a fully automatable, zero-credential attack: enumerate every username, then take over every account, including whichever one ends up being Admin.

**Fix:** replace `forgotPassword` with a real flow — generate a single-use, time-limited reset token, email it to the account's registered address, and only accept a password change when a valid token is presented. This requires transactional email (SendGrid, Postmark, or SES — pick one) which you don't have set up yet; treat standing that up as part of this fix, not a separate task.

### 2. Every read query is unauthenticated

`getArtists`, `getClients`, `getProjects`, `getUsers`, `getStaff`, `getShops`, `getMessages`, `getConversations*`, `getAppointments*` — none of them call `checkAuth`. Anyone who can reach the endpoint gets every client's PII, every project's images/notes, every user's email and role, no login required.

**Fix:** every Query resolver needs a `checkAuth(context)` call at minimum, and most need an additional ownership/role check (a Client should only ever see their own projects and profile, not everyone's). Don't do this by hand-editing 20 resolvers one at a time — see the "resolver wrapper" pattern in Phase 2, which fixes this and prevents it from regressing.

### 3. `register` accepts a client-supplied `role`

Nothing stops a direct API call (bypassing the React form, which hardcodes `role: 30`) from registering with `role: 1` (Admin). **Fix:** the `register` mutation should hardcode `role: CLIENT` / `userType: 'client'` server-side, full stop. Elevated roles (Artist, Staff, Shop Admin, Admin) should only be assignable through a separate, authenticated, Admin-only mutation — never through public self-registration.

### 4. Registration is currently broken, two independent ways

`Register.js`'s GraphQL mutation string has `tagColor; $tagColor` (semicolon, not colon) — a syntax error that will fail to parse client-side. Separately, the server's `register` resolver references a bare `tagColor` variable that's never destructured from its arguments — a `ReferenceError` the moment it's hit. Both need fixing regardless of anything else; right now no one can create an account.

### 5. Copy-pasted bug in every delete mutation

`deleteArtist`, `deleteClient`, `deleteStaff`, `deleteShop`, `deleteConversation`, `deleteMessage`, `deleteAppointment` all do `const x = Model.findById(id)` without `await` — that's a Query object, not a document, so the existence check is meaningless. `deleteAppointment`/`updateAppointment` also compare a JWT string `user.id` against a Mongoose `ObjectId` `appointment.userId` with `===`, which never matches. **Fix:** add the missing `await`, and centralize ID comparison in a helper (`String(a) === String(b)`) so this class of bug can't recur.

### 6. Authorization gap that likely blocks real usage

`updateProject`, `updateProjectNotes`, `updateProjectTags` require `role <= SHOP_ADMIN` (10). Artists are role 20 — so an Artist can't add notes or tags to their own project, a feature your own git history shows was built. Decide the intended rule (probably: Admin, Shop Admin, or the assigned Artist on that specific project) and fix the check to match.

### 7. Cleanup while you're in these files

Delete `server/models/Material.js` (unused), `server/graphql/mutations/users.js` (orphaned type def, never wired in), `client/src/utils/hooks/useForm.js` (unused), and either build out or delete `client/src/context/global.js` (empty stub provider).

---

## Phase 2 — Structural hardening (prevents the Phase 1 bugs from coming back)

The reason Phase 1's bugs exist is that every resolver repeats the same `checkAuth` + role-check boilerplate by hand, so it's trivially easy to forget it (as happened on every single Query resolver). Fix the pattern, not just the instances:

- **Resolver-level auth wrapper.** ✅ Done — `server/utils/with-auth.js` wraps every Query resolver and every mutation across all 8 entities. It calls `checkAuth`, enforces an optional `minRole`, and passes the authenticated `user` as a 5th resolver argument for the OR-ownership cases (Admin, or the record's own artist/user) that can't be expressed as a flat role gate. New resolvers inherit protection by wrapping in `withAuth` instead of remembering to call `checkAuth` by hand.
- **Input validation library.** ✅ Done — hand-rolled `validators.js` is deleted; `server/utils/validation.js` has zod schemas for login/register/change-password, including a real minimum password length (8 chars) that never existed before, and catches the "silently ignored extra field" class of bug (`tagColor` is now in the schema and the resolver's destructure).
- **Firebase Auth, done properly.** ✅ Done and verified live (real login, real custom token, real `signInWithCustomToken` success in the browser) — replaced the shared static account (`firebase@inkbooks.net`) with real per-user Firebase Auth: the Express backend mints a custom Firebase token via the Admin SDK at login/register (using the user's own Mongo `_id` as the Firebase UID), the client signs in with `signInWithCustomToken`, and the shared credential is gone from the client bundle entirely. Storage Security Rules now require genuine authentication rather than one shared identity.

  Getting this working end-to-end surfaced three separate issues, worth recording since two of them had nothing to do with this rewrite:
  - `firebase-admin` 14.x removed the legacy `admin.credential.cert(...)`/`admin.auth()` API from its default export in favor of modular imports (`require('firebase-admin/app')`, `require('firebase-admin/auth')`). `server/utils/firebase-admin.js` is updated for this. Anyone bumping `firebase-admin` again later should check this hasn't moved further.
  - `client/src/config.js`'s `FIREBASE` block pointed at a stale, wrong project (`inkbooks-872df`) that matched neither the service account key nor the account's actual project (`inkbooks-cd85b`) — pre-existing, unrelated to this work, just never surfaced until real per-user auth started actually validating the token's issuing project. Fixed to the correct project's config; the unused/mislabeled `DATABASE_URL` field (a `gs://` Storage URI, not a real Realtime Database URL - nothing in the app uses Realtime Database) was dropped along with it.
  - The `inkbooks-cd85b` Firebase project had never had Authentication switched on in the console at all (Storage can be enabled independently). No code fix - just Firebase Console → Authentication → Get Started.
- **Consolidate the two backend listeners.** ✅ Done — `server/index.js` now bootstraps `@apollo/server` v5 as Express middleware (`expressMiddleware` from `@as-integrations/express5`) mounted at `/`, and `socket.io` is attached to the same `http.createServer(app)` instance instead of its own listener on port 4000. One process, one port (5500 in dev), one CORS origin list to maintain. This absorbed the Phase 3 `apollo-server` → `@apollo/server` migration too, since it's the same bootstrapping code either way — see Phase 3 table below, that row is also done now.

  Two things worth flagging from this pass:
  - **`createShop` now requires `SHOP_ADMIN`.** It previously had no role check at all — any authenticated user, including a Client, could create a Shop. That's inconsistent with every other create-mutation and was almost certainly an oversight, not intentional, so I tightened it to match the others. If you actually need unprivileged shop creation for some signup flow, tell me and I'll back it out.
  - **CORS is now enforced on GraphQL, not just socket.io.** Apollo Server v3's standalone mode had no CORS restriction by default (any origin). `Constants.URLS.INKBOOKS_WEBAPP` is now also the allowed origin for the Express/Apollo layer, and I made that constant environment-aware (`http://localhost:3000` in dev, `http://www.inkbooks.net` in production) since it was previously hardcoded to localhost even in the production branch — that would have silently broken production CORS the moment this got enforced. Confirm `www.inkbooks.net` is actually the right production domain before deploying.
  - **Node ≥20 is now required** (`@as-integrations/express5` enforces this via `engines`). Run `node -v` before you `npm install` — if you're on an older Node, the install or runtime will fail.
  - You'll need to run `npm install` in `server/` yourself (sandbox can't reach the npm registry) — `apollo-server` is removed and `@apollo/server`, `@as-integrations/express5`, `express`, `cors`, `graphql-tag`, and `zod` are added to `package.json`.

### Artist-centric tenancy model — finalized design (pre-launch, no real user data to migrate)

The original plan assumed the current shop-centric schema (`Artist.shopId` as a hard foreign key — an artist *belongs to* a shop) was staying as-is. It isn't. Below is the finalized design from a dedicated design conversation, ready to implement.

**Core model.** The artist is the independent entity. A shop is a separate paying account that connects to zero or more artists via a many-to-many `ArtistShopConnection` record, not a foreign key on `Artist`. An artist gets full product functionality with zero dependency on any shop connection — the subscription has to be worth it standalone, the shop relationship is purely additive.

**What's actually shop-owned vs. artist-owned (checked against the real schema, not assumed):**
- `Project`: already `artistId`/`clientId` only, no `shopId` — no change needed.
- `Client`: already only `userId`, no shop tie — no change needed.
- `Staff`: keeps its required `shopId` as-is. Staff are genuine shop employees (front desk, shop management), not independent professionals — this relationship staying a simple foreign key is correct, this redesign doesn't touch it.
- `Artist`: the only model that moves off a hard `shopId`, onto the connection model below.
- `Appointment.shopCutStatus` is currently `required: true`, which silently assumes every appointment involves a shop taking a cut. That breaks for a fully independent artist with no shop involved at all — **this needs to become optional**, meaningful only when the appointment happened at a connected shop.

**Connection lifecycle:**
- Bootstrapping a shop that has no account yet: the artist generates a single-use/expiring invite link and sends it out-of-band (text, in person, etc.). Using the link creates the shop's account (including picking a billing tier) and establishes the connection in the same flow - using the link *is* the approval, no separate confirmation step, since the artist generating it already constitutes consent.
- Connecting to (or reconnecting to) a shop that already has an account: artists find shops via a searchable shop directory (shops want to be discoverable; this is deliberately asymmetric with artists, who are *not* in any public directory - protecting artist privacy was an explicit design goal). The artist sends an in-app request; the shop accepts or declines from their dashboard.
- Either party can disconnect at any time, no notice period required. Disconnecting only stops *future* data from flowing to that shop - it does not retroactively affect anything (see permanent records, below), and does not affect the artist's own ongoing access to their own historical data. An artist can be connected to multiple shops concurrently (not just serially) - this is fully supported by design, not just tolerated.
- After a disconnect, reconnecting goes through the same shop-directory request/accept flow as any other existing-shop connection.

**Permanent shop-owned compliance records — separate from the connection itself.** At the moment an appointment happens at a shop, the appointment record, any booking request, consent form, client-communication tied to that appointment, and the financial transaction get written as a permanent, shop-owned record. This survives the artist disconnecting or the connection being deleted entirely, and is retained for as long as the shop has an account - no retention-period expiry. This is explicitly *not* a live view into the artist's ongoing Client/Project records (which the artist can edit or the client could theoretically ask to have changed) - it's an immutable snapshot taken at time of service, because it exists to satisfy real recordkeeping obligations (health/safety consent, financial records) that need to survive the relationship ending. Client data-deletion requests are out of scope for this product by policy decision - clients cannot request deletion of their information, which sidesteps the conflict this would otherwise create against the shop's retention need.

**Known gap - fixed (minimal slice, not the full model).** A bare `ArtistShopConnection` model now exists (`models/ArtistShopConnection.js`: `artistId`/`shopId`/`status` (`active`/`disconnected`)/`disconnectedAt`, one document per artist/shop pair, reused across disconnect/reconnect rather than creating a new row each time) with `connectArtistToShop`/`disconnectArtistFromShop` mutations and `getArtistShopConnections`/`getShopArtistConnections` queries (`graphql/mutations/resolvers/artistShopConnections.js`). Deliberately does not include invite-link tokens, shop-directory search, or billing-tier enforcement - see below for why.

`mutations/appointments.js`'s `createAppointment` and `updateAppointment` now check `ArtistShopConnection.exists({ artistId: user.id, shopId })` (the *caller's* id, matching the design note's own framing of "the artist creating or updating an Appointment" - not derived from `Project.artistId`, since `Appointment` has no direct `artistId` field and a booking-request-originated appointment has no `projectId` either) before accepting a `shopId`, current-or-historical connection status both counting (disconnecting stops future data flow, it doesn't retroactively invalidate a `shopId` already legitimately written). Once an `Appointment.shopId` is set, `updateAppointment` now rejects any attempt to change it to a different value or unset it entirely - checked as its own explicit branch (unchanged/first-assignment/reject-change all handled separately), not lumped into the general field-validation pass.

Also fixed in the same file, surfaced by this work rather than introduced by it: `updateAppointment`'s catch block was unconditionally doing `throw new Error(err)`, which silently rewrapped `AuthenticationError`/`UserInputError` into a plain `Error` and stripped the `extensions.code` the client relies on - this was already happening to the pre-existing `'Action not allowed'` throw, and would have swallowed the new shopId errors' type the same way. Now only rethrows as-is when the caught error is already a `GraphQLError`.

Verified: full syntax check, a standalone logic test of all six shopId-mutation branches (unchanged/first-assignment/change-rejected/unset-rejected, etc.), and all six touched/new GraphQL operations (`createAppointment`, `updateAppointment`, `connectArtistToShop`, `disconnectArtistFromShop`, `getArtistShopConnections`, `getShopArtistConnections`) run through `ApolloServer.executeOperation()` against the live schema.

**Shop billing.** Shops are their own paying account, separate from the artist's $15/month: $39/month for up to 3 connected artists, $79/month up to 10, $149/month unlimited. Checked against current comparable tools (Vagaro, GlossGenius, Booksy, ROXO Hub, Mangomint, Boulevard) as of this writing - this sits above the simple budget tier (Vagaro caps around $84, GlossGenius around $168 at 9+ staff) but well below full-suite enterprise tools (Mangomint $165-375, Boulevard $176-293/location), which seems justified given none of the budget-tier competitors are built around cross-artist revenue forecasting the way this product is. A shop is hard-blocked from connecting more artists than their current tier allows - no soft warning or auto-upgrade, they must upgrade the plan first.

**Billing processor decided: Square, for all financial transactions including subscriptions** (not Stripe) - resolves the "not yet chosen" question below. Not yet implemented: today's Square wiring (`client/src/components/IBSquarePayments`) is prototype-stage artist/client payment collection only (and, per the earlier client-config security fix, currently missing its `ACCESS_TOKEN` on purpose - that belongs server-side, not in this client component). Shop *subscription* billing via Square Subscriptions, and the tier-enforcement this connection model needs ("hard-blocked from connecting more artists than their tier allows"), are real, separate integration work - not something to fake with hardcoded tier values in the meantime.

**Still open:** the full connection lifecycle (artist invite-link generation/redemption, searchable shop directory, connect-request/accept/decline as opposed to today's direct-connect, billing-tier enforcement once Square Subscriptions is wired up), and the fuller permanent shop-owned compliance-snapshot concept (today's fix makes `Appointment.shopId` itself immutable, but the separate immutable-snapshot-of-consent-forms/financial-records collection described above doesn't exist yet). `Appointment.shopCutStatus`'s `required: true` has since been removed - see the shop-cut ledger section below, which needed that fix as a prerequisite (an independent artist with no shop has nothing to owe, and shouldn't be forced to send a throwaway value).

### Shop-cut ledger — finalized design (new feature, server + client built)

Most shops take a percentage cut of every appointment (commonly ~40/60) rather than a flat booth fee; the artist collects the full amount from the client and owes the shop their cut afterward. Design conversation covered two models before landing here:

- **Option A - automatic per-transaction split** (Square's `app_fee_allocations`, splitting the client's payment at the moment they pay). Initially thought this required a slow, discretionary Square approval process - that turned out to be a conflation of three separate things: Square's App Marketplace partner review (a real ~14-business-day process, but only required to be listed in Square's public marketplace directory, which InkBooks doesn't need), the standard "move OAuth to production" checklist every Square integration completes regardless (a self-directed technical/security checklist, not a discretionary review), and the `PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS` scope itself, which Square's own docs list as an ordinary OAuth permission requested and granted the same way as any other scope. So the approval concern doesn't actually block Option A. It was still rejected, for a different reason: Square's fee-splitting mechanism structurally requires the developer's (InkBooks's) own location to be one of the allocation recipients on every split - InkBooks would become a fee-taking party on every transaction whether it wants a cut or not, with its own 1099-K reporting exposure, and the artist (not the shop) silently absorbs 100% of Square's processing fee since fees are deducted before the app fee split is applied - quietly turning an intended 60/40 split into something closer to 57/40.
- **Option B - a tracked ledger, decided.** InkBooks tracks what's owed per appointment (`Appointment.shopCutAmount`) without moving money through InkBooks's own account at all. Two ways to actually settle it, both built:
  1. **Square Invoices (automated, no manual "mark as paid" step).** The *shop* (not the artist, and not InkBooks) connects its own Square account via OAuth - a one-click "Connect with Square" redirect to Square's own hosted consent page (`getSquareAuthorizationUrl` → `routes/squareOAuth.js`'s callback). InkBooks then creates and publishes a Square invoice on the shop's behalf (`createShopCutInvoice`), billed to the artist, payable on a Square-hosted page with no Square account required on the artist's side. Money lands directly in the shop's Square account - InkBooks is never in the money path, so none of Option A's fee-recipient/1099-K exposure applies, and only ordinary OAuth scopes (`INVOICES_WRITE/READ`, `ORDERS_WRITE/READ`, `CUSTOMERS_WRITE/READ`, `PAYMENTS_READ`) are needed - not `PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS`. A `invoice.payment_made` webhook (`routes/squareWebhooks.js`, HMAC-verified per Square's documented scheme) automatically flips the ledger to `paid` - no one has to remember to go back into the app.
     - **Fee gross-up.** Square deducts its own processing fee from the invoice before the shop sees any of it (confirmed from Square's docs: a $20 payment with a $2 app fee nets the seller $17.12, not $18 - the fee comes off first). Since the artist, not the shop, should eat this cost, the invoice is generated for a grossed-up amount that nets the shop the exact `shopCutAmount` owed (`utils/square.js`'s `computeGrossedUpAmountCents` - ACH: amount ÷ 0.99; card: (amount + $0.30) ÷ 0.967, using Square's Free-plan rates as a conservative estimate since the app has no way to know which Square plan tier a connected shop is on). ACH defaults over card since the fee is roughly a third the cost (1% flat vs. 3.3% + $0.30) and there's no reason an artist-to-shop payment needs to be a card transaction.
     - **Not yet tested against a live Square account** - built against Square's published REST docs (OAuth, Invoices, Orders, Customers, webhook signature verification), but this sandbox has no real Square developer credentials. Before going live: connect a real Square sandbox account and walk connect → `createShopCutInvoice` → pay the sandbox invoice → confirm the webhook fires and the ledger flips to `paid`.
  2. **Manual mark-paid/confirm (cash or any off-platform payment), dual-control by design.** The artist calls `markShopCutPaidManually`, which does **not** flip the ledger straight to `paid` - it sets `pending_confirmation` and emails the shop (`Shop.email`) that a claim needs review. The shop must independently call `confirmShopCutPaid` (shop-admin-or-better only) to actually mark it `paid` - the artist's own unverified claim is never sufficient on its own, since this is exactly the kind of self-report a shop needs to be able to dispute. Pending items are also visible in-app via `getPendingShopCutConfirmations(shopId)`, not just the email.

**Data model:** `Appointment.shopCutStatus` is now an enum (`none`/`unpaid`/`invoice_sent`/`pending_confirmation`/`paid`, plus the pre-existing `received` kept for backward compatibility) defaulting to `none`, no longer `required: true`. New fields: `shopCutAmount`, `shopCutPaymentMethod` (`square_invoice`/`manual`), `shopCutSquareInvoiceId`, `shopCutMarkedPaidBy`/`At`, `shopCutConfirmedBy`/`At`. `Shop` gained Square connection fields (`squareConnected`, `squareMerchantId`, `squareLocationId`, `squareAccessTokenEncrypted`/`squareRefreshTokenEncrypted` - AES-256-GCM via `utils/token-crypto.js`, never stored in plaintext, never exposed over GraphQL). `Appointment.shopId` in the GraphQL type was also changed from `ID!` to `ID` (nullable) - it was already optional at the Mongoose layer for independent artists, but the schema hadn't been fixed to match until now; this was a latent bug that would have broken serialization for any shop-less appointment.

**New GraphQL surface:** `getSquareAuthorizationUrl(shopId)`, `getPendingShopCutConfirmations(shopId)`, `createShopCutInvoice`, `markShopCutPaidManually`, `confirmShopCutPaid`, `disconnectShopSquare`. Role gates follow existing conventions exactly - `createShopCutInvoice`/`markShopCutPaidManually` check the caller is the appointment's own artist inline (same pattern as `updateAppointment`'s ownership check); `confirmShopCutPaid`/`getSquareAuthorizationUrl`/`getPendingShopCutConfirmations`/`disconnectShopSquare` are shop-admin-or-better via `withAuth`'s `minRole`, with the same pre-existing, documented gap as `getShopArtistConnections` (Shop has no owning-User field yet, so this checks "is a shop-admin-or-better at all," not "is the admin of *this* shop").

Verified: encryption round-trip + tamper rejection + missing-key rejection (`utils/token-crypto.js`), the gross-up formulas and webhook HMAC signature verification against hand-computed values, and all eight new/changed GraphQL operations run through `ApolloServer.executeOperation()` against the live schema - including confirming the `SHOP_ADMIN` role gate correctly rejects an `ARTIST`-role caller on `confirmShopCutPaid`/`getSquareAuthorizationUrl` before ever reaching the database.

**Required env vars (all currently blank placeholders in `.env.development`/`.env.production` - fill in before this feature can be used):** `SQUARE_ENVIRONMENT`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_OAUTH_REDIRECT_URL`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_NOTIFICATION_URL`, `TOKEN_ENCRYPTION_KEY` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` - use a different key in dev vs. production, keep it secret).

**Client-side, now built:**
- `pages/shops/Shop.js`: a Square connection card (Connect/Disconnect, status display) plus handling of the `?square=connected|denied|error` redirect landing from `routes/squareOAuth.js`'s callback.
- `components/ibCalendar/UpdateEventDialog.js`: a shop-cut ledger panel shown whenever the appointment has a `shopId` - editable `shopCutAmount`, a human-readable status line, and (while `unpaid`/`none`) an ACH/card toggle plus "Send Square Invoice" and "Mark as Paid (cash)" buttons. `components/ibCalendar/CreateEventDialog.js` gained the `shopCutAmount` input at creation time.
- `pages/shopCutConfirmations/ShopCutConfirmations.js` (new page, routed at `/shop-cut-confirmations`, linked from the sidebar): the shop side of the dual-control flow - lists everything in `pending_confirmation` for the caller's shop with a "Confirm Received" button per row.
- `shopCutAmount`/`shopCutStatus`/`shopCutPaymentMethod`/`shopCutSquareInvoiceId` added to the relevant `AppointmentService.js` gql documents so the calendar's cached event objects actually carry this data - they weren't previously selected at all.

**Still open (client-side):**
- Nothing enforces `shopCutAmount` gets set at appointment-creation time yet (e.g. auto-computing it from a shop's percentage-cut setting) - today it's just a number the artist types in; no shop-level "our cut is 40%" setting exists to compute it from automatically.
- `shopCutAmount` is a whole-dollar `Int` (matching `total`/`tip`/`shopMinimum`/`hourlyRate`'s existing convention in this schema, none of which are `Float`) - caught during verification, since the first pass used `parseFloat` client-side, which would have thrown a GraphQL Int-coercion error the first time someone typed a non-whole-dollar amount.
- Verified via `@babel/parser` (JSX-aware syntax parse) on every new/changed client file, not a full `react-scripts build` - a full CRA production build was attempted but repeatedly exceeded this sandbox's command time budget before completing; worth an actual `npm run build` locally before deploying this.

### Booking request & guest correspondence — finalized design (new feature, not yet built)

How a prospective client connects to an artist is the critical path to actually getting a tattoo, and today that path doesn't exist in the product at all - a client has no way to reach an artist without already being a `Client` record something else created. This is the design for that, worked out in a dedicated conversation.

**The problem with the obvious approach.** The instinct is to let a client correspond by real email - fill out a form, then just reply to emails from there, seamlessly, no app needed. That's the wrong mechanism even though the "no account needed" goal is right. True inbound email requires a transactional email provider with inbound-parse support specifically, a webhook that verifies the sender isn't spoofed, thread-correlation logic, and handling for whatever malformed content real-world email clients produce - a lot of new infrastructure and ongoing cost for a worse outcome, since freeform email text has to be reverse-engineered into structured data (placement, size, budget, images) after the fact.

**The actual design: tokenized link, not inbound email.** A client fills out a structured intake form - name, email, phone, description of the idea, reference image uploads, placement, size, budget range, rough availability, whether it's a cover-up/touch-up, how they heard about the artist. This captures far more useful, structured data upfront than freeform email ever would. From there, all correspondence happens on a simple web page identified by a long, unguessable token unique to that conversation - no login, no app. When the artist replies in-app, the client gets a short notification email ("you have a new message - view it here") carrying that link; email is only ever a notification carrier, never the message channel itself. The client clicks through and sees the *entire* conversation history every time, not just what's new - a straightforward "fetch all messages for this conversation" query, same as any authenticated user's message view.

**No new data model needed for messaging itself.** `Message.senderId` is a required real `User` id today, which looks like it would need a "guest sender" schema change - it doesn't. When the booking form is submitted, check `User.email` first: if a `User` with that email already exists, reuse it (and its `Client` record) rather than creating a duplicate; if not, create a real `User` and `Client` immediately, just with no password set. The token maps to (conversation, client id) and stands in for a JWT for exactly two actions - view this conversation, post a message to it. Every message, from either side, is a completely normal `Message` row with a real `senderId`. `Message`/`Conversation` and all the auth-wrapper/validation hardening already built for them apply unmodified - there's no parallel "guest message" system to maintain.

**Security rule this depends on:** the token/magic-link only stays valid for a `User` that has never set a password. The instant that email has a real password on file - either they signed up properly, or a prior guest converted to a full account - the link needs to stop working and any new correspondence should prompt a normal login instead. A magic link is a deliberate bypass around password auth; that's harmless for an account with no password to bypass, but leaving it valid for an account that now has one means anyone who intercepts that notification email (compromised inbox, forwarded mail, whatever) gets in without the password at all. Reuse-by-email is otherwise a deliberate, industry-standard simplification (same email = same person) - not perfect (shared family emails, someone using a friend's address by mistake), but the accepted tradeoff every intake-form-based tool makes.

**Booking request is its own lightweight model, not a `Project` from the start.** `Project`'s current status options (open, in_progress, waitlist, cancelled, completed) have no slot for "still deciding whether to book anything," and a booking request has exactly three outcomes: a consult `Appointment` gets booked, a session `Appointment` gets booked, or the client declines and nothing is created. A real `Client`/`Project`/`Appointment` only get created at the point the artist actually commits - inquiries that go nowhere don't clutter the data the rest of the app reports on. `consult` and `session` are already valid `appointmentType` enum values from the earlier validation work, so no schema change needed there.

**Deferred, not blocking:** what happens if the matched email belongs to an existing `Artist` or `Staff` account rather than a `Client` - e.g. an artist getting tattooed by a colleague. The current one-role-per-`User` model doesn't cleanly support attaching a second, Client-flavored identity to an existing Artist account. Worth a decision before this ships, not before the rest of the design proceeds.

**Email provider: Resend**, on its free tier (3,000 emails/month, $0) to start - chosen over the originally-considered Postmark to keep cost at zero while volume is low; swapping providers later only means rewriting `utils/email.js`'s `sendEmail()` internals, the higher-level `send*()` functions calling it don't know or care which provider is behind it.

**Built and verified (schema + resolvers validated together via `ApolloServer.start()`, not just individual file syntax):** the `BookingRequest` model, the `hasSetPassword` flag on `User`, `utils/guest-client.js` (find-or-create by email), `utils/guest-auth.js` (token resolution + the password-set security gate), `utils/email.js`, and the full GraphQL surface (`createBookingRequest`, `sendGuestMessage`, `convertBookingRequest`, `getBookingRequests`/`getBookingRequest`/`getBookingRequestByToken`). The existing `createMessage` mutation also now notifies the guest by email when an artist replies in-app - easy to have missed, since that's the one direction of this flow that lives in a file otherwise unrelated to booking requests.

**Rate-limiting: implemented.** `utils/rate-limit.js` is a dependency-free, in-memory fixed-window limiter (no Redis/external package - fine for Render's single free-tier instance; would need a shared store if this service is ever scaled to more than one instance). `createBookingRequest` is capped at 5/hour per IP; `sendGuestMessage` is capped at 30/hour per IP *and* per token independently. Requires `app.set('trust proxy', 1)` in `index.js` (added) since Render terminates TLS and proxies requests - without it, `req.ip` would return Render's internal proxy address for every caller, collapsing everyone into one shared bucket. Verified both with a standalone logic test (allows up to the limit, blocks the next call, returns a correct `retryAfterSeconds`) and by re-running the full `ApolloServer.start()` schema/resolver check with the new wiring in place.

**Guest reference-image upload: implemented (server-side).** `BookingRequest.referenceImages` (and `BookingRequestInput.referenceImages`) changed from `[IBImage]`/`[IBImageInput]` to plain `[String]` URLs - `IBImage` requires a real `userId`, which doesn't exist yet at the point a guest uploads images, before `createBookingRequest` has run and created their `User`/`Client` record. `Project.bodyImages` already establishes `[String]` as a valid pattern in this schema, so this reuses an existing shape rather than inventing a new one. A new unauthenticated Express route, `POST /booking-uploads` (`routes/bookingUploads.js`, not GraphQL - multipart bodies don't fit GraphQL's JSON transport without an extra spec this app doesn't otherwise need), accepts up to 5 images per request (JPEG/PNG/WEBP/GIF only, 8MB cap each), uploads them via a new `uploadGuestReferenceImage()` helper in `utils/firebase-admin.js` using the Storage Admin SDK, and returns permanent download URLs (`getDownloadURL()` from `firebase-admin/storage` - deliberately not a signed URL, which caps out at 7 days regardless of requested expiry and doesn't fit a conversation that may continue for weeks). Uploaded filenames are always a fresh random UUID plus a server-determined extension - the client's original filename never reaches Storage. Rate-limited independently from the GraphQL mutations (10 upload requests/hour/IP, reusing `utils/rate-limit.js`), and `createBookingRequestInputSchema.referenceImages` re-validates the URLs server-side as the actual security boundary, not just trusting what the upload route handed back. Added `FIREBASE_STORAGE_BUCKET` env var and `multer` dependency (`^2.2.0` - the 2.x rewrite that fixed 1.x's DoS CVEs, not the 3.0 alpha). Verified: full syntax check, the route's rate-limit/file-type/file-size/file-count logic against 5 scenarios with a stubbed `multer`, the updated zod schema against valid/invalid/oversized payloads, and a full `ApolloServer.start()` schema/resolver check with the new types wired in.

**Public intake form: built (`client/src/pages/booking/BookingRequest.js`, route `/book/:artistId`).** Unauthenticated, no `AuthRoute` wrapper - same pattern as `/login`/`/register`/`/resetPassword`. Looks up the artist via a new public query, `getPublicArtistProfile` (`resolvers/bookingRequests.js`), which deliberately returns a narrow `PublicArtistProfile` type (`id`/`firstName`/`lastName`/`avatar` only) rather than the full `Artist`/`User` type - the full type carries email/phone/other fields with no business being reachable by an unauthenticated caller who only has a user id in a URL. Returns `null` for both "no such user" and "that id isn't an artist," deliberately not distinguishing the two so the query can't be used to probe which ids exist. Selected reference images upload to `POST /booking-uploads` *before* `createBookingRequest` runs (using `fetch`+`FormData`, not Apollo - this is a REST endpoint, not GraphQL), and the returned URLs are included in the mutation payload. On success, shows a confirmation telling the guest to check their email for the conversation link - it does not attempt to link them there directly, since `BookingRequest` deliberately never exposes `guestToken` through the general type (only through the already-built email and `getBookingRequestByToken`).

Verified beyond syntax: both the `getPublicArtistProfile` query and `createBookingRequest` mutation strings were run through the actual server's `ApolloServer.executeOperation()` (not just parsed standalone) and confirmed to pass real schema validation and reach resolver execution - this catches client/server field-name or argument-shape drift that parsing alone wouldn't.

**Guest conversation page: built (`client/src/pages/booking/GuestConversation.js`, route `/booking/:token`).** Token-gated, not auth-gated - no `AuthRoute` wrapper, matches the server-side model where the magic link itself *is* the credential. Shows the booking request's summary details (description, placement, size, budget, cover-up flag, status) plus the full message thread, with the guest's own messages distinguished from the artist's by comparing `Message.senderId` against `BookingRequest.client.userId` (not by anything auth-context-based, since there is no auth context here) - `Client.userId` is a plain scalar field, so this doesn't require the more complex `Message.user` type-resolver used elsewhere in the app. Polls every 15s (`useQuery`'s `pollInterval`) rather than opening a socket connection, since `SocketProvider` is keyed to an authenticated user's id and a guest has no session to key one to - a real-time upgrade is possible later but wasn't necessary to ship this. Sending a message re-fetches the thread on success rather than doing manual cache surgery. An invalid or revoked token (see `utils/guest-auth.js` - this happens the instant the underlying `User` sets a real password) shows a plain "this link is no longer active, log in instead" message rather than a raw GraphQL error.

Verified the same way as the intake form: both `getBookingRequestByToken` and `sendGuestMessage`'s exact query/mutation strings passed real schema validation via `ApolloServer.executeOperation()` against the live server, not just standalone parsing.

**Artist-side booking requests dashboard: built (`client/src/pages/booking/ArtistBookingRequests.js`, route `/booking-requests`, authenticated - `AuthRoute`-wrapped, linked from the sidebar).** Master-detail layout: a list of the logged-in artist's booking requests on the left (`getBookingRequests(artistId: user.id)`), full detail - contact info, structured intake fields, reference-image thumbnails, message thread, reply box - on the right. Replies reuse the existing, already-notification-wired `createMessage` mutation rather than a booking-specific one, so the guest keeps getting emailed on new replies exactly as already built. For a `pending` request, "Book Consult"/"Book Session" open an inline sub-form asking only for a date/time before calling `convertBookingRequest` - `shopCutStatus`/`appointmentStatus` are hardcoded to sensible defaults (`unpaid`/`scheduled`) rather than surfaced as form fields, since both are editable afterward from the regular Appointments views like any other appointment; not worth the extra UI for a first pass. "Decline" calls the same mutation with `outcome: 'declined'` after a plain `window.confirm`.

Verified the same way as the other two pieces: `getBookingRequests`, `createMessage`, and `convertBookingRequest` (including the nested `AppointmentInput` object) were run through the live server's `ApolloServer.executeOperation()` and confirmed to pass schema validation, reaching the `withAuth` check itself (which correctly rejected the request for lacking a real auth header in the test - the point was confirming the query shape, not bypassing auth).

**All three client-side pieces for booking request / guest correspondence are now built.** Full feature is otherwise complete per this section: data model, guest auth, email notifications, rate limiting, reference-image upload, and all three client surfaces (intake form, guest conversation, artist dashboard).

**Still open:** the artist-side booking requests dashboard is not yet built.

### Dependency vulnerability audit (`npm audit`) — result

Ran after the Apollo/Express/socket.io consolidation and the Node 16 → 24 upgrade. Started at 33 vulnerabilities, closed to 6, all deliberately:

- **`jsonwebtoken`** (2 CVEs, incl. a `jwt.verify()` insecure-default-algorithm bypass) — fixed properly, not just patched: bumped to `9.0.3` and explicitly pinned `{ algorithms: ['HS256'] }` on `check-auth.js`'s `jwt.verify()` and `{ algorithm: 'HS256' }` on `generateToken()`'s `jwt.sign()`, so the fix doesn't depend on the package's default behavior.
- **`mongoose`/`mongodb`** (prototype pollution, NoSQL injection via `sanitizeFilter`/`$nor`) — the highest-relevance fix in this batch, since several mutations pass raw client-submitted objects straight into `findByIdAndUpdate()`. Patched via `npm audit fix` within the existing `^6.2.0` range. The underlying pattern (unvalidated client objects going straight into Mongoose writes) is still a separate, open gap — tracked below, not yet fixed.
- **`nodemon`** (`brace-expansion`, `semver` ReDoS/DoS, only patchable via a major bump) — bumped `2.0.15` → `3.1.14`. Dev-only tool, no production exposure either way.
- **Stray `nvm` npm dependency** — removed. Not the real nvm (a shell script, never an npm package); an unrelated, unmaintained package that had somehow ended up in `package.json` doing nothing.
- **`firebase-admin`** `13.10.0` → `14.2.0` — closed the `@google-cloud/firestore`-side half of a `uuid` buffer-bounds-check chain. Required Node ≥22 (already covered by the Node 24 upgrade).
- **Remaining 6 (moderate, all `uuid`)** — accepted, not fixed. `@google-cloud/storage@7.19.0` (Google's own current release, confirmed directly against the registry — not something we're behind on) pins `uuid@^8.0.0` internally, and there's no newer release that changes this. The only fix `npm audit` offers is downgrading `firebase-admin` to `10.3.0`, a 3-major regression on the package the entire per-user auth system now depends on, to patch a code path (`@google-cloud/storage`'s Admin-SDK internals) this app's server code never actually calls — `firebase-admin.js` only touches `admin.auth().createCustomToken()`. Revisit only if Google patches `@google-cloud/storage` upstream, or if this app ever calls Storage through the Admin SDK directly (it currently doesn't — Storage is client-side only, via the Firebase client SDK).

### Update-mutation validation — done, with a correction to how this was originally framed

`updateProject`, `updateAppointment`, `updateConversation`, and `updateMessage` now validate through zod schemas in `validation.js` (`updateProjectInputSchema`, etc.), following the same `validate(schema, input)` → `UserInputError` pattern as login/register.

The original framing of this gap (above) was overstated: it described the risk as a client submitting arbitrary keys (`role`, `__proto__`, Mongo operators) into `findByIdAndUpdate`. That's not actually possible here - GraphQL's own type system already rejects any field not declared on `ProjectInput`/`AppointmentInput`/`ConversationInput`/`MessageInput` before a resolver ever runs, unlike an untyped REST body. What these schemas actually fix is narrower but still real: update mutations weren't re-running the non-empty-string checks their create-mutation counterparts do (`updateProject` never re-checked that `title` wasn't blank the way `createProject` does), and status/type-like fields (`status`, `appointmentType`, `appointmentStatus`, `shopCutStatus`) were plain, unconstrained strings at both the GraphQL and Mongoose layers - nothing stopped a client from writing a value none of the UI's dropdowns would ever produce. The new schemas enforce non-empty required strings, enum membership matching `client/src/constants/app.js`'s dropdown options, non-negative numeric amounts, and Mongo ObjectId format on ID fields (failing cleanly with a `UserInputError` instead of an opaque Mongoose `CastError`).

**Update:** the create side is done too - `createProjectInputSchema`, `createAppointmentInputSchema`, `createConversationInputSchema`, `createMessageInputSchema` are wired into all four `create` mutations, replacing `createProject`'s old manual `title.trim() === ''` checks entirely. Required-ness on each field matches what the corresponding Mongoose model already enforces via `required: true` (e.g. `createAppointment`'s `shopCutStatus`/`appointmentType`/`appointmentStatus` are required in the schema because `Appointment.js` already required them at save time - a client omitting them was always going to fail, this just fails earlier with a clear message instead of an unhandled Mongoose `ValidationError`). Tested directly against both valid and deliberately-bad payloads for all four before calling it done.

---

## Phase 3 — Dependency & framework modernization

You're several major versions behind across the stack. Current latest-stable as of this writing, checked directly against the npm registry:

| Package | You're on | Current latest | Notes |
|---|---|---|---|
| `apollo-server` (standalone) | — | `@apollo/server` 5.5.1 | ✅ Done in Phase 2 — migrated to `@apollo/server` + Express (`@as-integrations/express5`) together with the listener-consolidation work. |
| `mongoose` | 6.2.0 | 9.6.3 | Requires Node ≥20.19. Multiple major versions of breaking changes (query behavior, TypeScript types, some deprecated methods) — read the 7.x, 8.x, and 9.x migration guides in sequence rather than jumping straight there. |
| `graphql` | 16.3.0 | still 16.x line, patch-level behind | Low risk to bump. |
| `react` | 17.0.2 | 19.2.6 | React 17→18 is the bigger behavioral jump (automatic batching, new root API via `createRoot`); 18→19 is smaller. Do it in two steps, not one. |
| `react-router-dom` | 6.2.1 | 6.x is current major, later 6.x releases exist | You're already on the current major; bump the minor/patch. |
| `@mui/material` | 5.2.8 | 9.1.0 | MUI 9's peer deps accept React 17/18/19, so this can be upgraded independently of the React bump, but MUI 6→7 dropped some legacy APIs (`@mui/styles` is deprecated — you use it, see below) — budget real time here. |
| `react-scripts` (CRA) | 5.0.0 | — (Create React App is unmaintained) | Recommend migrating off CRA entirely to **Vite** (currently 8.0.14). This is the single highest-leverage modernization step: faster dev server, faster builds, actively maintained, and CRA's `react-scripts` hasn't shipped a real update in years. |

Recommended sequencing, since doing all of this simultaneously is how migrations turn into multi-week yak-shaves:

1. Vite migration first (isolated, mostly config/tooling, doesn't touch app logic).
2. `@apollo/server` v5 + Express consolidation (also isolated — swaps the server bootstrapping, not the resolvers).
3. Mongoose major-version bump (do it in stages: 6→7→8→9, running your test suite — which you need to build, see Phase 5 — after each step).
4. React 17→18→19, then MUI 5→9 (MUI's `@mui/styles` package you currently use is deprecated in favor of `sx` prop / `styled()` — worth migrating call sites while you're touching this anyway, not as a separate future project).

**Revised call on TypeScript:** the original version of this section said to skip it, on the logic that it's a parallel investment that doesn't block a web-only production launch. That logic no longer holds now that a mobile app is in scope (Phase 6) — once two clients need to consume the same GraphQL API and stay in lockstep with schema changes, TypeScript plus schema-driven codegen stops being a nice-to-have and becomes the actual mechanism that prevents the two from drifting apart. Introduce it as part of the Phase 6 monorepo setup below, not bolted on twice later.

---

## Phase 4 — Payments

Square isn't actually wired up: `squareConfig.js` posts to `http://localhost:4000/process-payment`, but that port only runs the socket.io server — there's no route handling that path anywhere in `server/index.js`. The "production" Square config in `client/src/config.js` is a copy-paste of the sandbox app ID, not real production credentials.

To finish this:
1. Build the actual Express route (this ties into the Phase 2 "consolidate listeners" work — you'll have an Express app to add a route to) using Square's Node SDK to create a payment from the nonce.
2. Test the full sandbox flow end-to-end.
3. Apply for Square production access, get real production credentials, and store them as environment variables — never hardcoded, this time with the lesson from Phase 0 applied from day one.
4. You're already using Square's hosted card fields, which keeps you out of most PCI DSS scope — don't change that; don't ever let raw card numbers touch your server.

---

## Phase 5 — Mobile app

You need feature parity with the web app on mobile, and you want web and mobile to stay in sync without maintaining two divergent implementations of the same business logic. Three real options, weighed against what you're actually optimizing for:

**Full native (Swift/Kotlin, separate codebases per platform).** Best possible performance and platform-idiomatic UX. Rejected for you: it triples the surface area (web + iOS + Android as three unrelated codebases in three languages) and does the opposite of "easy to keep in sync" — every feature gets built three times by design.

**Flutter (Dart, single codebase for iOS + Android).** Genuinely excellent mobile performance and one codebase for both mobile platforms. Rejected for you specifically: zero code-sharing with your existing React/GraphQL web app. You'd be maintaining the business logic (auth flow, validation rules, API contracts) twice, in two different languages, which is the exact drift problem you're trying to avoid. Makes sense for a team building mobile-only or starting from scratch; doesn't make sense bolted onto an existing React codebase.

**Capacitor (wrap the existing React web build in a native shell).** The fastest path to an app-store listing — almost no new UI code, since it's your existing MUI/React app running in a native WebView with plugins bridging camera, push notifications, etc. Rejected as the primary approach for you, specifically because of what this app does: the core workflow is photo-heavy (reference images, body images, design images, cropping) and WebView camera/gallery performance and feel is noticeably worse than a true native camera component. It also caps how good push notifications and offline behavior can get. Worth knowing about as a cheap fallback if you ever need an app-store presence fast, but not the long-term answer.

**Recommendation: React Native via Expo, as its own app, sharing logic (not UI) with the web app through a monorepo.**

Why this wins on all three criteria you named:

- *Team velocity / ease of sync:* it's still React and still JavaScript — no new language, and your engineers (you) don't context-switch between two paradigms. The actual synchronization problem — API contracts and business logic drifting between clients — gets solved architecturally, not by hoping people remember to update both places.
- *Performance:* modern React Native (0.85.x as of this writing) runs on the New Architecture (Fabric renderer + JSI), which is close to native performance for the CRUD/list/form-heavy screens that make up most of this app. Camera capture and push notifications are first-class, well-supported Expo APIs — not framework afterthoughts.

**On photo editing specifically** (relevant since `referenceImages`/`designImages`/`bodyImages` with crop/rotate is core to the app, not incidental): the current `CropEasy.js` + `cropImage.js` combo — free pan, continuous zoom, 0-360° rotation slider, canvas rasterization — is built on `react-easy-crop`, which is a web-only package (pointer events + HTML canvas). It doesn't run in React Native, full stop, so this isn't a drop-in swap. The replacement is two pieces: `expo-image-manipulator` as the transform backend (crop/rotate/resize/flip/compress via native OS image APIs — actually handles full-resolution phone-camera photos better than a browser canvas does), plus a small custom cropper UI built with `react-native-gesture-handler` + `react-native-reanimated` to reproduce the pan/zoom/rotate interaction (`react-native-image-crop-picker` is a faster off-the-shelf alternative, but its rotation is typically 90°-increment only — a downgrade from the slider you have now). Both approaches include native modules, which means testing requires a custom Expo dev client via EAS Build, not the plain Expo Go app.
- *Functionality:* full native camera/gallery access, real push notifications through Expo's push service (APNs/FCM abstracted for you) — which is a genuine feature upgrade over the web app, not just parity. Appointment reminders and new-message notifications work properly on mobile in a way browser push never reliably does on iOS.

### How to structure it so web and mobile actually stay in sync

Don't build the mobile app as a bolted-on second project. Restructure the repo into a monorepo (Turborepo, currently 2.9.14, is the standard choice here) with this shape:

```
apps/
  web/       — your existing React app (post-Vite migration from Phase 3)
  mobile/    — new Expo/React Native app
packages/
  api/       — GraphQL operations (the ProjectService/ClientService/etc. pattern
              you already have — these are just gql tag definitions, already
              framework-agnostic and directly reusable as-is)
  shared/    — TypeScript types, zod validation schemas (from Phase 2), constants,
              pure utility functions (UtilsService-equivalent)
```

The mechanism that actually keeps web and mobile "in sync" isn't shared UI — it's **GraphQL Code Generator** (`@graphql-codegen/cli`, currently 7.1.3) pointed at your server's schema, generating TypeScript types and typed Apollo hooks into `packages/api`. Both apps import the same generated, typed operations. When the schema changes, both clients get compile errors at the exact call sites that break — not a silent runtime mismatch discovered by a user. This is also the concrete reason to stop deferring TypeScript (see the revised note in Phase 3).

What does *not* get shared: UI components. MUI doesn't run in React Native, and that's fine — mobile navigation (bottom tabs, native stack navigation via `expo-router` or React Navigation) should look and behave like a mobile app, not a squeezed-down web layout. The React Native screens get built fresh, using a lightweight RN component library (React Native Paper or Tamagui) rather than trying to port MUI.

Other things that need a cross-platform abstraction rather than direct reuse:
- **Auth token storage:** replace `CacheService`'s direct `localStorage` calls with a small storage interface — `expo-secure-store` (Keychain/Keystore-backed) on mobile, `localStorage` on web. Worth doing this refactor once, now, since it also fixes the XSS/localStorage token-theft exposure flagged back in the original audit.
- **Socket.io:** `socket.io-client` works in React Native without changes — no new work needed once the Phase 2 "consolidate listeners" work lands.
- **Firebase Storage uploads:** the Firebase JS SDK has a React Native-compatible path (`@react-native-firebase` or the same `firebase` JS SDK with RN's fetch polyfills); needs verification but isn't a rewrite.

### Honest scope-setting

This is not a small addition to the roadmap — be clear-eyed about it. You're not "reusing 80% of the app," you're reusing the data/logic layer (services, types, validation, auth flow) and rebuilding the entire UI layer for mobile conventions. Realistically, that's comparable in size to building the original web client's component layer again, just re-skinned for mobile navigation patterns and native capabilities. Sequence it after Phase 0-2 (security) are done and the monorepo scaffolding happens alongside the Phase 3 Vite migration — don't start mobile UI work against an API that's still wide open.

### iPad / tablet support

Setting `ios.supportsTablet: true` gets the same binary installing and launching on iPad — that part is free. It does not make the app good on iPad: without deliberate adaptive layouts, you get a phone-sized single-column UI stretched onto a much bigger screen. Given a front-desk iPad running the shop calendar and client project galleries all day is a realistic device for this app (not an edge case), budget explicit work for tablet layouts — a master-detail split view (project list + detail side by side, calendar with a persistent sidebar) switched in above a width breakpoint via `useWindowDimensions` or React Navigation/`expo-router`'s adaptive patterns.

### Confirmed platform scope: iOS-first, Android deferred

Target is iPhone + iPad, engineered for maximum UX on those two — not a lowest-common-denominator cross-platform app. Decision: build iOS-first and hold off spending design effort on Android, but keep the codebase Android-capable (plain React Native/Expo, no iOS-only native modules where an equivalent Android path exists) so a Play Store build is a smaller lift later rather than a rewrite. Concretely, this means:

- **Component choices lean iOS-native now.** Since Android isn't being designed for yet, don't default to a Material Design component library purely for cross-platform safety — build (or pick a kit oriented around) iOS Human Interface Guidelines conventions: native-feeling navigation transitions, sheet/modal presentations, swipe-back gesture, SF Symbols-style iconography. Revisit component choices when Android design work actually starts.
- **Haptics.** `expo-haptics` on key actions — appointment created, message sent, payment confirmed. Small, cheap, and it's the kind of detail that makes an app feel considered rather than generic.
- **Apple Pencil support on iPad.** Directly relevant to this app's actual domain, not a generic nice-to-have: annotating placement on body/reference images, marking up design references, capturing a signature on intake/consent forms. The `react-native-skia` canvas layer already recommended above for photo editing is the same technical foundation for this — build it once, use it for both.
- **iPad multitasking.** Verify the app behaves correctly in Split View and Slide Over, not just full-screen — plausible for shop staff running it alongside another app.
- **Dark mode**, via RN's `useColorScheme` — both a real request in low-lit shop environments and a baseline expectation of a well-built iOS app in 2026.
- **Dynamic Type and accessibility.** Respect the user's iOS text-size setting, proper VoiceOver labels, real tap-target sizing — this is a tool people will use all day, every day; accessibility here isn't a compliance checkbox, it's daily usability.
- **Face ID / Touch ID app unlock**, via `expo-local-authentication` — pairs naturally with the `expo-secure-store` token storage already planned above, and is a meaningfully better login experience than typing a password on a phone every time.
- **Stretch, not core scope:** a home-screen widget or Lock Screen Live Activity showing today's appointments. Worth a line in a future planning pass once the core app is built and stable — not something to scope into the initial build.

---

## Phase 6 — Testing, monitoring, and the production checklist

There are currently zero tests (`"test": "echo \"Error: no test specified\" && exit 1"` in `server/package.json`). Before calling this production-ready:

- **Server:** Jest + a GraphQL testing helper for resolvers, focused first on the auth wrapper from Phase 2 (prove unauthenticated requests get rejected) and the password-reset flow from Phase 1 (prove a token is required).
- **Client:** React Testing Library for the login/register/project-creation flows at minimum — the ones most likely to silently break during the Phase 3 migrations.
- **CI:** GitHub Actions running lint + tests + build on every PR. Cheap to set up, catches regressions during the dependency upgrades.
- **Error monitoring:** Sentry (or similar) on both client and server — right now errors just go to `console.log`, including some that log full user objects, which you'll want to stop doing before this touches real client PII.
- **Logging:** replace the `console.log(user)` / `console.log(appointment)` debug statements scattered through the mutations with structured logging (`pino`), and make sure nothing sensitive (passwords, tokens) ever hits a log line.
- **Backups:** enable automated MongoDB Atlas snapshots before real client data exists in that cluster, not after.
- **Legal:** a privacy policy and terms of service before collecting client PII and reference images for real — this is a legal/compliance conversation, not an engineering one, and it's worth having before Phase 1's data-model decisions get locked in.

### Hosting recommendation (since none is chosen yet)

- **Frontend:** Vercel or Netlify — static Vite build, trivial to deploy, generous free tier for pre-launch traffic.
- **Backend (Express + socket.io):** Render or Railway. Both support long-running Node processes with persistent WebSocket connections, which Vercel's serverless functions do not handle well — this matters once you consolidate onto one Express+socket.io process in Phase 2.
- **Database:** stay on MongoDB Atlas, but create a new database user with least-privilege scoped access (read/write to the `inkbook` database only, not an admin-equivalent account) as part of the Phase 0 credential rotation, and enable IP allowlisting.
- **Firebase:** keep for Storage; fix the auth pattern per Phase 2.

---

## Suggested sequencing

Phase 0 today. Phase 1 this week — it's the part where real damage is currently possible. Phase 2 the following 1-2 weeks, since it's what keeps Phase 1 fixed. Phase 3 (modernization, including the monorepo/TypeScript scaffolding that Phase 5 needs) can run in parallel with Phase 2 once the auth wrapper pattern is settled. Phase 4 (real payments) whenever you're ready to actually take deposits. Phase 5 (mobile) starts once Phase 0-2 are done and the monorepo shape from Phase 3 exists — don't build a mobile UI against an API that's still wide open. Phase 6 items — tests, CI, monitoring — should be stood up incrementally starting in Phase 1, not bolted on at the end; retrofitting tests onto already-migrated code (or two clients instead of one) is much more expensive than writing them alongside the fixes.

---

## Deployment log — issues found live at inkbooks.net (August 1, 2026)

The backend (Render) and frontend (Netlify) were both deployed earlier, but a chain of separate misconfigurations meant the site wasn't actually usable end-to-end. Found and fixed in this order:

1. **Netlify project visibility was Private.** Any non-team-member visitor got a "this project is private" wall regardless of deploy status. Set Production and Deploy Preview visibility to Public in Netlify's Project configuration.
2. **Netlify had no build step configured at all.** Base directory, build command, and publish directory were all blank, so Netlify was publishing the raw repo (`client/`, `server/` source folders) as static files instead of running `npm run build` and serving `client/build`. Fixed: base directory `client`, build command `npm run build`, publish directory `client/build`, plus a `CI=false` env var (Netlify sets `CI=true` by default, which makes `react-scripts build` fail on ESLint warnings that aren't actually build-breaking).
3. **No SPA fallback redirect.** Direct loads or refreshes of any client-side route (e.g. `/login`) 404'd, because Netlify had no rule telling it to serve `index.html` for unknown paths and let React Router handle them client-side. Added `client/public/_redirects` with `/* /index.html 200`.
4. **CORS origin was the wrong domain.** `server/utils/constants.js`'s `INKBOOKS_WEBAPP` constant (used for both Express/Apollo's `cors()` origin and socket.io's CORS origin) was set to `https://www.inkbooks.net`, but Netlify's Domain management shows `inkbooks.net` (no www) as the actual Primary domain — `www.inkbooks.net` redirects to it, not the other way around. Real visitors always land on the bare domain, so every GraphQL/socket.io request from the live frontend was being rejected by the browser's CORS check — confirmed live by running `fetch('https://api.inkbooks.net/', ...)` from the console at `https://inkbooks.net` and getting `TypeError: Failed to fetch`, the standard CORS-block signature, even though the API itself was healthy (direct requests to `api.inkbooks.net` returned 200). This was a full outage for anything requiring a real API call (login, register, everything) despite the page itself loading fine. Fixed by changing the constant to `https://inkbooks.net`.

**Takeaway:** "the deploy succeeded" and "the site works for a real visitor" turned out to be four separate claims here. Worth adding a real end-to-end smoke test (Phase 6) that loads the production URL in a real browser context and exercises one authenticated action, rather than relying on deploy-success webhooks alone.
