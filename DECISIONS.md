# Decisions

Settled calls, the reasoning behind them, and the alternative that was rejected.

**Why this file exists.** These decisions were made in chat sessions that no longer exist. A
decision that lives nowhere is one you will make again, differently, in three weeks — and the
expensive ones here are about money, where "differently" means the books disagree with themselves.
Commit messages carry the reasoning for a change; this carries the reasoning for a *rule*, so it can
be read before writing code rather than excavated afterwards.

Anything marked **OPEN** has not been decided. Do not guess at it.

For *where the project currently stands* — what is built, what is next, and what has not been
verified — see `HANDOFF.md`. This file holds rules; that one holds state, and they change at
different rates.

---

## Money

### M1. Shop cut is per artist, defaulting to the shop's rate

A shop has different artists at different rates. The percentage resolves in this order:

1. `ShopCutRate` — the newest row for this artist/shop with `effectiveFrom` at or before the date
   the work happened (M7)
2. `ArtistShopConnection.shopCutPercent` — the pre-history fallback, for connections that predate
   dated rates
3. `Shop.shopCutPercent` as the default
4. `0` when the artist has no shop

The override is checked with a null test, **not** a falsy test. `0` is a meaningful configured value
("this guest artist owes us nothing") and `||` would silently fall it through to the shop's rate.

Implemented in `server/utils/shop-cut.js` as `resolveShopCutPercentAt`. The shop-level field is a
default, not the authority.

### M2. The cut applies to the pre-tax session subtotal only

Excluded, in descending order of firmness:

- **Tips** — the artist keeps every one. Non-negotiable, and the reason `tipCents` is stored
  separately from `totalCents`: with only a grand total, "the cut excludes tips" is not computable.
- **Tax** — sales tax is money held for the state. A shop taking 40% of it is taking 40% of someone
  else's money. On a $200 session at 9.4% that is $7.52 per ticket moving to the shop.
- **Processing fees** — already left the building. Charging the artist a share of a cost neither
  party keeps means the artist pays for it twice.

Worked example, confirmed: one hour at $180, 40% cut → `$180 × 0.4 = $72` to the shop. The
`Square_Fee_Offset` (M5) is **not** in the cuttable base — it exists to recover a fee the artist
pays, so the artist keeps it.

### M3. A deposit is revenue once, at collection

The shop cut is taken on the deposit **at the consult that collected it**. Applying that deposit to
a later session is a *credit against what the client owes*, not a second revenue event.

Mechanically: a consult holding a deposit gets `subtotalCents` set to the deposit amount, so
`applyShopCut` charges the cut there. At application, `depositCreditCents` is subtracted from
`subtotalCents` before the cut is computed. Across the two appointments the shop's cut totals what
it would have been on the undiscounted price.

**These two halves are load-bearing on each other.** Change one without the other and the shop
quietly loses its cut on every deposit ever taken, or the artist is charged twice on the same money.

Clamped at zero: a $500 deposit against a $300 final sitting must not produce a negative cut, which
would read as the shop owing the artist.

### M4. Nothing in InkBooks is refundable

Deposits and sessions alike. A genuine reversal is performed **in the Square app**, by hand, and
then recorded here as a shop-admin adjustment with a documented reason. InkBooks never calls
Square's refund API.

Rejected: a `REFUNDED` appointment state and an in-app refund path. It would have been a second way
to move money with no second set of eyes on it, for a case that is rare by policy.

Adjustments are shop-admin only **where there is a shop**. An unaffiliated artist adjusts their own
— see S2.

### M5. Square_Fee_Offset

A flat amount configured in Settings → Square. At charge time:

```
implied hours = session total ÷ hourly rate
offset        = offset amount × implied hours
```

Derived from the total rather than from the booked duration, so it works identically for hourly and
flat-priced sessions and for deposits.

**Presented as a choice before the card is charged, never applied silently. Square transactions
only — never cash.** It becomes part of the taxable price.

At $180/hr with a $6 offset: one hour recovers $6 against a $5.39 fee. Six hours recovers $36
against $31.84. It over-recovers as sessions lengthen; that is understood and accepted. A keyed
deposit costs 3.5% + $0.15 — $7.15 on $200 — where one unit of offset under-recovers.

