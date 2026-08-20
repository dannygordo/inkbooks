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

  The offset is **offered at purchase**, the same choice on the same terms as anywhere else (M5) —
  the card is being bought with a card, so there is a processing fee to pass on, and the artist
  decides whether to. It is never applied silently.

  So the sale is priced by `computeChargeBreakdown` with `taxRateBasisPoints: 0` — the same shape as
  a deposit charge (M11) but with the tax deliberately zeroed rather than resolved. The offset is
  recorded apart from the face value and **does not** load onto the balance: the client bought a
  $200 card and holds $200 of credit, whatever the sale totalled.

  This is the exact opposite of a deposit, and the pair is worth holding together: a deposit is
  taxed at collection and comes off the session's taxable base; a gift card is untaxed at sale and
  comes off the session's total. Both take the offset. See M8 for the ordering that falls out.
- Full face value loaded as balance. Partial redemption supported. Spendable on deposits.
- No expiry — Washington prohibits it. The liability never ages off.
- **RESOLVED.** The earlier framing ("shop-level when the artist is connected, artist-level
  otherwise — the shop holds the entire amount") was written when a client charge was thought to
  settle to the shop. It does not (M9): a client pays the artist. Liability doesn't follow a
  connection status — it follows **who issued the card**, and every card records that explicitly:
  `issuerType: 'ARTIST' | 'SHOP'`, `issuerArtistId` set only when `ARTIST`. The two issuer types are
  not one flow with a flag — they are different money events.

  **Artist-issued.** Sold by one artist, for that artist alone. **Locked to them at redemption — no
  other artist at the shop, and the shop itself, will honour it.** The card's own terms say so, and a
  redemption attempt against any other artist's session is refused outright, not silently allowed.
  This is the same shape as a deposit (M3), because it's the same kind of money: the artist collected
  it, into their own account (M9), at the moment of sale. So the shop's cut is taken **at the sale**,
  through `applyShopCut`, exactly as if the sale were a consult deposit — not deferred to redemption.
  Because the cut is already settled by then, `computeChargeBreakdown`'s cuttable base at redemption
  must exclude an artist-issued card's applied amount the same way it already excludes
  `depositCreditCents` (M3) — skip that and the same money gets cut twice. An independent artist's
  card carries no cut at all, same as M1's `0`-with-no-shop case.

  **Shop-issued.** Sold as a shop product, not attributed to any one artist's book of business — the
  client buys it from the shop, not from an artist, and no `Client` record or session context is
  required to make the sale at all. **Always charged by a shop admin.** Every shop admin is an artist
  (S0), so they have their own connected Square account like anyone else (M9), and that account is
  what takes the payment — there is no other path, since only an artist's own account can take a
  client's card. But **none of it is the admin's revenue**: the full face value is recorded as owed
  to the shop, settled through the same shop-cut invoice machinery already built
  (`createAndPublishShopCutInvoice` / `markShopCutPaidManually` / `confirmShopCutPaid`), at 100%
  rather than whatever the admin's own artist rate happens to be. **Redeemable against any artist's
  session at the shop** — the artist who eventually does the work was never involved in the sale, and
  is owed their share at redemption regardless of who sold the card.

Payout at redemption — **shop-issued cards only**, since an artist-issued card never reaches a second
party to net against:

```
(session_total × shop_rate) − gift_card_applied
```

**Positive means the artist owes the shop. Negative means the shop owes the artist.** Write that
sign convention into every test — inverted payout signs are found three months late.

Worked both directions. $200 session, 40%, $100 card: `80 − 100 = −20`, shop owes the artist $20.
Same session, $50 card: `80 − 50 = +30`, artist owes the shop $30.

A gift card's unspent balance is a **liability, not revenue**, for as long as it's outstanding,
regardless of issuer — a report must show outstanding balance, card count and oldest issue date,
because that portion of the bank balance is already spoken for. What differs by issuer is **when the
shop's cut is recognised as revenue**: at sale for an artist-issued card (deposit-shaped), at
redemption for a shop-issued one (the formula above).

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

### M8. Tax is stored in basis points, and a deposit comes off the base while a gift card comes off the total

The rate lives on the **shop** when the artist is connected and on the **artist** when independent.
Tax is destination-based — a client is taxed where the work happens — so two artists in the same
room must not bill different rates. The fee offset follows the same owner: they are set together in
one Square settings section, and splitting them would give a shop artist shop-tax with their own
offset, which nobody can reason about at a counter.

**Basis points, not a float percentage.** 9.4% is `940`. A float rate multiplied into a total is
exactly where rounding stops being academic, and this codebase already keeps money in integer cents
for the same reason.

**Order of operations is fixed:**

1. the deposit credit comes off the subtotal **first**, before anything else is computed;
2. the offset is derived from what remains and joins the taxable base — it is part of the service
   price, not a separate fee, so it **is** taxed;
3. tax is computed on that base;
4. any gift card comes off the **total**, after tax.

**A deposit and a gift card are not the same kind of money.** This is the distinction the ordering
exists to express, and getting it wrong double-taxes a client or under-collects for the state.

- **A deposit is its own transaction and was taxed when it was collected** (M11). The portion of the
  work it covers has already been taxed once. Taxing the full session again and deducting the deposit
  from the total would charge tax twice on that portion. Off the subtotal, the session taxes exactly
  the part of the work not yet paid for.
- **A gift card was sold untaxed** (M6) — nothing was delivered at the sale, so nothing was due. Tax
  on the whole session is still owed, and the card is a payment instrument against the taxed total,
  not a prepayment of the work.

Worked, at 9.4%: a $500 job with a $200 deposit already taken. The deposit was billed as
`$200 + $18.80 tax = $218.80` at the consult. The sitting bills `($500 − $200) = $300`, tax `$28.20`,
total `$328.20`. Tax collected across the two: `$47.00`, which is 9.4% of $500 exactly once.

The same job paid with a $200 **gift card** instead bills the full `$500 + $47.00 = $547.00`, and the
card takes $200 off that — the state still gets $47.00, and it gets it all at the sitting.

Tips sit outside both the taxable base and the shop cut, and are added to what the card is charged.

Both credits clamp at zero, per credit, before anything is derived from them. A $100 deposit against
an $80 final sitting bills $0 — never a negative that would read as owing the client money, and never
a negative taxable base that would invert the tax.

Rejected: taking both credits off the total, on the reasoning that "tax on the work was already
owed". That reasoning holds for a gift card and fails for a deposit, because it assumes the earlier
money was untaxed. This document said it for both, and the implementation followed — a $500 job with
a $200 deposit would have collected 9.4% on $700 of base across the two transactions.

### M9. A client pays the artist. The shop is paid afterwards, by the artist

**Two Square accounts, never interchangeable:**

- **The artist's own** takes money from **clients** — sessions, deposits, everything a client is
  charged. Always the artist's, whether they work at a shop or not.
- **The shop's** receives **shop-cut invoices** from its artists. The artist owes a percentage
  afterwards and settles it, by Square invoice or by hand.

Money moves client → artist → shop, in two transactions, and the second one already existed:
`createAndPublishShopCutInvoice` is *"billed to the artist, payable directly into the shop's own
connected Square account"*. **It works exactly the way cash does** — the client hands the artist the
money, and the artist squares up with the shop after.

Stored in a `SquareAccount` model keyed `{ownerType: 'SHOP' | 'ARTIST', ownerId}`, extracted from
the six fields that used to sit inline on `Shop`. `ownerType`/`ownerId` rather than two nullable
foreign keys: two nullable columns make "neither" and "both" representable, and every reader then
has to handle states the writer never intended.

`resolveArtistChargeAccount(artistUserId)` is what a charge uses. It returns the artist's own
account or **null** — and null must never fall back to the shop's. That fallback is the bug below.

#### The mistake, because it is worth not repeating

This originally resolved a client charge to the **shop** when the artist was connected to one, by
analogy with the tax rate: M8 resolves the rate to the shop, so the account seemed to follow. It
does not, and the result was severe — **the shop received the entire payment and then invoiced the
artist for a cut of it.** Paid twice; the artist paid nothing.

The two questions look alike and are not:

| Question | Answer | Why |
|---|---|---|
| Whose **tax rate**? | The shop's | Destination-based — *where the work happened* |
| Whose **account** is charged? | The artist's | *Who is owed* for the work |

The same shop is attached to one of them, which is what made conflating them easy. An integration
test now asserts the two resolve **differently** for the same artist.

#### Built

`models/SquareAccount.js`, `utils/square-account.js`, `scripts/migrate-square-accounts.js`. Worth
knowing before touching it:

- **Every artist connects their own account** through `getMySquareAuthorizationUrl`, which takes no
  argument — it can only act for the caller. Shop artists included; they need one *most*, since
  their clients pay them directly.
- **The GraphQL contract on `Shop` did not change.** `squareConnected`, `squareLocationId` and
  `squareConnectedAt` are still there, now derived by field resolvers. They describe the shop's
  invoice-receiving account, not anything a client is charged into.
- **`isUsable`, not `connected`.** A half-failed OAuth callback leaves the boolean true with no
  token. Every consumer checks `SquareAccount.isUsable(account)` so the refusal happens where there
  is a message the user can act on.
- **The old `Shop` fields still exist on stored documents.** The schema no longer declares them and
  nothing reads them; the migration deliberately does not `$unset` until charges are confirmed.

Rejected: **copying the six fields onto `Artist`** and branching per consumer. Cheaper today, but it
makes the owner rule exist twice in two shapes, and every field added afterwards has to be added to
both or it silently works for one owner and not the other.

Rejected: **falling back to the shop's account** when an artist has not connected their own. It
looks like a courtesy and is the exact failure above.

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

### M11. A deposit is recorded before it is charged, and IS taxed at collection

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

**Taxed at collection, because a deposit is its own transaction.** It is not a down payment held
against a future bill — it is money taken for work, at the moment it is taken, with the shop's cut
recognised then too (M3). The tax follows the money.

This is the half that makes M8's session-side ordering correct. The deposit's face value is deducted
from the session subtotal *before* tax at the sitting, so the two transactions between them tax the
whole job exactly once. **The two halves are load-bearing on each other** — tax the deposit without
deducting it from the base, and the client pays tax twice on that portion; deduct it from the base
without taxing it, and that portion is never taxed at all.

**The offset applies.** M5 is explicit that deriving it from the total rather than the booked
duration makes it work "identically for hourly and flat-priced sessions and for deposits", and works
the $200 keyed-deposit case through by hand. At the session it is derived from the subtotal *net* of
the deposit, since the fee on the deposit was already recovered by the offset taken at collection.

Tax and the offset collected on a deposit are recorded in `taxCents` and `feeCents`, never added to
`depositCents`. Both are real money taken, but neither is part of the deposit's face value and
neither must become spendable credit.

### M12. Booth rent is a second compensation model, not a percentage-of-zero hack

An artist can owe their shop a flat monthly fee instead of a percentage of session work.
Confirmed directly, via `AskUserQuestion`, on two sub-questions: overdue rent **"escalates until
marked paid"** (not a one-time nudge), and confirming a charge **"generates real records
monthly"** - a real `Expense`/`Income` pair, reusing `RecurringExpense`'s engine shape rather than
a parallel bookkeeping path.

**`ShopCutRate` gained one field, `compensationModel: 'PERCENTAGE' | 'BOOTH_RENT'`, rather than a
whole second history table.** Switching an artist to booth rent writes a new dated `ShopCutRate`
row with `percent: 0, compensationModel: 'BOOTH_RENT'` - `utils/shop-cut.js`'s
`resolveShopCutPercentAt` needed **zero code changes**, since booth rent already IS 0% by
construction. This is the same "append a dated row, never edit history" shape M7 already
established, extended to cover which model applied, not just what number.

**The terms themselves (amount, due day) live on a separate `BoothRentPlan`, not on `ShopCutRate`
itself**, because a rent amount can change without the compensation model changing, and the two
questions ("which model" and "how much, on what day") don't share a natural cardinality - an
artist could plausibly have one `ShopCutRate` row spanning a year of `BOOTH_RENT` while the actual
rent amount changed twice within it. `BoothRentPlan` is append-only for the identical M7 reason.

**Real ledger rows generate only at `confirmed`, never at `due` or `marked_paid`** - an
invoiced-but-unconfirmed shop cut isn't counted as revenue either (M9's dual-control flow), and
booth rent follows the same timing. `confirmBoothRentPaid` creates an artist-owned `Expense` and a
shop-owned `Income`, both against an owned (not seeded) "Booth Rent" `ExpenseType`/`IncomeType` -
see `ExpenseType`/`IncomeType`'s own header comments on why this app never ships a universal
expense vocabulary.

