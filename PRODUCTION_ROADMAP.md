
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

### The tenancy rule: nobody reaches a shop they aren't assigned to

**Decided and implemented.** There is no global role. `Constants.ROLES.ADMIN` (1) survives as a
reserved number so existing role-1 rows don't silently become some other role, but it grants no
access to any shop's data — an account with role 1 and no `Staff` row sees nothing at all.

The rule lives in one file, `server/utils/shop-membership.js`, and every shop-scoped resolver
routes through it (`assertCanAccessShop`, `canManageArtist`, `canAccessConversation`). Roles still
exist and still answer a real question — *how much of their own shop* someone sees: `SHOP_ADMIN`
(10) sees the money, `SHOP_STAFF` (15) sees the schedule but not the books, `ARTIST` (20) sees
their own work. "Which shop" is never a role question, and a role comparison can never answer it.

**Why this was worth doing.** `user.role <= Constants.ROLES.SHOP_ADMIN` appeared ~50 times, and in
every case where it guarded shop-scoped data it meant "skip the shop check" — which for a shop
admin is exactly backwards. Any shop admin could read any other shop's revenue, client list,
booking inbox and private message threads by passing a different id. The first version of the fix
got `getShopAnalytics` backwards *in the very line under a comment warning about this*; the test
suite caught it.

**What this deliberately gives up.** Cross-shop platform analytics, and "log in as support and look
at the customer's data". If support access is ever needed, the mechanism is a real `Staff` row at
the shop being helped — time-boxed, revocable, visible to the shop owner — not a role that bypasses
`shop-membership.js`. A backend management tool would create and revoke that row; it does not need,
and should not get, its own privileged read path.

**Open, deliberately not bundled into this:** none of the list queries paginate. `getClients`,
`getProjects` and friends have no `.limit()`, which is unbounded for a large single shop regardless
of tenancy. That's a separate job with its own tests — removing the global role did not address it
and was never going to.

**Deleted rather than scoped:** `getUsers`, `getMessages`, `getConversations`. All three returned
every record of their kind on the platform, none had a caller in the client, and their only
possible caller was the global role that no longer exists. Scoping them would have meant inventing
a feature to justify keeping a query that returns every email address in the system.

**Deletes are gone; archiving replaced them.** All eight `delete*` mutations were removed except
`deleteAppointment`, which survives because two real buttons call it (the calendar event modal and
the session view) and clearing an empty scheduled slot is legitimate - it now refuses any
appointment that is completed, has money recorded, holds or has consumed a deposit, or has a shop
cut in flight, pointing the caller at the `cancelled`/`no_show` statuses instead.

Removing a person is `archiveArtist`/`archiveStaff`/`archiveClient` (each with an `unarchive`
counterpart). Status 4 = ARCHIVED across all three, unset reads as active so pre-existing rows
aren't hidden. The rule that matters, stated in `utils/archiving.js` and enforced by
`test/integration/archiving.test.js`: **archiving never touches history.** An archived artist's
completed sessions still count toward shop and artist revenue and still render on the calendar. A
shop's Q3 total must not move because somebody left - that failure would look like a plausible
number rather than an error, which is why it gets its own test rather than a comment.

Deleting rows was worse than it looked: `Project.client` is nullable, so a deleted client left
projects silently pointing at nothing; the `User` row outlived its profile, producing a login with
a role and no profile (the exact bug that made the old `platformadmin` unable to log in); and
appointments kept totals, shop cuts and Square invoice ids with nobody attached.

Still open: a redaction action for GDPR/CCPA erasure requests, which must null the PII in place and
keep the financial row - tax retention runs the other way, so deletion is the wrong tool even
there.

**Coverage:** `server/test/integration/shopIsolation.test.js` is the boundary test — two complete
shops, and shop B's admin (a real, legitimate user) attempting every read and write against shop A
one surface at a time, plus the counterweight cases proving a shop admin still has full reach
inside their own shop.

### Artist-centric tenancy: membership is ArtistShopConnection, full stop — DONE

**The half-finished state, and what it cost.** `Artist.shopId` was the original "which shop does
this artist work at" foreign key. `ArtistShopConnection` replaced it — but only for authorization.
The directories (`getArtists`, `getArtistsByShop`, `getUserTagColors`) and the `Artist.shop` field
resolver were never moved and went on reading the old field. Two answers to one question, agreeing
only because `createArtistAccount` and the seed happened to write both.

`connectArtistToShop` — the mutation that exists specifically to connect an artist to a shop —
writes only the connection. So an artist connected that way was authorized at the shop, missing
from its directory, and had a null `Artist.shop`, which the entire client reads as "independent
artist". The client sets `Appointment.shopId` from that field (`UpdateEventDialog.jsx`,
`AppointmentWizard.jsx`), so **every appointment they booked was written with no shop: no shop cut
computed, and the session absent from the shop's revenue.** Silently, with nothing erroring.

**Now:** `utils/artist-shop.js` is the single place that answers it. `Artist.shop` and
`Artist.shopId` are field resolvers over the active connection; the stored `Artist.shopId` is
deprecated, no longer read or written, and left on the model only so
`scripts/backfill-artist-connections.js` has something to read.

**One active connection, enforced on the write.** An artist works at one shop at a time — a
product decision, and enforcing it is what makes "which shop" answerable with no precedence rule.
Connecting to a new shop disconnects the old one, and `connectArtistToShop` refuses unless
`confirmTransfer: true`, returning the name of the shop being left in `extensions.transfer` so the
UI can name it. Safe by default: a caller that knows nothing about the flag can never silently move
an artist off their shop. Settings.jsx has a "Move to a Different Shop" path and a confirmation
naming both shops — without that path the guard would only ever be reachable by an admin.

The realistic way an artist ends up connected twice isn't a guest spot, it's mundane: they move
shops and nobody remembers to disconnect them from the old one. Connecting somewhere new is now
exactly that record.

**Before deploying:** run `node scripts/backfill-artist-connections.js` (report), then `--apply`.
Any artist whose membership exists only as a stored `shopId` becomes independent without it.

**Deliberately not built** (and not wanted per the shop-context-switcher decision): concurrent
multi-shop artists, invite-link shop bootstrapping, the searchable shop directory, and
request/accept connection flows. An artist genuinely working at two shops uses InkBooks as an
independent.

**Known cost:** `Artist.shop`/`shopId` are now per-artist connection lookups, so a directory of N
artists does N+1 queries. Fine at current list sizes; the fix when it matters is a DataLoader, and
it belongs with pagination rather than on its own.

### Artist-centric tenancy model — original design notes (superseded in part by the above)

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
     - **Full cycle verified live end-to-end (August 1-2, 2026).** Real Sandbox Application ID/Secret configured in Render, a Sandbox Test Account launched from the Square Developer Console (Square keeps these dormant until launched once - the first attempt failed with "first launch the seller test account from the Developer Console," which is Square's own gate, not a bug here), and "Connect with Square" completed successfully end-to-end from the live production shop settings page. `createShopCutInvoice` was then confirmed against the live Square Sandbox API for both payment methods, with the gross-up math checked exactly against the real invoice amounts Square returned: a $1.00 ACH invoice came back as $1.02 (`ceil(100/0.99)`), and a $1.00 card invoice came back as $1.35 (`ceil((100+30)/0.967)`). The webhook side was verified in two passes: first, a synthetic `invoice.payment_made` event was constructed and correctly HMAC-signed with the real production `SQUARE_WEBHOOK_SIGNATURE_KEY` and POSTed directly to `/webhooks/square`, confirming the signature check and the ledger-update logic both work against the real key - this caught nothing broken but also didn't prove Square's real payload matches what the handler expects. Second, a real sandbox invoice was paid manually through Square's own hosted payment page (card `4111 1111 1111 1111`) - this required a human click, since Square's Web Payments SDK renders the MM/YY/CVV/ZIP fields in a security-hardened iframe that resisted every scripted-input method tried. That real payment produced a real, Square-originated webhook, which the server correctly verified and used to flip the appointment's `shopCutStatus` to `paid` - confirmed via a follow-up query. This is now a fully verified sandbox cycle: connect → invoice (both payment methods) → real payment → real webhook → ledger update. The test used an existing production appointment temporarily (`shopCutAmount`/`shopCutStatus` set, then reset back to `null`/`unpaid` afterward) - no lasting data changes. One prerequisite worth calling out for anyone repeating this: a Webhook Subscription must exist in the Square Developer Console (Sandbox), separate from the OAuth app itself, pointed at `SQUARE_WEBHOOK_NOTIFICATION_URL` and subscribed to `invoice.payment_made`, with its signature key matching `SQUARE_WEBHOOK_SIGNATURE_KEY` - without it Square accepts the payment but never calls the endpoint.
  2. **Manual mark-paid/confirm (cash or any off-platform payment), dual-control by design.** The artist calls `markShopCutPaidManually`, which does **not** flip the ledger straight to `paid` - it sets `pending_confirmation` and emails the shop (`Shop.email`) that a claim needs review. The shop must independently call `confirmShopCutPaid` (shop-admin-or-better only) to actually mark it `paid` - the artist's own unverified claim is never sufficient on its own, since this is exactly the kind of self-report a shop needs to be able to dispute. Pending items are also visible in-app via `getPendingShopCutConfirmations(shopId)`, not just the email.

**Data model:** `Appointment.shopCutStatus` is now an enum (`none`/`unpaid`/`invoice_sent`/`pending_confirmation`/`paid`, plus the pre-existing `received` kept for backward compatibility) defaulting to `none`, no longer `required: true`. New fields: `shopCutAmount`, `shopCutPaymentMethod` (`square_invoice`/`manual`), `shopCutSquareInvoiceId`, `shopCutMarkedPaidBy`/`At`, `shopCutConfirmedBy`/`At`. `Shop` gained Square connection fields (`squareConnected`, `squareMerchantId`, `squareLocationId`, `squareAccessTokenEncrypted`/`squareRefreshTokenEncrypted` - AES-256-GCM via `utils/token-crypto.js`, never stored in plaintext, never exposed over GraphQL). `Appointment.shopId` in the GraphQL type was also changed from `ID!` to `ID` (nullable) - it was already optional at the Mongoose layer for independent artists, but the schema hadn't been fixed to match until now; this was a latent bug that would have broken serialization for any shop-less appointment.

**New GraphQL surface:** `getSquareAuthorizationUrl(shopId)`, `getPendingShopCutConfirmations(shopId)`, `createShopCutInvoice`, `markShopCutPaidManually`, `confirmShopCutPaid`, `disconnectShopSquare`. Role gates follow existing conventions exactly - `createShopCutInvoice`/`markShopCutPaidManually` check the caller is the appointment's own artist inline (same pattern as `updateAppointment`'s ownership check); `confirmShopCutPaid`/`getSquareAuthorizationUrl`/`getPendingShopCutConfirmations`/`disconnectShopSquare` are shop-admin-or-better via `withAuth`'s `minRole`, with the same pre-existing, documented gap as `getShopArtistConnections` (Shop has no owning-User field yet, so this checks "is a shop-admin-or-better at all," not "is the admin of *this* shop").

Verified: encryption round-trip + tamper rejection + missing-key rejection (`utils/token-crypto.js`), the gross-up formulas and webhook HMAC signature verification against hand-computed values, and all eight new/changed GraphQL operations run through `ApolloServer.executeOperation()` against the live schema - including confirming the `SHOP_ADMIN` role gate correctly rejects an `ARTIST`-role caller on `confirmShopCutPaid`/`getSquareAuthorizationUrl` before ever reaching the database.