Rejected: a true percentage surcharge. Card network rules prohibit surcharging debit and prepaid
cards, which would have required card-brand detection, and a flat pass-through under-recovers
because the fee applies to the grossed-up total.

### M6. Gift cards

- Random code plus a database record. **Not** a hash of the attributes — a hash is opaque, so you
  need the record anyway, and guessable inputs make codes enumerable.
- Sold at face value **plus the offset**, **untaxed**. Selling a gift card is not a taxable event;
  nothing was delivered. Tax is collected once, at the session.
- Full face value loaded as balance. Partial redemption supported. Spendable on deposits.
- No expiry — Washington prohibits it. The liability never ages off.
- Shop-level when the artist is connected, artist-level otherwise. **The shop holds the entire
  amount.**

Payout on redemption:

```
(session_total × shop_rate) − gift_card_applied
```

**Positive means the artist owes the shop. Negative means the shop owes the artist.** Write that
sign convention into every test — inverted payout signs are found three months late.

Worked both directions. $200 session, 40%, $100 card: `80 − 100 = −20`, shop owes the artist $20.
Same session, $50 card: `80 − 50 = +30`, artist owes the shop $30.

Gift card sales are a **liability, not revenue**, recognised at redemption. A report must show
outstanding balance, card count and oldest issue date, because that portion of the bank balance is
already spoken for.

### M7. A rate change applies forward only, never backward

Changing an artist's percentage never alters work already performed. The rate that applied is the
one in effect **on the appointment's own date**, not the one configured now.

Two things follow, and the second is the one that bites:

- The rate needs its own effective-dated history — `(artist, shop, effectiveFrom, percent)` —
  resolved by taking the latest `effectiveFrom` at or before the appointment date. Storing one
  current number per interval only handles a change that coincides with a reconnect.
- `applyShopCut` recomputes on save. It used to read the *currently active* connection, so editing a
  past session's subtotal after a rate change would silently reprice the cut at the new rate. It now
  passes `appointment.appointmentDate`, which fixes this by construction: the appointment's date
  doesn't move, so the rate it resolves can't either.

`ShopCutRate` rows are **append-only** — `setShopCutRate` never edits an existing one. That is what
makes "forward only" a property of the data rather than a rule someone has to remember, since there
is no code path that rewrites history.

`Appointment.shopCutPercentApplied` still records what was actually used on each row, which is what
made existing payouts safe before any of this.

Rejected: freezing the cut permanently once written. That would also block legitimate recomputation
— correcting a mistyped subtotal on work performed last week should re-derive the cut at *last
week's* rate, not refuse to move at all.

### M8. Tax is stored in basis points, and credits are not taxed

The rate lives on the **shop** when the artist is connected and on the **artist** when independent.
Tax is destination-based — a client is taxed where the work happens — so two artists in the same
room must not bill different rates. The fee offset follows the same owner: they are set together in
one Square settings section, and splitting them would give a shop artist shop-tax with their own
offset, which nobody can reason about at a counter.

**Basis points, not a float percentage.** 9.4% is `940`. A float rate multiplied into a total is
exactly where rounding stops being academic, and this codebase already keeps money in integer cents
for the same reason.

Order of operations is fixed, and two consequences follow from it:

1. The offset joins the taxable base — it is part of the service price, not a separate fee, so it
   **is** taxed.
2. The deposit credit and any gift card come off the **total**, not off the taxable base. Tax on the
   work was already owed; paying part of the bill with money taken earlier does not change what the
   state is due.

Tips sit outside both the taxable base and the shop cut, and are added to what the card is charged.

Credits clamp at zero. A $100 deposit against an $80 final sitting bills $0 — never a negative that
would read as owing the client money.

### M9. A Square account belongs to an owner, not to a shop

Extracted into its own `SquareAccount` model keyed on `{ownerType: 'SHOP' | 'ARTIST', ownerId}`.
The six connection fields move off `Shop`: `squareConnected`, `squareMerchantId`,
`squareLocationId`, `squareAccessTokenEncrypted`, `squareRefreshTokenEncrypted`,
`squareTokenExpiresAt`.

The forcing question was an independent artist, who under S2 is their own admin and under M8 already
carries `taxRateBasisPoints` and `squareFeeOffsetCents` on `Artist` — pricing configuration with no
account to charge against. They can set a tax rate and then cannot take a card.

