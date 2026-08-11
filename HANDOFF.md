# Where this project is

**Read this first, then `DECISIONS.md`.** This file is *state* — what is done, what is next, what
has not been verified. `DECISIONS.md` is *rules* — the settled calls and why. They change at
different rates, which is why they are separate files.

Last updated: 2026-08-11.

---

## Test status

Everything has been run and everything passes.

| Suite | Files | Tests | Status |
|---|---|---|---|
| `client` | 22 | 108 | green |
| `server/test/unit` | 9 | 103 | green |
| `server/test/integration` | 44 | 663 | green |

Everything passes, including the M9 extraction: the derived `Shop` fields, `shopCutPayments` on
`SquareAccount`, `disconnectShopSquare`, `attention`'s `squareHealth`, and the new
`test/integration/squareAccounts.test.js`.

This is the standing expectation now, not an achievement — treat a failure as a real regression
rather than as a test nobody had ever run. The caveat that used to open this file is gone for good.

Getting there took exactly one fix, and it was in a **fixture, not the code**:
`connectArtistToShop` in `test/helpers/factories.js` still upserted on `{artistId, shopId}`, the
row-reuse pattern A2 removed, so connecting one artist to a second shop left two open intervals and
the partial unique index rejected the second. The helper now mirrors the production transfer
sequence in `mutations/artistShopConnections.js`: close the open interval elsewhere, then
reuse-or-create.

Worth recording what that failure was *not*. The model, the index and the resolver were all
correct — the partial unique index did exactly the job A2 says it exists for, and what it caught was
a fixture building a state the application itself cannot produce. The interval migration landed
clean.

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
- **Client booking confirmations.** Consults email immediately; sessions coalesce per project on a
  three-minute debounce that restarts with each new sitting.
- **A Square account belongs to an owner.** `SquareAccount` keyed `{ownerType, ownerId}`, resolved
  by `resolveSquareAccountFor` in the same shape as `resolveSquareSettings`. An independent artist
  can now connect Square at all — `getMySquareAuthorizationUrl`, which takes no argument. The
  GraphQL `Shop` fields are unchanged and derived. See `DECISIONS.md` M9.

## Next

1. **Run the migration, then drop the old `Shop` fields.** The `SquareAccount` extraction is built
   (`DECISIONS.md` M9). What remains is operational, not code: run
   `node scripts/migrate-square-accounts.js --dry-run`, read the output, run it for real, confirm a
   shop-cut invoice still issues, then delete the seven now-unread `square*` fields from stored
   shop documents in a follow-up. The script is idempotent and never overwrites an existing
   account, so a re-run cannot clobber a token refreshed since the first pass.
2. Gift cards — model, balance, partial redemption, the payout sign convention in `DECISIONS.md` M6.
3. Adjustment records — shop-admin only, never calls Square.
4. GraphQL surface for client flags. The automatic path works end to end; reading a client's flags
   and raising a manual one exist only as functions.
5. The Orders-based charge itself, then the deposit UI at every booking entry point.

Last of all, deliberately: the UI standardisation pass onto the register-page aesthetic. It collides
with everything else.

## Known gaps, not bugs

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
