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

## Architecture and cross-platform

### X1. TypeScript is adopted going forward, not retrofitted onto existing JS

New code in `packages/api`/`packages/shared` (once the mobile-app monorepo split happens) is
TypeScript from the start. Existing `server/` and `client/` JavaScript is **not** rewritten as
part of that migration - same precedent as declining the React Router v6->v7 jump mid-task
(PRODUCTION_ROADMAP.md): a real migration bundled into an unrelated task is how both end up half
done. The reason to adopt TypeScript at all, rather than defer it again, is concrete: GraphQL Code
Generator's actual value is compile errors at the exact call site a schema change breaks, and that
requires a TypeScript consumer on the other end - a generated `.d.ts` file nothing imports as types
is decoration. TypeScript reaching the rest of the codebase, if it ever does, is a separate,
later, explicitly-scoped decision - not an assumed consequence of this one.

### X2. GraphQL schema changes are additive-only once a second client exists, with a deprecation window before removal

Today, one client (the web app) exists, and it gets fresh code on every page load - a breaking
schema change and a client update ship together, atomically, because there's no gap for them to
disagree in. That stops being true the moment a mobile app exists: a phone sitting on someone's
home screen keeps running whatever version was on it when they last updated, for however long they
go before updating again. A field renamed or removed on the server can break an app already in the
wild with no code push able to fix it - the server doesn't get to force a client-side update the
way a web deploy does.

Rule: prefer additive changes (a new field alongside an old one, not a rename). When a field
genuinely must be removed, mark it `@deprecated` in the schema with a reason, keep it fully
functional, and don't delete it until either every client is confirmed to have moved off it or a
minimum window has passed long enough to cover realistic update adoption (a fixed number here would
be fiction before there's real usage data to set it from - decide the actual window once the
mobile app has real install/update-rate numbers to look at, not in the abstract now). Additive
schema changes need no version negotiation at all; a hard removal, if one is ever unavoidable
before the window closes, needs the server to detect the caller's client/version and branch - not
built until a real case demands it.

### X3. Design tokens have one source, in plain JS, not CSS

`client/src/theme/tokens.mjs` is the single source for every color value the app uses - `tokens.css`
is generated from it (`npm run tokens:generate`), and `theme.js`'s MUI palette imports it directly,
closing the "keep two copies in sync by hand" gap that existed between those two files. Plain JS
rather than CSS custom properties because CSS custom properties don't exist in React Native -
mobile theming (Tamagui or React Native Paper, Phase 5) needs plain values regardless, and the
question was only ever whether that source gets built now, once, correctly, or invented a second
time under deadline once mobile work is already underway. Staged in `client/src/theme/` ahead of
the monorepo split described in PRODUCTION_ROADMAP.md's Phase 5 - moves into `packages/shared`
verbatim once that structure exists, no rewrite needed at that point.

### X4. apps/web depends on packages/api via `file:`, not bare npm workspace resolution - and CI installs from the repo root

Root `package.json` now declares `"workspaces": ["apps/*", "packages/*"]` (step 1 deferred this to
step 2 - see PRODUCTION_ROADMAP.md's Phase 5 order-of-operations). That field alone doesn't decide
*how* apps/web resolves `@inkbooks/api` - two real options, and this picked the second:

Bare workspace resolution (`"@inkbooks/api": "^0.1.0"` in apps/web/package.json, relying on npm to
match it against the local workspace package by name+version) is the more "idiomatic" workspaces
pattern, but it only resolves during a root-level `npm install`/`npm ci` - it does nothing for
`apps/web`'s own standalone install. Confirmed empirically (same finding as step 1's note on the
`workspaces` field itself): once a package's ancestor declares `workspaces`, `npm ci` run with cwd
inside that package stops managing its own independent lockfile the way it used to, and starts
deferring to the root - so apps/web's `npm ci` silently stopped being self-sufficient the moment
`workspaces` was added, regardless of which resolution mechanism `@inkbooks/api` used.