Resolution mirrors `resolveSquareSettings` in `utils/square-pricing.js` exactly: active shop first,
artist when independent. One helper, `resolveSquareAccountFor(artistUserId)`, so the answer to "whose
tax rate is this" and the answer to "whose Square account is this" are produced by the same rule
rather than two that can drift apart.

What this costs, stated plainly:

- A migration lifting every connected `Shop` into a `SquareAccount` row with `ownerType: 'SHOP'`.
- `routes/squareOAuth.js` signs a JWT state carrying `shopId`; it has to carry `ownerType` **and**
  `ownerId`. That signature is the thing stopping someone attaching their own Square account to
  another owner, so widening it needs the same care the original had.
- `utils/square.js`'s `refreshAccessTokenIfNeeded` takes a `shop` and writes the refreshed token back
  onto it. It takes a `SquareAccount` instead.

The blast radius is smaller than it looks: the encrypted token is read in exactly one place
(`utils/square.js:154`).

**Built.** `models/SquareAccount.js`, `utils/square-account.js`, and
`scripts/migrate-square-accounts.js`. Three things worth knowing before touching it:

- **The GraphQL contract did not change.** `Shop.squareConnected`, `squareLocationId` and
  `squareConnectedAt` are still there and are now *derived* by field resolvers reading
  `SquareAccount`. The client already queries them by name; where the server keeps the row is not
  something the schema should make the client care about.
- **`isUsable`, not `connected`.** A half-failed OAuth callback leaves `connected: true` with no
  token. Every consumer checks `SquareAccount.isUsable(account)` so the refusal happens where there
  is a message the user can act on, rather than inside `getValidAccessToken`.
- **The old `Shop` fields still exist on stored documents.** The schema no longer declares them and
  nothing reads them, but the migration deliberately does not `$unset`. Two copies of an opaque
  ciphertext cannot produce the class of error two copies of a *number* can, and the cost of being
  wrong is a shop that cannot take payment. Drop them in a follow-up once charges are confirmed.

An independent artist connects through `getMySquareAuthorizationUrl`, which takes no argument — it
can only act for the caller. It refuses an artist who is currently at a shop: under M8 their tax
rate and offset already resolve to the shop, so a personal account would be a connection nothing
routes to, sitting there looking like it works. `disconnectMySquare` refuses the same case for the
same reason — succeeding by clearing an artist-owned row they don't use would report "Disconnected"
while their sessions carried on charging into the shop's account.

`getMySquareConnection` returns a **source**, not just a boolean, and the settings panel renders for
shop artists as well as independent ones. Their sessions charge into the shop's account, so what
they need is to be told that — with the shop named, and no button. Hiding the panel would leave
"where does my money go" unanswered anywhere in the product; offering a connect button would invite
them to build the dead connection above.

Rejected: **copying the six fields onto `Artist`** and branching on "has an active shop?" at each
consumer. Cheaper today — one real branch — but it makes M8's owner rule exist twice in two shapes,
and every Square field added afterwards has to be added in both places or it silently works for one
owner and not the other. That failure is invisible until an independent artist hits it in
production.

Rejected: **shop-only, permanently**. It contradicts S2 and strands the two pricing fields already on
`Artist` as configuration that can never be used.

### M10. The server decides what a charge is. The client only says which button was pressed

Every money figure in a charge is derived from stored state: the session's price from the saved
`Appointment`, the tax rate and fee offset from `resolveSquareSettings` (M8), the total from
`computeChargeBreakdown`. `utils/charge-quote.js` is the only place that assembles them, and both
the quote the UI displays and the amount actually charged come from it — so what the artist agrees
to on screen and what leaves the card cannot differ.

The route previously took `subtotalCents`, `taxCents`, `feeCents`, `tipCents` and `amountCents` from
the request body, wrote them onto the appointment, and computed the shop's cut from the subtotal the
caller had just supplied. An artist could charge one figure and record another, and pay their cut on
the smaller one. The Zod schema validated those fields' *types*, which is not the same claim.

There is no tighter schema that fixes this. No assertion about a number makes a client entitled to
assert it.

**What the caller still supplies, and why each is legitimate:**

