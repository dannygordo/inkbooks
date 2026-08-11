# Where this project is

**Read this first, then `DECISIONS.md`.** This file is *state* — what is done, what is next, what
has not been verified. `DECISIONS.md` is *rules* — the settled calls and why. They change at
different rates, which is why they are separate files.

Last updated: 2026-08-11.

---

## Test status

The server suite is green. The client suite has not been run since the charge work.

| Suite | Files | Tests | Status |
|---|---|---|---|
| `server` (unit + integration) | 49 | 740 | green |
| `client` | 24 | — | new panels green; **full suite not re-run** |

Green is the standing expectation now, not an achievement — treat a failure as a real regression
rather than as a test nobody had ever run.

**The client suite has not been run since the charge work.** `SessionDetail` and
`BookSessionDatesForm` both changed shape, `SessionDetail` now fires a query it did not before, and
`IBInput` gained an `inputProps` passthrough. `SquarePanel.test.jsx` and
`SquarePricingPanel.test.jsx` pass on their own; the rest is unobserved.

```
cd client && npm test
```

### Every failure so far has been in a test, never in the code

Worth knowing, because it should change how the next one is read. Across three integration runs:

- **A fixture built a state the app cannot produce.** `connectArtistToShop` still upserted on
  `{artistId, shopId}`, the row-reuse A2 removed, so a second connection left two open intervals.
  The partial unique index did exactly the job A2 says it exists for.
- **A suite tested a contract that had been deliberately removed** — `squarePayments.test.js`, on
  client-supplied `amountCents` and a platform sandbox token. Deleted, its still-valid cases moved.
- **The rate limiter leaked across tests.** `utils/rate-limit.js` is an in-memory singleton living
  for the whole test *process*, and the payment route allows 10 attempts a minute, so every request
  in a file shares one key unless it sets `X-Forwarded-For` and the app sets `trust proxy`. Failures
  surface as statuses that read like assertions about payments. `bookingRequests.test.js` and
  `squarePaymentRoute.test.js` both carry a `fakeIp()` helper for this.
- **A fixture was called without a required argument** — `createStaffUser` takes a `shopId`.

**No database has been migrated.** The code reads `SquareAccount`; every existing environment still
has the connection on `Shop`, so a previously connected shop reads as *disconnected* until
`scripts/migrate-square-accounts.js` runs there. That applies to a local dev database as much as to
production — see Next item 1.

### Running them

The integration suites need a `mongod` binary that `mongodb-memory-server` fetches from
`fastdl.mongodb.org` at first run. Any environment without a route to that host cannot run them at
all — it fails during `globalSetup`, before a single test file is collected, so the failure reads as
"No test files found" rather than as a network error. On a normal machine the download just works.

Two notes for running on Linux: the committed `node_modules` holds darwin-only rollup binaries, so
`npm i --no-save @rollup/rollup-linux-x64-gnu` is needed in both `client` and `server` first — it is
additive and harmless on macOS. And the client suite takes roughly five minutes.

The seven pre-commit checks *have* been run and pass. They cover imports, GraphQL documents against
the schema, React-in-tested-components, `moment.utc` in the client, unstable React keys, and
client-side data outliving a session. They are in `.git/hooks/pre-commit`; if that file loses its
executable bit, git skips it with a hint on stderr rather than an error — which has happened once.

---

## Done

- **Membership is an interval.** `ArtistShopConnection` carries `startedAt`/`endedAt`, one row per
  period. Reconnecting opens a new row instead of overwriting the old one.
- **Shop cut rates are effective-dated.** `ShopCutRate` is append-only; `resolveShopCutPercentAt`
  takes the work's date. A rate change cannot reach backwards. Set from a panel on the artist's page,
  shop-admin only, readable by the artist.
- **Client flags.** `ClientFlag` + an admin-managed `ClientFlagType` table. `NO_SHOWED` is raised
  automatically when a session is marked no-show and *resolved*, never deleted, when un-marked.
  Denormalised counters on `Client`.
- **Charge arithmetic.** `utils/square-pricing.js` — tax in basis points, the fee offset derived from
  implied hours, credits off the total rather than the taxable base. Pure; nothing calls Square.
  Covered by `test/unit/square-pricing.test.js`, 29 tests, observed passing. The expected figures are
  taken from the worked examples in `DECISIONS.md` M2/M3/M5/M8 rather than from the implementation,
  so a disagreement between the two files is visible instead of silently ratified.

  A units bug lived in `resolveSquareSettings` under those 29 passing tests for exactly as long as
  they existed: `hourlyRate` is stored in whole **dollars** and was assigned straight to
  `hourlyRateCents`, so a one-hour session at $180 implied 100 hours and a $6 offset came out at
  $600. Every one of those tests passed `hourlyRateCents` in by hand, so none of them touched the
  function that reads it off a document. Fixed, and pinned by `test/integration/chargeQuote.test.js`.
  Worth remembering the shape: the tested half was correct and the untested boundary was not.
- **Client booking confirmations.** Consults email immediately; sessions coalesce per project on a
  three-minute debounce that restarts with each new sitting.
- **A Square account belongs to an owner.** `SquareAccount` keyed `{ownerType, ownerId}`, resolved
  by `resolveSquareAccountFor` in the same shape as `resolveSquareSettings`. The GraphQL `Shop`
  fields are unchanged and derived. See `DECISIONS.md` M9.