Given that's already true, the decision was to make it explicit rather than accidental:
apps/web/package.json depends on `"@inkbooks/api": "file:../../packages/api"` - a concrete path,
not a version-range match - and CI's `client`/`packages-api` jobs both run `npm ci` at the repo
root (one lockfile, `package-lock.json`, covering apps/web + packages/api together), then target
a single project's scripts with `npm run <script> --workspace=<name>` rather than `cd`-ing into
it. `server/` is unaffected either way - it was never added to the `workspaces` array (it isn't
part of the apps/mobile monorepo split PRODUCTION_ROADMAP.md's Phase 5 describes), so its own
`npm ci` in its own CI job keeps working exactly as it did before this step.

Practical effect for anyone working locally: `apps/web`'s own previously-standalone
`package-lock.json` is gone (moved to `_to_delete/` rather than deleted outright, since these
remote-bridge sessions can't delete files - safe for a human to remove) - it stopped being
accurate the moment `workspaces` landed and would only have kept lying about what `npm ci` there
actually does. Run `npm ci` (or `npm install`) once from the repo root; that's what both CI jobs
and any future workspace member (packages/shared, apps/mobile) will do too.

### X5. Auth token storage sits behind an async interface shaped like expo-secure-store, not localStorage's synchronous one

`CacheService.js` (`localStorage.setItem`/`getItem`/`removeItem`, synchronous) is gone, replaced by
`apps/web/src/services/TokenStorageService.js` (`setItemAsync`/`getItemAsync`/`deleteItemAsync`).
Staged in `apps/web/src/services/` ahead of `packages/shared` existing, same precedent as X3's
design tokens - moves verbatim once that package exists.

The shape is dictated by the mobile side, not chosen freely: `expo-secure-store`'s real API
(iOS Keychain / Android Keystore) is inherently async and stores strings only, no JSON encoding
done for you. An interface that stayed synchronous, or that did its own `JSON.stringify`
internally the way `CacheService` did, could not become the real mobile implementation without
also changing its signature - every call site would need a second migration later. Written now,
the mobile implementation is a three-line re-export with no adapter logic:

```js
import * as SecureStore from "expo-secure-store";
export const TokenStorageService = {
  setItemAsync: SecureStore.setItemAsync,
  getItemAsync: SecureStore.getItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};
```

This also fixes a real, if harmless, bug rather than just relocating it: `CacheService.setItem`/
`getItem` did a *redundant double* `JSON.stringify`/`JSON.parse` - every real caller already
pre-stringified before calling `setItem`, then `setItem` stringified again, and `getItem` only
round-tripped correctly because it parsed twice too. `CacheService.test.js` explicitly documented
and locked that contract in, calling a fix "out of scope for a test-writing pass." It's in scope
here: this step already touches every call site to make it async, and the new service does zero
JSON encoding of its own - callers stringify once before `setItemAsync`, parse once after
`getItemAsync` - so the double-encoding isn't fixed so much as made impossible to reintroduce.

**Consequence for `context/auth.jsx`:** the previously-synchronous initial-session check (read
directly into the reducer's initial state at module load, before React ever rendered) has to move
into an effect, since `getItemAsync` is genuinely async even on web. That produces one real render,
on mount, before a previously-signed-in user's session comes back - `AuthProvider` now exposes a
distinct `initializing` boolean (not the existing, unrelated `loading` flag) so consumers can tell
"still checking" apart from "checked, nobody's signed in." `utils/AuthRoute.jsx` and
`utils/RoleRoute.jsx` both gate on it (render nothing while `initializing`) - without that, an
already-authenticated person hitting a route either guards on a hard refresh would be bounced to
`/login` for one render, before their session had a chance to be restored. RoleRoute needed the
same fix independently: it's used standalone in `App.jsx` (`/artists`, `/expenses`, `/income`,
`/forms`), not nested inside AuthRoute, so it had the identical exposure one role check further
along.

Not yet done, and deliberately out of scope for this step: `TokenStorageService`'s web
implementation is still `localStorage`-backed. This step gets every call site behind the shared
interface first, so swapping the storage backend later (closing the XSS/localStorage token-theft
exposure the original security audit flagged) is a one-file change here, not an app-wide
search-and-replace.

### X6. `apps/mobile` is a real Expo/TypeScript app from the first commit, not a placeholder folder - CI/CD, Sentry, and a test harness stood up before any feature screen exists

`apps/mobile` was added via `npx create-expo-app@latest` (Expo SDK ~57.0.17, React Native 0.86.3,
React 19.2.3, TypeScript ~6.0.3, expo-router with typed routes), then stripped of every
template-only demo (the "Welcome to Expo" tab layout and its icons/images, `scripts/reset-project.js`,
the template's own `README.md`/`CLAUDE.md`/`AGENTS.md`) while keeping the genuinely reusable
primitives the template ships (`ThemedText`/`ThemedView`, the color-scheme hooks, `tsconfig.json`'s
`@/*` path alias). It joins root `package.json`'s existing `"workspaces": ["apps/*", "packages/*"]`
(X4) as a third member, and depends on `@inkbooks/api` the identical `file:../../packages/api` way
apps/web does - `src/app/index.tsx` type-only-imports `GetProjectsQuery` from it specifically to
prove that resolves and typechecks from a second, non-web client, which is packages/api's entire
reason to exist (X1).

**What's real vs. deliberately deferred, in the walking-skeleton screen itself
(`src/app/index.tsx`, `src/app/_layout.tsx`):** an Apollo Client pointed at
`EXPO_PUBLIC_API_URL` (`src/lib/apollo-client.ts` - Expo's env-var convention, the RN/Expo
equivalent of Vite's `VITE_*` prefix requirement; only `EXPO_PUBLIC_*`-prefixed vars get inlined
into the built app), no auth link yet (needs a real `expo-secure-store`-backed
`TokenStorageService` implementation and a real login screen to read a token from - neither exists
until step 6), no tab bar or navigation IA (one screen isn't navigation, it's decoration - a real
decision once there's a second screen to navigate between), no InkBooks "copper" theme (still the
template's generic light/dark placeholder colors - `packages/shared` and the token migration X3
already anticipates is step 6's work, not this one).

**Mobile CI/CD (roadmap item 4) - stood up, EAS Build itself is not.** `apps/mobile/eas.json`
declares `development`/`preview`/`production` build profiles (internal distribution for the first
two, an EAS Update channel per profile, `EXPO_PUBLIC_API_URL` set per-environment) - the channel
strategy the roadmap calls for. What it cannot do yet: actually run. EAS Build needs a real
Expo/EAS account, `eas init` run against it (which writes a real `extra.eas.projectId` into
`app.json` - deliberately absent rather than faked, so it can't be mistaken for a working one), and
an `EXPO_TOKEN` secret in the repo's CI. None of those exist in this environment. `.github/workflows/ci.yml`
gained a fourth job, `mobile` (typecheck + `jest` on every push/PR to `main`, same pattern as the
existing `server`/`packages-api`/`client` jobs) - that part needs no account and runs today; an
`eas build` step is a follow-up once the account exists, noted inline in the workflow file itself.

**`@sentry/react-native` (roadmap item 5) - the no-DSN-means-off contract, not source-map upload.**
`src/lib/sentry.ts`'s `initSentry()` mirrors the exact contract `apps/web`'s `index.jsx` and
`server/utils/error-reporting.js` already use: `Sentry.init()` only runs if
`EXPO_PUBLIC_SENTRY_DSN` is set, so this is safe to ship with no Sentry React Native project behind
it yet. What real crash reporting with readable native stack traces additionally needs - the
`@sentry/react-native` Expo config plugin in `app.json`, wired to a real org/project slug and auth
token so EAS Build can upload source maps - is deliberately not added, since wiring a config plugin
against credentials that don't exist would be dead configuration, not a head start.

**Mobile test strategy (roadmap item 6) - Jest + React Native Testing Library, wired and green.**
`jest-expo` as the preset (RN doesn't run on Vite's toolchain - PR1's "tests ship with the feature"
rule needed a working harness before `__tests__/index.test.tsx` could exist, not after).
`__tests__/` sits at the top level of `apps/mobile`, not inside `src/app/` next to the screen it
tests, because expo-router treats every file under `src/app/` as a candidate route and there's no
documented guarantee it skips `.test.tsx` files the way some bundlers skip `__tests__` directories
by convention - keeping test files out of the routes tree entirely removes the question rather than
relying on unverified exclusion behavior. Two real bugs the first test run caught, exactly PR1's
point: `react-native-safe-area-context`'s own jest mock (`react-native-safe-area-context/jest/mock`)
ships as `export default {...}` with no named exports, so `jest.mock`ing it by requiring that file
verbatim silently made every named import (`SafeAreaView` included) resolve to `undefined` -
`jest.setup.js` unwraps `.default` before returning it. Global CSS (`src/global.css`, imported by
`theme.ts` for the template's web output target) has no Jest transform for real CSS syntax by
default - `jest.css-mock.js` stubs it to `{}` since nothing under test asserts on stylesheet
effects.

**A real npm-workspace version-hoisting bug, found and fixed, worth recording so it isn't
rediscovered the hard way:** `create-expo-app`'s scaffold pins `react`/`react-dom` to an *exact*
`19.2.3` and `jest-expo`'s own `package.json` hard-pins its `react-test-renderer` dependency to
that same exact `19.2.3` - both narrower than react-native 0.86.3's own peer range (`^19.2.3`).
Meanwhile apps/web already forces the workspace root to hoist `react@19.2.8` (its own
`^19.2.8`). With `react`/`react-test-renderer` left at exact `19.2.3` in apps/mobile, npm nested a
*second* copy of `react` inside `apps/mobile/node_modules` to satisfy the exact pin, while
`@testing-library/react-native` (hoisted to the shared root, alongside root's `react@19.2.8`)
resolved a *different* `react` instance than the app code under test did - two separate copies of
React's internal reconciler state, which breaks `act()` tracking in a way that fails silently and
confusingly (`render()` appears to succeed; `screen.getByText` then throws "`render` function has
not been called," or "Can't access `.root` on unmounted test renderer," neither of which mentions
React at all). Loosening apps/mobile's `react`/`react-dom` to `^19.2.3` (react-native's own peer
range, still satisfied) let npm hoist a single shared `react` instead of nesting a second copy - but
`react-test-renderer` still resolved to the mismatched `19.2.3` sitting at the root, because nothing
forced it off the version `jest-expo`'s own exact pin was content to share. The actual fix: a root
`package.json` `"overrides": { "react-test-renderer": "19.2.8" }`, forcing every consumer -
including `jest-expo`'s own internal one - onto the single version that matches the hoisted `react`
it needs to pair with. `@testing-library/react-native` was also downgraded from its just-released
`14.x` to `^13.3.3`: `14.x`'s `screen` API failed to register a render result at all in this
environment (same symptom as the mismatch above, but present even after the version-hoisting fix),
and `13.x` is the version this project's actual `jest-expo`/RN combination was verified against,
not a version chased for its own sake.

### X7. App Store Guideline 3.1.3(e) requires Square for the deposit/session-charge flow, not merely permits it

Researched against Apple's own current App Store Review Guidelines text (guideline 3.1, "In-App
Purchase") and this app's actual `server/routes/squarePayments.js` route, not written from memory
or general App Store folklore. Guideline 3.1.1 requires In-App Purchase for unlocking features or
content *within the app itself*. That is not what Inkbooks' Square flow does: a client's deposit or
session-charge payment settles a real-world tattoo appointment delivered in person, later, outside
the app - it unlocks nothing in the software. Guideline 3.1.3(e), "Goods and Services Outside of the
App," covers exactly this case and, read closely, does more than permit an alternative to IAP for
it - it's the clause that would make using Apple's IAP for a real-world service *non-compliant* in
the first place, since IAP is scoped to digital content and unlocks consumed inside the app.
Guideline 3.1.3(d), "Person-to-Person Services" (a marketplace connecting a client to a service
provider for work delivered outside the app - the artist/client relationship here, precisely), is
the secondary, reinforcing clause.

Grounded in what the route actually does, confirmed by reading `squarePayments.js` in full: charges
land in **the artist's own connected Square account**, never Inkbooks' platform account, even for a
shop-employed artist (M9's existing rule - what the artist owes the shop is settled separately,
afterward, through the shop-cut ledger); the charge amount is computed server-side from stored
rates, never accepted from the client; and the route handles both a deposit and a full session
charge, gated to the appointment's owner or `SHOP_ADMIN`. Nothing about a successful charge grants
access to any app feature or content - the transaction pays for work performed in a tattoo chair,
not for anything the app itself provides.

### X8. Mobile auth ships app-token-only; Firebase sign-in stays web-only until mobile has an image-upload feature

PRODUCTION_ROADMAP.md's Phase 5, step 6 calls for one real screen end-to-end (the appointments
list) with real auth ahead of it. Scoped with the user up front to two decisions, both intentional
narrowings of what X6's walking skeleton left open: the feature itself is the full read/write
wizard (not a read-only list), but auth is the app's own login only - no Firebase custom-token
sign-in alongside it.

`apps/web/src/context/auth.jsx`'s `login()` does two things after a successful `LOGIN_USER`
mutation: `setSession(userData)` (the app's own token, persisted, cache-wiped), then
`signInWithCustomToken(userData.firebaseToken)`. Those are separable because they exist for
different reasons - the app token is what every GraphQL request authenticates with; the Firebase
sign-in exists solely so an authenticated client can write to Firebase Storage (reference-image
uploads). Mobile has no image-upload feature yet, so there is nothing for a Firebase session to
authorize here - porting it now would be a second, live auth flow with no caller. `apps/mobile/src/context/auth.tsx`
is `auth.jsx` minus exactly that piece: no `firebaseUser` state, no `FIREBASE_LOGIN` action, no
`signInWithCustomToken`/`signOut` calls. `login.graphql` mirrors `LOGIN_USER`'s selection minus
`firebaseToken` for the same reason - nothing on mobile reads it. Everything session-lifecycle-
related that has nothing to do with Firebase - the cache-wipe-on-session-change fix (`cache.reset()`
+ `clearStore()` on every `setSession`, not just when the user id changes - a single long-lived
`InMemoryCache` means a second user's screen can otherwise render the first user's cached data with
no network request, so no server-side scoping check ever runs to catch it), the async
`SecureStore`-backed session restore with a JWT-expiry check (`jwt-decode`'s `exp` compared against
`Date.now()`, stored session discarded rather than restored if already expired), and the
`initializing` flag distinguishing "still checking" from "checked, signed out" - is unchanged,
because the bug class each exists to prevent is identical on mobile. When mobile does grow an
image-upload feature, Firebase sign-in is additive to this file, not a rework of it.

`CurrentUser` (`apps/mobile/src/context/auth.tsx`) is `LoginMutation['login']` - read off
`packages/api`'s generated type rather than hand-declared, so a field added to or removed from
`login.graphql` is a compile error at every place that assumed the old shape, not a silent runtime
mismatch. `login.graphql` itself selects `shop.id`/`shop.name` on `Artist`/`Staff`'s `userInfo`
now, even though nothing reads it yet - every shop-scoped query the appointments screens need next
needs it, and re-running codegen later for one more field is pure overhead against getting it now.

Navigation IA: `_layout.tsx` uses expo-router's `Stack.Protected` (`guard` prop) rather than a
manually-managed `<Redirect>` - the currently-documented pattern, confirmed against
`docs.expo.dev/router/advanced/protected` rather than assumed from training data, since this is
exactly the kind of API surface that moves across Expo SDK versions. It re-evaluates on every
render, so the moment `login()`/`logout()` flips `user`, the Stack swaps which screen group is
reachable on its own - no `navigate()` call needed at either call site, and no flash of the wrong
screen while `initializing` is true (the Stack renders `null` until it resolves, matching X5's
`initializing`-gated `AuthRoute`/`RoleRoute` pattern on web).

`apps/mobile/src/constants/auth.ts` duplicates (not shares) `ROLES`/`AUTH_SETTINGS_CONSTANTS`/
`AUTH_ERROR_MESSAGES` from web's `constants/auth.js`, trimmed to what auth actually needs so far -
same `packages/shared`-doesn't-exist-yet staging precedent as X3 and X5, both of which note their
own duplication the same way.

### X9. The mobile appointments screen is read-only, fixed to "this week," and reuses web's exact shop/personal query split - FlashList and Apollo cache persistence are the actual point of this phase

`apps/mobile/src/app/index.tsx` becomes the real appointments list this phase, as X6's and X8's own
comments on that file already said it would - not a second screen alongside the placeholder.
PRODUCTION_ROADMAP.md's Phase 5, step 6 asked for four things at once here: real data through
packages/api, `FlashList` for the list, Apollo cache persistence for offline reads, and a visible
offline banner. Everything else about the screen - which appointments it shows, what window, what
a row displays - is deliberately the minimum that makes those four things demonstrable end to end,
not a first draft of the full web feature.

**Which queries fire is copied from `AppointmentsList.jsx`, not simplified.** A shop-connected
artist reads the shop's whole calendar (`getAppointmentsByShop`) plus their own personal entries
merged in separately (`getAppointmentsByShop` excludes `isPersonal` rows server-side, no exceptions
- see `resolvers/appointments.js`'s own comment - so a second `getAppointmentsByArtist` call with
`isPersonal: true` is the only way to see them); an independent artist reads
`getAppointmentsByArtist` alone. This looked like a place to cut a corner for a first mobile pass -
it isn't, because the exclusion it's built around is a privacy boundary (a personal appointment is
never visible to anyone but its owner, full stop), not a display preference. Simplifying to "just
call getAppointmentsByArtist" would have silently dropped a shop-connected artist's own personal
calendar off their own phone. `packages/api/src/operations/appointments.graphql` defines one
`AppointmentListItem` fragment shared by both operations - web's two queries copy-paste the
identical field list across two `gql` templates; a fragment gets the same result without keeping
two lists in sync by hand, worth doing now that it's being authored fresh rather than ported
verbatim.

**Fixed to the current ISO week, no range picker, no pager.** Web's `AppointmentsList.jsx` carries
a full range picker (This month/Next month/This week/Next week/custom) and real pagination over an
arbitrary window - both genuinely useful, neither necessary to prove FlashList and cache
persistence work. `utils/dateRanges.ts` ports only `getDefaultScheduleRange`'s Monday-start ISO
week math (native `Date`, not `moment` - the entire reason to add `moment` as a mobile dependency
would have been this one calculation), fetched at a fixed `{ limit: 200 }` the same way web's
*calendar*-view queries do (not the paged list's), since a bounded one-week window needs no pager
of its own. The picker and real paging are additive later, against the same query shape - not a
second implementation.

**Offline banner is driven by NetInfo's device-level signal, not by inspecting the Apollo query
result.** `OfflineBanner.tsx` reads `@react-native-community/netinfo`'s `useNetInfo().isConnected`
directly rather than asking "did this query's fetch fail" or "is this data serving from cache."
Those usually agree, but they're not the same fact, and deriving the banner from one query's own
error/network state would tie a UI promise ("you're offline") to that query's particular
retry/error-policy behavior as a side effect rather than a guarantee. `isConnected` starts `null`
(not yet determined) and is treated as online rather than flashing the banner on every cold start
before NetInfo has reported in.

**Cache persistence gets its own readiness flag, the same shape as auth's `initializing`.**
`apollo-client.ts` exports the `InMemoryCache` instance separately from the `ApolloClient` that
wraps it, plus an `initCachePersistence()` that awaits `apollo3-cache-persist`'s `persistCache()`
against it. `_layout.tsx`'s `RootNavigator` now gates on `initializing || !cacheReady` instead of
`initializing` alone, keeping the splash screen up through both async bootstrap steps - restoring
AsyncStorage's saved cache is itself async, and a cold launch offline would otherwise render an
empty list for one frame before the restore finishes, which is the exact flash persisting the
cache exists to prevent. One root-level readiness flag per async bootstrap step, not a per-screen
loading check invented separately for each one.

**Dependency versions are Expo SDK 57's own pins, not each package's latest.** `@react-native-async-storage/async-storage`
(`2.2.0`), `@react-native-community/netinfo` (`12.0.1`), and `@shopify/flash-list` (`2.0.2`) are
pinned to exactly what `expo`'s own `bundledNativeModules.json` lists for this SDK - the same
reasoning X6's dependency work already established for `expo-secure-store` (X8): a version `expo
install` wouldn't have chosen risks native-module/JS mismatches EAS Build isn't set up to catch
until a real device build fails. `apollo3-cache-persist` isn't Expo-managed (pure JS, no native
module) and is pinned to its latest (`0.15.0`) instead.

Not done, and deliberately out of scope for this phase: opening an appointment (a session's
project, a consult's detail page) - Phase 3's wizard is where that navigation and the write side
both land together, rather than building read-only navigation now and rewiring it once editing
exists. `AppointmentTypeChip`'s consult/session/personal visual distinction is also not ported -
the row shows `appointmentType` as plain text for this pass.

---

### X10. iOS/iPadOS is the primary target platform; Android support is required, not optional, but never blocks an iOS decision

Stated directly by the user once there was a real build to test: focus is iPhone/iPad first,
Android has to keep working too, but nothing ships that works on Android and not on iOS/iPadOS -
the reverse (works on iOS, Android trails) is the acceptable temporary state, never the other way
around.

Practical consequence for how this project sequences work from here: a platform-specific bug or
EAS build issue gets fixed for iOS before Android if only one can be done first; a new dependency
gets its iOS behavior verified even when Android was what happened to be built/tested first (as it
was for Phase 1/2 - the only dev client built so far is Android); and any future UI decision that
would read fine on a phone but awkwardly on an iPad (fixed single-column layouts, phone-only
navigation chrome) is a real defect against this project's own stated priority, not a nice-to-have.
Nothing so far has been iPad-specific - Phase 2's appointments list is unstyled for tablet width
because no screen has needed that judgment call yet, not because it was decided against.

---

### X11. Push is a fourth channel through the existing notification dispatch point, not a parallel system - one row per device, gated by email's own IMMEDIATE/DIGEST/OFF resolution

PRODUCTION_ROADMAP.md's Phase 5 step 7. `notify()` (`server/utils/notifications.js`) already
resolves, per recipient, whether an event is worth an immediate interruption, a daily digest, or
nothing (`notification-preferences.js`'s `emailModeFor`) - the artist-versus-shop-admin,
money-versus-schedule story NOTIFICATIONS_DESIGN.md §6/§7 exists to tell. Push had two honest
options: reuse that resolution, or invent its own noise judgment and get it right a second time.
It reuses it. A shop admin whose money category is already DIGEST because a six-artist shop
throws 60-80 money events a week does not want their phone buzzing for the same 60-80 events their
inbox is already sparing them from - so push fires only when `emailModeFor` resolves `IMMEDIATE`,
and is gated by the same `email: false` flag that already means "in-app only" for an event, since
a push notification leaves the device even more than an email does. No separate
`pushPrefs`/`platform` preference exists, and none should be added later without first asking why
the email resolution stopped being the right one for push too.

**`PushToken` is one row per device, not per user, upserted by token.** A studio's front-desk
iPad is signed in as whoever is at the counter; the same physical device's Expo token has to be
reassignable across accounts rather than accumulating one abandoned row per person who ever signed
in there. `registerDeviceToken` (`server/graphql/resolvers/pushTokens.js`) upserts
`findOneAndUpdate({ token }, { $set: { userId, platform, lastSeenAt } }, { upsert: true })` -
keyed on the token, never on `(userId, token)`. `platform` is a plain validated `String!`
(`ios`/`android`), matching this schema's existing convention of no GraphQL enums anywhere
(`ReminderLog`'s channel field is the same shape) rather than introducing the first one for this.

**Send is fire-and-forget from `notify()`, exactly like email is queued rather than sent inline.**
`push.sendPushForRecipients(...).catch(...)` is deliberately not awaited - an Expo outage or a
slow response must never add latency to the deposit/booking/etc. that triggered the notification.
The in-app `Notification` rows, written first and synchronously, remain the source of truth
regardless of what push does after.

**Only `DeviceNotRegistered` prunes a token; nothing else does, and there is no receipts sweep.**
Expo's ticket-level errors distinguish a genuinely dead token (app uninstalled, token revoked -
permanent, prune it) from everything else (rate limits, transient provider errors - report and
leave the token alone; it may well work next time). Expo also offers a second, delayed
receipts-check API for confirming a ticket that came back `ok` was actually delivered; this phase
does not poll it. That is a deliberate v1 scope trim - the ticket-level signal already catches the
one failure mode (a dead device) that matters for keeping `PushToken` clean - not an oversight to
silently fix later.

**`expo-server-sdk` is pinned to `^6.1.0`, not latest.** `7.2.0` requires `node>=22.12.0`, which
`server/package.json`'s own `engines: { node: '>=20' }` does not guarantee; `6.1.0` requires only
`node>=20` and exposes every API surface this phase uses (`Expo`, `Expo.isExpoPushToken`,
`chunkPushNotifications`, `sendPushNotificationsAsync`) unchanged.

**Registration is called from `apps/mobile/src/lib/push-notifications.ts`, on login and on a
restored cold-start session; unregistration is called on logout, before the session's auth token
is cleared** (`unregisterDeviceToken` requires auth, the same as every other mutation here). Both
directions take the caller's `ApolloClient` as a parameter rather than importing a client
singleton - the same injectable-client shape `server/utils/push.js`'s `expoClient` and
`server/utils/email.js`'s `send` already use for testability - and neither function ever throws:
a failed push registration is a worse notification experience, never a reason to fail login or
logout. `Device.isDevice` (from `expo-device`, added alongside `expo-notifications`) is checked
before ever requesting permission or asking Expo for a token, since the Simulator/emulator throws
out of `getExpoPushTokenAsync` rather than returning nothing, and there is no real device to
register regardless.

Not done, and deliberately out of scope for this phase: a notification-tap deep link (opening the
appointment/message the push was about, rather than just the app) - `data` is already attached to
every outgoing message for this to build on later, but nothing yet reads it on the client.

The server-side `mongodb-memory-server`-backed Vitest run for
`test/unit/push.test.js`/`test/integration/pushNotifications.test.js` could not be done inside the
cloud sandbox that authored this phase (that binary's download is blocked there by network policy
- both files were verified instead via standalone Node scripts exercising the real modules with
hand-built mocks, and via a real `ApolloServer(...).start()` confirming the full schema, including
the two new mutations, builds), but IS done now: run for real on Danny's own machine
(2026-08-30) and passing, closing the one gap this entry originally flagged.

---

### X12. Mobile's appointment-opening screens are full parity on money/timer/deposit/booking logic, with Square charging and image upload deliberately deferred - not stubbed

PRODUCTION_ROADMAP.md's Phase 5 step 8: the mobile appointments list's row tap now opens the same
three destinations `AppointmentsList.jsx`'s `openAppointment()` branches to on web - a personal
entry's quick edit/delete (`app/appointment/[id].tsx`), a consult's detail + convert-to-session
(`app/consult/[id].tsx`), and a session's Project, including its Sessions sub-list and the Session
Detail screen the sub-list drills into (`app/project/[id].tsx`, `components/ProjectSessionsList`,
`app/session/[id].tsx`). Scope was chosen deliberately, not defaulted into: all three destinations,
built as one slice and shipped as one PR, per Danny's own call rather than a per-screen check-in
cadence.

**Charge via Square and image upload are both omitted entirely, not stubbed/grayed-out.** Neither
has the infrastructure mobile would need - a Square React Native SDK for the former, Firebase
Storage (X8 already keeps Firebase sign-in web-only for exactly this reason) for the latter - and
building either was a separate infra project outside this slice's scope, Danny's own call when
asked. Session Detail's port (`components/SessionDetailForm.tsx`) has no "Charge via Square"
button and no `IBSquarePaymentForm` at all; Consult/Project have no reference/design/body image
upload or gallery. Everything a card charge or an image upload would otherwise gate - the
tax/fee/total quote preview, the deposit-apply flow, adjustments, notes, tags - is full parity
regardless, since none of it actually depends on either missing piece.

**Consult-to-session conversion is cash-only**, ported from `BookSessionDatesForm.jsx` into
`components/BookSessionDatesForm.tsx` with the entire Square branch removed: no
`pendingCardDeposit` state, no payment-method `ToggleButtonGroup` (there is only one method, so
there is nothing to toggle), no `IBSquarePaymentForm`. The deposit field's label says "cash only"
rather than defaulting silently to one option a shop might expect a choice about. Mechanically
unchanged otherwise: the first sitting always goes through `convertBookingRequest` (the only call
that creates the Project from the BookingRequest's own intake fields), every additional sitting is
a plain `createAppointment` against the resulting `projectId`, and a cash deposit - when given - is
recorded after the booking succeeds, against the *consult* appointment, never rolling back the
booking on a deposit-record failure. Same reasoning as X8's Square deferral: this is the same
missing infrastructure, not a second decision.

**The per-sitting `DaySchedule` conflict-check panel (web's "what's already on the books that
day" hint) is left out of the mobile booking form - a documented v1 simplification, not a silent
one.** Web's version issues a live query per row as dates/durations change; porting it well needs
its own mobile-sized presentation (nothing on mobile shows a day's schedule as a strip yet), and
the booking flow works correctly without it - an artist can already see their own day on the main
appointments list before opening a consult. Add it back as its own follow-up, not bundled into a
form that already does five other things.

**Two narrower GraphQL operations exist purely for the mobile Project screen -
`GetProjectDetail`/`UpdateProjectDetail` (`packages/api/src/operations/projectDetail.graphql`) -
deliberately not reusing web's `getProject`/`updateProject`.** Web's versions carry
`conversation.messages` and all three `IBImage` arrays, because `Project.jsx` renders `IBChatBox`
and `IBImagesUpload`/`IBImagesList` against them; this port renders neither (messaging was never
in this slice's scope at all, images are the same deferred infra as above). Selecting those fields
anyway would mean every open of this screen pulls a full chat history and every image's metadata
over a mobile connection to display none of it - the same "don't pay for what you don't render"
reasoning `sessionDetail.graphql`'s narrower selection already applies next to
`appointmentDetail.graphql`'s full `UpdateAppointment`.

**Every `updateProject`/`updateAppointment` call from mobile echoes back only the required fields
plus whichever one field actually changed - never `referenceImages`/`bodyImages`/`designImages`/
`materialsUsed`, which this port never fetches at all.** This is safe, not an oversight: both
resolvers call Mongoose's `findByIdAndUpdate` with a plain object with no `$`-prefixed keys, which
Mongoose wraps in `$set` automatically - an omitted key is left untouched, not nulled out. Web's
own `handleDetailFieldBlur`/`handleNotesUpdate`/`handleTagsUpdate` already rely on this same
behavior for the same reason (none of them send the image arrays either); this port's leaner
queries just make that pre-existing assumption explicit instead of accidental.

**A client-generated Mongo-style id for a new `IBNote`, without adding `bson` as a mobile
dependency.** Web's `handleNotesUpdate` calls `new ObjectID()` (the `bson` package) to give a new
note a client-side id before the save round-trip, matching a server that remaps `IBNoteInput.id`
straight onto the subdocument's real `_id` (`server/graphql/mutations/projects.js`'s
`remapIdToMongoId`) - Mongoose casts that to `mongoose.Schema.Types.ObjectId`, which only requires
12 bytes of valid hex, not `bson`'s specific timestamp/counter encoding. `bson` itself is a
Node/`Buffer`-oriented package with no React Native build. `apps/mobile/src/utils/objectId.ts`'s
`generateObjectId()` produces a random 24-hex-character string instead - satisfies the same
Mongoose cast, adds no dependency, one field.

**Timer/save/close/deposit-apply mutations are read back through Apollo's normalized cache rather
than a manually-mirrored local `appointment` state.** Web's `SessionDetail.jsx` keeps its own
`useState(initialAppointment)` and merges every mutation response into it by hand - necessary
there because `appointment` arrives as a prop passed into a global modal, with no query of its own
in that component. `components/SessionDetailForm.tsx` instead receives `appointment` sourced from
its parent's own live `GetAppointmentsByProject` query; every timer/save/close/applyDeposit
mutation here returns Appointment-shaped fields with a matching `id`, which Apollo's cache
normalizes and merges into that already-mounted query on its own, re-rendering this component with
the fresh value without any manual merge step. The one exception is `recordAdjustment`, whose
response is a single new `Adjustment` with nothing for normalized cache to append it to (Apollo
has no way to know it belongs on this Appointment's `adjustments` array) - that handler explicitly
calls `refetchSessions()` afterward instead, the same refetch-based pattern this port already uses
for Add Deposit and Add Session elsewhere on the Project screen.

### X13. X12's deferred Square charging and image upload are now built - Firebase Storage sign-in ported to mobile, Square charge ported via a WebView, both scoped to the three screens X12 already shipped

Reverses X12's (and X8's) deferral: Danny's own call, made explicitly after X12 shipped -
"image upload is an absolute requirement, firebase storage sign-in is a must," with Square
charging confirmed in scope too when asked directly. Held X12's already-verified, already-tested
PR rather than shipping it first, per Danny's own choice, and added this work onto the same
branch/PR instead of a follow-up.

**Scope stayed bounded to what X12's three screens actually needed, not "port the entire web
app."** "All functionality of the web app is required" is, read literally, a much bigger claim
than image upload + Square charge - it would also reach Settings' avatar upload
(`AccountPanel.jsx`'s plain `IBUploadFile.js`, no progress bar, a different screen mobile doesn't
have at all yet), the whole Messages/`IBChatBox` thread (Firestore-backed, never scoped into any
mobile port so far), the client-dashboard shared-images panel, and every other web page not yet
ported to mobile. Confirmed directly rather than assumed: asked whether "all functionality" reached
Square charging specifically (yes) and whether Firebase sign-in should port `auth.jsx`'s flow
as-is (yes) - not asked, and so not read as in scope, is anything belonging to a screen this port
has never touched. Avatar upload, Messages, and the rest of the web app remain tracked as future
work, the same status X12 already left every other unported screen in.

**Firebase: the plain `firebase` JS SDK, not `@react-native-firebase/*`.** Web already uses the JS
SDK (`firebase/app`, `firebase/auth`, `firebase/storage`), and Expo's own docs confirm it needs no
native linking or `metro.config.js` changes to work in RN - unlike `@react-native-firebase`, which
requires linking native iOS/Android modules and would mean this port's first native rebuild, a
different order of operation than everything verified so far (`npm install` + `tsc` + `jest`, no
EAS/Xcode/Gradle step ever exercised in this environment). `apps/mobile/src/firebase/firebase.ts`
mirrors `apps/web/src/firebase/firebase.js` minus `getAnalytics` (DOM-only, no RN equivalent, same
test-mode-skip reasoning that file already documents for itself) and `getFirestore`/`db` (nothing
in scope needs Firestore - Messages stays out, see above). Auth persistence uses
`initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`, the officially
documented RN pattern (`expo.fyi/firebase-js-auth-setup`) - plain `getAuth()` would silently fall
back to in-memory persistence and sign every user out on every cold start.
`getReactNativePersistence` needs a `// @ts-expect-error` at its import: the `firebase` wrapper
package's own published `.d.ts` for the `firebase/auth` subpath doesn't forward the `"react-native"`
package.json export condition the way `@firebase/auth` itself does, even though the *runtime* JS
correctly resolves to the RN build via Metro's bundler-condition resolution (`customConditions:
["react-native"]`, set in `expo/tsconfig.base.json`) - a long-standing upstream types-only gap
(`firebase/firebase-js-sdk` issues #7584/#7615/#9316, still open), not an app bug, and the
documented community workaround. `config.ts`'s `FIREBASE` object duplicates web's `config.js`
values rather than importing them - same "two separate deployables sharing only `@inkbooks/api`"
reasoning every other cross-cutting mobile constant already follows - with `EXPO_PUBLIC_FIREBASE_*`
overrides for the same reason `apiUrl`/Sentry's `dsn` read `EXPO_PUBLIC_*` first.

`login.graphql` now selects `firebaseToken` (X8 deliberately omitted it - "mobile doesn't sign
into Firebase"); `auth.tsx` gained back exactly what X8 subtracted from `auth.jsx`: `firebaseUser`
state, the `FIREBASE_LOGIN` action, `signInWithCustomToken`/`signOut` calls in `login()`/`logout()`,
fire-and-forget in `login()` for the identical reason push registration already is there - a slow
or failed Firebase handshake must never block the login screen, and app auth has already fully
succeeded via `setSession` regardless of whether this succeeds.

**Uploading a picked image needs one real RN-specific step web never had to think about: turning a
local file URI into a `Blob`.** Web's `File` object (from `<input type=file>`) is already a `Blob`
subclass `uploadBytesResumable` accepts directly; `expo-image-picker`'s `launchImageLibraryAsync`
instead hands back a `file://`/`content://` URI - a path, not file data.
`apps/mobile/src/firebase/uploadFile.ts` reads it with RN's documented `fetch(uri).then(r =>
r.blob())` pattern before handing the Blob to `uploadBytesResumable`, otherwise a direct, corrected
port of `IBUploadFileWithProgress.js` - **corrected** because that file's `upload.on("state_change",
...)` is a typo (Firebase's real event name is `"state_changed"`; the mistyped version silently
never fires progress callbacks) not worth reproducing. `deleteFile.ts` is a direct, uncorrected
port of `IBDeleteFile.js`.

**Image upload/gallery: two RN components (`ImagesUpload.tsx`, `ImagesGallery.tsx`) replace web's
four-file split (`IBImagesUpload`/`IBImagesUploadForm`/`IBProgressListProject`/`IBProgressItemProject`
plus `IBImagesList`/`IBImagesListOptions`).** Web's split exists to support reuse
`IBImagesList`/`IBImagesListOptions` get elsewhere (the client-dashboard shared-images panel, with
its own non-destructive delete) - mobile has no such second caller yet, so collapsing to two files
matching web's own two-component boundary (upload vs. display) is simpler with nothing lost.
`expo-image-picker`'s `launchImageLibraryAsync({ allowsMultipleSelection: true })` stands in for
web's multi-file `<input>`; each picked image uploads with its own progress, and ONE
`updateProjectDetail` call saves the merged array only once every image in the batch finishes -
same batching web's `hasSubmittedBatch` ref exists to guarantee (an async mutation is a real side
effect, so it can't fire directly from a state setter), done here with an equivalent ref.

**No swipeable multi-image lightbox - a documented v1 simplification, not a silently dropped
feature.** Web's `yet-another-react-lightbox` renders every image in a section as slides with
next/prev navigation; `ImagesGallery.tsx`'s tap-to-open uses a plain RN `Modal` showing one image
full-screen with Close/Delete. Viewing one image at a time and deleting it are the two things this
list actually needs to do; add swipe-between if it's ever actually asked for.

**Every image-array mutation (upload-batch-complete, delete) standardizes on the SAME leaner
payload shape mobile already uses for Notes/Tags: the required `ProjectInput` scalars
(`id`/`title`/`description`/`clientId`/`artistId`/`status`) plus the ONE image field that changed -
not web's `IBProgressListProject.jsx`, which redundantly echoes all three image arrays plus notes/
tags every time it saves.** Web itself is inconsistent between handlers here -
`handleProjectReferencesUpdate`/`handleProjectDesignsUpdate`/`handleProjectBodyImagesUpdate`
(`Project.jsx`, used by delete/tag-update) already send only the one changed field, while
`IBProgressListProject.jsx`'s upload-batch handler sends all three arrays regardless. Both work,
for the reason X12 already established (Mongoose's `$set`-auto-wrap leaves an omitted key
untouched) - mobile just doesn't copy the more wasteful of the two, on both code paths. A shared
`ProjectImageFields` GraphQL fragment (`projectDetail.graphql`) keeps `GetProjectDetail`'s fetch
and `UpdateProjectDetail`'s echoed-back selection in exact sync, so Apollo's normalized cache
merges every image-array mutation's response with no manual refetch - same "Apollo-normalized-
cache-driven" convention X12 already established for Session Detail.

**Square: a `WebView` hosting the same Web Payments SDK web uses, not Square's React Native "In-App
Payments SDK."** That plugin exists and isn't formally deprecated, but it requires linking native
iOS/Android modules - a full EAS/Xcode/Gradle build, the same category of infeasible-from-here
problem the Firebase native-SDK path above was ruled out for, and not something verifiable end-to-
end in an environment that has only ever run `npm install`/`tsc`/`jest` against this app.
`components/SquarePaymentForm.tsx` instead renders a self-contained HTML string (Square's sandbox
`square.js`, a card container, a Pay button, all inline - never fetched, never a bundled file) via
`source={{ html }}`; on tap it calls `card.tokenize()` inside the WebView and posts the result back
to RN with `window.ReactNativeWebView.postMessage`. This is a documented working pattern (confirmed
via Square's own developer forum), with one real caveat: a WebView engine too old to parse ES2020
(`??`) will fail to load the minified SDK - not a concern on anything Expo SDK 57 itself still
supports. **The app's own bearer token never enters the WebView** - only Square's public
`applicationId`/`locationId` (fetched from `GET square/config`, unauthenticated, same public-
identifier reasoning `squareConfig.js` already documents) do. The actual authenticated POST to
`POST square/process-payment` happens in RN after the WebView hands back a token, mirroring
`IBSquarePaymentForm.jsx`'s `handlePay` field-for-field: same idempotency-key-per-mount (a
`Math.random`-based fallback string, not `crypto.randomUUID` - RN's `crypto` global support is
inconsistent across engines/versions, and this key only needs to be unique per mounted form, not a
strict UUID), same request body, same "the server decides what the charge actually is" contract
(`amountCents` is display-only everywhere on mobile too). `apps/mobile/src/utils/restApi.ts`'s
`restApiUrl()` is a direct port of `apps/web/src/utils/apiUrl.js` - safe to reuse the existing
`apiUrl` (apollo-client.ts) as the REST base because web's own `GRAPHQL_SERVER_URL` is already the
bare host GraphQL is POSTed to at root, confirmed by reading `index.jsx`'s own httpLink setup
before assuming it.

**`chargeQuote.graphql` gained `canCharge`** (`ChargeQuote.canCharge: Boolean!`, already on the
schema, never previously selected) so Session Detail's "Charge via Square" button can say "this
shop/artist has no Square account connected" *before* the artist reaches for a card, matching
`handleChargeViaSquare`'s own check - not discovered only after a failed charge attempt.
`SessionDetailForm.tsx` gained the button (save-first-then-quote-then-render-`SquarePaymentForm`-
in-a-`Modal`, disabled until there's a subtotal, exact mirror of web's own gating) and
`BookSessionDatesForm.tsx` gained back the Cash/Card choice (`needsMethod`, no default
preselected - a wrong answer accepted in a hurry is worse than an unanswered one) and the
`pendingCardDeposit` post-booking branch, both removed by X12's cash-only scoping and now restored
field-for-field against web's `ToggleButtonGroup`/`pendingCardDeposit` logic, including
`recordDeposit`'s `pending: true` argument (`deposits.graphql` gained the `$pending` variable X12's
own comment had explicitly left out).

---

## Process

### PR1. Tests are written alongside the feature or fix, not queued for a later pass

Every real test run this project has ever done, client and server alike, has found at least one
genuine bug that a syntax check or read-through missed - two missing React imports, a
wrong-on-paper `getByRole` query, a required-field asterisk breaking an exact label match, a
shipped production bug (the password visibility toggle silently dead since the MUI v9 migration,
found only because fixing its test forced reading the real component), `cache.toReference` having
been removed from Apollo Client's own public API, a null-ref crash in `GuestConversation.jsx`, a
flaky short-delay mock. PRODUCTION_ROADMAP.md's Phase 6 section says it outright: "every real run
of either suite so far has found at least one genuine bug a syntax check alone missed - that streak
is unbroken." That is not a string of coincidences. It is what happens when a test is written once,
later, in a separate pass, against code that has already moved on to the next thing - it catches
what a same-commit test would have caught days or weeks earlier, for a fraction of the cost.

This was already the stated intent for Phase 6 ("stood up incrementally starting in Phase 1, not
bolted on at the end") but was not consistently followed - features shipped, tests followed later
in batches, and every batch found real bugs the gap had let ship. This decision makes it the actual
rule instead of an intention stated once and drifted from.

**Rule, effective now, for all new work** - web, server, and mobile once it exists: a feature or fix
ships with its test in the same commit that introduces it, not queued for a later coverage pass.

This does not retroactively demand tests for everything already shipped without them - the existing
test-coverage backlog (PRODUCTION_ROADMAP.md Phase 6, item 10: `utils/appChrome.js` and the
remaining component/server-util tail) is a separate, already-tracked cleanup, not reopened by this
rule. This is about what ships from here forward.

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
| Rewriting existing server/client JS to TypeScript now | A real migration bundled into an unrelated task ships neither well |
| A fixed schema-deprecation window decided before mobile has real usage data | Fiction before there's an actual update-adoption rate to set it from |
| Keeping tokens.css hand-written, tokens.mjs as a manual second copy | The exact drift the single-source change exists to prevent |
| Deferring tests to a later, separate coverage pass | Every real run so far has found bugs a syntax check alone missed |

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