**Eligibility for the generator is re-checked every run, never cached on the plan.** An artist can
switch back to `PERCENTAGE` (a new `ShopCutRate` row) without anyone touching `BoothRentPlan` at
all, and `utils/booth-rent.js`'s `generateDueBoothRentCharges` must stop generating the moment
that happens - it re-resolves `ShopCutRate.compensationModel` for every {artist, shop} pair on
every run rather than trusting a boolean set once at switch time.

**The escalation cadence (3 days) is my own default, not one of the confirmed decisions** - "escalate
until marked paid" said the *shape*, not the *interval*. Flagged here rather than presented as
settled; easy to make configurable alongside `ResponseTimeSettings` (MSG4) if it ever needs to be.

Rejected: a parallel expense/income engine for booth rent specifically, instead of reusing
`RecurringExpense`'s cursor/catch-up/idempotent-index shape. Rejected: storing rent terms directly
on `ShopCutRate` rather than a separate append-only `BoothRentPlan`.

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

### S0. Every shop admin is an artist

One shape of shop admin, not two. `role: SHOP_ADMIN` with `userType: ARTIST`, an `Artist` profile, a
`Staff` row and an `ArtistShopConnection` — which is what `registerAccount` has always produced for
a shop signup ("a shop owner tattoos until they say otherwise").