- `appointmentId` and `chargeType` — which record, and which of the two transactions against it.
  A consult can take a deposit and later be charged for work.
- `applyFeeOffset` — the offset is a choice presented before the card is charged (M5). The choice is
  the artist's; whether it is honoured is not.
- `tipCents` — decided at the counter, and no stored rate predicts it. Also the only caller-supplied
  figure that cannot move the shop's cut, since tips sit outside the cuttable base (M2).
- `idempotencyKey` — generated per Pay press and resent unchanged on retry. The server used to
  generate its own, which made every retry a distinct charge — the precise failure idempotency keys
  exist to prevent.

**The price of the work is still the artist's to set.** That is not what was being guarded. It has to
be *saved* before it can be charged, so that what was billed and what was recorded are the same
number by construction, and so `updateAppointment`'s own authorization is the only path into that
field rather than every charge request being a second, weaker one.

Charges settle into the owner's connected account (M9), never a platform account. Both halves are
load-bearing: computing the right number and charging it into InkBooks' account is still wrong, and
charging into the seller's account an amount the caller chose is still wrong.

Rejected: keeping the components as request fields and cross-checking them against a server
computation. It sounds safer and is worse — two sources for one number, with a reconciliation rule
that has to decide which wins, in the one place where "they disagreed and we picked one" is not an
acceptable answer.

### M11. A deposit is recorded before it is charged, and is not taxed at collection

`recordDeposit` writes the agreed amount with `depositStatus: 'pending'` **before** any card is
taken. The charge route reads that stored figure, charges it, and flips the status to `available`
with the Square payment id. `depositCents` is never rewritten by the charge — it is the field the
charge was computed from.

Ordering, because charging first meant the amount charged and the amount recorded were two numbers
from the same browser. It also removes a real failure: a successful charge followed by a failed
`recordDeposit` left money taken with no record, which `BookSessionDatesForm` handled by telling the
artist to go fix it by hand. The worst case is now a pending deposit that was never collected —
visible, harmless, and unspendable, since `getAvailableDeposits` and `applyDeposit` both require
`available`.

**Untaxed at collection.** M8 fixes tax to the work, collected at the session, and has the deposit
credit come off the *total* there precisely because "tax on the work was already owed". Taxing the
deposit as well would charge the client tax twice on the same money.

**The offset still applies.** M5 is explicit that deriving it from the total rather than the booked
duration makes it work "identically for hourly and flat-priced sessions and for deposits", and works
the $200 keyed-deposit case through by hand.

The offset collected on a deposit is recorded in `feeCents`, not added to `depositCents`. It is real
money taken, but it is not part of the deposit's face value and must not become spendable credit.

---

## Membership and attribution

### A1. Visibility by project start, shop cut by session date

A project started at the shop stays visible to the shop forever, including sessions performed after
the artist left.

The **cut** follows the session date against the membership interval. An artist who starts a project
at the shop in January, leaves in March and finishes three sessions in July does not owe the shop
40% of work performed elsewhere, after leaving, with the shop contributing nothing.

These are deliberately different rules for the same project. Visibility is about history; the cut is
about who contributed.

### A2. Membership is an interval, not a flag

Implemented **on `ArtistShopConnection` itself** — `startedAt` / `endedAt`, one row per period —
rather than as a new `ShopMembership` model. A parallel model would have been a second source of
truth for the same fact, and every shop-scoped query already reads this one.

It used to carry a unique index on `{artistId, shopId}` and **reuse one document per pair across
disconnect/reconnect cycles**, so a reconnect overwrote the previous period. Any artist who has
already disconnected and reconnected has lost that boundary; there is nothing to migrate. New
intervals start from the change; current state becomes the open interval.

That index is now partial, on open intervals only: never two *current* memberships, any number of
closed ones. It cannot simply be dropped — "an artist works at one shop at a time" is a real rule,
and without an index it survives only as long as nobody races it.

The **rate** is not stored on the interval. See M7: a rate can change without a reconnect, so it
needs its own history (`ShopCutRate`).

### A3. An unaffiliated artist sees no shop-cut UI at all

Not an empty panel — absent. `resolveShopCutPercent` already returns 0 with no shop.

---

## Clients and flags

### C1. Session notes are never client-visible