**Required env vars:** `SQUARE_ENVIRONMENT`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_OAUTH_REDIRECT_URL`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_NOTIFICATION_URL`, `TOKEN_ENCRYPTION_KEY` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` - use a different key in dev vs. production, keep it secret). All six Square vars plus `TOKEN_ENCRYPTION_KEY` are set in Render's dashboard for production (Sandbox credentials as of August 2, 2026 - the full cycle is now verified, see above, so flipping `SQUARE_ENVIRONMENT` to `production` is unblocked whenever you're ready; that still requires applying for Square production access and swapping in real production Application ID/Secret, which is a separate step from anything tested here).

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
| `mongoose` | 6.2.0 | 9.9.1 | ✅ Done and verified (August 2, 2026) — bumped directly to 9.x, see below. |
| `graphql` | 16.3.0 → 16.14.2 | 16.14.2 (npm's actual `latest` dist-tag) | ✅ Done (August 3, 2026) — a floor-version bookkeeping fix, not a real change: the `^16.3.0` range had already resolved to 16.14.2 in both `client/` and `server/`'s installed `node_modules`/lockfiles (confirmed by reading the installed `package.json`), so the package.json string was just stale, not the actual running code. |
| `react` | 17.0.2 | 19.2.8 | ✅ Done and verified (August 2, 2026) — see below. |
| `react-router-dom` | 6.2.1 → 6.30.4 | 7.16.0 (a new major, not a minor bump - see note) | ✅ Bumped within v6 (August 3, 2026), **not** to v7. Correction to this table's own prior framing: v7 (Remix's routing APIs merged into React Router) has been the actual current major for a while now - "6.x is current major" above was wrong when written. Confirmed directly against the npm registry that 6.30.4 is the last real 6.x release and is what's already installed here (same floor-was-stale situation as `graphql` above - `^6.2.1` had already resolved to 6.30.4). Deliberately did **not** jump to v7: that's a real migration (changed data-loading/route-config APIs), not a same-major patch bump, and doesn't belong bundled into a "minor version bump" task - it needs its own scoped pass if/when it's worth doing. |
| `@mui/material` | 5.2.8 | 9.2.0 | ✅ Done and verified (August 2, 2026) — see below. `@mui/styles` turned out to be unused (confirmed via full-codebase search), so it was removed outright rather than migrated. |
| `react-scripts` (CRA) | 5.0.0 | — (Create React App is unmaintained) | ✅ Done and verified (August 2, 2026) — migrated to Vite 8.2.0. |

**Vite migration — done, verified with a real production build.** `react-scripts`/CRA is fully removed: `package.json` scripts now call `vite`/`vite build`/`vite preview`, `vite.config.js` was added (just the React plugin - see below on why an initial esbuild-loader approach was abandoned), `public/index.html` moved to `client/index.html` (Vite's required location) with `%PUBLIC_URL%` replaced by plain root-relative paths and a real `<script type="module" src="/src/index.jsx">` entry tag, and the 5 places using `process.env.NODE_ENV` (`index.js`, `SocketProvider.js`, `Projects.js` ×2, `BookingRequest.js`) were swapped to `import.meta.env.MODE` - Vite doesn't polyfill Node's `process.env` at all, so these would have crashed on load otherwise. Also found and fixed a real interop break along the way: `client/src/config.js` used `module.exports = {...}` while being consumed via ES named imports (`import { FIREBASE }`/`import { SQUARE }`) - Webpack silently interops CJS/ESM like this, Vite's dev server does not for local source files, so this would have thrown "module is not defined" the moment `firebase.js`/`squareConfig.js` loaded. Converted to real `export const FIREBASE`/`export const SQUARE`. Removed now-dead dependencies: `react-scripts`, `process` (unused CRA polyfill, never actually imported), `web-vitals`, and `@testing-library/*` (no test files exist anywhere in the client, so nothing was actually testing anything - worth building real tests before this matters, see Phase 5).

**The real gotcha: JSX living in `.js` files.** This codebase writes JSX throughout in plain `.js` files (a valid CRA/webpack pattern), which first surfaced as a crash the moment `npm run dev` actually ran: `vite:oxc` (this Vite version's Rust-based transform) rejected `<ApolloProvider ...>` in `index.js` with "Unexpected JSX expression... JSX syntax is disabled." An initial fix attempt added an `esbuild.loader`/`optimizeDeps.esbuildOptions.loader` override in `vite.config.js` targeting `.js` files - this was the standard older-Vite fix, but this version's `oxc` transform doesn't consult those options at all, so it didn't work. Rather than keep guessing at config flags for an internal parser with version-specific behavior, every `.js` file that actually contains JSX was renamed to `.jsx` - 91 of the 112 files in `client/src` (the other 21 - services, utils, constants, firebase helpers - have no JSX and were left alone). This is the standard, version-proof fix: every JS toolchain auto-detects JSX correctly from the `.jsx` extension with zero config. Confirmed first that no import statement anywhere in the codebase used an explicit `.js` extension, so the rename needed no import updates - except `index.html`'s own entry script tag, which had to be updated by hand from `/src/index.js` to `/src/index.jsx` since `index.js` itself was one of the 91 renamed files.

**Verified for real:** `npm run build` completed and produced `client/dist/` - hashed `assets/index-*.js` (1.75MB) and `.css`, with `_redirects`/`favicon.ico`/`manifest.json`/`robots.txt` correctly copied over from `public/`, exactly as CRA copied `public/` into `build/`. One real, worth-noting number: that 1.75MB JS bundle is a single chunk with no code-splitting (MUI + Firebase + Apollo + moment + socket.io all landing together) - not a regression from CRA, just a real opportunity for route-based `React.lazy` splitting later, not a blocker now. The required Netlify dashboard change (not yet done, since Netlify is dashboard-configured with no `netlify.toml` in the repo): Publish directory `client/build` → `client/dist`. Base directory (`client`) and Build command (`npm run build`) stay exactly as they were (see the Deployment log above for the values these were originally set to).

Original recommended sequencing, for reference - all four steps are now done:

1. ~~Vite migration first (isolated, mostly config/tooling, doesn't touch app logic).~~ Done and verified above.
2. ~~`@apollo/server` v5 + Express consolidation.~~ Done in Phase 2.
3. ~~Mongoose major-version bump (staged 6→7→8→9).~~ Done - see below for why this ended up as one direct bump instead of staged.
4. ~~React 17→18→19, then MUI 5→9.~~ Done - see below.

### Mongoose 6→9 — done, verified

Audited every model and resolver in `server/` first: no `.remove()`/`.count()`/`execPopulate()`, no `pre`/`post` hooks, no discriminators, no custom `toJSON`/`toObject` transforms, no explicit `mongodb` driver pin anywhere. Given that, bumped directly to `mongoose@9.6.3` (resolved `9.9.1`) instead of staging through 7 and 8 - the staged plan above was a hedge against unknown breaking changes the audit didn't find any of in this codebase. Removed the one dead option in the `connect()` call (`useNewUrlParser: true` - a no-op MongoDB driver-3.x option, ignored since Mongoose 6's driver 4).

Verified schema-compile-time (no DB connection needed, since Atlas's SRV DNS lookup is blocked from the sandbox this work was done in): all 11 real models compile cleanly under `mongoose@9.9.1`, `IBImage`/`IBNote` (schema-only exports used as embedded subdocuments, not standalone collections - easy to mistake for a bug at first glance, they're not) still work, and `ApolloServer.start()` succeeds against the full resolver map. Live DB connectivity against the real Atlas cluster was confirmed separately by the user running the server directly.

### React 17→19 + MUI 5→9 — done, verified with a real build

Bumped both together in one `npm install` rather than staging React ahead of MUI - MUI 5.x's package metadata doesn't declare React 19 peer support, so bumping React alone first would have risked the same kind of `ERESOLVE` conflict hit during the Vite migration. A clean reinstall (`rm -rf node_modules package-lock.json && npm install`) was done first for the same reason - stale lockfile entries were the actual root cause of that earlier conflict, not anything version-specific.

**Audit-driven, not blind bumping.** Checked actual usage before touching versions: `@mui/styles`/`makeStyles`/`withStyles` had zero real usage anywhere (only in commented-out import lines) - removed entirely rather than migrated, since there was nothing to migrate. Same for `@mui/lab` - every import from it was already commented out (the app had already migrated to `@mui/x-date-pickers` for its date pickers at some earlier point, just left the dead commented lines behind). `ReactDOM.render` was the only React-18-breaking pattern anywhere in the client - converted to `createRoot` in `index.jsx`. Two files (`Month.jsx`, `SmallCalendar.jsx`) used the old `<Grid item xs={1}>` API (replaced by a `size` prop starting MUI 6) and an `experimentalStyled` import (a dead alpha-era alias for `styled()`) - both fixed.

**A real, unrelated vulnerability surfaced during the install: `simple-react-lightbox`.** This package (wrapping the whole app in `index.jsx`, plus the image lightbox/zoom feature in `IBImagesList.jsx`) pins its peer dependency to `react@"^17.0.2"` exactly and hasn't shipped a release past `3.6.9-0` - effectively abandoned. npm force-installed it anyway ("overriding peer dependency"), which also pulled in a new critical vulnerability from its own outdated dependencies (`framer-motion`/`nano-css`). User chose to replace it rather than accept the risk or drop the feature. Replaced with `yet-another-react-lightbox` (actively maintained, no React version pin) - a real architectural rewrite of `IBImagesList.jsx`, not a drop-in swap: the old `SRLWrapper` declaratively scanned the DOM for `<img>` tags and built the lightbox automatically; the new one needs an explicit `slides` array plus controlled open/index state, with each thumbnail's `onClick` setting that index. The app-wide `<SimpleReactLightbox>` provider in `index.jsx` was removed entirely - the replacement needs no provider.

**Two real rounds of build errors, both root-caused and fixed - not worked around:**
1. A syntax mistake introduced while fixing the `Grid` API in `Month.jsx` - a JSX-style comment (`{/* ... */}`) ended up in a plain JavaScript expression position (inside a `.map()` callback body, before any JSX element), which is only valid syntax between actual JSX children. Moved the comment to a valid position.
2. Three `@mui/icons-material` icons - `ErrorOutline`, `MailOutline`, `CheckCircleOutline` - had their bare/default-style export names removed in the current major version, while their style-suffixed siblings (`ErrorOutlined`, `MailOutlined`, `CheckCircleOutlined`, etc.) remained. Fixed all affected files, then cross-checked all 41 real icon imports across the entire client against the actual installed export list (stripping out commented-out dead imports first, which produced false positives on the first pass) to confirm nothing else was affected.

Also bumped `@date-io/moment` (was years-stale at `^2.16.1` while `@mui/x-date-pickers` jumped to `9.10.1`) to avoid a latent date-formatting mismatch that a build wouldn't necessarily catch.

**Verified for real:** `npm run build` completed and produced `client/dist/` - `assets/index-*.js` came in at 1.64MB, slightly smaller than the Vite-migration baseline (1.75MB) despite everything else added, likely from dropping `@mui/styles`/`@mui/lab`/`simple-react-lightbox`.

**Was not covered by any of this at the time it was written:** there was no test suite (client or server) anywhere in this project. Every verification above was real - actual builds, actual schema checks, actual manual confirmation - but none of it was automated regression coverage. This gap is now closed - see Phase 6's "Test suite" section below - built immediately after this phase specifically because three major-version bumps had landed back to back with nothing automated behind them.

**Revised call on TypeScript:** the original version of this section said to skip it, on the logic that it's a parallel investment that doesn't block a web-only production launch. That logic no longer holds now that a mobile app is in scope (Phase 6) — once two clients need to consume the same GraphQL API and stay in lockstep with schema changes, TypeScript plus schema-driven codegen stops being a nice-to-have and becomes the actual mechanism that prevents the two from drifting apart. Introduce it as part of the Phase 6 monorepo setup below, not bolted on twice later.

---

## Phase 4 — Payments

**Status as of August 2, 2026: built and wired up end-to-end, sandbox only. Not yet production-ready — see the go-live checklist below before touching real credentials.**

The original finding here (`squareConfig.js` posting to a `http://localhost:4000/process-payment` that no route anywhere ever handled, built against Square's own `SqPaymentForm` API, which Square had already retired) is fixed. What actually shipped:

**Server side:**
- `server/utils/square.js` gained `createSandboxPayment({sourceId, amountCents, idempotencyKey, note})` — a plain `fetch` POST to Square's sandbox `/v2/payments` REST endpoint (`Square-Version: 2026-07-15`), consistent with this file's existing philosophy of not adding the `square` npm SDK as a dependency. Deliberately independent of the `SQUARE_ENVIRONMENT` env var used by the shop-cut-ledger OAuth/Invoices flow above — the sandbox host (`https://connect.squareupsandbox.com`) is hardcoded, so changing that setting for the other feature can never accidentally point this one at real money.
- `server/utils/validation.js` gained `processSquarePaymentInputSchema` (zod: `sourceId` non-empty string, `amountCents` positive integer, `note` optional).
- New route: `server/routes/squarePayments.js` — `POST /square/process-payment`, authenticated (`checkAuth`, any logged-in user), rate-limited (10/min per caller IP via the existing `utils/rate-limit.js`, same pattern as the public booking-request routes), zod-validated, wired into `server/index.js` alongside the existing `squareOAuthRouter`/`squareWebhooksRouter`.
- `server/test/integration/squarePayments.test.js` covers 401 (no auth), 400 (missing/invalid fields), 200 (success + exact Square API call shape asserted via a mocked `global.fetch`), 402 (Square decline passthrough), 500 (missing `SQUARE_SANDBOX_ACCESS_TOKEN`), and 429 (rate limit).