There used to be a second shape. `scripts/seed.js` created a `STAFF`-typed admin with a `Staff` row
and nothing else, and no creation path in the real app produced it. The difference was invisible
until `userType` began gating real surfaces, and then it was severe: a `STAFF`-typed admin had no
Settings page at all, and `getMySquareConnection` / `getMySquarePricingSettings` resolved them as an
**independent artist** — because both resolve ownership through `ArtistShopConnection`, which they
had none of. A shop admin who did not tattoo could not configure their own shop's tax rate, and was
told the zeros they saw were their own.

Migrated by `scripts/migrate-shop-admins-to-artists.js`; the seed now produces the same shape as
signup.

**The domain fact this rests on:** a shop admin or owner is essentially always a tattoo artist too.
Confirmed by the person running the shop this is built for, and it is the assumption `registerAccount`
was already written on. The non-tattooing owner is the rare exception, not a second class of user to
model for.

That matters because it turns the apparent cost into a non-issue. A migrated admin does appear in the
shop's artist directory, carry a calendar tag colour, and show up in per-artist dashboards — which
would be wrong for someone who never tattoos, and is simply correct for someone who does. For the
rare exception the mitigation is per-account rather than structural: set their `Artist.status` to
`INACTIVE` or `ARCHIVED` and they drop out of the directory while keeping every record attached to
them.