"The client's dashboard" means the client detail page **inside the artist-facing app**. Artists write
things in session notes they would never want a client to read.

### C2. Flags

`NO_SHOWED` is generated automatically when a session is marked no-show. Every other type is created
by hand, from an admin-managed type table rather than a hardcoded enum.

Un-marking a no-show **keeps the flag with a resolved timestamp**. The history survives.

Shaped for search: client, type, appointment (nullable), created by, created at, note, resolved at.
Indexed on client + type, with denormalised counters on the client so an appointment list can render
a badge without a join per row.

### C3. A no-show prompts for the deposit

Forfeit and record as revenue, or leave it on the project balance. The user chooses; it is never
silent.

---

## Projects

### P1. An artist closes a project, gated on zero open sessions

Artists only. There is no outstanding financial state to settle at close — deposits are
non-refundable and were recognised as revenue at collection (M3) — so closing is a statement about
the work, not about money.

---

## Scope of a shop's visibility

### S1. While connected, the shop sees everything

All client and appointment data. On disconnect, the artist retains visibility of everything
collected during the connected period. Data from the gap — other shops, independent work — stays
invisible to the shop.

### S2. An unaffiliated artist has full control of their own functionality

An independent artist is their own admin. Anything gated on "shop admin" applies **only where a shop
exists**; with no shop, the artist holds that authority over their own data — adjustments included.

**This is not fully implemented, and the gap is uneven.** There are two gate styles in the codebase:

- `canManageArtist` / `assertCanManageArtist` — checks `user.id === artistUserId` **first**, so an
  artist always passes for themselves regardless of role. Already correct for independents.
- `withAuth(fn, ROLES.SHOP_ADMIN)` — a bare role floor with no self or no-shop escape. An
  independent artist has role `ARTIST`, so these refuse them outright. `archiveClient`,
  `archiveArtist` and their siblings are in this group: an independent artist currently cannot
  archive their own client.

The fix is a shared helper in the shape of `assertCanManageArtist`, not a per-call-site edit — that
is exactly how one of them ends up forgotten. It needs judgement about which gates are genuinely
platform-level rather than shop-level, so it is deliberately not a blanket loosening.

---

## Sequencing

UI standardisation onto the register-page aesthetic goes **last**, as a design-token and shared
component extraction rather than a page-by-page rewrite. It collides with everything else.

Order: schema → the payment service that deposits, the Pay Deposit control and session charges all
share → UI surfaces → dashboard fixes. Standalone fixes pulled forward.

---

## Rejected, and why — quick index

| Rejected | Because |
|---|---|
| Hash-derived gift card codes | Opaque anyway, and enumerable if inputs are guessable |
| Taxing gift cards at sale | Taxes the same money twice; either the client overpays or you eat it |
| Percentage surcharge for fees | Debit surcharging is prohibited; flat pass-through under-recovers |
| In-app refunds | A second way to move money with no second set of eyes, for a rare case |
| Shop cut by project start | Charges an artist for work performed after leaving |
| Shop cut on the taxed total | Takes a percentage of the state's money |
| `shopId` flag on the artist | Cannot express a reconnect, so history is destroyed |
| Un-marking a no-show deleting the flag | Destroys the history the flag exists to keep |
| Rate changes applying retroactively | Reprices work already performed and paid out |
| Freezing a cut permanently once written | Blocks correcting a mistyped subtotal at the rate that applied |
| Square fields copied onto `Artist` | Two shapes of the same owner rule; new fields get added to one |
| Square as a shop-only feature | Contradicts S2 and strands the pricing fields already on `Artist` |
| Client-supplied charge components | No schema makes a client entitled to assert what it is owed |
| Cross-checking client figures against server ones | Two sources for one number, needing a rule for which wins |
| Charging a deposit before recording it | Charged and recorded become two numbers that can differ |

---

## Open

Nothing is blocking. Two things are parked rather than undecided:

- **The reference-image upload 400.** Parked at the user's direction until it recurs and a payload
  exists. `express.json()` was on Express's 100kb default and is now 2mb, but that is **not**
  confirmed as the cause and should not be recorded as the fix.
- **S2's uneven gates** are known work, not an open question. The rule is decided; the
  `withAuth(fn, SHOP_ADMIN)` call sites have not been moved onto it yet.