- **The server decides what a charge is.** `utils/charge-quote.js` computes every figure from
  stored state; the client sends which appointment, which transaction, the offset choice, the tip
  and an idempotency key. Charges settle into the owner's connected account. See `DECISIONS.md`
  M10, and M11 for the record-then-charge deposit ordering.
- **A deposit is taxed at collection and comes off the session subtotal before tax.** M8 and M11,
  and they are load-bearing on each other — tax the deposit without deducting it from the base and
  the client pays tax twice on that portion; deduct without taxing and that portion is never taxed.
  A gift card is the opposite case and comes off the total, because it was sold untaxed (M6).
- **Tax and the fee offset are configurable.** `updateSquarePricingSettings` writes to whichever
  owner M8 resolves; `SquarePricingPanel` converts percentages and dollars at the boundary. These
  fields had existed since M8 with no screen anywhere, so every charge collected $0.00 of tax and
  nobody could fix it from the app — see the note under Known gaps about what that means for
  existing data.
- **A shop admin configures their shop from `/settings`.** `ShopPanel`, shown for
  `role <= SHOP_ADMIN`. A shop's first account is a SHOP_ADMIN whose `userType` is ARTIST
  (`registerAccount`: "a shop owner tattoos until they say otherwise"), so one person has both
  kinds of settings and they used to live on unrelated pages.
- **An independent artist can connect Square, end to end.** `getMySquareConnection`,
  `getMySquareAuthorizationUrl` and `disconnectMySquare`, with a panel in
  `components/settings/SquarePanel.jsx`. It renders for shop artists too and tells them the shop
  holds the connection, naming it — that is the only place in the product that answers "where does
  my money go".

## Next

0. **Run the client suite.** See the table above. Do this before anything else.

1. **Take one real payment end to end.** Nothing in the charge path has ever touched Square. It was
   built against their published REST docs, and `utils/square.js` has said so at the top since it
   was written. The sequence: run `scripts/migrate-square-accounts.js`, connect a Square **sandbox**
   seller through the OAuth flow, set a tax rate and offset in Settings, then charge a session and a
   deposit and confirm the figures in Square's dashboard match what InkBooks recorded. Everything
   below is built on arithmetic that has only ever been checked against itself.
2. **Drop the old `Shop` Square fields.** Once the migration has run and a charge has worked, delete
   the seven now-unread `square*` fields from stored shop documents. Deliberately left in place for
   one deploy — see M9.
3. Gift cards — model, balance, partial redemption, the payout sign convention in `DECISIONS.md` M6,
   and the offset at purchase. The ownership question they depended on is answered (M9), and the
   sale is priced by the same `computeChargeBreakdown` with tax zeroed.
4. **Fix the S2 gate gap.** The `withAuth(fn, ROLES.SHOP_ADMIN)` call sites still refuse an
   independent artist outright — they cannot archive their own client. Decided long ago, and the
   codebase now half-agrees with S2: M9, M10 and the pricing settings all treat independent artists
   as real owners while `archiveClient` does not.
5. Adjustment records — shop-admin only, never calls Square.
6. GraphQL surface for client flags. The automatic path works end to end; reading a client's flags
   and raising a manual one exist only as functions.

Last of all, deliberately: the UI standardisation pass onto the register-page aesthetic. It collides
with everything else.

## Known gaps, not bugs

- **Every existing shop and artist has a tax rate of 0.** Not a migration oversight — there was no
  way to set one until now, so every row is genuinely unconfigured. Any charge taken before someone
  visits Settings collects no sales tax, and the panel says so on screen rather than leaving it to
  be noticed from a receipt. Worth setting for every real shop before the charge path goes live.
- **The shop cut percentage has two editors** — `ShopPanel` on `/settings` and the autosave field on
  `/shop/:shopId`. One stored field, so this is a UX duplication rather than a second source of
  truth. Collapse it when the shop pages are next touched.

- **Nothing writes a `ShopCutRate` row automatically.** Until an admin records one, every lookup
  falls through to the connection or shop value exactly as before. Behaviour is unchanged.
- **`S2` is unevenly implemented.** An independent artist is their own admin, but only the
  `canManageArtist` gates honour that. The `withAuth(fn, ROLES.SHOP_ADMIN)` call sites refuse them
  outright — an independent artist currently cannot archive their own client. Fix is a shared helper,
  not an edit per call site.
- **The reference-image upload 400** is parked until it recurs and a payload exists. `express.json()`
  was on Express's 100kb default and is now 2mb; that is **not** confirmed as the cause.
- **Artists who already disconnected and reconnected** have no interval history. There was nothing to
  migrate — the old model overwrote it. New intervals start from the change.
- **`computeChargeBreakdown` echoes raw credit inputs, not the clamped ones.** A negative
  `depositCreditCents` is correctly ignored by the arithmetic but returned unchanged in the result,
  so a confirmation screen rendering that field directly would show a negative credit beside an
  unreduced total. Pinned by a test that documents current behaviour. No caller passes a negative
  today; worth changing to echo the clamped figures when the deposit UI is built.

## How this repo carries context

Sessions end; the repo does not. Three places, on purpose:

- **`DECISIONS.md`** — the rule and why, including the rejected alternative.
- **Commit messages** — why a specific change was made, and what was verified versus written.
- **Code comments** — why *this* line is the way it is, usually naming the bug that caused it.

A new session should be able to start from these alone. If something important lives only in a chat,
it is not written down.