Rejected: supporting both shapes and resolving viewer-facing gates on "do you administer a shop"
instead of on `userType`. It models the general case more closely, but it means every gate carries
two questions forever and the two answers drift — a permanent structural cost to serve a case that
barely occurs. One shape means one signal.

### S1. While connected, the shop sees everything

All client and appointment data. On disconnect, the artist retains visibility of everything
collected during the connected period. Data from the gap — other shops, independent work — stays
invisible to the shop.

### S2. An unaffiliated artist has full control of their own functionality

An independent artist is their own admin. Anything gated on "shop admin" applies **only where a shop
exists**; with no shop, the artist holds that authority over their own data — adjustments included.

**Implemented.** The gap was that two gate styles existed and only one obeyed the rule:

- `canManageArtist` / `assertCanManageArtist` — checks `user.id === artistUserId` **first**, so an
  artist always passes for themselves regardless of role. Already correct.
- `withAuth(fn, ROLES.SHOP_ADMIN)` — a bare role floor that runs **before the function body**. An
  independent artist has role `ARTIST`, so these refused them outright no matter how correct the
  ownership check inside was. `archiveClient` is the clearest case: its body already calls
  `assertCanAccessClient`, which has an explicit "an ARTIST is their own shop for this purpose"
  branch, and an independent artist never reached it.