**Client side:**
- `client/src/components/IBSquarePayments/loadSquareSdk.js` (new) — injects Square's current Web Payments SDK script (`https://sandbox.web.squarecdn.com/v1/square.js`) on demand and resolves `window.Square`, memoized so repeated opens of the payment form reuse one load.
- `client/src/components/IBSquarePayments/squareConfig.js` — rewritten from the old `SqPaymentForm`-style config object to just `{applicationId, locationId}` sourced from `client/src/config.js`'s `SQUARE.SANDBOX` block.
- `client/src/components/IBSquarePayments/IBSquarePaymentForm.jsx` — fully rebuilt against `Square.payments()` → `payments.card()` → `card.attach()`/`card.tokenize()`, then an authenticated `fetch` (using `useAuth()`'s `user.accessToken`, the same field Apollo's own `authLink` reads) to the new server route.
- `client/src/config.js` — dropped the dead `PROCESS_URL` entries; `SQUARE.PRODUCTION` still deliberately points at the same sandbox app/location IDs as `SQUARE.SANDBOX` (commented, so this isn't mistaken for real prod config later).
- `client/src/pages/projects/Project.jsx` — added a "Pay Deposit" button next to the `depositAmount` field (disabled when there's no deposit amount saved), which opens the existing global `IBModal` (`setModal({isOpen, title, content})`) with `IBSquarePaymentForm`, wired to the existing `AuthContext` alert system on success/failure.

**Verification caveat:** this sandbox environment cannot execute the real Vitest suite for either `client/` or `server/` (`Cannot find module @rollup/rollup-linux-x64-gnu`, and installing it is blocked by a `403` from the npm registry in this environment) — the same limitation noted in the Phase 6 test-suite entry below. `squarePayments.test.js` was syntax-checked (`node --check`) but not run via Vitest here. As stronger-than-syntax verification, the actual route logic was exercised directly: a real Express server was started in this sandbox with the route mounted and `global.fetch` mocked, and real HTTP requests were sent against it — confirming the 401/400/402/200 paths all behave exactly as the test file asserts, including the outgoing call to Square (`https://connect.squareupsandbox.com/v2/payments`, correct headers, correct body shape). **Run `npm test` in `server/` yourself to get an authoritative pass/fail**, and manually click through a real "Pay Deposit" flow in the browser once you've filled in the two env vars below — that manual click-through has not been done by me at all, since it requires a real Square sandbox account and a browser.

**Two things you need to do before this works end-to-end:**
1. Get a Sandbox Access Token and Location ID from `developer.squareup.com/apps` → your app → Sandbox tab, and set `SQUARE_SANDBOX_ACCESS_TOKEN`/`SQUARE_SANDBOX_LOCATION_ID` in `server/.env.development` (and, if you want to test this on the live Render deploy, in Render's env var dashboard too — placeholders with instructions are already in both `.env.development` and `.env.production`).
2. Restart the server after setting those, then open a project with a deposit amount saved and click "Pay Deposit." Square publishes sandbox test card numbers (e.g. a Visa ending in specific test digits) in their docs for exercising both approve and decline paths — use one of those, not a real card.

**Go-live checklist (do not skip any of this before switching to real production credentials):**
1. Apply for Square production access and get real production credentials.
2. Remove the hardcoded sandbox host from `createSandboxPayment()`/`loadSquareSdk.js` and make both environment-aware (mirroring how the OAuth flow already reads `SQUARE_ENVIRONMENT`) — right now this is intentionally impossible to flip by accident, which means it also needs a deliberate code change, not just an env var change, to go live.
3. Test the full production flow end-to-end with a real (small-dollar) card charge before relying on it for actual client deposits.
4. You're using Square's hosted Web Payments SDK card field, which keeps raw card numbers off your server entirely (they go straight from the browser to Square, you only ever see a token) — this keeps you out of most PCI DSS scope; don't change that.

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

### Test suite — done, both client and server, run for real and passing (August 2, 2026)

Both suites use Vitest, not Jest - it pairs naturally with the client's Vite toolchain (one config-loading mechanism instead of two) and works identically well for the Node server, so this is one toolchain instead of two rather than a Jest-for-server/Vitest-for-client split.

**Server (`server/test/`):** `vitest.config.js` runs everything against `mongodb-memory-server` (a real, ephemeral MongoDB binary, not mocks) via a shared `globalSetup.js`; `test/setup.js` connects Mongoose once and clears every collection `afterEach`. `fileParallelism: false` is deliberate - all test files share one in-memory mongod, so parallel files would race each other's cleanup. Three helpers do the heavy lifting: `test/helpers/testServer.js` builds a real `ApolloServer` from the app's actual `typeDefs`/`resolvers` (no separate test schema), `test/helpers/auth.js` signs JWTs matching `generateToken()` exactly, and `test/helpers/factories.js` builds valid Mongoose fixtures direct-to-DB (bypassing register/login for speed - `bcrypt` hashing is slow and most tests don't care about it specifically).

Coverage:
- `test/unit/`: `square.js`'s fee gross-up math and webhook signature verification, `token-crypto.js`'s AES-GCM round-trip/tamper-rejection, `rate-limit.js`'s window/reset behavior, and `validation.js`'s zod schemas - including an explicit regression test locking in the Phase 1 `register()` role-escalation fix.
- `test/integration/auth.test.js`: register/login end-to-end (including the same role-escalation regression test at the full-mutation level, not just the schema level), and `withAuth`'s behavior across missing/malformed/expired/wrong-secret tokens and a real `minRole` gate.
- `test/integration/appointments.test.js`: the Phase 2 shopId tenancy/immutability fix specifically - connected vs. unconnected artists, first-time attribution, the "can never change or remove shopId once set" rule, and ownership-based update/delete.
- `test/integration/projects.test.js` / `crud.test.js`: role-gated CRUD across Project/Client/Staff/Artist/Shop. **Found and fixed a real bug while writing these:** `createStaff`'s GraphQL schema was missing `shopId`/`title` entirely, even though the resolver already destructured both and `Staff.shopId` is `required: true` in Mongoose - this mutation could never have succeeded end-to-end before this fix. See the comment on `createStaff` in `graphql/typeDefs.js` and the regression test in `test/integration/crud.test.js`.
- `test/integration/shopCutLedger.test.js`: the full dual-control manual-pay flow (`markShopCutPaidManually` → `confirmShopCutPaid`, proving the artist's own claim never auto-flips to `paid`) and `createShopCutInvoice`'s preconditions, with `square.createAndPublishShopCutInvoice` mocked (it makes real HTTPS calls to Square - no reason a test should need network access or real credentials for this).
- `test/integration/squareWebhook.test.js`: the one part of this feature not reachable through GraphQL at all - a real `supertest` HTTP request against the actual Express router, proving signature verification and the `invoice.payment_made` status transition.
- `test/integration/bookingRequests.test.js`: the public/guest-token flow - rate limiting on both public endpoints, and the security-critical property that a guest's magic link stops working the instant its underlying account sets a real password.

**Client (`client/src/`):** Vitest reads its config straight out of `vite.config.js` (a `test` key that `vite build`/`vite dev` simply ignore), running in `jsdom` with React Testing Library + `@testing-library/user-event`. Covers `CacheService.js` (its unusual double-`JSON.parse` contract, documented rather than "fixed" - fixing it would require a matching change in `context/auth.jsx`, out of scope here), `context/auth.jsx` (login/logout/update state transitions, Firebase custom-token sign-in, all with Firebase itself mocked so tests don't need real credentials or network access), and `Login.jsx`/`Register.jsx` (success paths, the client-side password-mismatch guard, and server-side validation errors rendering correctly) via `@apollo/client/testing`'s `MockedProvider`.

**Known gap at the time this pass was written, since closed:** `CreateEventDialog`/`UpdateEventDialog` (the calendar appointment forms) had no tests yet - this pass prioritized auth and the two highest-stakes money-adjacent flows (shop-cut ledger, booking requests) given the time available. `CreateEventDialog.test.jsx`/`UpdateEventDialog.test.jsx` were added afterward (see below). The remaining `IB*` form input components (`IBInput`, `IBMultilineInput`, `IBEmailField`, `IBPasswordField`, `IBButton`, `IBSubmitButton`, `IBSelect`, `IBProjectPalettesSelect`, `IBProjectsByArtistSelect`, `IBAvatar`, `IBDatePicker`, `IBDateTimePicker`) are now tested too (August 2, 2026) - see the entry below for what running these for real against the actual suite turned up.

**Run for real and passing (August 2, 2026).** `npm install` + `npm test` run by the user on their own machine in both `server/` and `client/` - both suites now pass in full (server: 125/125; client: 17/17). Getting there surfaced real issues a static read-through hadn't caught, all fixed:
- Vitest 3.x's package is ESM-only - every test file's `require('vitest')` had to be removed in favor of the pre-existing `globals: true` config.
- A systematic test-writing mistake across ~15 assertions: GraphQL's null-propagation rule means a non-null (`Type!`) mutation's error nulls out the entire `data` object, not just `data.fieldName` - fixed everywhere it was written wrong (`auth`/`projects`/`crud`/`bookingRequests`/`shopCutLedger` test files).
- Two real, previously-undiscovered production bugs, both caught by the tests doing their job: `convertBookingRequest` was passing a raw Mongoose `ObjectId` into a zod string schema (fixed with `.toString()`); `register()` never created a `Client` record for self-registered users, which would have crashed `login()` on every self-registered user's second real login attempt (fixed).
- Client-side: React 19's automatic JSX runtime (relied on throughout the app with zero explicit `React` imports) isn't picked up the same way by Vitest's test-execution transform - `Login.jsx`/`Register.jsx` needed an explicit `import React from "react"` since they're the two components actually rendered under a test. An `esbuild.jsx: 'automatic'` config attempt didn't fix this (`@vitejs/plugin-react` transforms JSX via Babel, not esbuild) - reverted in favor of the direct import.
- Also cleaned up: `@apollo/client` 3.14.1's `MockedProvider` deprecation warning on `addTypename={false}` (removed, with matching `__typename` fields added to the affected mocks).

**Run for real again after the twelve new `IB*` component test files were added (August 3, 2026) - took two passes to actually fix, both documented here rather than just the final answer.** Same lesson as August 2 - this sandbox can't execute Vitest at all (`Cannot find module @rollup/rollup-linux-x64-gnu`, blocked npm install), so these test files had only ever been syntax-checked, never run, until the user ran them for real.

First run: 12 failed / 50 passed. Two real, distinct bugs:
- **`IBEmailField.jsx`/`IBPasswordField.jsx` threw `ReferenceError: React is not defined`** under Vitest - the exact same automatic-JSX-runtime-vs-Vitest-transform gap noted above for `Login.jsx`/`Register.jsx` (and already worked around in `IBDatePicker.jsx`/`IBDateTimePicker.jsx`), just not yet hit for these two, since nothing had ever actually mounted them in a test before. Fixed with the same explicit `import React from 'react'`.
- **`IBDateTimePicker.test.jsx` failed both tests with `TestingLibraryElementError: Found multiple elements with the text of: Appointment Date/Time`** (from `getByLabelText`) - not a component bug. MUI X's Date/Time pickers (v7+) render an "accessible field" DOM structure: a visually-hidden, `aria-hidden`, form-submittable `<input>` sitting alongside a `role="group"` container of editable sections (day/month/year/etc.), both associated with the same visible `<label>`, which is what makes a plain `getByLabelText()` ambiguous. The first fix attempt, based on reading MUI X's own docs rather than the actual rendered DOM, was `getByRole("textbox", { hidden: true, name: label })` - reasonable-sounding, but wrong.

The pasted output was truncated both times (only 3 of 5, then 3 of 4, failing files shown in detail) - each round only fixed what was visible, and re-running surfaced the next layer:

Second run, after the first fix: 9 failed / 53 passed - the "fixed" `getByRole` query itself failed, with `Unable to find an element with the role "textbox" and name "Appointment Date/Time"`. The full DOM dump in the failure output showed why: the hidden `<input>`'s computed accessible **name is always `""`**, even though its `id`/the label's `for` attribute pair them up - Testing Library's underlying `dom-accessibility-api` excludes `aria-hidden` nodes from accessible-name computation entirely, regardless of label association. `{ hidden: true }` makes a hidden element discoverable by role at all, but doesn't give it back a name. Corrected to `screen.getByRole("textbox", { hidden: true })` with no `name` filter, in both `IBDateTimePicker.test.jsx` and `IBDatePicker.test.jsx` - there's only one `textbox`-role element in either render, so dropping the name filter resolves the ambiguity without needing one.

Same run also surfaced a second, unrelated bug in `IBPasswordField.test.jsx`: `Unable to find a label with the text of: password`. `IBPasswordField` defaults `required` to `true`, and MUI renders the required-field asterisk as an extra child inside the `<label>` element - so its real text content is `"password *"`, not exactly `"password"`, and an exact-string `getByLabelText("password")` throws. Fixed by switching to a regex, `getByLabelText(/password/i)` (substring match, unaffected by the asterisk) - the same approach `IBEmailField.test.jsx` already used for its own required field, which is why that one never hit this.

Third run (full output this time, 4 failed / 58 passed): two more causes, one of them a real, previously-shipped production bug rather than a test-only problem.

- **`IBButton.test.jsx` (3 tests): the same `ReferenceError: React is not defined`** pattern, this time from JSX in a default parameter value (`endIcon = <Send />`), evaluated the moment `IBButton` renders with no props. Fixed the same way, explicit `import React from 'react'`. (This component is otherwise unused dead code - see its test file's own note.)

- **`IBPasswordField.test.jsx`'s remaining test: `Unable to find an accessible element with the role "button" and name /toggle password visibility/i` - "There are no accessible roles."** Not a test bug at all - the show/hide toggle button was never in the DOM to find. Root cause, confirmed by reading the installed `TextField.js`: MUI v9's `TextField` no longer destructures the legacy top-level `InputProps`/`inputProps` props *at all* (neither name appears anywhere in the file) - both were fully replaced by `slotProps.input`/`slotProps.htmlInput` as part of the same v5→v9 migration already responsible for the `Avatar.imgProps` and date-picker `renderInput` bugs found earlier this session. `IBPasswordField.jsx` was still using the old names, which meant **the password visibility toggle button has never actually rendered in the live app since the MUI v9 bump** - confirmed conclusively in the failure output's own DOM dump, which showed `InputProps` had landed as a literal, meaningless `inputprops="[object Object]"` HTML attribute on the outer `<div>` (React's fallback for an unrecognized prop passed to a DOM element), and `inputProps={{ minLength: 6 }}`'s client-side password-length validation was silently gone too. Fixed by moving both to `slotProps={{ input: { endAdornment: ... }, htmlInput: { minLength: 6 } }}`.

  **Swept for the same pattern elsewhere and found one more, lower-severity instance:** `ibCalendar/Sidebar.jsx`'s artist-filter `Checkbox` used `inputProps={{ "aria-labelledby": labelId }}` - confirmed via the installed `SwitchBase.js` (Checkbox's base implementation) that this legacy prop is equally dead there. The checkbox itself still works fully; the only loss was the `aria-labelledby` link between the input and its list-item label (a screen-reader accessibility gap, not a functional break). Fixed the same way, `slotProps={{ input: { "aria-labelledby": labelId } }}`. A third `inputProps` usage, in `IBImagesUploadForm.jsx` on a plain `<Input>` (not `TextField`/`Checkbox`), was checked and confirmed still fine as-is - `Input` never explicitly destructures `inputProps` either, but unlike `TextField`/`SwitchBase` it forwards its unrecognized props straight through to the underlying `InputBase`, which still fully supports the legacy prop name directly.

Fourth run (down to 1 failed file, 2 tests): fixing the `IBPasswordField.jsx` production bug above had a side effect on its own test - once the toggle button actually started rendering, `getByLabelText(/password/i)` became ambiguous in the other direction. The button's own `aria-label="Toggle Password visibility"` also contains "password" as a substring, so the same unanchored regex that fixed the asterisk problem now matched *two* elements (the real input and the button), throwing `Found multiple elements with the text of: /password/i`. Fixed by adding the `selector: "input"` option to `getByLabelText` - scopes the match to actual form-control elements and excludes the button, without needing a more fragile/anchored regex against label text that isn't fully in this test's control (the asterisk is MUI's, not this test's).

**Confirmed clean (August 3, 2026): full client suite passing, 62/62, for real, on the user's own machine.** Five rounds total to get there - each of the first four "fixes" was individually correct but surfaced something new on the next real run: two missing `React` imports found across two rounds, a wrong-on-paper-right-after-reading-docs `getByRole` query corrected against the actual rendered DOM, a required-field asterisk breaking an exact label match, a genuine shipped production bug (the password visibility toggle button silently dead since the MUI v9 migration) found only because fixing the test forced reading the real component, and finally a same-test regression once that real bug's fix made a previously-absent button start rendering. Worth remembering as the concrete case for why this sandbox's inability to run Vitest matters: every one of these was invisible to syntax-checking and would have shipped believing the suite was green.

**Closed (August 2, 2026):** all twelve `client/src/components/inputs/*` components now have tests
- `IBInput`, `IBMultilineInput`, `IBEmailField`, `IBPasswordField`, `IBButton`, `IBSubmitButton`,
`IBSelect`, `IBProjectPalettesSelect`, `IBProjectsByArtistSelect`, `IBAvatar`, `IBDatePicker`,
`IBDateTimePicker`. Writing these surfaced three more real, previously-undiscovered bugs, the same
pattern as the two bugs the auth/CRUD test pass caught:

- **`IBSelect.jsx`'s `handleOnChange`** did `return onChange;` instead of `onChange(e)` - returned
  the function reference itself rather than calling it, so a caller passing a real `onChange`
  handler (to drive `selectedVal` as the genuinely controlled value the prop names advertise) had
  it silently never invoked. Low real-world impact today - every current caller
  (`IBProjectPalettesSelect`/`CreateEventDialog`/`UpdateEventDialog`) actually reads the selected
  value at submit time via `inputRef`, not through `onChange` - but it's a real, confirmed defect
  in a prop contract this component explicitly advertises, and its near-identical sibling
  `IBProjectsByArtistSelect.jsx` already gets this right, so it was a one-off mistake, not the
  established pattern. Fixed; regression test added to `IBSelect.test.jsx`.
- **`IBAvatar.jsx`'s `isOnline` branch** sized its `Avatar` with `sx={{ width: { size }, height:
  { size } }}` - the `{ size }` shorthand wraps the value in an object (`{ size: size }`), which
  `sx` interprets as a responsive-breakpoint map with an invalid key (`size` isn't `xs/sm/md/lg/xl`)
  and silently ignores. The non-`isOnline` branch right below it does this correctly
  (`width: size, height: size`). Meant the online-status-badge variant of this component never
  actually respected the `size` prop, always falling back to Avatar's default size. Fixed.
- **`IBDatePicker.jsx`/`IBDateTimePicker.jsx`'s `renderInput` prop** - removed from MUI X Date
  Pickers' API in v6 (replaced by `slots`/`slotProps`); this project is on v9.10.1. Confirmed via
  the installed type definitions that the prop no longer exists at all. It rendered its own default
  `TextField` regardless, so this was silently ignored rather than crashing (unlike the `Avatar`
  `imgProps` fix earlier, which leaked onto a real DOM node and warned) - same root cause as that
  fix, missed during the same MUI 5→9 upgrade. Removed the dead prop from both files.

Also noted, not fixed: `IBButton.jsx` and `IBDatePicker.jsx` are both dead code - neither is
imported anywhere else in the client (confirmed via grep). `IBButton` additionally has no `onClick`
prop at all, unlike its sibling `IBSubmitButton`, so it can only ever function as a plain
`type="submit"` button inside a form. Tested as-is rather than expanding scope to fix or remove
unused code that wasn't reported broken.

**Verification caveat:** this sandbox cannot execute the client's real Vitest suite (missing
`@rollup/rollup-linux-x64-gnu` native binary, `npm install` blocked by the same registry
restriction noted elsewhere in this doc) - every new test file was verified via `@babel/parser`
(JSX-aware syntax parse) only, plus careful manual tracing against each component's actual
behavior. The two date-picker tests deliberately assert only that a formatted value contains the
expected day/year rather than pinning an exact display-format string, since that exact string
couldn't be confirmed by executing the suite here. **User should run `npm test` after pulling to
confirm all new tests actually pass, not just parse.**

- **CI:** ✅ Done — `.github/workflows/ci.yml` runs on every push/PR to `main`: a `server` job (`npm ci` + `npm test`, no other setup needed since `test/globalSetup.js` provisions its own in-memory MongoDB and dummy `SECRET_KEY`) and a `client` job (`npm ci` + `npm test` + `npm run build`, confirming the app still actually compiles, not just that tests pass). No lint step yet — there's no ESLint config anywhere in the repo to run; worth adding a real lint setup (and wiring it into this same workflow) as a follow-up, not bundled into this pass.
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

## UI/UX consistency and the artist dashboard (August 2, 2026)

Started from a specific complaint (avatars showing inconsistently across the app) and expanded
into a real audit of the dashboard/reporting layer, since the two turned out to be related -
neither the dashboard nor the artist detail page had any real content at all before this pass.

**Avatar bug - root cause and fix.** `avatar` was stored as four independent copies: `User.avatar`,
`Artist.avatar`, `Client.avatar`, `Staff.avatar`. `Profile.jsx`'s `updateUser` mutation only ever
wrote `User.avatar` - nothing propagated the change to the matching Artist/Client/Staff record, so
those three went stale the moment anyone changed their profile picture. Fixed with GraphQL field
resolvers (`resolvers/index.js`'s `Artist.avatar`/`Client.avatar`/`Staff.avatar`) that always
resolve from the linked `User.avatar`, ignoring the stored column - every existing query gets
correct data with no client-side changes. Deliberately did not remove the now-dead columns from
the Mongoose schemas or the `avatar: String!` required argument on `createArtist`/`createStaff`/
`createClient` in this pass - that's a real cleanup worth doing, but it touches required GraphQL
arguments and existing passing tests, which is a bigger, separate-decision change than the
resolver fix itself.

**Also cleaned up while in `Sidebar.jsx`/found in `Topbar.jsx`:** the account menu had unmodified
MUI template boilerplate - "My account" (a blank, unpopulated avatar sitting right next to the
correctly-working Profile item), "Add another account", and "Settings" menu items, none wired to
an `onClick` or a real route. Removed from `Sidebar.jsx` (the component that's actually rendered -
`Topbar.jsx` is dead code, never mounted anywhere in `App.jsx`, worth deleting or wiring in
separately rather than polishing a component nobody sees).

**Dashboard/artist-page gap - bigger than initially described.** `Home.jsx` (both `/` and
`/dashboard`), `Reports.jsx`, `Payments.jsx`, `Account.jsx`, and `Artist.jsx` were all one-line
stubs (`<div>Dashboard</div>`, etc.) - there was no analytics/reporting layer anywhere in the app
to inconsistently fix, just nothing built yet.

**Built: `ArtistPerformancePanel`** (`components/artistDashboard/ArtistPerformancePanel.jsx`), one
reusable component mounted with different framing in two places rather than built twice:
- `Home.jsx`: an artist's own view of their own numbers, shown when `user.userType === 'artist'`
  (`isSelf=true`). Other roles (Client/Staff/Shop Admin) currently just see a greeting - a real
  shop-wide dashboard (aggregate across all connected artists) is explicitly not built in this
  pass.
- `Artist.jsx`: a shop admin/staff's view into one specific artist, alongside real artist contact
  info/avatar that the page never showed before (`isSelf=false`).

Shows upcoming appointments (next 5, future-dated), MTD/YTD revenue (`total`+`tip` summed from
`getAppointmentsByArtist`), MTD/YTD shop-cut owed (`shopCutAmount` summed where `shopCutStatus` is
`unpaid`/`invoice_sent`/`pending_confirmation`), and active project count (`getProjectsByArtist`,
which already filters out completed/closed projects server-side). All math is computed
client-side from the full appointment list for this artist - fine at current data volume, worth
revisiting as a dedicated server aggregation resolver if an artist's history grows large.

**Real authorization gap found while building this - fixed August 2, 2026, in the broader
ownership-check audit below.** `getAppointmentsByArtist` and `getProjectsByArtist` were wrapped in
`withAuth` but had no ownership or role check beyond "is logged in" - any authenticated Client
could query any artist's full appointment history (including `total`/`tip`/`shopCutAmount`) or
active project list just by passing an arbitrary `userId`/`artistId`. Both now enforce "the artist
themselves, or shop-admin-or-better," with regression tests in `appointments.test.js`/
`projects.test.js`.

**Also found - fixed the same day.** `resolvers/index.js`'s `Message.user` resolver referenced
`Staff` (to build `userInfo` for a Staff-type message sender) without importing the `Staff` model
in that file - a latent `ReferenceError: Staff is not defined` waiting for the first message sent
by a Staff user. Fixed as part of the Conversation/Message repair pass below, alongside two other
bugs in the same resolver (see that section for detail).

**Architecture finding: the UI has no role-aware navigation at all.** `Sidebar.jsx` shows the
identical nav (Shops, Staff, Artists, Clients, Shop Cut Confirmations, etc.) to every logged-in
user regardless of role or shop-connection status. This was tolerable when there was no real
per-role content to route to; it stops being tolerable as real role-scoped views (like this
dashboard) get built. It's also the concrete gap between the backend's already-correct
artist-centric data model (an artist can be connected to zero, one, or several shops
concurrently - see the `ArtistShopConnection` design earlier in this document) and what the
frontend can currently express: there's no shop-context switcher anywhere, so a multi-shop-
connected artist has no way to indicate "I mean my numbers at *this* shop" once shop-scoped
reporting exists. Worth a dedicated pass (role-aware nav + a shop switcher) before building
further shop-scoped analytics on top of the current flat nav.

**Client test coverage added:** `CreateEventDialog.test.jsx`/`UpdateEventDialog.test.jsx` -
rendering, submitting a new appointment with the right defaults (and the modal staying open on a
failed mutation, not silently closing), and the shop-cut ledger panel's conditional rendering plus
its Mark-as-Paid action. Also added a `window.matchMedia` polyfill to the shared client test
setup (`src/test/setup.js`) - jsdom doesn't implement it at all, and MUI's `useMediaQuery`
(used internally by Dialog/pickers) throws without it; needed for these two components' MUI X date
picker, and will be needed by any future test touching an MUI Dialog or responsive component.

**CI added:** see the "Test suite" section above and `.github/workflows/ci.yml` - not new work in
this pass, cross-referenced here since it now also runs these new tests on every push/PR.

**Square production-access:** researched and compiled into a separate checklist
(`square-production-checklist.md`) rather than this document, since it's an action list for the
user to work through in Square's own dashboard, not an engineering record of what was built.

---

## Local development environment (August 2, 2026)

Prompted by a real cost signal, not a hypothetical one: Netlify build-minute usage hit 50% of the
free-tier allotment from ordinary local development/testing, not real traffic. Investigating
turned up a bigger problem than the credit usage itself — `server/.env.development`'s `MONGODB`
was pointed at the same shared Atlas cluster (`cluster0.6sz1d.mongodb.net/inkbook`) used
elsewhere. "Local" development had actually been reading and writing a shared cloud database this
whole time, not a real local one — every manual test, every bug repro, was mutating data that
could collide with production. That's now fixed, separately from the Netlify-credits question
that prompted looking at this at all.

**What changed:**
- Local MongoDB, installed natively via Homebrew — `brew install mongodb-community` (requires
  tapping MongoDB's own Homebrew repo first, since it's not in `homebrew-core`: `brew tap
  mongodb/brew`), running as a lightweight `brew services` background daemon on port `27017`. An
  initial `docker-compose.yml` was drafted first, then dropped in favor of this - Docker Desktop's
  VM/container overhead isn't worth it for running exactly one service with nothing else in the
  stack to containerize; the Node server and Vite client both already run fine directly on the
  host.
- `server/.env.development` — `MONGODB` repointed to `mongodb://localhost:27017/inkbooks-dev`. The
  old Atlas connection string is commented out directly below it (not deleted) in case you ever
  need to point back at real data temporarily to debug something — don't leave it uncommented
  day-to-day. This file is gitignored, always was, so this change needs no commit/push — it only
  needs to exist on your own machine.
- `server/scripts/seed.js` (new) + `npm run seed` (from `server/`) — wipes every collection this
  script touches, then creates a full realistic dataset with real bcrypt hashes (12 rounds, same
  as `register`/`login` use) so you can actually log into the running app, not just inspect
  documents in a database client. Refuses to run against anything whose `MONGODB` doesn't start
  with `mongodb://localhost` or `mongodb://127.0.0.1` — a deliberate guard against ever pointing
  this destructive script at Atlas by accident.

  Seeded data covers every real role. The `platformadmin` account was removed when the global
  role lost its cross-shop access - it has no `Staff` row, so it would log in to an empty app, and
  seeding a login that looks broken is worse than not seeding it. What remains: one
  shop (Copper Wolf Tattoo Co.), a Shop Admin, a Shop Staff member, two shop-affiliated Artists
  (each with a real `ArtistShopConnection`), one independent Artist with no shop connection at all
  (exercises the artist-centric tenancy path — see that section above), four Clients, four Projects
  (correctly using the `Project.clientId` = Client sub-document `_id` / `Project.artistId` =
  artist's own `User._id` convention documented elsewhere in this file), Appointments covering the
  full `shopCutStatus` lifecycle (`none`/`unpaid`/`pending_confirmation`/`paid`), and two
  Conversations with real Messages between an artist/client pair each (built via the same
  `findOrCreateConversationForMembers` logic the app itself uses, so the Messenger and Project-chat
  panels have real threads to display, not empty states).

  Every seeded account shares one password (`devpass123`, printed to the console at the end of the
  run along with each account's username and email) — this is throwaway local data, not anything
  security-sensitive. Log in with the username, not the email - see the runbook below.

**Validation performed and its actual limit.** The script was reviewed line-by-line against every
real Mongoose schema and the real zod enum values in `utils/validation.js` (not the unrelated
numeric `Constants.PROJECT_STATUS`/`ARTIST_STATUS` constants a first draft mistakenly reached for
— `status: 'in_progress'`/`'completed'` and `appointmentStatus: 'scheduled'`/`'completed'` are the
actual accepted values), and syntax-checked. A full run against a real `mongod` was attempted from
this sandbox using `mongodb-memory-server` (already a dev dependency, used by the real test suite)
but failed — this sandbox's network access blocks `fastdl.mongodb.org`, the same class of outbound
restriction that already blocks the npm registry here. That means the very first real run of this
script needs to happen on your machine, not mine — see the steps below. If anything's wrong, it'll
fail loudly on that first run (Mongoose validation errors are specific about which field and why),
not silently.

**How to actually use this, end to end, on your own machine:**
1. One-time setup: `brew tap mongodb/brew && brew install mongodb-community`.
2. `brew services start mongodb-community` — starts local Mongo on `27017` as a background
   service. Runs `brew services list` to confirm `mongodb-community` shows `started`. This is a
   real background service (like any other `brew services` daemon), not a one-shot command - once
   started it stays running across terminal sessions and reboots until you `brew services stop
   mongodb-community` yourself, so you generally only need this step once per machine, not once per
   session.
4. `cd server && npm run seed` — wipes and repopulates `inkbooks-dev`. Re-run any time you want a
   clean slate; it's fully repeatable.
5. `npm start` (from `server/`) — same command as always; `NODE_ENV=DEVELOPMENT` already makes
   `index.js` load `.env.development`, which now points at local Mongo instead of Atlas.
6. `npm run dev` (from `client/`) — no changes needed here at all.
   `client/src/constants/app.js` already auto-selects `http://localhost:5500/` as the GraphQL
   server URL whenever Vite's dev mode is active, which it always is under `npm run dev`.
7. Log into the running app at `localhost:3000` (or whatever port Vite prints). The login screen
   takes **username, not email** (`resolvers/users.js`'s `login` looks up `User.findOne({
   username })`) - use one of: `platformadmin`, `shopadmin`, `frontdesk`, `artist.maya`,
   `artist.jonas`, `artist.indie`, `client.alex`, `client.jordan`, `client.taylor`, `client.morgan`
   - password `devpass123` for all of them. `npm run seed`'s own console output lists these same
   usernames alongside each account's email at the end of the run.

**Important gotcha, found via manual testing (see the tenth report below): re-running `npm run
seed` while you're still logged in from a previous seed run will silently break things.** The seed
script wipes and recreates every user with brand-new `_id`s. Your browser keeps its login session
(JWT + cached user object) in `localStorage` independent of the database - that session stays
"valid" (same JWT secret, still passes auth) even after the user it points to no longer exists,
because nothing currently checks whether the referenced user is still real, only that the token's
signature and expiry are good. Anything you do while in that state - most notably uploading an
image, which stamps `userId` from your cached session onto the new record - silently writes a
dangling reference to a deleted user. **Log out and log back in any time you reseed**, before doing
anything else.

None of this touches Render or Netlify — the point is that ordinary day-to-day development and
manual testing now happens entirely on your machine, against a database that only you can affect,
with zero Netlify build minutes spent. Netlify usage should now only come from real deploys
(pushing to `main`), which is what its free tier is actually meant to cover.

**Real bug found via manual testing against this seeded data - fixed.** Clicking into Artists as
the seeded Shop Admin crashed the whole page (`Cannot read properties of undefined (reading
'getArtists')`). Root cause: `typeDefs.js`'s `Artist` type marked `shopId`/`userId` as `ID!`
(non-null), but the seeded independent artist (no shop, by design - the headline scenario of the
artist-centric tenancy redesign above) had neither set. The instant that record serialized in
`getArtists`' response, GraphQL threw "Cannot return null for non-nullable field Artist.shopId",
and Apollo Client's default error policy drops `data` entirely when any error is present - not
just that one field - which is what actually crashed `Artists.jsx` (it never checked for `error`
before reading `data.getArtists`, a separate, pre-existing client robustness gap worth a look
someday, but not the root cause here).

This isn't just a seed-script problem - it's a real, previously-undiscovered schema/design mismatch
that predates this session's local-dev work. `Artist.js`'s Mongoose schema already allows `shopId`
to be unset, `ArtistInput.shopId` in the same file is already nullable, and `Appointment.shopId`
already got this exact fix during the shop-cut ledger work - `Artist.shopId` was simply missed at
the time. No existing test caught it because no test ever selected `shopId` on a `getArtists`
response alongside a shopId-less artist - `crud.test.js`'s own `CREATE_ARTIST` mutation only ever
selected `id`/`firstName`. Any real independent artist created once the invite-link flow (still
"still open" above) ships would have hit this same crash in production.

**Fixed:** `Artist.shopId: ID!` → `Artist.shopId: ID` in `typeDefs.js` (`userId` stays non-null -
every artist has a real user account regardless of shop affiliation, that part of the model is a
real invariant, and the seed script's independent artist was also missing `userId` - a separate,
straightforward seed-script bug, also fixed). Added a regression test to `crud.test.js`'s Artist
CRUD block (`getArtists: does not error on an independent artist with no shopId`) that explicitly
selects `shopId`/`userId` on a `createArtistUser()` fixture (which is itself shopId-less by
default) - this is the test shape that would have caught this originally.

**Self-inflicted follow-up, caught by the user's own `npm test` run.** The `shopId` fix above was
first written with a `//` JS-style comment inside `typeDefs.js`'s `gql\`...\`` template literal -
that literal *is* the GraphQL SDL, which only supports `#` comments, not `//`. `node --check` only
validates JavaScript syntax (the template literal itself is valid JS regardless of its string
contents), so this passed that check but broke schema parsing at runtime the instant anything
built the schema - all 9 server integration test files failed immediately with `GraphQLError:
Syntax Error: Unexpected character: "/"`. Fixed by converting to `#` comments. Verified two
stronger ways this time, not just `node --check`: `require('./graphql/typeDefs')` directly (proves
`graphql-tag` parses it), and building/starting a real `ApolloServer({ typeDefs, resolvers })` -
the same construction `test/helpers/testServer.js` uses - end to end.

**Second real bug found via manual testing - a broadly-applicable one, not artist-specific.**
Clicking into a artist's card still crashed after the schema fix above, this time client-side, in
`IBCardArtistDetails`. Root cause: `UtilsService.formatPhone(phoneNumber)` did
`parsePhoneNumber(\`+1${phoneNumber}\`).formatNational()` with no guard at all. `phone` defaults to
`""` on `Artist`/`Client`/`Staff`/`Shop` at the Mongoose layer - nothing requires a caller to have
one on file - and the seed script hadn't set one for anybody yet. `parsePhoneNumber("+1")` (or any
string it can't parse as a real number) returns `undefined` rather than throwing, so
`.formatNational()` on that crashed with "Cannot read properties of undefined." This isn't an
edge case - it's the *default* state of a freshly created record, and `formatPhone` is called
unconditionally from all four `IBCard*Details` components (Artist/Client/Staff/Shop), so any real
person who hasn't filled in a phone number would crash their own card the same way in production.

**Fixed:** `UtilsService._formatPhone` now returns `""` for empty/falsy input, and falls back to
the raw stored value (instead of crashing) if the library can't parse it as a valid number at all.
Added `client/src/services/UtilsService.test.js` (new file - no prior test coverage existed for
this service) locking in all four cases: empty string, null/undefined, a real 10-digit number, and
an unparseable string. Also gave every seeded person in `scripts/seed.js` a real-looking phone
number, both for realism and so the seed data actually exercises the fixed code path instead of
just avoiding it.

**Third real bug found via manual testing - this one affected every project, unconditionally.**
Clicking into Projects crashed with `Cannot read properties of null (reading 'avatar')` in
`IBCardProjectDetails.jsx`, which reads `project.client.avatar` with no null check. Root cause:
`resolvers/index.js`'s `Project.client` field resolver did `Client.findOne({id: project.clientId})`
- `id` is a Mongoose *virtual* getter, computed at the application layer, never a real stored field
on the document. That query filter was looking for a literal field named `id` that no `Client`
document has ever had, so it matched nothing - not intermittently, not depending on the data,
*every single time*, for every project that has ever existed in this app. This was flagged as a
known-but-unfixed latent bug earlier in this session's audit work and only now got the manual-
testing pass that turned it from a documented risk into a confirmed, reproduced crash.

**Fixed:** `Client.findOne({id: project.clientId})` → `Client.findById(project.clientId)`, matching
the pattern already used correctly two lines below in the same file's `conversation` resolver. The
exact same bug pattern (`User.findOne({id: ibImage.userId})`) also existed in the unrelated
`IBImage.userInfo` resolver in the same file - fixed too. **Correction to the note originally
written here:** this was first (wrongly) described as dead/unused code based on a grep that turned
out to be malformed (a stray argument accidentally became part of the search pattern, so it
silently matched nothing) - `ProjectService.js`'s real `_FETCH_PROJECT_QUERY` (used by the single-
project detail page, feeding `IBImagesList.jsx`) does select `userInfo { firstName lastName avatar
id }` on both `referenceImages` and `designImages`. This was a real, live bug, not a dead one - see
the next entry below, where it actually surfaced. Added a regression test to `projects.test.js`
(`Project.client field resolver: resolves the actual Client sub-document, not null`) that selects
`client { id firstName lastName }` on a real `getProjects` response - the same shape
`ProjectService.js`'s real query already uses, which is exactly what would have caught this from
day one.

**Fourth real bug found via manual testing - the widest blast radius of the four, a whole class of
unguarded `user.userInfo.shop.id` access across the client.** Uploading images on a project crashed
in `IBProgressItemProject.jsx` (`Cannot read properties of null (reading 'id')`) - it built the
Firebase Storage path as `` `${project.artist.shop.id}/...` `` with no null check. Investigating
turned up the same unguarded pattern in five more places once grepped for across the client:
`Profile.jsx` (twice - once unconditionally on every render, before the avatar-upload code even
runs, meaning **the entire Profile page was broken for every Client and every independent artist**,
not just the avatar-upload feature), `IBCalendar.jsx`, `ibCalendar/Sidebar.jsx`, and both
`CreateEventDialog.jsx`/`UpdateEventDialog.jsx` (building the appointment payload). All six shared
the same root cause: `project.artist.shop` is legitimately `null` for an independent artist (no
shop connection at all - the headline scenario of the artist-centric tenancy redesign, not a data
gap), and `user.userInfo.shop` is legitimately absent entirely for a `Client` (that type has no
`shop` field at all) - nothing in this code ever accounted for either case.

**Fixed:** every occurrence now uses optional chaining (`user.userInfo?.shop?.id`) rather than
crashing. The two upload-path builders (`IBProgressItemProject.jsx`, `Profile.jsx`) fall back to a
literal `'independent'` path segment when there's no shop, since Firebase Storage paths need
*some* segment there. The three data-fetching hooks that take a `shopId` as a query variable
(`AppointmentService.getAppointmentsByShop`, `ArtistService.fetchArtistsByShop`,
`UserService.getTagColorsByShop`) each gained a `skip: !shopId` guard, so an undefined `shopId`
means "don't fire this query" rather than a doomed request against a resolver typed to expect a
real one. `CreateEventDialog.jsx`/`UpdateEventDialog.jsx` needed no fallback at all - sending
`shopId: undefined` in an appointment payload is already correct, unmodified behavior, since
`Appointment.shopId` has been nullable in the schema since the shop-cut ledger work specifically to
support shop-less appointments.

**Independent-artist empty calendar gap - now fixed (August 3, 2026).** Previously flagged and deliberately not fixed at the time: `IBCalendar.jsx`/`ibCalendar/Sidebar.jsx` degraded gracefully instead of crashing for an independent artist, but still showed an empty calendar and an empty artist filter rather than that artist's own appointments.

- `services/AppointmentService.js` gained a new `getAppointmentsByArtistForCalendar(userId)` query - same field selection as the existing `getAppointmentsByShop` query (the shape `Day.jsx`/`UpdateEventDialog.jsx` actually need: `project.client.user`, `user.tagColor`, etc.), just scoped to one artist via the existing `getAppointmentsByArtist` resolver instead of by shop. Deliberately a separate query from the existing `FETCH_APPOINTMENTS_BY_ARTIST` (used by `ArtistPerformancePanel`'s dashboard) rather than widening that one - that query is intentionally lean for its own use case and doesn't select the detail a calendar day cell renders.
- `IBCalendar.jsx` now calls both `getAppointmentsByShop`/`getAppointmentsByArtistForCalendar` unconditionally (hooks can't be called conditionally) with each one's own `skip` guard based on whether `user.userInfo?.shop?.id` is present, so exactly one ever actually fires, and populates `savedEvents`/`filteredEvents` from whichever one returned data.
- `ibCalendar/Sidebar.jsx`'s "Artists" filter heading/list is now hidden entirely (not shown empty) when the artist has no shop - there's no one else to filter between for a solo artist, so an empty filter list would just be confusing rather than informative.
- Verified the new query is schema-valid by parsing and validating it directly against the real SDL (`graphql`'s `buildSchema`/`validate`, not just syntax-checked) - this sandbox still can't run a live server/DB to test the resolver's actual auth/data behavior end to end, but the existing `getAppointmentsByArtist` resolver and its ownership check are unchanged and already covered by `appointments.test.js`.
- **Not done:** a dedicated component test for the branching logic in `IBCalendar.jsx`/`Sidebar.jsx` - it would need `CalendarProvider` (not just a mocked context, since `CalendarContext` itself isn't exported) plus `MockedProvider` plus the full `Month`/`Sidebar`/`CalendarHeader` render tree, a much heavier setup than the existing focused dialog tests. Worth a manual click-through as an independent-artist test account, and/or a proper test later, rather than skipped silently.
- **Still open, deliberately not addressed here:** the broader "no shop-context switcher anywhere" gap for artists connected to *multiple* shops (noted in the UI/UX consistency section above) - this fix only addresses the zero-shop case, not letting a multi-shop artist pick which shop's calendar/numbers they're viewing. That's a real design decision, not a bug fix, and stays a separate, larger backlog item.

**Fifth real bug found via manual testing, a different mechanism from the `shop`-optional class
above.** Clicking into Appointments crashed with `Cannot read properties of undefined (reading
'appointmentDate')` at `IBCalendar.jsx`. Root cause: two leftover debug `console.log` statements
hard-indexed `data.getAppointmentsByShop[0]` unconditionally, which throws the instant a shop has
zero appointments - an entirely normal, common state (a brand-new shop, or any shop between
appointments), not an edge case specific to independent artists at all. Fixed by deleting both
lines - they added no functional value; the following `setSavedEvents`/`setFilteredEvents` calls
already use the full array correctly and never depended on them. Also removed the now-unused
`moment` import this left behind.

**Sixth report - not a new bug, a dev-workflow gap that made an already-fixed bug look unfixed.**
Saving an image on a project crashed in `IBImagesList.jsx` reading `item.userInfo.firstName` on a
`null` `userInfo` - which is exactly the `IBImage.userInfo` resolver bug already fixed above
(`User.findOne({id: ...})` → `User.findById(...)`). The likely explanation: `server/package.json`'s
`start` script ran plain `node index.js`, not `nodemon` - so a `git pull` alone never picks up
server-side changes, the process has to be manually stopped and restarted every time. If that
restart is missed after a pull, every already-fixed server bug looks like it's still broken.

**Fixed the workflow gap, not just this one instance:** `start` now runs `nodemon index.js`
(nodemon was already a dependency - used only by the oddly-named `start:prod` script before this)
so the dev server auto-restarts on every file change, the same way `npm run dev` already does for
the client via Vite. This should prevent this whole class of "did the fix actually not work" false
alarm from recurring, not just resolve this one report.

**Seventh real bug found via manual testing - a seed-data bug, not an app bug, but one that broke
every project the moment anything touched it.** Saving an uploaded image on a project threw a
generic `ApolloError: Errors` from `IBProgressListProject.jsx`'s `updateProject` call. Root cause:
`server/utils/validation.js`'s `updateProjectInputSchema.palette` is `z.enum(['black', 'color'])`
— the real dropdown values from `client/src/constants/app.js`'s `PROJECT_PALETTE_OPTIONS` (`{value:
"black", label: "Black and Grey"}` / `{value: "color", label: "Color"}`). `seed.js` had set
`palette` to the display *labels* instead (`'Black and grey'`, `'Full color'`, `'Black'`) on all
four seeded projects. Every one of them failed `updateProject`'s zod validation unconditionally —
not a null-safety issue or an edge case, just wrong seed data — the instant any code path called
`updateProject`, which uploading an image does (it round-trips the whole project object through
that mutation to persist the new image array). A project created through the UI's own dropdown
would never hit this, since the dropdown only ever sends `"black"`/`"color"`.

Fixed all four `palette` values in `seed.js` to the real enum values. Added two regression tests to
`test/integration/projects.test.js`: one asserting `updateProject` still rejects a label-shaped
palette value (`'Black and grey'`) with the same generic `Errors` message, one asserting the real
enum value (`'black'`) is accepted — so this exact label/value mismatch can't silently return in
either the seed script or a future schema change without a test failing.

**Eighth real bug found via manual testing - a stale-cache bug hiding behind the seventh's fix.**
Once the palette bug above was fixed and an image upload could actually complete, saving it
crashed `IBImagesList.jsx:114` reading `item.userInfo.firstName` on a `null` `userInfo` - the exact
same symptom the `IBImage.userInfo` resolver bug produced earlier, which raised the question of
whether that fix had actually regressed. It hadn't: the resolver (`User.findById(ibImage.userId)`)
is correct and was confirmed unchanged. The real cause was one level up, in the client:
`ProjectService.js`'s `_updateProject` mutation response never selected `userInfo` (or `title`) on
`referenceImages`/`designImages`, unlike the `getProject` fetch queries, which do. For a brand-new
image - freshly uploaded, never before written to Apollo's normalized cache - the mutation
response is the *first* write for that entity, so the cache entity ends up with no `userInfo` field
at all. The actively-watched `getProject` query (which `Project.jsx` renders `IBImagesList` from)
then reads that same entity expecting `userInfo` and gets an incomplete/broken result instead.
Existing images already cached from a prior full `getProject` fetch weren't affected, since a
partial mutation write doesn't erase fields it doesn't mention - only the very first save of a new
image hit this.

Fixed by adding `title`/`userInfo { firstName lastName avatar id }` to `referenceImages` and
`userInfo { firstName lastName avatar id }` to `designImages` in the `UPDATE_PROJECT_MUTATION`
response selection, matching what `_FETCH_PROJECT_QUERY` already selects - so every write to this
normalized cache entity is complete, not just the first read. Also corrected a stale comment left
on the `IBImage.userInfo` resolver in `resolvers/index.js` that still claimed the field was
dead/unused code (an earlier, wrong conclusion from a malformed grep this session, corrected in
the roadmap at the time but never fixed at the source).

**Ninth report - the identical eighth-bug crash recurred verbatim after the fix above.** Two
non-exclusive possibilities, both addressed:

1. *Likely, unconfirmed:* Apollo Client's `InMemoryCache` is a plain JS object living in the
   browser tab's memory for the life of that tab - a `git pull` plus a server/Vite restart does
   not clear it. If this report came from the same browser tab used for the pre-fix attempt, the
   tab may still be holding the earlier broken `IBImage` cache entity from before the eighth fix
   went in; nothing in the fixed code retroactively repairs data already sitting in an open tab's
   cache. A hard reload (or a fresh tab) forces a real `getProject` network fetch and should not
   reproduce this. Flagging this explicitly rather than guessing silently, since it changes what
   "retest" needs to mean here - a `git pull` alone isn't enough for client-side state the way it
   is for the server.
2. *Confirmed, real, fixed regardless:* `IBProgressListProject.jsx` called `handleProjectUpdate()`
   - which fires the `updateProject` mutation, a genuine side effect - directly in the JSX render
   body, gated only by `urlList.length === files.length`. Calling a side effect during render
   violates React's render-must-be-pure rule and had no guard against firing again on a later
   re-render while that condition still happened to hold (e.g. a re-render triggered by the
   mutation's own cache write completing elsewhere in the tree). Refactored into a `useEffect` with
   a `hasSubmittedBatch` ref, so the mutation fires exactly once per completed upload batch.

**Tenth report - the identical crash persisted through a hard reload and a fresh tab, ruling out
cache staleness and the render-body-effect theory.** Rather than keep guessing from code, asked
for ground truth directly: a `mongosh` query against the actual `inkbooks-dev` data showed the
uploaded image's `userId` was a well-formed ObjectId that matched no document in `users`
(`userExists=false`). Root cause: `npm run seed` wipes and recreates every user with fresh `_id`s
on each run; the browser's cached login session (JWT + user object in `localStorage`) survives a
reseed untouched, since nothing currently validates that the JWT's embedded user id still refers to
a real document, only that the signature/expiry are valid. If you're logged in as
SHOP_ADMIN-or-better, `updateProject`'s ownership check doesn't even require `user.id` to match
anything real, so the save "succeeds" while quietly writing a dangling `userId` onto the new image.
Not a code bug in the reported-crash sense - a real, previously-undocumented operational gotcha of
this session's own reseed-while-testing workflow. Documented in the runbook above: log out and back
in after every reseed.

**Fixed defensively anyway, since a deleted/dangling uploader reference is a real (if rare) case a
production app should survive too:** `IBImagesList.jsx` no longer assumes `item.userInfo` is
present - falls back to "Unknown uploader" for the tooltip and the default no-image avatar, instead
of crashing the entire gallery over one image with a missing uploader.

**Eleventh report - the crash is gone, but the uploaded image doesn't actually appear.** Two
distinct bugs, both real, both in `IBImagesList.jsx`:

1. `srcset()` appended `?w=...&h=...&fit=crop&auto=format&dpr=2x` to every image URL - lifted
   directly from MUI's own `ImageList` demo, which points at Unsplash (a CDN that supports dynamic
   resize query params). Every real image URL here is a Firebase Storage download URL (see
   `IBUploadFileWithProgress.js`'s `getDownloadURL()`), which already ends in its own
   `?alt=media&token=...` query string and doesn't support resize params at all. Appending a second
   `?w=...` produced a URL with two `?`s; Firebase parses everything after the real token as part
   of the token value, corrupting it, so the image request fails and nothing renders. This wasn't
   data-dependent or new-upload-specific - it would have broken every single project image this
   whole session, the first time any image actually made it into `referenceImages`/`designImages`
   for real (which, thanks to the seed-data palette bug and the stale-session bug above, hadn't
   happened until just now). Fixed by dropping the fake resize params entirely and using the real
   URL as-is for both `src` and `srcSet`.
2. `Avatar`'s `imgProps` prop - console-warned "React does not recognize the `imgProps` prop on a
   DOM element." `imgProps` was removed from MUI's `Avatar` API in favor of `slotProps.img` as part
   of this project's own React 17→19/MUI 5→9 upgrade earlier this project; this one call site was
   missed at the time. Fixed to `slotProps={{ img: { "aria-hidden": true } }}`. Confirmed via
   `node_modules/@mui/material/Avatar/Avatar.js` (installed version 9.2.0) that `imgProps` no
   longer exists on the component at all - grepped the rest of the client for other stale
   `imgProps` call sites; this was the only one.

**Backlog item, now fixed (August 2, 2026):** the image/note `_id`-churn bug noted above (every
`updateProject` call minted a brand-new `_id` for every element of `referenceImages`/
`designImages`/`notes`, not just newly-added ones, since the client always sends GraphQL's virtual
`id` field back and none of `IBImageSchema`/`IBNoteSchema` treat `id` as an alias for `_id`) is
fixed. `mutations/projects.js` now has a `remapIdToMongoId()` helper, applied to
`referenceImages`/`designImages`/`notes` in both `createProject` and `updateProject` before the
Mongoose write: it maps each item's `id` onto the real `_id` key it needs to be for Mongoose to
recognize and preserve existing subdocument identity (and to give a genuinely new item's
client-generated id - see `IBProgressItemProject.jsx`'s `new ObjectID()` - a stable real identity
instead of a random one). Verified empirically (`Project.schema.path('referenceImages').cast(...)`
against the real schema, before vs. after the fix) and via two new regression tests in
`projects.test.js` that save a project twice in a row - exactly how the real client re-sends
existing images/notes unchanged alongside new ones - and confirm the id survives.

**Cleanup done the same day:** `server/config.js` - a dead, gitignored file holding a stale
hardcoded Atlas connection string with a different (never-rotated) plaintext password - has been
deleted. Nothing in the codebase still required it (confirmed via a full-codebase grep before
removing it); it was gitignored and untracked, so this needed no commit.

The `mongodb-memory-server`-based test suite (`npm test`) is completely separate from this
local-dev database and needs no changes — it already provisions and tears down its own ephemeral
`mongod` per test run, real local Mongo or not.

**Twelfth report (August 3, 2026) - reported as "calendar appointment colors," actual root cause
was much larger: Profile.jsx was completely inaccessible to every independent artist.** Reported
symptom: appointments show up correctly on the calendar, but render with no visible color label -
only the tooltip (which reads the same `evt.user.tagColor` data) shows anything on hover.

`ibCalendar/Day.jsx` renders each label as `<div style={{ backgroundColor: evt.user.tagColor, color:
'#fff', ... }}>` - if `tagColor` is falsy or white, that's literally white text on a transparent/
white background: present in the DOM (so the `Tooltip` wrapping it still fires on hover) but
invisible. That part of the theory was right, but `Day.jsx` itself needed no fix - the real question
was why an artist's `tagColor` was ever stuck at that default in the first place. `Register.jsx`
hardcodes every new user's `tagColor` to `'#fff'` at signup with no picker, and the *only* place to
change it afterward is Profile.jsx's "Select Tag Color" section.

Reading `Profile.jsx` found the actual root cause, well beyond the calendar: the component's entire
render was gated behind `if (availableTags)` -  `availableTags` being the data from
`UserService.getTagColorsByShop(user.userInfo?.shop?.id)`, a query that (per this same session's
earlier shop-optional fix) is deliberately `skip`ped whenever there's no `shopId`. For a shop-less
independent artist that query never fires, so `availableTags` never becomes truthy, and the `else`
branch - a bare `<IBPageLoader />` - rendered forever. Not a color-picker-only bug: an independent
artist could never reach *any* part of Profile.jsx this way - not the avatar upload, not the
password form, nothing. They could never have set a real tag color, which is the actual reason
their calendar labels were invisible.

Fixed in `client/src/pages/profile/Profile.jsx`:
- The render gate now checks the query's own `loading` flag (`if (!loading)`) instead of the data
  (`if (availableTags)`) - `loading` resolves to `false` immediately for a skipped query, so the
  page renders right away for a shop-less artist, the same as it already did for a shop artist once
  their real query resolved.
- The `useEffect` that builds the color-swatch list no longer gates its entire body on
  `if (availableTags)` (which meant it silently never ran for a shop-less artist, leaving
  `tagColors` permanently `[]`); it now always runs, using `availableTags?.getUserTagColors ?? []`
  as the "colors already taken by shop-mates" list - correctly empty when there are no shop-mates,
  so an independent artist sees and can pick from the full palette.
- `handleTagColor`'s `availableTags.getUserTagColors.filter(...)` call - which would have thrown on
  `undefined` the moment an independent artist could actually reach this code path - is now
  `(availableTags?.getUserTagColors ?? []).filter(...)`.

Verified via `@babel/parser` (this sandbox can't run the client's Vitest suite - a pre-existing,
already-documented `@rollup/rollup-linux-x64-gnu` optional-dependency resolution failure, unrelated
to this change). No dedicated component test added for this fix, matching the same render-tree-
complexity tradeoff already noted for the `IBCalendar.jsx` gap above (`useAuth`, `useMutation`, and
`UserService.getTagColorsByShop` would all need mocking to meaningfully test the loading/skip
interaction). **Needs a manual click-through as an independent-artist test account:** confirm
Profile now loads immediately (no spinner), confirm a tag color can be selected and persists, then
confirm the calendar renders that artist's appointment labels in the chosen color instead of blank.

---

## Phase 7 — Session/workflow redesign (August 3, 2026, ongoing)

A larger, deliberately-scoped redesign covering four related gaps identified via a design
conversation, not a bug report: (1) inconsistent edit-page UI across the app, (2) the appointment-
creation flow not distinguishing consult vs. session or reusing the booking-request pipeline for
artist-entered walk-ins, (3) sessions needing a timer/notes/auto-computed total inside Project, and
(4) the shop-cut ledger UI needing to move off the appointment dialog onto an artist-dashboard
payout list. Being built in dependency order - schema/settings first, since the other three depend
on it - then the wizard, then the in-project session view, then the payout dashboard, then a
whole-app UI consistency sweep last. Full design discussion and the flaws/alternatives considered
for each piece live in this session's conversation history, not repeated here - this section
documents what's actually been built.

### Rates & settings foundation - done

New fields: `Artist.flatRate`/`billingType` (hourlyRate already existed) and matching
`Shop.flatRate` (for symmetry - a shop can express a flat-rate expectation too, not just hourly).
`ArtistShopConnection.rateSource` (`'shop' | 'own'`, default `'shop'`) decides which side's rate
actually applies for a given connected artist - lives on the connection record, not on `User` or
`Shop` directly, since an artist could in principle connect to more than one shop later and use a
different rate at each.

Two new mutations, both self-service (an artist acting on their own record, not an admin editing
someone else's):
- `updateArtistRateSettings(hourlyRate, flatRate, billingType)` - deliberately separate from the
  existing `updateArtist`, which is `SHOP_ADMIN`-or-better only and so a plain `ARTIST`-role user
  could never call it on their own record at all, including to set their own rate. Looked up by
  the caller's own `userId`, not a client-supplied `artistId`, so there's no ownership check to get
  wrong.
- `setArtistShopRateSource(artistId, shopId, rateSource)` - same ownership shape as the existing
  `connectArtistToShop`/`disconnectArtistFromShop` (the artist themselves, or shop-admin-or-better).

New top-level `/settings` page (`client/src/pages/settings/Settings.jsx`), not bolted onto
`Profile.jsx` - this is going to keep growing (rate config today, likely notification prefs/
shop-connection management later), and Profile already carries avatar/password/tag-color. Only
visible in the sidebar nav for `userType === 'artist'` (staff/client/shop-admin have nothing to
configure here yet). Content: hourly/flat rate + billing-type inputs, and - only when the artist
has a shop - a "use the shop's rate / use my own" picker wired to `setArtistShopRateSource`.

One real implementation bug caught and fixed before it shipped: the rate inputs initially used
`IBInput`'s `value` prop for controlled state hydrated from the query result via a `useEffect` -
`IBInput` is uncontrolled (`defaultValue`, not `value` - it doesn't forward a `value` prop to MUI's
`TextField` at all), so the effect would have updated React state that was never actually reflected
in what rendered. Fixed by following `EditArtist.jsx`'s existing (correct) pattern instead: read
`defaultValue` straight from the query result at render time, and use local state only to capture
edits, falling back to the query's own value at submit for anything untouched.

Verified via `graphql`'s `buildSchema`/`validate` against the real SDL for every new query/mutation
document, `node --check`/`@babel/parser` syntax checks on every file, and a standalone script
confirming the new `tryCheckAuth` helper (see below) behaves correctly against a real signed JWT.
This sandbox still can't run either test suite (`@rollup/rollup-linux-x64-gnu` resolution failure,
already documented above) or a live Mongo connection, so no integration test was run against the
new mutations end-to-end - worth doing once you can run `npm test` yourself.

### Booking-request pipeline - reassignment, session-to-project, and rate-limit fix - done

**Reassignment.** New `reassignBookingRequest(bookingRequestId, newArtistId)` mutation - a 4th
action ("Forward to...") alongside Book Consult/Book Session/Decline on the artist's booking-
requests dashboard, for when the artist who originally got a request isn't the right fit but a
shop-mate is. Only allowed between two artists who share an active `ArtistShopConnection` to the
same shop (checked via the existing `getShopIdsForUser` helper, so this works under the fuller
multi-shop model, not just the legacy single-`Artist.shopId` case) - not a general "reassign to
anyone" escape hatch. Only a still-`pending` request can be reassigned, since a converted one
already has a real Appointment/Project under the original artist. The dashboard only offers this
button when the artist actually has shop-mates to forward to.

**Session booking now creates a real Project.** Found while designing the "every session
appointment must have a project" rule: `convertBookingRequest`'s `session_booked` path only ever
created an `Appointment`, leaving `projectId` unset - there was no code path that ever created a
`Project` from a booking request at all. Fixed: booking a session now auto-creates a `Project` from
the request's own intake fields (`description`/`placement`/`size`/`referenceImages`), and the new
Project's id becomes the Appointment's `projectId` (overriding anything the caller sent, same
"derived, not trusted" treatment already applied to `appointmentType`). `Project.title` is required
and `BookingRequest` never collects one, so `convertBookingRequest` gained a `projectTitle`
argument - required only when `outcome: session_booked` (a plain runtime check, not expressed as a
zod cross-field constraint) - surfaced as a text input in the dashboard's existing date/time
sub-form. `BookingRequest.referenceImages` are plain URL strings (no real `userId` existed when a
guest uploaded them); each gets wrapped into `Project.referenceImages`'s `[IBImage]` shape with the
now-real client's `userId` as the attributed uploader.

**Rate-limit fix for artist-submitted walk-ins.** `createBookingRequest`'s existing 5/hour/IP limit
is sized to stop anonymous scripted abuse of the public intake form - but an artist using that same
form for real walk-in clients at the studio would hit it on a busy day, since nothing distinguished
an authenticated caller from an anonymous one. Added `tryCheckAuth` (`utils/check-auth.js`) - a
non-throwing variant of the existing `checkAuth` that returns `null` instead of raising when
there's no/an invalid token - and used it to give an authenticated caller a separate, much higher
bucket (100/hour, keyed independently from the anonymous 5/hour bucket so the two can never bleed
into each other on the same IP) rather than exempting authenticated calls from rate-limiting
outright. `createBookingRequest` itself deliberately stays unauthenticated (`withAuth` isn't
applied) - this only changes which bucket/limit applies when a valid token happens to be present.

Verified the same way as the rates work above: schema validation for the new mutation shape,
syntax checks, and a standalone script confirming `tryCheckAuth` returns the decoded user for a
valid signed token and `null` for a missing/garbage one, without throwing either way.

### Appointment-creation wizard - done

New `client/src/components/ibCalendar/AppointmentWizard.jsx` replaces `CreateEventDialog.jsx` at
both entry points (`ibCalendar/Day.jsx`'s day-cell click, `ibCalendar/CreateEventButton.jsx`'s
header button) - `CreateEventDialog.jsx` itself and its existing test file were left in place,
now genuinely unreferenced from the app's real render tree, rather than deleted alongside a larger
change; cleaning it up is a small, safe follow-up (noted below, not done here).

Step one always asks what's being scheduled - consult, session, or other:

- **Consult** reuses the exact `createBookingRequest` -> `convertBookingRequest` pipeline a public
  guest already goes through, just entered by the logged-in artist on behalf of a walk-in/phone
  client (pick an existing `Client` from a dropdown, or enter new first/last/email/phone) instead
  of building a second, parallel "create a consult" path that could drift from the first one.
  Client -> intake details (description/placement/size/budget/cover-up) -> date/time, each its own
  step.
- **Session** requires a real `Project` - pick an existing one (`IBProjectsByArtistSelect`,
  already used elsewhere) or create a minimal new one inline (title/description + an *existing*
  `Client` only - see the scope note below) - then date/time. The appointment's `projectId` is
  always the chosen/just-created project's id; `createProject` didn't exist as a client-side
  mutation anywhere in this app before this (the only prior way a `Project` ever got made was the
  server's seed script) - added to `ProjectService.js` matching the server's flat-argument
  `createProject` signature (unlike `updateProject`'s wrapped `ProjectInput`).
- **Other** stays a single fast step (title/description/date-time, no project, no shop cut) -
  deliberately not folded into the multi-step flow, since blocking off time or logging a non-client
  entry shouldn't cost three screens.

All three paths end by refetching whichever appointments query `IBCalendar.jsx` is actually
watching (shop-scoped `getAppointmentsByShop` vs. artist-scoped `getAppointmentsByArtist`, chosen
by whether `shopId` is present) rather than hand-rolling three separate `cache.modify` calls for
three different mutations that all ultimately create an `Appointment` - simpler and less
error-prone than replicating that pattern three times.

**Deliberate scope cut, not an oversight:** a brand-new project's client is limited to an existing
`Client` record. Creating a genuinely new client inline here would mean re-implementing the same
find-or-create-by-email logic the Consult path already runs through properly - rather than
duplicate that a second time, a brand-new client either goes through the Consult path first (which
does this correctly) or the Clients page. Also not carried over from the original design
conversation: reference-image upload on the Consult path (the public form's upload route exists,
but wiring an authenticated equivalent into this wizard is a reasonable follow-up, not core to
unblocking the type-split itself).

Verified via `graphql`'s `buildSchema`/`validate` against the real SDL for the new
`createProject` document, `node --check`/`@babel/parser` on every new/changed file, and manual
tracing of every field name against the real query/mutation shapes already confirmed elsewhere
in this codebase (`FETCH_APPOINTMENTS_BY_SHOP`'s `$shopId`, `FETCH_APPOINTMENTS_BY_ARTIST_FOR_CALENDAR`'s
`$userId`, etc.) - this sandbox still can't run the client's Vitest suite (documented rollup
binary limitation) or click through the real UI, so **this needs a manual click-through before
relying on it**: try all three types, both new and existing client/project, and confirm the
calendar actually shows the new appointment afterward.

### In-project session view - done

Server: `Appointment` gained `timerStatus` (`'stopped'|'running'`, default `'stopped'`),
`timerStartedAt` (`Date`), `accumulatedSeconds` (`Number`, default `0`), and `sessionNotes`
(`String`) - see `models/Appointment.js`'s own comment for the full reasoning. Timer state is
server-persisted, not pure client React state, so a refresh/browser-close/laptop-sleep mid-session
doesn't lose elapsed time - `accumulatedSeconds` banks everything from prior start/stop cycles,
`timerStartedAt` marks when the *current* running interval began, and the live total while running
(`accumulatedSeconds + (now - timerStartedAt)`) is always computed on read, never stored. Three new
dedicated mutations - `startSessionTimer`/`stopSessionTimer`/`resetSessionTimer` (all
`appointmentId`-only, ownership-checked via a shared `loadOwnedAppointment` helper in
`mutations/appointments.js` - Admin/shop-admin-or-better or the appointment's own artist) - are the
only way to touch those three timer fields; they're deliberately absent from the generic
`AppointmentInput` so `updateAppointment` can't corrupt timer state. `sessionNotes` *is* on
`AppointmentInput` - a plain autosaved-on-save textarea has no start/stop semantics to protect.
New `getAppointmentsByProject(projectId)` query (same ownership shape as `getProject` itself:
shop-admin-or-better, the project's own artist, the project's own client, or shop staff affiliated
with the artist) powers the session list.

Client: `client/src/utils/sessionRate.js` is a small, dependency-free pure-logic module (no React/
Apollo, unit-tested standalone) with `getEffectiveRate` (decides shop's rate vs. the artist's own,
per `ArtistShopConnection.rateSource`, defaulting to `'shop'` when no connection record exists -
matching the schema field's own default), `computeSessionTotal` (hourly-from-elapsed-time or flat,
rounded to whole dollars - `total` is stored as `Int`, matching `ArtistPerformancePanel`'s existing
treatment of it), `getLiveElapsedSeconds`, and `formatElapsed`.
`client/src/components/projectSessions/ProjectSessionsList.jsx` renders inside a new "Sessions"
card on `Project.jsx`, listing every session tied to the project (date, open/completed, total);
clicking one opens `SessionDetail.jsx` in the existing global modal with start/stop/reset timer
buttons, a live-ticking elapsed readout, an editable "Session Total $" field pre-filled from the
computed suggestion (with a "Use Suggested" button to reset it back to that if hand-edited), a
notes textarea, a "Charge via Square" button (reuses the existing sandbox-only
`IBSquarePaymentForm` - not new payment infrastructure, per the earlier decision that real payments
stay deprioritized), and "Close Session" (`appointmentStatus: 'completed'` - the exact gate the
still-to-build payout dashboard below filters on). Once a session is closed, all of its controls
disable - no editing a session's timer/total/notes after the fact from this view.

Verified via `graphql`'s `buildSchema`/`validate` against the real SDL for every new/changed
query/mutation document (`getAppointmentsByProject`, all three timer mutations, the trimmed-payload
`updateAppointment` call this view uses), `@babel/parser` JSX parsing on every new/changed client
file, `node --check` on every changed server file, and a standalone Node script exercising
`sessionRate.js`'s four functions against known inputs (independent-artist vs. shop-with-`'shop'`-
source vs. shop-with-`'own'`-source rate selection, hourly vs. flat total math, live-elapsed math
against a fixed clock, and `H:MM:SS` formatting) - all passed. This sandbox still can't run the
client's Vitest suite (documented rollup binary limitation) or click through the real UI, so **this
needs a manual click-through before relying on it**: start/stop/reset a timer, save a note and a
manually-edited total, close a session and confirm its controls actually disable, and confirm the
shop-vs-own rate picker in Settings actually changes which rate `SessionDetail` suggests.

### Artist-dashboard shop-cut payout list - done

Moves shop-cut *payment actions* (send invoice, mark paid cash) off the per-appointment
Create/UpdateEventDialog and onto the artist's own dashboard, where every outstanding cut across
every completed session is visible and actionable at once - see `ShopCutPayoutList.jsx`
(`components/artistDashboard/`), rendered inside `ArtistPerformancePanel.jsx` only when
`isSelf` (the mutations it calls are all self-service, server-checked against
`String(user.id) === String(appointment.userId)`, so a shop admin viewing someone else's numbers
couldn't act on these buttons even if they were shown). Filtered to `appointmentStatus ===
'completed' && shopCutStatus === 'unpaid' && shopId` - the exact gate `SessionDetail`'s
close-session action sets, per the earlier design decision to only surface a shop cut as payable
once the session itself is actually done.

Each row gets a "Paid (Cash)" button (existing `markShopCutPaidManually` - unchanged, still sets
`pending_confirmation` and emails the shop rather than trusting the artist's own claim) and a
"Charge (Card)" button (existing `createShopCutInvoice`, one appointment at a time). New: checking
multiple rows enables "Send Combined Invoice", which calls a new `createBatchShopCutInvoice`
mutation - sums the selected sessions' `shopCutAmount`, creates one Square invoice for that total
(reusing `square.createAndPublishShopCutInvoice` unchanged - it already only needed a target amount
and description, nothing single-appointment-specific), and sets `shopCutStatus: 'invoice_sent'` +
the same `shopCutSquareInvoiceId` on every appointment in the batch. Server-side, this required
three real changes, not just a new resolver: `createBatchShopCutInvoiceInputSchema` (validation.js),
the `createBatchShopCutInvoice` resolver itself (checks ownership/shop/unpaid-status/same-shop on
*every* appointment in the batch before creating anything), and - easy to miss - the Square webhook
handler (`routes/squareWebhooks.js`), which previously did `Appointment.findOne({
shopCutSquareInvoiceId })` on `invoice.payment_made`; a batch invoice's payment event needs to mark
every appointment sharing that invoice id paid, not just whichever one `findOne` returned first, so
this is now `Appointment.find(...)` with a loop.

`UpdateEventDialog.jsx`'s shop-cut section is now read-only (status label + a note pointing at the
dashboard) - the `shopCutAmount` dollar input itself stays (still the only place that number gets
set), but the payment-method radio buttons and Send Invoice/Mark Paid buttons were removed along
with their handlers/mutations/state. Its existing test file had two tests asserting those removed
buttons rendered and worked - updated in place rather than left broken (one now asserts the buttons
are *absent* and the read-only note is present; the other, which tested clicking "Mark as Paid",
was removed outright since that action doesn't live in this component anymore).

Also fixed in passing: `client/src/constants/app.js`'s `SHOP_CUT_STATUS` array only had 3 of the 6
real `Appointment.shopCutStatus` enum values (missing `none`/`invoice_sent`/`pending_confirmation`)
- stale since the Square-invoice/manual-confirm flow was added. Wasn't actually wired to any
dropdown anywhere (grepped the whole client), but fixed for whoever reads it next.

**Cleanup done alongside this, not deferred further:** `CreateEventDialog.jsx` and its test file -
fully dead since `AppointmentWizard.jsx` replaced it at both real entry points a few commits ago -
are deleted, not just left unreferenced.

Verified via `graphql`'s `buildSchema`/`validate` against the real SDL for the new
`createBatchShopCutInvoice` mutation document, `node --check` on every changed server file,
`@babel/parser` JSX parsing on every changed client file, and re-confirming the full resolver map
still wires cleanly (`require('./graphql/resolvers/index')` after the schema change). This sandbox
still can't run either test suite (documented rollup/Mongo limitations), so **this needs a manual
click-through before relying on it**: complete a session with a shop cut owed, confirm it shows up
in the dashboard's payout list, try both the cash and single-card-invoice buttons, then try
selecting 2+ rows and sending a combined invoice, and confirm the amounts/status transitions match
what's expected.

### UI consistency sweep - first pass done, real scope larger than one pass

Scoped down to the concrete thing the user actually asked for: "all edit pages should have
consistent UI matching EditArtist's look/feel" (functionality unchanged - explicitly UI-only, per
the user's own clarification). Read all four canonical edit forms
(`components/{artist,client,staff,shop}/edit/Edit*.jsx`) side by side rather than assuming, and
found the real, concrete gap: `EditArtist.jsx`/`EditClient.jsx` already use the styled `IBInput`
(MUI `TextField`) component for every field, but `EditStaff.jsx` and `EditShop.jsx` were still
using bare unstyled native `<input>` elements - the actual visible inconsistency, not a vague one.
Fixed by swapping every `<input ref={...}>` to `<IBInput inputRef={...}>` in both files, prop-for-
prop identical (`type`/`defaultValue`/`placeholder` untouched) so this is purely visual - no
`handleSave` logic, ref usage, or submitted data changed at all.

Two smaller bugs fixed alongside, both squarely UI/markup, not behavior: (1) `EditStaff.jsx`'s
Title field had a copy-paste `className="artistItem"` instead of `"staffItem"` - cosmetically
harmless today only because `.artistItem` happens to be defined globally with the same layout
rules, but a landmine waiting for either class to diverge; (2) `.artistActions`'s
`justify-content` was declared *twice* across this app with conflicting values -
`editArtist.css` said `left`, `pages/artists/artist.css` said `right` - meaning which one actually
won depended on CSS load order, not deliberate design. Every other edit page's own `*Actions` rule
(client/staff/shop) already says `right`, so `editArtist.css` was the outlier - fixed to `right` to
match everywhere else and to stop the two same-named rules from disagreeing with each other.

**What this pass deliberately did not do, and why it's flagged rather than silently skipped:**
this app has no CSS Modules/scoping - every component's CSS file declares plain global class names
(`.shopItem`, `.artistActions`, etc.), and multiple unrelated files (an edit form's own CSS file
*and* that entity's list/detail page CSS file) independently redeclare the same class names,
sometimes with different values, as this pass's own `.artistActions` finding shows. That's the
actual root cause of "look and feel isn't consistent" - not that nobody tried, but that styling
correctness currently depends on avoiding accidental collisions across files that don't know about
each other. A real fix is a CSS Modules (or styled-components/Tailwind) migration - a much larger,
separate effort than one pass, and not started here. Also out of scope for this pass, deliberately:
`Profile.jsx`/`Settings.jsx` (newer pages, already both use `IBInput` consistently - not part of
the reported gap) and any deeper visual redesign beyond matching what `EditArtist.jsx` already
does.

Verified via `@babel/parser` JSX parsing on both changed files, and confirming (via `Grep`) no
lingering bare `ref={...}` was left unconverted to `inputRef={...}` in either file - a raw `ref`
passed to a non-forwardRef component like `IBInput` would silently fail to populate `.current`,
which `handleSave` in both files depends on. This sandbox still can't run the client's Vitest suite
or render the real UI, so **this needs a manual click-through before relying on it**: open Edit
Staff and Edit Shop, confirm every field now renders as a styled MUI input matching Edit
Artist/Edit Client, and confirm Save still submits the same values as before.

This closes out Phase 7's originally-scoped four pieces (rates/settings, booking-request pipeline,
appointment wizard, in-project sessions, shop-cut payout dashboard, and now this first UI pass).
The CSS-architecture root cause above is a real, separate follow-up worth its own pass, not
something to fold into "later" without writing it down.

### Phase 7 follow-up fixes from first real usage (August 3, 2026) - done

Four issues reported after actually clicking through the wizard/dashboard built above - three real
bugs, one design change:

**Consult silently "not saving" + the client dropdown itself, in both Consult and Session.**
Traced the "nothing happened" report by re-reading the wizard's old client-step flow end to end:
the "consult-client" step's own "Next" button never validated anything before advancing, so
picking "Existing client" with zero clients on file (or just not picking one) sailed straight
through to the details/date-time steps - the *only* place that ever caught the missing client was
the final Save handler, which set a small red one-line error inside the dialog. Easy to miss
entirely, and functionally indistinguishable from nothing happening at all. Rather than just adding
more validation to the same dropdown-based step, replaced it per explicit direction: no more
client dropdown in either Consult or Session. The new "client-email" step is a single email field -
typed against the artist's already-fetched client list (no new query) for a live match; a match
shows a read-only "Found: Name - phone" card, no match shows first/last/phone fields to create one.
Either way the same firstName/lastName/email/phone end up in `createBookingRequest`'s input exactly
as before - the server's existing `findOrCreateGuestClient` (already used by the public intake
form) still does the actual find-or-create by email, so this is a client-side UX change only, no
new server logic. Every save (success or failure, all four submit handlers) now also raises a real
global alert via `setAlert`, not just the small in-dialog line - a failure can't go unnoticed the
same way again regardless of root cause.

**Session's "new project" path now reuses the Consult pipeline, not a separate one.** Per explicit
direction ("the next step will be the same booking request form fields as for the consult...the
session needs to be a project as well and contain all of that information"), a brand-new-project
Session no longer calls `createProject`+`createAppointment` directly - it now goes through the
exact same `createBookingRequest` -> `convertBookingRequest` pipeline as Consult, just with
`outcome: 'session_booked'` and an added required Project-title field (Project.title is required
and BookingRequest never collects one - same requirement `convertBookingRequest` already enforced
for this outcome, see that resolver). `convertBookingRequest`'s existing session_booked branch
already auto-creates the Project from the booking request's own description/placement/size - no
server changes needed here at all, this was a client-only restructuring of `AppointmentWizard.jsx`.
Session against an *already-existing* Project is unchanged (no client step needed - the project
already has one; pick project -> date/time -> `createAppointment` directly).

**Dashboard showing "(untitled appointment)" despite a title being entered.** The title the user
typed was the *Project's* title (there was no field to set the Appointment's own title for a
session at all - by design, see `AppointmentWizard.jsx`/`convertBookingRequest`, a session/consult
Appointment never gets its own `title`). `ArtistPerformancePanel.jsx`'s upcoming-appointments list
only ever read `appt.title`, with no fallback and no `project.title` even fetched by
`AppointmentService.js`'s `_FETCH_APPOINTMENTS_BY_ARTIST` query. Fixed: that query now selects
`projectId`/`project { id title }`, and the list falls back to `appt.project?.title` before
"(untitled appointment)" (checked: `Appointment.project` field resolver already existed and works -
`Project.findById(appointment.projectId)`, see `resolvers/index.js` - so this was purely a missing
client-side field selection, not a server gap).

**Dashboard rows weren't clickable.** Same list now navigates to `/project/:projectId` on click
whenever an appointment has one (session appointments do, since `convertBookingRequest` auto-creates
a Project for a `session_booked` outcome; a pure consult does not by design - see the follow-up
section below - and "other" appointments never have a project; all three cases stay non-clickable
with no dead click targets).

Not touched, same rationale as "not part of the reported gap" above: the calendar's own day-cell
rendering (`ibCalendar/Day.jsx`) has this same missing-`project.title`-fallback gap in its own
tooltip/label text - noticed while tracing the dashboard bug, but not reported broken and not fixed
here to stay scoped to what was actually asked.

Verified via `@babel/parser` JSX parsing on every changed file and `graphql`'s `buildSchema`/
`validate` against the real SDL for the (unchanged-shape but re-checked) `createBookingRequest`/
`convertBookingRequest` documents and the extended `getAppointmentsByArtist` query - all valid.
Attempted to reproduce the original "nothing happened" report end-to-end against a real in-memory
Mongo (`mongodb-memory-server`, already a devDependency) rather than guess - this sandbox's network
allowlist blocks the mongod binary download (403), so that couldn't run; the fix above is grounded
in reading the actual old step-transition logic, not a confirmed repro. **This needs a real
click-through before relying on it**: create a Consult via email lookup (both a matching and a
non-matching email), create a brand-new-project Session the same way and confirm a Project was
actually created with the entered details, create a Session against an existing project (unchanged
path), and confirm the dashboard now shows real titles and navigates to the right project on click.

### Phase 7 follow-up fix #2: convertBookingRequest wrote the wrong Appointment.userId, and never set shopId (August 3, 2026) - done

The click-through above turned up a deeper bug the wizard rewrite didn't touch: a converted
Consult (and, it turns out, a converted Session too) showed up correctly in the booking-request
list but never appeared on the artist's own calendar or dashboard. Root cause, found by re-reading
every real consumer of `Appointment.userId` against what `convertBookingRequest`
(`server/graphql/mutations/bookingRequests.js`) was actually writing:

- **`Appointment.userId` means "the artist" everywhere else in this codebase** -
  `getAppointmentsByArtist`/`getAppointmentsByShop` filter on it as the artist,
  `loadOwnedAppointment` (`mutations/appointments.js`) checks it against the caller as the artist,
  every other creation path (`createAppointment`, the wizard's own existing-project session path)
  sets it to the logged-in artist's own id. `convertBookingRequest` alone set it to
  `clientForAppointment.userId` - the *client's* id - so `getAppointmentsByArtist(artistId)` could
  never match the resulting Appointment against its own artist. This is the exact reason "shows up
  in booking-request view, not on calendar or dashboard."
- **`shopId` was never set at all.** `IBCalendar.jsx` exclusively queries `getAppointmentsByShop`
  once an artist belongs to a shop (falling back to `getAppointmentsByArtistForCalendar` only when
  shopless) - confirmed neither client caller (`AppointmentWizard.jsx` nor the pre-existing
  `ArtistBookingRequests.jsx` dashboard) ever sends a `shopId` on conversion. A shop-affiliated
  artist's converted booking request was therefore invisible on their calendar independent of the
  `userId` bug above.

Fixed both server-side in the one resolver, so both existing callers are covered without relying on
either client to remember a `shopId`: `userId` is now always `bookingRequest.artistId.toString()`;
`shopId` is derived from `Artist.findOne({ userId: bookingRequest.artistId }).shopId` (the same
single-shop `Artist.shopId` convention every other appointment-creation path already reads via
`user.userInfo.shop.id`/`Artist.shop`'s resolver - not the newer multi-shop
`ArtistShopConnection`/`getShopIdsForUser` model, which nothing else in this pipeline uses). Also
corrected an inaccurate comment left in `ArtistPerformancePanel.jsx` from the first follow-up pass
that claimed a consult "always" gets a Project/projectId - it doesn't; only `session_booked`
outcomes create one (see `convertBookingRequest`'s own comment on why), so a pure consult
Appointment is expected to stay non-clickable on the dashboard even after this fix.

Added two regression tests to `server/test/integration/bookingRequests.test.js`'s
`convertBookingRequest` describe block: one asserting the resulting Appointment's `userId` equals
the artist's own id (not the client's), one asserting `shopId` equals the artist's shop id when the
artist has one. Verified via `node --check` on both the resolver and test file, and via
`graphql`'s `buildSchema` against the real SDL (no schema/typeDefs changes, resolver logic only).
Could not run the tests themselves - same `mongodb-memory-server` 403 network-allowlist block as
the first follow-up pass.

**Resolved - the consult/Project question:** confirmed the intended funnel is `pending` ->
`consult_booked` -> (`session_booked` | `not_booked`), with `session_booked` reachable directly from
`pending` too (some sessions get booked with no separate consult). A consult does *not* spawn a
Project on its own - only the eventual `session_booked` conversion does, whether that happens
straight from `pending` or as the next step after an existing `consult_booked` request. See the
next section for what that required.

A specific existing record (a Joseph Smith consult under an `artist.jonas`-named test account) was
flagged as "not linked to a project, not clickable" - that's expected for a pure consult under this
design, not a bug. That specific record also predates the userId/shopId fix above, so it still has
the wrong `userId`/no `shopId` baked in and won't retroactively correct itself - it'll need to be
recreated (or hand-corrected in Mongo) to actually verify against a shop-affiliated artist's
calendar/dashboard now.

**Also raised, confirmed as already correct, not a code change:** the intended public-booking-
request flow - a guest submits the intake form with no date; the artist reviews it, corresponds with
the guest, and only then sets a date when converting to a consult or session. That already matches
how `createBookingRequest`/`convertBookingRequest` are built (`BookingRequest` never collects a
date; `appointmentInput.appointmentDate` is only supplied at conversion time, by the artist) - no
gap found, this was a confirm-the-design check, not a bug report.

### Phase 7 follow-up fix #3: consult -> session progression + a distinct "not booked" outcome (August 3, 2026) - done

Before this, `convertBookingRequest` treated `consult_booked` as a dead end: once a request became
a consult, there was no way to later book the actual session from it (the "Book Consult / Book
Session / Decline" actions on `ArtistBookingRequests.jsx` only rendered for `status === "pending"`),
and the only terminal non-success state was `declined` - conflating "never even had a consult" with
"had the consult, client went cold," which loses information an artist would actually want when
reviewing their own booking-request history.

Changes, all server-driven so the existing dashboard and the wizard both get this for free:

- `BookingRequest.status` enum gained a fifth value, `not_booked`, kept deliberately distinct from
  `declined` (see that model's own comment on why - different points in the real-world funnel, same
  practical "nothing more happens here" outcome).
- `convertBookingRequest` now enforces which outcome is reachable from which *current* status
  (`VALID_OUTCOMES_BY_STATUS`, resolver-local): `pending` -> `consult_booked | session_booked |
  declined`; `consult_booked` -> `session_booked | not_booked`; anything already terminal
  (`session_booked`/`declined`/`not_booked`) rejects any further conversion. Previously there was no
  such guard at all - a second call against an already-`session_booked` request would have silently
  created a *second* Appointment/Project and overwritten `resultingAppointmentId`, orphaning the
  link to the first one.
- `not_booked` behaves like `declined` (status change only, no Appointment/Project) but is only
  reachable from `consult_booked`.
- `ArtistBookingRequests.jsx` gained a second action block, rendered for `status === "consult_booked"`:
  "Book Session" (reuses the same date/time + project-title sub-form as the pending path) and "Mark
  Not Booked". Forwarding to a shop-mate isn't offered here - that action is for a request nobody's
  engaged with yet.
- `convertBookingRequestInputSchema` (zod) extended to accept the new outcome value.

Also fixed, found while extending the test file: `CONVERT_BOOKING_REQUEST`'s test query never
declared a `$projectTitle` variable at all, so the existing "converts to session_booked" test's
`projectTitle` would never have reached the resolver had it actually run against a database - the
resolver would have thrown for a missing required project title. Added the missing variable
declaration and a real value to that test.

Added five regression tests to `bookingRequests.test.js`: consult -> session progression (asserts
the resulting Appointment has a `projectId`), consult -> not_booked (asserts no Appointment is
created), rejecting a second conversion of an already-`declined` request, and rejecting `not_booked`
on a still-`pending` request. Verified via `node --check` on every changed file and `graphql`'s
`validate`/`buildSchema` against the real SDL for the updated test query. Could not execute the
tests themselves - same `mongodb-memory-server` 403 network-allowlist block as the prior two
follow-up passes.

### Phase 7 follow-up fix #4: manual appointments were leaking into the public Booking Requests inbox, and consult/session titles showed literal "null" (August 3, 2026) - done

A real click-through (create a consult directly from the calendar's appointment wizard, not the
public intake form) turned up two more gaps in the same convertBookingRequest pipeline:

**A manually-created consult/session showed up in the artist's own "Booking Requests" inbox.**
`AppointmentWizard.jsx`'s Consult and new-project-Session paths both call
`createBookingRequest`/`convertBookingRequest` purely to reuse that pipeline's find-or-create-
client + Appointment/Project creation logic - not because the artist actually submitted a request
to themselves. But `getBookingRequests` (the artist-facing inbox, powering
`ArtistBookingRequests.jsx`) had no way to tell that kind of BookingRequest apart from a real guest
submission via the public intake form, so every wizard-created consult/session echoed back at the
artist as if a stranger had just requested it. Fixed by adding `BookingRequest.source`
(`public_form` | `artist_created`, default `public_form`) - `AppointmentWizard.jsx` is the one
caller that now sends `artist_created`; `getBookingRequests` filters to `source: 'public_form'`
only. Not a security boundary (an artist could tag their own submission either way with no
consequence beyond which of their own dashboard lists it shows up in) - purely a UI-categorization
field, so the client is trusted to set it honestly. `ArtistBookingRequests.jsx`'s "Book Consult /
Book Session from a real public submission" flow (the thing an artist should still be able to do)
is unaffected - it only ever acts on requests this query still returns.

**Consult/session Appointment titles showed the literal text "null" in the calendar.** Neither
outcome ever set `Appointment.title` at all - a session had a Project to eventually fall back to on
the dashboard (see follow-up #1 above), but `ibCalendar/Day.jsx`'s own event-label template string
(`` `${time} - ${evt.title}` ``) had no such fallback, so a null title rendered as the literal word
"null", not blank - exactly what was reported. Fixed at the source: `convertBookingRequest` now
sets a real `title` at creation - the client's name for a consult (which has no Project to borrow
one from), the just-created Project's own title for a session. `description` is copied from the
BookingRequest onto the consult Appointment too, for the same "nothing else to hold this" reason.
`ibCalendar/Day.jsx` also gained a defensive `evt.title || evt.project?.title || "Untitled"`
fallback and the calendar's own queries now select `project.title`, so a stale pre-fix record (or
the existing-project session path, which still has no BookingRequest to derive a title from -
fixed separately in `AppointmentWizard.jsx`'s `handleSubmitExistingProjectSession` by borrowing the
already-selected Project's own title) renders sensibly instead of "null" either way.

**A consult had no way to be viewed or converted to a session from the dashboard.** The dashboard's
clickability only ever checked `appt.projectId`, which a pure consult never has by design. Added
`Appointment.bookingRequestId` (stamped by `convertBookingRequest`, both outcomes) plus a
`bookingRequest` field resolver (mirrors the existing `project` resolver), so a consult can surface
its original intake details without needing a Project of its own. Built `ConsultDetail.jsx` (new
route `/consult/:appointmentId`) - shows the client's contact info and intake fields (pulled from
the linked BookingRequest) and, while that BookingRequest is still `consult_booked`, a "Convert to
Session" action that calls the same `convertBookingRequest(outcome: 'session_booked')` used
elsewhere. `ArtistPerformancePanel.jsx`'s dashboard rows now route a session appointment to its
Project (unchanged) and a consult appointment (one with a `bookingRequestId`) to `ConsultDetail`
instead of leaving it non-clickable. Also added `BookingRequest.resultingAppointment` (mirrors
`Appointment.bookingRequest`) so converting a consult to a session can navigate straight to the new
Project in one round trip rather than a second query.

Added regression tests: `getBookingRequests` excludes `artist_created` submissions (and a
submission with no explicit `source` still defaults to `public_form`); `convertBookingRequest`
derives the client's name as a consult's title (plus copies `description` and stamps
`bookingRequestId`) and the Project's title as a session's. Verified via `node --check` on every
changed server file, `@babel/parser` JSX parsing on every changed client file including the new
`ConsultDetail.jsx`, and `graphql`'s `buildSchema`/`validate` against the real SDL for every new or
changed query/mutation document (`getBookingRequests`, the extended `convertBookingRequest`
selection, the new `getAppointment` document `ConsultDetail.jsx` uses). Could not execute the test
suite itself - same `mongodb-memory-server` 403 network-allowlist block as every prior follow-up
pass this week; a real click-through (create a consult from the calendar, confirm it's absent from
Booking Requests, open it from the dashboard, convert it to a session) is still the only way to
fully confirm this end to end.

### Phase 7 follow-up fix #5: shopId-immutability crash, calendar labels only rendering in tooltips, single-date-only session booking, and no session CRUD from the Project page (August 3, 2026) - done

A second real click-through (booking a session against a brand-new project) turned up four more
gaps, all downstream of the fixes above:

**Saving a session threw `shopId cannot be changed once an appointment has been attributed to a
shop.`** `updateAppointment`'s immutability check compared the raw incoming
`appointment.shopId` against the existing one, but `SessionDetail.jsx`'s minimal-payload save (see
`AppointmentService.UPDATE_SESSION_DETAILS` - only ever sends `id/appointmentDate/total/
sessionNotes/appointmentStatus`, deliberately never `shopId`) means `appointment.shopId` is simply
absent, not falsy-with-a-value - `String(undefined || '') !== String(realShopId)` always threw.
This bug existed all along but had no way to surface until follow-up fix #2 (above) made
`convertBookingRequest` actually set `shopId` on session/consult Appointments - before that,
`existingAppointment.shopId` was always empty, so this branch never ran. Fixed by gating the check
on `'shopId' in appointment` (a plain JS `in` check - verified via a live `graphql()` run in this
session that an omitted GraphQL input field is truly absent as a JS key, not present-with-value-
`undefined`) rather than just truthiness, so a partial update that never mentions `shopId` leaves
it untouched instead of being treated as an attempt to null it out. Added a regression test
matching `SessionDetail.jsx`'s exact minimal-payload shape.

**Calendar events only showed their color-coded label in a hover tooltip, not in the day cell
itself.** `ibCalendar.css`'s `.ibCalendarDateCell` carried a hardcoded `height: 24px; line-height:
24px` meant only for the day-number header text, but it wrapped both the header *and* the events
list below it - squashing the whole cell, including every event's colored label div, into a 24px
sliver. The label divs were still genuinely in the DOM (MUI `Tooltip`s render via a portal, outside
this clipped box, which is exactly why hovering still worked), just visually invisible. Fixed by
splitting the header's fixed sizing onto its own `.ibCalendarDayHeader` class and letting
`.ibCalendarDateCell` stretch (`flex; height: 100%`) with a new `.ibCalendarDayEvents` child taking
the remaining space - `Day.jsx` updated to use both new classes.

**Booking a session only ever allowed one date, and used a plain
`<input type="datetime-local">`.** A real tattoo project is very often several sittings agreed on
up front (a sleeve, a large back piece). Built a shared `BookSessionDatesForm.jsx` (used by both
`ArtistBookingRequests.jsx` and `ConsultDetail.jsx`, rather than two copies that could drift, per
this app's own established anti-pattern lesson elsewhere) - lets an artist add as many session dates
as needed, each via the app's existing `IBDateTimePicker` (the same date/time picker
`AppointmentWizard.jsx` already uses) instead of a native input. Mechanically: the first date still
goes through `convertBookingRequest(outcome: 'session_booked')` (the only call that creates the
real Project from the BookingRequest's intake fields); every additional date reuses the plain
`createAppointment` mutation pointed at the just-created project, mirroring
`AppointmentWizard.jsx`'s existing "session against an existing project" path. No new server-side
mutation was needed.

**The Project page had no way to add another session, and an open session's date/time wasn't
editable or deletable.** `ProjectSessionsList.jsx` gained an "Add Session" button/inline form
(same `IBDateTimePicker` + `createAppointment`, using the *project's* own artist/shop - not
necessarily the viewer's - since a shop admin can view and add a session to another artist's
project) and each row now shows the full date+time (`LLL`, not date-only `LL`). `SessionDetail.jsx`
gained an editable `IBDateTimePicker` for `appointmentDate` (previously not editable anywhere -
`buildSavePayload()` just echoed back the original value unchanged) wired into the existing save
path, and a "Delete Session" action using the already-defined `AppointmentService.DELETE_APPOINTMENT`
mutation with a `window.confirm` guard (matching this app's existing confirm-before-destructive-
action pattern) and a new `onDeleted` callback so the parent list refreshes and the modal closes.
`AppointmentService.UPDATE_SESSION_DETAILS`'s return selection gained `appointmentDate` so the
saved value round-trips back into local state without a refetch. `IBDateTimePicker` itself gained a
`disabled` prop (previously unsupported) so the date can be locked once a session is closed, same
as the total/notes fields already were.

Verified via `node --check`/live `graphql()` experiments on the server-side change, `@babel/parser`
JSX parsing on every changed/new client file (`ProjectSessionsList.jsx`, `SessionDetail.jsx`,
`IBDateTimePicker.jsx`, `BookSessionDatesForm.jsx`, `ConsultDetail.jsx`,
`ArtistBookingRequests.jsx`). Could not execute the client or server test suites - same
`mongodb-memory-server` 403 network-allowlist block as every prior pass this week, and the client
suite wasn't run in this pass either. The calendar CSS fix and the date/time-picker UX in
particular still need a real browser click-through to confirm visually - nothing in this sandbox
can render CSS or take a screenshot.

### Phase 7 follow-up fix #6: dashboard appointments missing the time, calendar day-cell min-height, and a real default tagColor (August 3, 2026) - done

Two more small dashboard/calendar issues plus one real bug:

**The artist dashboard's "Upcoming Appointments" list only showed the date.**
`ArtistPerformancePanel.jsx` (mounted on both Home.jsx's self view and Artist.jsx's shop-admin
view) used `toLocaleDateString` - switched to `toLocaleString` with both date and time options.

**Calendar event labels still weren't rendering after follow-up #5's CSS fix.** That fix (splitting
`.ibCalendarDayHeader`'s sizing out of `.ibCalendarDateCell`) was necessary but apparently not
sufficient - `.ibCalendarDateCellBody`'s height still comes from a `flex: 1` chain that ultimately
depends on `Month.jsx`'s Grid container (one `height: 800` on the whole 6-row grid, not per row)
correctly distributing that space through flexbox's default multi-line stretch behavior - not
something verifiable without a real browser (none available in this sandbox). Gave
`.ibCalendarDateCellBody` a direct `min-height: 90px` instead of relying on the percentage chain -
guaranteed room for the header plus a few events regardless of what the ancestor resolves to.

**A user with no tagColor selected defaulted to white - invisible on their own calendar.**
`Register.jsx` hardcoded every self-registered account's `tagColor` to the literal `'#fff'`, and
`updateAppointment`'s resolver just echoed back whatever it was sent - so any artist who never
happened to open Profile and pick a color had appointments that rendered with a white label on a
white cell (only visible via the tooltip - see follow-up #5's diagnosis of the same visual symptom
for a different root cause). Built `utils/tag-color.js`: a `TAG_COLORS` palette mirroring the
client's own list, a fixed `DEFAULT_NO_SHOP_TAG_COLOR` (`'#8E24AA'`, "Royal Purple" in that
palette) for anyone with no shop affiliation, and `pickDefaultTagColor(shopId, excludeUserId)`
which picks a color guaranteed not already in use by another Staff/Artist member of that shop (via
`getMemberUserIdsForShop`, the same shop-membership resolution `getUserTagColors` already uses) -
falling back to the first palette color if a shop somehow has more members than the 15-color
palette. `isUnsetTagColor` treats `undefined`/`null`/`''`/`'#fff'`/`'#ffffff'` (any casing) as "not
a real choice yet" - a tagColor an artist or admin actually picked is never overwritten, even if it
later collides with a shop-mate.

Wired in three places: `register()` now always assigns `DEFAULT_NO_SHOP_TAG_COLOR` itself,
ignoring any tagColor the client sends (a self-registered account is always a shopless Client, so
there's nothing to be unique against) - `Register.jsx`'s hardcoded `'#fff'` was removed entirely,
along with a stray dead `user` object it never actually sent. `login()` self-heals any account
whose tagColor is still unset the moment they next log in, using their first shop (if any, via the
same `getShopIdsForUser` used elsewhere) for shop-scoped uniqueness or the purple default
otherwise - this fixes every already-broken existing account without needing a one-off DB
migration script, which this sandbox has no way to run against a live database anyway
(`mongodb-memory-server`'s binary download is blocked here, same as every other pass this week).
`connectArtistToShop` also assigns a shop-unique color at the moment a real shop affiliation forms,
so a newly-connected artist doesn't have to wait for their next login to get a non-colliding color.

Added regression tests: `register()` always returns the purple default regardless of what's sent;
`login()` heals both a never-set and the old literal-white tagColor, assigns a shop-unique color
for a shop-affiliated artist (verified against a shop-mate's existing color), and leaves an
already-set real tagColor untouched; `connectArtistToShop` assigns a real color when unset, avoids
colliding with an existing shop-mate's color, and never overwrites a deliberate existing choice.
Verified via `node --check` on every changed/new server file and `graphql`'s `buildSchema`/`parse`/
`validate` against the real SDL for every changed query/mutation document (the extended
`register`/`login`/`connectArtistToShop` selections). Could not execute the test suite itself -
same `mongodb-memory-server` block as every prior pass this week.

### Phase 7 follow-up fix #7: page content hidden under the fixed header, Settings had no shop-affiliation UI, calendar edit/view separation, shop cut removed from the appointment modal, and a dashboard caching gap (August 3, 2026) - done

Five more issues from continued real usage:

**Page content rendered underneath the app's own header on every page, not just ConsultDetail.**
`components/sidebar/Sidebar.jsx` renders its own MUI `AppBar` with `position="fixed"` (the real
header - the separate, unrelated `Topbar.jsx` component is commented out in `App.jsx` and was never
the culprit). A fixed element is removed from normal document flow entirely, so nothing below it
gets pushed down automatically - the Drawer compensates for this internally (its own `DrawerHeader`
spacer), but the actual routed page content in `App.jsx` never did. ~19 individual pages had each
separately hand-patched this with their own hardcoded `margin-top: 60px` (one used `55px`) on their
own top-level wrapper class - an inconsistent, per-page workaround rather than a fix at the source,
and `ConsultDetail.jsx`/`ArtistBookingRequests.jsx` (reusing `artistBookingRequests.css`) had no
workaround at all, which is what made the overlap visible there first. Fixed at the one real source:
`App.jsx` now wraps `<Routes>` in a `<Box component="main">` with an empty MUI `<Toolbar />` spacer
as its first child (only rendered when `user` is truthy, matching the `AppBar` itself) - MUI's own
documented pattern for this exact "permanent mini-drawer + fixed AppBar" layout, since it tracks the
AppBar's real rendered height (which changes across breakpoints) instead of a hardcoded number.
Removed all ~19 pages' redundant `margin-top` hacks, which would otherwise have doubled up with the
new global spacer and pushed every page's content down twice as far.

**Settings had no way to see or manage shop affiliation at all.** An artist could see their rate
settings and (if already connected) which rate source applied, but nothing showed which shop they
belonged to, and there was no way to connect to a shop or disconnect from one -
`connectArtistToShop`/`disconnectArtistFromShop` existed server-side with no client caller at all.
Added a "Shop" card at the top of Settings.jsx: shows the connected shop's name/website (already
available on the cached user from login/register - see `Login.jsx`'s own `userInfo.shop` selection,
no new query needed for that part) with a "Disconnect from Shop" action, or, for an independent
artist, a small form to connect via a Shop ID (the only mechanism `connectArtistToShop` actually
supports today - see that mutation's own comment: "there's no invite-link/shop-directory
request-approve flow yet", not something this fix invents a workaround for). Added the two missing
mutations to `ArtistShopConnectionService.js` and a lazy `ShopService.useLazyShop` (fetches
id/name/website by shopId) used right after a successful connect, since `connectArtistToShop`'s own
response is just the raw `ArtistShopConnection` record with no shop name to display - the result
updates the cached user (`updateCurrentUser`) so the rest of the app (calendar, rate-source card)
reflects the new affiliation immediately, no re-login required.

**A shop-connected artist's calendar showed every artist's appointments (already correct -
`getAppointmentsByShop` was already shop-wide, not scoped to the caller), but clicking a shop-mate's
appointment silently did nothing at all.** `Day.jsx`'s `handleUpdateEvent` already correctly gated
`UpdateEventDialog` (the editable dialog) to `evt.userId === user.id` - that's the right "can't edit
someone else's appointment" behavior, but a dead click reads as broken, not as "this is read-only".
Built `ViewEventDialog.jsx` - a deliberately minimal, non-editable summary (artist name/tag color,
date/time, title, client if it's a session, description) with only a Close button, opened instead
whenever the clicked appointment belongs to a different artist. Reusing `UpdateEventDialog` itself
in some "disabled" mode wasn't safe: it fetches `ProjectService.fetchProjectsByArtist(user.id)` -
the *viewer's own* projects, not the appointment owner's - so its project dropdown would silently
show the wrong artist's projects entirely if just unlocked read-only.

**Shop cut had an editable amount field and a status readout inside the appointment edit
dialog.** Paying/invoicing a shop cut already lives entirely on the artist dashboard's "Shop Cut
Payouts" list (`ArtistPerformancePanel.jsx`/`ShopCutPayoutList.jsx`, across every completed session
at once) - the amount field and status panel in `UpdateEventDialog.jsx` added a second, duplicate,
partially-editable surface for the same data with no real workflow attached to it there. Removed
both entirely; `handleSubmit`'s save payload now echoes back `event.shopCutAmount`/`shopCutStatus`
unchanged instead of reading a ref that no longer has a DOM node behind it (the same "don't touch
what this view doesn't actually edit" pattern `SessionDetail.jsx`'s own minimal-payload save already
uses). Updated `UpdateEventDialog.test.jsx`'s matching test into a regression test confirming the
panel never reappears, even when the appointment has a shopId.

**Converting a consult to a session, editing the new project, then visiting the dashboard didn't
show the new session until a hard reload.** `ArtistPerformancePanel.jsx`'s two dashboard queries
(`AppointmentService.getAppointmentsByArtist`, `ProjectService.fetchProjectsByArtist`) both used
Apollo's default `cache-first` fetch policy. Converting a consult creates the new Appointment/
Project via mutations (`convertBookingRequest`, `createAppointment`) that have no reason to know
these specific cached list queries exist, let alone update them - Apollo normalizes individual
entities into its cache automatically, but never inserts a newly-created entity into an
*already-cached* list query's result array on its own. If the dashboard had been visited once
already earlier in the session, revisiting it after creating something elsewhere just re-served the
stale cached array, and only a full page reload (which resets the in-memory cache entirely) showed
the new data. Changed both to `fetchPolicy: 'cache-and-network'` - still shows the cached list
instantly (no loading flash on a normal visit) but always fires a real network request behind it
too, so a dashboard visit is guaranteed to reflect anything created elsewhere in the same session.
Note: the calendar's own list queries (`getAppointmentsByShop`/`getAppointmentsByArtistForCalendar`)
likely have the same underlying staleness risk (same cache-first default, same "a mutation
elsewhere doesn't know to update this list" gap) - not changed here since it wasn't the reported
symptom, but worth the same fix if a similar "created it elsewhere, calendar didn't pick it up
without a reload" report comes in.

Verified via `@babel/parser` on every changed/new client file (`App.jsx`, `Settings.jsx`,
`ShopService.js`, `ArtistShopConnectionService.js`, `Day.jsx`, `ViewEventDialog.jsx`,
`UpdateEventDialog.jsx`, `UpdateEventDialog.test.jsx`, `AppointmentService.js`, `ProjectService.js`)
and `graphql`'s `buildSchema`/`parse`/`validate` against the real SDL for the new
`connectArtistToShop`/`disconnectArtistFromShop`/`getShop` documents. Could not execute the client
test suite - this sandbox's `npm install` is also network-blocked (403 from the npm registry,
same class of restriction as `mongodb-memory-server`'s block on the server side), and a pre-existing
`@rollup/rollup-linux-x64-gnu` optional-dependency gap means `vitest` can't even start here as-is.
None of this round's changes could be visually confirmed in a real browser either - the header-
spacing fix and the Settings page layout in particular are worth a real click-through.

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
