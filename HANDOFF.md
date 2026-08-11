# Where this project is

**Read this first, then `DECISIONS.md`.** This file is *state* — what is done, what is next, what
has not been verified. `DECISIONS.md` is *rules* — the settled calls and why. They change at
different rates, which is why they are separate files.

Last updated: 2026-08-11.

---

## The one thing to do before trusting anything

**No test suite has been run.** Roughly 30 tests were written across the last several commits and
nobody has watched a single one pass. The environment they were written in is Linux; the repo's
`node_modules` holds darwin-only rollup/esbuild binaries, so the suites could not execute there.

```
cd client && npm test
cd server && npm test
```

Do this before building on any of it. If something fails, that is expected — written is not
observed, and the commit messages say so individually.

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
- **Client booking confirmations.** Consults email immediately; sessions coalesce per project on a
  three-minute debounce that restarts with each new sitting.

## Next

1. **The Square account decision.** The largest fork left. `Shop` carries
   `squareAccessTokenEncrypted` and friends *inline*; per-artist connections means either a second
   copy of those fields or migrating a working OAuth flow onto a shared owner model. Decide before
   writing anything. Nothing built so far depends on it.
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

## How this repo carries context

Sessions end; the repo does not. Three places, on purpose:

- **`DECISIONS.md`** — the rule and why, including the rejected alternative.
- **Commit messages** — why a specific change was made, and what was verified versus written.
- **Code comments** — why *this* line is the way it is, usually naming the bug that caused it.

A new session should be able to start from these alone. If something important lives only in a chat,
it is not written down.