**Two different fixes, because the checks underneath differ.** This is the judgement the rule
needed, and it is not uniform:

- **`archiveArtist`, `unarchiveArtist`, `updateArtist` — floor simply removed.**
  `assertCanManageArtist` already expresses the whole rule on its own: self passes, and anyone
  else who is not `SHOP_ADMIN`-or-better sharing a shop fails on `user.role > minRole`. Nothing a
  shop artist can do changed.
- **`archiveClient`, `unarchiveClient`, `updateClient`, `redactClient` — floor moved inside**, as
  `assertAdminAuthority`. Their ownership check, `assertCanAccessClient`, passes any artist sharing
  a shop *or a project* with the client — so removing the floor outright would have let a plain
  artist at a shop archive that shop's clients. At a shop this is an admin action. With no shop
  there is no admin to be.

`hasAdminAuthority` in `utils/shop-membership.js` is the helper: true at `SHOP_ADMIN`-or-better, and
true for anyone with no shop at all. It asks the database rather than reading a role number, because
independence is a fact about membership and a role cannot express it.

**Left on the bare floor, deliberately.** `createStaffAccount`, `updateShop`, `disconnectShopSquare`,
`confirmShopCutPaid` and their siblings are genuinely shop-level. An independent artist has no staff,
no shop and nobody to confirm a payment against — loosening these would expose a mutation with no
meaning rather than grant a permission.

---

## Messaging and Auto-Responses

### MSG1. An Auto-Response can post into the conversation thread, not just email/SMS

`trigger: 'MESSAGE_RECEIVED'` (the away-message/out-of-studio trigger) posts a real `Message` into
the client's conversation, authored as the artist, in addition to whatever the response's own
`emailEnabled`/`smsEnabled` toggles send separately. This is the one exception to the feature's
original scoping ("Messages" = email/SMS, not the in-app Messenger) - confirmed directly, not
assumed, after building the first version without it: the auto-reply-into-the-thread behavior was
"literally the point of the feature" for the person who requested it, an out-of-office responder
in the same sense a mail client's is.

Rejected: email/SMS only, matching SESSION_COMPLETED/PAYMENT_RECEIVED. A client messaging in-app
and getting only an email back reads as broken, not as a feature.

### MSG2. MESSAGE_RECEIVED replies once per incoming message, with no throttle

Every qualifying client message gets its own reply - not one per conversation, not one per day.
Confirmed directly: "it should generate one response to each message sent in from a client... just
like an email out of office response," which does answer every inbound message rather than muting
itself after the first. Implemented as a claim-before-send dedup keyed to the triggering Message's
own id (`AutoResponseLog.messageId`), parallel to how SESSION_COMPLETED dedups on `appointmentId` -
same mechanism, different key, so a retried call still can't double-reply to one message.

Rejected: a 24-hour (or "once per toggle-on period") throttle per conversation. Both were on the
table and explicitly turned down in favor of the above.

### MSG3. MESSAGE_RECEIVED only fires on a thread with exactly one artist member

The triggering message's sender must be a Client, and the conversation's other members must resolve
to exactly one Artist. Zero (a staff-only thread) or more than one (a group thread) is left alone
rather than guessed at. `Conversation` carries no `artistId`/`shopId` field to resolve this any
other way - membership is the only relationship it has (see `utils/conversations.js`) - and every
ordinary client/artist Messages thread already has this shape. Not directly asked, but necessary to
implement anything: **OPEN** whether group threads need their own rule if they turn out to be
common.

### MSG4. Response-time thresholds: the shop sets a ceiling, an artist can only tighten it

`ResponseTimeSettings` (Settings > Messages) governs how long a client message can sit unanswered
before `utils/notification-jobs.js`'s `sendMessageNudges` sweep starts nagging the artist about it,
and how often it repeats. Confirmed directly, via `AskUserQuestion`: "Shop admin sets a policy floor
artists can tighten but not loosen" - not "one wins outright" the way every other owner-precedence
resolver in this codebase works (`resolveShopCutPercentAt`, `resolveAutoResponseForTrigger`,
`resolveSystemMessageTemplate` below). `utils/response-time.js`'s `clamp()` is the actual new shape:
the shop's row, if any, is a CEILING - `min(artistValue, shopValue)` - never a value the artist's
own setting can exceed. No shop row at all falls through to the artist's own value, or the built-in
480/180-minute default. Worth remembering when adding a SIXTH owner-precedence resolver: check
which shape the request actually describes before reaching for "one wins outright" as the default.

### MSG5. System-generated text is manageable per-owner, except two identity/security emails

Confirmed directly, via `AskUserQuestion`: "every hardcoded outbound email/SMS app-wide" becomes
editable, not just the new-message notifications this was first scoped around. `SystemMessageTemplate`
(one row per `{owner, key}`, 7 keys) follows the exact same owner precedence as `AutoResponse` -
artist's own override wins outright, else the shop's, else `utils/system-message-templates.js`'s
`DEFAULT_TEMPLATES` - and the same "absence means default" convention: `getSystemMessageTemplates`
returns only rows that exist, never one synthesized per key, so an owner who has customized nothing
sees an empty list rather than 7 rows all quietly already matching the default text.

**`sendAccountInviteEmail` and `sendPasswordResetEmail` stay hardcoded, on purpose.** Both are
identity/security emails the *platform* sends, not a shop or artist's own outreach - a password
reset is looked up by email address alone, with no shop/artist ownership context at send time, and
letting a shop admin edit the password-reset email their own artists receive is a phishing-adjacent
surface this app's tenancy model has no business opening. Flagged explicitly rather than silently
included, since "every hardcoded email" read literally would have swept these in too.

`BOOKING_CONFIRMATION` (`client-booking-emails.js`) is narrower than the other 6 keys for a
different reason: that email is assembled from arrays/conditionals (schedule table, deposit line,
intake-form recap), not one string, and letting an owner override the whole body risks them
accidentally deleting the schedule/deposit info the email exists to convey. Only the **subject**
and one **appendable "extra note"** are template fields; the structural body stays code-generated.

Rejected: scoping this to just the new-message notifications it was first noticed on. Rejected:
letting `BOOKING_CONFIRMATION`'s body be fully overridden like the other 6.

### MSG6. Shared images are indexed and badged, never removed on assignment or deleted from storage

`SharedImage` (one row per image URL shared via a message, either direction) backs a
client-dashboard triage list, feeding `IBImagesList.jsx` - the same tag/lightbox component the
project image lists already use - by mirroring `IBImage`'s own field shape rather than inventing a
new one. Three sub-decisions, each confirmed directly via `AskUserQuestion`:

**Every shared image shows, always - no "unassigned only" filter.** Confirmed directly: "every
shared image should be fine, because it's just pulling from a link to where the image is stored,
not an actual duplicate image." No new "hidden once assigned" state was added - `SharedImage` rows
persist indefinitely once created, an index rather than a queue to empty out.

**Assigning an image to a project badges it; it does not disappear from the list.** Confirmed
directly: "stays, with a badge showing where it went." `assignedProjectId`/`assignedImageType` stay
on the row permanently once set (see the model's own header comment on why this is stored rather
than derived by searching every project's image arrays for a matching URL) and the panel renders a
"Added to `<project>`'s `<list>`" badge instead of filtering the row out.

**Visible to the artist and shop admins, never the client themselves, never plain staff.**
Confirmed directly: "Artist and shop admins." This is narrower than the existing
`canAccessClient` (which also lets the client read their own record, and lets any shop member
including front-desk staff in) - `canManageClientSharedImages` (`utils/shop-membership.js`) is a
new, separate check rather than a reuse, since loosening `canAccessClient` itself for this one
caller would have widened every OTHER thing gated on it too.

**Assignment copies the URL into the project's image list; it does not move or reference it.**
Not directly asked, but the necessary consequence of "just a link, not a duplicate" plus "stays
badged" together: if `assignSharedImageToProject` moved the row instead of copying it, "delete
this shared image" and "delete this project's copy of it" would become the same action by
accident, and a project's own image list would depend on a client-dashboard row nobody browsing
the project would know still needed to exist. A real `IBImage` subdocument is pushed onto
`Project.referenceImages`/`designImages`/`bodyImages`, independent of the `SharedImage` row from
that point on.

**"Delete" on this list only drops the tracking row - it does not call `IBDeleteFile` the way the
project image lists' own delete does.** Not directly asked, and flagged as a deliberate deviation
from "same functionality as the image lists in projects, ie, ability to add tags, delete, etc"
rather than silently narrowed: the project lists' delete permanently removes the file from Firebase
Storage, which is safe there because that file exists only for the project. A shared image's URL is
also the actual image rendered in the client's real chat history (`IBMessage.jsx`) - deleting the
file would silently break that thread's own display for an action that reads, from this list, like
"stop showing me this in my triage list." `IBImagesListOptions.jsx` gained an `onDelete` override
and a `deleteLabel` prop precisely so this one caller could opt out of the destructive default
without changing it for the two callers that still want it (`Project.jsx`'s three image lists).

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
| Charging a client into the shop's account | Shop is paid in full AND invoices the artist for a cut |
| Falling back to the shop when the artist has no account | Looks like a courtesy; is the same double-payment |
| Client-supplied charge components | No schema makes a client entitled to assert what it is owed |
| Cross-checking client figures against server ones | Two sources for one number, needing a rule for which wins |
| Charging a deposit before recording it | Charged and recorded become two numbers that can differ |
| Two shapes of shop admin | Every gate carries two questions forever, and the answers drift |
| Dropping the role floor on the client gates | Would let any artist at a shop archive that shop's clients |

---

## Open

Nothing is blocking. Two things are parked rather than undecided:

- **The reference-image upload 400.** Parked at the user's direction until it recurs and a payload
  exists. `express.json()` was on Express's 100kb default and is now 2mb, but that is **not**
  confirmed as the cause and should not be recorded as the fix.
- **S2's uneven gates** are known work, not an open question. The rule is decided; the
  `withAuth(fn, SHOP_ADMIN)` call sites have not been moved onto it yet.
- **MSG3's group-thread gap.** `MESSAGE_RECEIVED` currently skips any conversation with more than
  one Artist member rather than picking one. Parked until group threads (a shop general inbox with
  multiple staff, say) actually exist in practice - no rule has been asked for yet.
