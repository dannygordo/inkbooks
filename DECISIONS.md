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

### X14. Settings' avatar upload is the next slice of X13's still-unported list - photo only, password and calendar color deliberately left for later

X13 named three things still unported: avatar upload, Messages, and the client-dashboard shared-
images panel. Asked which to build next (three-way clarifying question, matching X12's own
"scoped down via clarifying questions" precedent) - avatar upload chosen for being the smallest,
self-contained, and the only one needing no new upload plumbing (reuses `ImagesUpload.tsx`/
`uploadFile.ts`'s Firebase infra from X13 verbatim).

**Scoped narrower than "port `AccountPanel.jsx`," not just narrower than "the whole web app."**
That component is three real features - photo, password (`IBUpdatePassword.jsx`), calendar color
(`getTagColorsByShop` + a shop-mates-collision-avoiding picker) - bundled onto one settings page
for web's own navigation reasons (see that file's header comment), not because they're one
feature. Photo is this slice; password and calendar color are follow-up work on the same screen,
not silently dropped - `app/settings/index.tsx`'s own header comment says so, same as X12/X13's
convention of naming what a scope cut leaves out rather than letting it read as complete.

**No crop screen, unlike web's `CropEasy.jsx` (`react-easy-crop`, a canvas-based web-only
library).** `expo-image-picker`'s own `allowsEditing: true` + `aspect: [1, 1]` gives a native
square-crop UI on both platforms for free - no new dependency, no native module, matching X13's
own "avoid a native rebuild where RN already has a built-in answer" reasoning (there for Firebase/
Square, here for cropping). `ImagesUpload.tsx` never needed this (project reference/design/finished
photos aren't cropped on web either), so this is genuinely new to the port, not a corrected gap.

**Upload order deliberately reversed from web's.** `AccountPanel.jsx`'s `handleSubmit` uploads the
new avatar, deletes the old one, THEN calls `updateUser` - so an `updateUser` failure after a
successful upload+delete leaves the account with no avatar reference AND no old file to fall back
to. `app/settings/index.tsx` deletes the old avatar only after `updateUser` succeeds instead; the
worst case on any mid-flow failure is an orphaned new file in Storage nothing points at yet, never
a user left with neither. `firebase/deleteFile.ts`'s `deleteFile()` already accepts a full download
URL directly (Storage's `ref()` resolves a `gs://` path, a plain storage path, or an `https`
download URL interchangeably), so this also drops web's own URL-parsing step
(`user.avatar.split("%2Fprofile%2F")[1]?.split("?")[0]`) entirely rather than porting it.

**`updateUser.graphql` selects only `id`/`avatar`, not web's full field list
(`email`/`firstName`/`lastName`/`role`/`accessToken`/`userType`/`tagColor`/`themePreference`/
`userInfo`).** This slice only ever changes one field; widen the selection when password/calendar-
color are actually built rather than over-fetching now for hypothetical future callers. Same
"merge the one changed field into the existing `CurrentUser`, never replace it" contract
`context/auth.tsx`'s `updateCurrentUser` already establishes elsewhere - load-bearing here because
`updateUser`'s own resolver returns a placeholder `accessToken` (`'temp_' + Date.now()`), not a
real one; the mutation document's own header comment carries this warning forward for the next
caller who reaches for it.

**New `Avatar.tsx` component, not a port of `IBAvatar.jsx`.** Web's version falls back to MUI
Avatar's generic person icon with no image; this one shows the user's own initials in a filled
circle instead - more legible, and cheap enough to build new rather than reproduce the less useful
behavior. The `isOnline` presence-dot variant isn't included: nothing in this app has presence/read
receipts yet (Messages is still X13's other unbuilt item), so there's nothing to wire it to.

**No dedicated screen-level test for `app/settings/index.tsx`**, matching the precedent X12/X13's
own four screens already set (`appointment/[id].tsx`, `consult/[id].tsx`, `project/[id].tsx`,
`session/[id].tsx` have none either) - only pure logic gets its own test file
(`utils/avatar.ts` → `__tests__/avatar.test.ts`), not the Apollo-wired screen component itself.

### X15. Client Detail + the client-dashboard shared-images panel is X14's next slice - view-only, no delete/tag/assign, and no new query for the header

X13/X14 left two items on the still-unported list: Messages and the client-dashboard shared-images
panel. This is the panel half, plus the screen it has to live on - mobile has no client-detail
screen at all yet, so building the panel first meant building `app/client/[id].tsx` to hold it.

**View-only, not a port of `SharedImagesPanel.jsx`'s full feature set.** Web's version does three
things: shows every image shared via a message on this client's conversation(s), lets an
artist/shop-admin file one onto a project's References/Design/Finished-Tattoo list
(`assignSharedImageToProject`), and lets them drop a row from the list or edit its tags
(`removeSharedImageFromList`/`updateSharedImageTags`). This slice only builds the read side -
`getSharedImagesForClient` - same reasoning as X14's photo-only cut: land the smallest complete
piece, name what's left rather than let it read as done. Assign/delete/tag-edit are real future
work on this same screen, not dropped silently - `sharedImages.graphql`, `SharedImagesGallery.tsx`,
and `client/[id].tsx`'s own header comments all say so.

**`client/[id].tsx` reads the client's name from route params, not a new `getClient` query.** The
only way to reach this screen today is `project/[id].tsx`'s new "View Client" link, which already
has `project.client.firstName`/`lastName` in hand from its own existing query - passing those
through as params avoids a second round-trip for data the caller already fetched, at the cost of
this screen having nothing to show if it's ever reached another way. Worth revisiting if a second
entry point (e.g. a client list/search screen) gets built before a proper `getClient` query would
be needed anyway.

**`SharedImage` stays its own GraphQL type on the mobile side too, not reused as `IbImageInput`
or folded into `IBImage`.** Web's own `typeDefs.js` already keeps them distinct despite
`SharedImagesPanel.jsx`'s header comment noting `SharedImage`'s shape "mirrors IBImage's field
names" - it is a separate MongoDB collection indexing images shared via chat messages, not a
project's own image list, and a `SharedImage` row keeps existing (and can still be filed onto a
project later) independently of whatever a project's own References/Design/Body Images arrays
contain. `sharedImages.ts`'s `SharedImageItem` type is pulled straight from the generated
`GetSharedImagesForClientQuery`, so this distinction isn't something a caller can accidentally
blur.

**Auth gate is `canManageClientSharedImages`, stricter than `canAccessClient`, and mobile's own
error state says so.** `canAccessClient` (what every other client-facing screen in this app checks)
lets any shop member in, front-desk staff included, plus the client themselves reading their own
record. `canManageClientSharedImages` (`server/utils/shop-membership.js`) excludes plain
`SHOP_STAFF` outright (`user.role > SHOP_ADMIN` short-circuits to `false`) and never lets the
client see their own shared-images list either - this is an artist/shop-admin triage surface, the
same reasoning `SharedImagesPanel.jsx`'s own header comment gives for why it's mounted
`!isSelf`-gated on web. `client/[id].tsx`'s error message names this possibility explicitly rather
than presenting a bare GraphQL error, since a staff account hitting this screen via a future entry
point is an expected, not exceptional, outcome.

**No dedicated screen-level test for `client/[id].tsx` or `SharedImagesGallery.tsx`**, matching
X12/X13/X14's own precedent - only the pure logic (`utils/sharedImages.ts`'s `assignedLabel`) gets
`__tests__/sharedImages.test.ts`, not the Apollo-wired screen or the gallery component itself.

### X16. Messages - the last of X13's three unported items - built as one 1:1-thread inbox + thread, polled instead of socket-delivered

Closes out X13's list: avatar upload (X14) and the client-dashboard shared-images panel (X15)
were the other two. This is the bigger of the three - a real compose-and-send surface, not a
read-only view - so it cuts more from web's version than either of those did.

**Polling, not `socket.io-client`, and this is the real decision here, not an afterthought.**
Web's `IBChatBox.jsx` delivers messages live over a socket (`context/SocketProvider`) and only
falls back to a 60-second poll (`MessengerService._useUnreadMessageCount`) for pages that aren't
the messenger itself. Mobile has no socket.io-client dependency anywhere in this codebase, and
adding one - a persistent connection, a server-side room/emit model to extend to a second client
type, reconnect-on-backgrounding handling RN needs that a browser tab doesn't - is real ongoing
complexity for a feature that already has a working fallback path. Same reasoning X12/X13 already
established for Firebase and Square (native RN answers over native rebuilds) applied here in the
opposite direction: prefer the simpler transport the server already supports as a fallback, rather
than port the more complex one, until polling is actually shown to be not good enough. Mobile
polls the inbox list every 30s (matching web's own fallback interval) and an open thread every 4s
(shorter, since staring at an open conversation is exactly when latency is most noticeable) -
`createMessage`'s own `refetchQueries` pulls a just-sent message back immediately regardless, so
sending never waits out the poll window.

**No image-attachment compose flow.** `routes/messageUploads.js` (the REST upload endpoint
`IBChatBox.jsx` posts to) isn't called from mobile at all yet - `messenger.graphql`'s
`createMessage` mutation only ever sends `message`, never `imageUrls`. Receiving still works: a
message that arrives with `imageUrls` (sent from web) renders its images inline in
`MessageBubble.tsx`, just without web's own new-tab full-size view - mobile's version has no
lightbox for this yet either. Composing an image message is real follow-up work, deferred for the
same "smallest complete piece" reason every slice this session has used, not because it's hard -
`restApi.ts`'s `restApiUrl`/`getAccessToken` (already built for Square) are the right tool
whenever it's picked up.

**Scoped to one 1:1-thread list, not the whole of `Messenger.jsx`.** `getConversationsByShopId`
(shop-wide/staff group conversations) isn't called from mobile - only `getConversationsByMemberId`,
self-only server-side already (see `resolvers/conversations.js`'s own security-fix comment via
`messenger.graphql`). `IBConversation.jsx`'s per-row "Mark as unread" menu and `Messenger.jsx`'s
search-by-name box aren't built either - both are real, but neither is required to read and reply
to a conversation, which is this slice's whole job.

**Message timestamps get their own port (`utils/messageTime.ts`), not a reuse of
`utils/timeAgo.ts`.** Web's `utils/messageTime.js` has its own explicit reasoning for why plain
relative time ("3 days ago") is wrong for this app - artists schedule against a calendar, so a
message's actual time of day/weekday/date answers real scheduling questions relative time can't.
`timeAgo.ts` exists for a genuinely different case (image-upload staleness), so this is a second,
deliberately separate util rather than a shared one stretched to cover both.

**Corrects a stale claim in this same file's own X13 entry**: X13 described the Messages thread as
"Firestore-backed." It never was - `Conversation`/`Message` are Mongoose models
(`server/models/Conversation.js`/`Message.js`) behind GraphQL resolvers, delivered live via
socket.io on web, not Firestore in any capacity. X13's own scope call (no `getFirestore`/`db` on
mobile) was still the right call, just for the wrong stated reason - nothing in this app has ever
needed Firestore, this feature included.

**No dedicated screen-level test for `messages/index.tsx` or `messages/[id].tsx`**, matching every
prior slice's precedent - `utils/messageTime.ts` and `utils/conversations.ts` (the two new pure
logic modules) get `__tests__/messageTime.test.ts` and `__tests__/conversations.test.ts`; the two
new components (`ConversationRow.tsx`, `MessageBubble.tsx`) and the two Apollo-wired screens don't.
`index.test.tsx` gained one new mocked query (`GetUnreadMessageCount`, the header badge added to
that screen) so the existing suite keeps passing without a "no matching mock" warning, but that's
an update to an existing test, not a new screen-level one.

### X17. Client roster (list + search) is next on Phase 5 step 8's remaining list, and the second real entry point into X15's client-detail screen

X13's own three-item list (avatar upload/shared-images/Messages) is fully closed as of X14-X16.
Asked what to port next from the rest of step 8's ~40-screen list; picked the client roster over
a booking-requests inbox or finishing Settings' password/calendar-color, both because it's smaller
and because `client/[id].tsx` (X15) has had exactly one way to reach it since it was built - a
project's "View Client" link - and that screen's own header comment named a second entry point as
the thing worth revisiting for. This is that second entry point.

**No create-client action, no archive/"Show archived" toggle.** `Clients.jsx` bundles both onto
the same page (`IBPageActionBar`, `ArchiveControl`); neither is built on mobile at all yet in any
form (Phase 5 has no client-creation wizard, no archiving anywhere), so both stay out here rather
than being the one place they get invented as a side effect of porting a list. `getClients` is
called with a literal `includeArchived: false`, matching the toggle's own unchecked default -
archived clients are simply absent, not a state this screen has any way to reveal.

**Search only filters what's already been paged in, not the caller's whole roster - a real
limitation, not an oversight, and worth being honest about.** `getClients` takes no search
argument at all (`server/graphql/typeDefs.js`) - the only place a name/email search actually
exists server-side is `utils/search.js`, behind the separate cross-entity Global Search feature
(`SearchService`/`GlobalSearch.jsx`/`Search.jsx`), which also spans projects, messages, and shared
images and is a genuinely separate feature, not a small extension of this one. Mobile's search box
is a client-side filter over the current page only, same shape as `Messenger.jsx`'s own
name-filter (`otherMembers`-based, "filters what's rendered without touching what's loaded"),
extended here to match email too. This is a non-issue in practice for the page size chosen (see
below) but a real gap past it - `utils/clients.ts`'s own header comment carries this forward for
whoever builds real server-side search next.

**Page size is the server's own `MAX_LIMIT` (200), not `Clients.jsx`'s 50-with-a-pager default.**
Same reasoning `index.tsx`'s own appointments `PAGE` constant already uses for a week's worth of
appointments: fetch the bound most shops fit inside in one request, rather than making every shop
click "Load more" to see their whole list. `Clients.jsx`'s pager exists because a shop admin
managing many hundreds of clients is a real case on web; `onEndReached`-triggered `fetchMore` (not
a page-number pager, which has no natural mobile-list equivalent) covers that same case here
without it being the common path.

**Phone numbers get their own hand-rolled formatter (`utils/phone.ts`), not
`libphonenumber-js`.** Same "not worth a new dependency for a small piece of formatting" call
`utils/timeAgo.ts`/`utils/messageTime.ts` already made against moment/dayjs - this app's phone
data is US-only in practice (web's own `formatPhone` hardcodes a `+1` prefix before parsing it),
so a real international parsing library buys nothing a 10-digit format doesn't already cover.
Falls back to the raw stored value for anything else, matching web's own "don't crash, don't lie"
contract for missing/malformed numbers.

**No dedicated screen-level test for `clients/index.tsx`**, matching every prior slice's
precedent - the two new pure logic modules (`utils/clients.ts`'s `matchesClientSearch`,
`utils/phone.ts`'s `formatPhone`) get their own test files; the Apollo-wired screen doesn't.

### X18. Settings' Password and Calendar color built - closes out X14's two deferred pieces, in full this time

X14 shipped Settings' Photo section and explicitly deferred Password (`IBUpdatePassword.jsx`) and
Calendar color (`AccountPanel.jsx`'s tag-color picker) as their own follow-up. This is that
follow-up - both land in the same `app/settings/index.tsx`, as two more cards under Photo, same
as web's `AccountPanel.jsx` stacks all three.

**`ChangePassword`'s returned `accessToken` is real, and this is the one place that matters.**
Every other mutation this app's mobile port has called that returns a `User`-shaped payload
(`updateUser`) returns a placeholder token (`'temp_' + Date.now()`, per X14's own
`updateUser.graphql` comment) - callers merge one field and discard the rest. `changePassword`'s
resolver actually calls `generateToken(res)` and returns a real one, because the password just
changed underneath the session's existing token. `accountSettings.graphql`'s own header comment
flags this explicitly, and `handleChangePassword` in `settings/index.tsx` persists it via
`updateCurrentUser({ ...user, accessToken: ... })` rather than discarding it the way the avatar
and calendar-color call sites correctly do for their own placeholder responses. Getting this
backwards in either direction is a real bug: persisting `updateUser`'s placeholder would corrupt
the session's real token, and discarding `changePassword`'s real one would leave the app running
on a token the server has already superseded (not broken today, since nothing here invalidates
old tokens on password change, but wrong regardless, and there's no guarantee that stays true).

**No dedicated logged-out "forgot password" flow, matching web's own present-day scope.** Web's
`IBUpdatePassword.jsx` used to support an `isPublic` mode for exactly this and it was a full
account-takeover vulnerability, removed on web already (see that file's own header comment) - so
there's no unauthenticated flow to even consider porting. Changing a password on mobile always
requires an active session and the current password, same as web today.

**Calendar-color picker ported faithfully, including a check that's currently always true.**
`showsOnACalendar = user.userType !== 'client'` is real logic carried over from
`AccountPanel.jsx`, even though mobile has no client login at all yet (see X15's own note on
`ClientDashboard`'s `isSelf` mode being out of scope by construction) - so today this is always
`true` in practice. Ported anyway rather than assumed away, so the day a client account can sign
into mobile, this screen is already correct for it instead of silently showing a calendar-color
picker to someone with no calendar.

**Simpler bookkeeping than web's own `stillTaken` state for the same result.** `AccountPanel.jsx`
hand-maintains a local `tagColors` array so a just-picked color disappears from "available"
without waiting on a refetch. Mobile's `handleTagColor` instead calls `updateUser` with
`refetchQueries: ['GetUserTagColors']` - one extra network round-trip per pick, in exchange for
mobile skipping a second piece of state that has to stay in sync with a query result it's already
derived from.

**No dedicated screen-level test added for these two sections**, matching X14's own precedent for
this same screen - `utils/tagColors.ts`'s `showAvailableColorTags` gets
`__tests__/tagColors.test.ts`; the password form and the swatch picker, both Apollo-wired, don't.

### X19. Booking Requests inbox built - the funnel before an Appointment exists, split into list + detail rather than web's one master-detail page

Picked as the next slice of Phase 5 step 8's remaining list, over the rest of the ~40-screen
backlog, as the natural companion to X16's Messages (a booking request carries a real Conversation
of its own) and to X13/X17's client-facing work. Reuses `ConvertBookingRequest` (already built for
`consult/[id].tsx`'s "Convert to Session" flow) for every status transition here too, and
`messenger.graphql`'s `GetMessagesByConversationId`/`CreateMessage`/`MarkConversationRead` for the
conversation thread verbatim - a booking request's conversation is the exact same shape Messages
already renders.

**`apps/web/src/pages/booking/BookingRequest.jsx` is out of scope by construction, not by
omission.** It is the public guest-facing intake form at `/book/:artistHandle` - a prospective
client fills it out before any account of theirs exists - not an artist-side tool. Nothing in
Phase 5 step 8 is porting client-facing web pages to the artist's mobile app; the artist-side
counterpart, `ArtistBookingRequests.jsx`, is what this slice actually ports.

**List + detail, not one master-detail page.** `ArtistBookingRequests.jsx` renders the list and
the selected request's full detail (intake fields, conversation, actions) side by side in one
page - reasonable screen-width use on web, but the same "a phone doesn't have two panes" call
Messages' own inbox/thread split (X16) already made. `app/booking-requests/index.tsx` is the list;
`app/booking-requests/[id].tsx` is the detail, reached by row tap, same shape as Messages.

**`BookSessionDatesForm.tsx` generalized to work with or without a consult, matching web's own
reuse exactly.** `ArtistBookingRequests.jsx` calls the identical session-booking component for
both a fresh `pending` request and an already-`consult_booked` one, in both cases without a
consult appointment - so rather than building a second, parallel "book a session directly"
component, mobile's existing form (previously hard-wired to always require a consult, built for
`consult/[id].tsx` alone) had its `consultAppointmentId`/`initialDate` props made optional. The
deposit field is a real correctness point here, not just UI: `recordDeposit` needs a real
appointment to attach a deposit transaction to, and booking straight from a pending or
consult-booked request with no consult appointment has none. The entire deposit `FormField` and
method-toggle block is now hidden outright when there's no `consultAppointmentId` (`{
consultAppointmentId ? (...) : null }`), and the deposit-recording branch itself is guarded on
`depositCents > 0 && consultAppointmentId` together, not `depositCents > 0` alone - the two
previously-separate `if` blocks were combined under that one guard specifically so a mis-wired
future caller can't type a deposit amount that either silently vanishes or gets submitted with
`appointmentId: undefined`. This is the same guard web's own code uses, ported exactly, not a new
rule invented for mobile.

**`markConversationRead` refetches `GetUnreadMessageCount` only, never
`GetPendingBookingRequestCount`.** The pending-request badge counts requests still owed a
decision, not unread messages - reading a reply doesn't answer a request, only
`convertBookingRequest` does, and that mutation is what refetches the pending-count badge instead.
This is a previously-buggy-then-fixed distinction on web (the two counts used to be conflated) and
is being ported as the already-correct behavior, not rediscovered here.

**No "Forward to..." reassignment.** `ArtistBookingRequests.jsx` lets a shop admin hand a request
to a different artist at the same shop. Real, secondary feature - needs a shop-mates picker mobile
has no equivalent of yet - deliberately left for later rather than built as a rushed side effect
of this slice.

**No dedicated screen-level test for either new screen**, matching every prior slice's precedent -
`utils/bookingRequests.ts`'s `bookingRequestStatusLabel` and `BOOKING_REQUEST_FILTERS` get
`__tests__/bookingRequests.test.ts`; the two Apollo-wired screens don't. `BookSessionDatesForm.tsx`
itself still has no dedicated test either, consistent with it never having had one before this
slice - only `tsc --noEmit` covers its changes directly, same as `consult/[id].tsx`, its one other
caller.

### X20. Projects list built - a browsable entry point for project/[id].tsx, which has never had one until now

`project/[id].tsx` shipped in step 8's original PR, reachable only by tapping through an
appointment or converting a booking request - there was never a way to just browse every project.
This is the smallest remaining item with real, immediate value: a plain list, no filter, no
search, matching web's own `Projects.jsx` scope exactly (that page has neither either - global
search is a separate feature, same reasoning X17 already gave for `getClients`).

**New `GetProjectsList` query, not a reuse of web's own `GetProjects`.** Same operation
(`getProjects(page)`), but web's version selects every reference/body/design image array, every
note, `materialsUsed`, and `tags` - fields a row summary never renders. Same "leaner sibling" call
`projectDetail.graphql` already made against web's `getProject`/`updateProject` (step 8's own
PRODUCTION_ROADMAP.md paragraph). Named `GetProjectsList` specifically so it coexists with web's
`GetProjects` in the same generated `packages/api` output without colliding.

**Found, not ported: web's own status column has been silently blank since it was written.**
`Projects.jsx` (and `Search.jsx`, the only other caller) renders status via
`UtilsService.prettyConstantsListValue(APP_SETTINGS_CONSTANTS.PROJECT_STATUS, project.status)`.
That helper compares `item.VALUE`/`item.LABEL` (uppercase) against its inputs, but every entry in
`PROJECT_STATUS` - and everywhere else in `constants/app.js` - uses lowercase `value`/`label`. The
comparison can never match, so the status cell has rendered as an empty string for every project,
on both pages, unconditionally, presumably since this helper was written. `utils/projectStatus.ts`
does a plain lowercase-keyed lookup instead - correct, not a port of the bug. **This is a real web
bug, left unfixed on web deliberately** - out of scope for a mobile-port slice, not something to
patch as a drive-by on a file this work never otherwise touches. Flagged here by name so it isn't
lost, same as every other out-of-scope finding this session has named rather than silently working
around.

**No "Add Project" button, matching web's own `IBPageActionBar` exactly - not a scope cut.** A
project is always spawned by the booking workflow (`convertBookingRequest`, building it from a
booking request's own intake fields) on both platforms; `IBPageActionBar`'s own comment notes the
button that used to link to a create-project route was already dead before this port started.
Nothing here removes a real web capability.

**No dedicated screen-level test for `projects/index.tsx`**, matching every prior slice's
precedent - `utils/projectStatus.ts`'s `projectStatusLabel` gets `__tests__/projectStatus.test.ts`;
the Apollo-wired screen doesn't.

### X21. Shop Cut Confirmations built - the first mobile screen with a role-gated entry point

The shop-side half of the manual mark-paid/confirm dual-control flow (see
PRODUCTION_ROADMAP.md's "Shop-cut ledger" section) - an artist marking their shop cut paid doesn't
close the ledger item on its own, a shop admin has to independently confirm it. Picked next
because it's small, self-contained, and - unlike the artist-side `markShopCutPaidManually` action
it depends on - genuinely useful on mobile even before that other half is ported: an artist can
mark a cut paid from web today, and a shop admin can now confirm it from mobile without opening a
laptop.

**`isShopAdminOrBetter` added to `utils/permissions.ts` - the first role floor mobile has put on a
header link, not just on what a screen lets you do once you're there.** Every prior entry point
(Clients, Projects, Requests, Messages) is shown to any logged-in artist, because mobile has no
client login yet (X15's own note) and none of those screens needed a floor above "logged in."
`ShopCutConfirmations` is different: `getPendingShopCutConfirmations` itself is gated
`SHOP_ADMIN`-or-better server-side (`server/graphql/resolvers/appointments.js`), and web's own
`Sidebar.jsx` hides the nav item entirely behind the identical `user.role <= ROLES.SHOP_ADMIN`
check rather than showing it and letting the page's own "not available" message do the work. Mobile
ports the same call: the header link only renders for a shop admin (or plain platform Admin), and
the screen itself still carries web's own "This screen is only available to shop accounts"
fallback underneath, for a shop-admin-role user who somehow has no shop (`getUserShopId` returns
`undefined`, e.g. a platform Admin with no Artist/Staff `userInfo` at all).

**`utils/tagColor.ts` (singular) added, ported from web's own `utils/tagColor.js` - distinct from
the existing `utils/tagColors.ts` (plural).** The plural file is the Settings swatch picker
(`TAG_COLORS` + `showAvailableColorTags`); this one is about correctly *displaying* an
already-assigned color on a row - `resolveTagColor`'s guard against a literal white value carries
forward web's own reasoning verbatim (white text on a white tag color doesn't look broken, it
looks *absent* - an artist once reported a resulting invisible calendar label as "appointments
missing," not a color bug). `tagColorRowStyle` drops web's `hovered` parameter/second alpha tier
entirely - mobile has no mouse hover to tint for.

**Leaner query than web's own `AppointmentService.js` selection.** Drops `durationMinutes`/
`appointmentEnd`, which web fetches but `ShopCutConfirmations.jsx` never actually renders.

**`markShopCutPaidManually`, `createShopCutInvoice`, and `createBatchShopCutInvoice` are
deliberately not built here.** All three are the artist-side half of this same ledger (marking a
cut paid, or invoicing it via Square) - real, separate follow-up work, not a natural extension of
a shop admin's confirmation inbox. Nothing on mobile writes `shopCutStatus` to anything but
`'unpaid'` at appointment-creation time yet (`appointment/[id].tsx`, `booking-requests/[id].tsx`,
`BookSessionDatesForm.tsx`, `ProjectSessionsList.tsx`) - this slice only adds the ability to
*confirm* a cut some other flow (today, always web) already marked paid.

**No pagination, matching web's own `ShopCutConfirmations.jsx` exactly, not a scope cut.** This
list is inherently small - a shop's currently-pending confirmations, not a growing history - so
there is no "Load more" to build on either platform.

**No dedicated screen-level test for the screen itself**, matching every prior slice's precedent -
`utils/tagColor.ts`'s `resolveTagColor`/`tagColorRowStyle` and `utils/permissions.ts`'s new
`isShopAdminOrBetter` each get test coverage; the Apollo-wired screen doesn't.


### X22. Artists directory built - a shop's own team roster, minus the Phase-7 dashboard panels web bundles onto it

Picked as the next slice after a user request to work through the rest of the remaining feature
list (Artists/Staff directories, Shops, Search, Income/Expenses, Forms) in sequence. Artists first
because it's the most directly parallel to already-built Clients/Projects (same list+detail
shape), and because `Artist.jsx`'s own real complexity - archiving, an autosave identity form - is
now well-established mobile territory, unlike its two embedded dashboard panels (next paragraph).

**Deliberately NOT ported: `ArtistPerformancePanel` and `ShopCutRatePanel`, the two panels web
mounts below the identity card.** Both are pieces of a large, still-actively-evolving analytics
dashboard - PRODUCTION_ROADMAP.md's own Phase 7 section runs to seven numbered follow-up fixes
covering these two panels alone (caching gaps, timezone bugs, capped result counts, and more,
still ongoing as of this document). Bundling either into a directory-listing port would mean
re-deriving a moving target from scratch rather than porting a settled feature - a separate slice,
when it happens, should port Phase 7 as its own thing with its own scope discussion, not inherit
whatever shape it happened to be in the day Artists shipped.

**Archive/unarchive is real here, not a scope cut like Clients'/Projects' missing archive
support.** `archiveArtist`/`unarchiveArtist` are two simple, already-existing mutations
(`assertCanManageArtist`-gated) - nothing like the "no archiving exists on mobile in any form"
reasoning X17 gave for `getClients`. Built a reusable `components/ArchiveControl.tsx`, a direct
port of web's own `ArchiveControl.jsx` (same confirmation prose, stating what archiving does AND
doesn't, for the same reason web's own comment gives: "remove this person" reads as "lose their
history," and someone who thinks a year of revenue records is at risk won't press the button) -
except confirmation is RN's native `Alert.alert` rather than a ported custom backdrop-dialog,
since a native alert is the idiomatic RN equivalent and needs no bespoke styling. Deliberately
generic (kind/name/mutation callbacks as props, not the mutations themselves) so Staff and Client
detail screens can reuse it without duplicating the confirmation copy.

**"Add Artist" is not built, and this IS a scope cut - unlike Clients/Projects, web has a real
create flow here.** `CreateArtistWizard` (`IBPageActionBar`'s `artists` case) creates a real
account: email, password, role - effectively a small register flow, not a form with a few fields.
Separate, real scope from a directory port, same category of cut as every other account-creation
wizard this session has deferred.

**`isStaffOrBetter` added to `utils/permissions.ts`, alongside X21's `isShopAdminOrBetter`.**
Direct port of web's Sidebar.jsx gate on this exact nav item - looser than `isShopAdminOrBetter`
(SHOP_STAFF=15, not SHOP_ADMIN=10), matching `getArtists`/`getArtist`'s own server-side minRole.
Worth noting the security history here: `getArtist`'s own resolver comment records that this used
to allow ANY artist to open ANY shop-mate's page - found and fixed specifically because that page
mounted `ArtistPerformancePanel`, a shop-mate's revenue/shop-cut view. Mobile inherits the
already-fixed rule (self, or Staff-and-above sharing a shop) directly from the server; the
`isStaffOrBetter` header-link gate is presentation only, same "the mutation is the real gate"
caveat X13/X21 already established for other client-side role checks.

**Identity-form autosave is a direct structural port of `project/[id].tsx`'s `ProjectDetailsCard`
pattern** (per-field `useRef`, a `lastSavedRef` dirty-check, `onBlur`-triggered `save()`) - not a
new pattern invented for this screen. `shopId` is never sent in the update payload, matching web's
own `buildIdentityPayload` exactly: `updateArtist` rejects a `shopId` that doesn't match the
artist's current shop outright (connecting/moving shops is `connectArtistToShop`, which asks
first), so sending it at all is pure risk for a field this form was never going to change.

**No dedicated screen-level test for either new screen**, matching every prior slice's precedent -
`utils/permissions.ts`'s new `isStaffOrBetter` gets test coverage; the two Apollo-wired screens
don't.

### X23. Staff directory built - same shape as Artists, simpler in every respect

Second of the requested batch. Structurally identical to X22's Artists directory (list with a
real "Show archived" toggle, detail with an autosave identity form and Archive/Restore reusing
`components/ArchiveControl.tsx`), but genuinely simpler on both counts web itself already
establishes, not a mobile-side scope cut:

**No self-service edit path at all.** `updateStaff` has a hard `SHOP_ADMIN` floor server-side
(`assertCanAccessShop`, no self-branch), unlike `updateArtist`'s self-or-shop-admin rule - matching
web's own `canEditIdentity = user.role <= ROLES.SHOP_ADMIN` exactly, with no `isSelf` check to
port because there is no self-edit case to check for.

**No embedded dashboard panels to defer.** `StaffProfile.jsx` never mounted an
`ArtistPerformancePanel`/`ShopCutRatePanel`-equivalent - Staff isn't the person a shop-cut ledger
or performance dashboard is ever computed for, so there's nothing here comparable to X22's
deliberate Phase-7 deferral.

**`StaffInput` requires `shopId`/`userId`/`status` as non-null and they're echoed back unchanged**,
same "not user-editable on this screen, but the input type demands them" situation `ArtistInput`
doesn't have (that one made all three nullable). Ported straight from web's own
`buildIdentityPayload` comment.

**Route note:** list and detail share one directory (`app/staff/index.tsx` +
`app/staff/[id].tsx`), same pattern `booking-requests/` already uses - unlike Clients/Artists,
where "staff"/"staff" has no natural singular/plural split to hang two directory names off of
(web's own `ROUTE_CONSTANTS.STAFF_PROFILE` was dead code for exactly this reason - see
`Staff.jsx`'s own comment on the route that was never registered).

**No "Add Staff" action**, same reasoning as X22's missing "Add Artist" - `CreateStaffWizard`
creates a real account, separate scope from a directory port.

**No dedicated screen-level test for either new screen**, matching every prior slice's precedent -
no new pure-logic module was added this slice (unlike X22's `isStaffOrBetter`, already built and
reused here unchanged).

### X24. Shops directory built - no archiving, no self-edit, and an honest gap on Square's OAuth return

Third of the requested batch. `getShops` takes no arguments at all (no `page`/`includeArchived`) -
there is no shop archiving anywhere in this app (no `archiveShop`/`unarchiveShop` mutations exist
server-side), so unlike X22/X23 this slice has no `ArchiveControl`, no toggle, and the list screen
is simpler than either directory that came before it.

**`canEdit` is the same hard `SHOP_ADMIN` floor as Staff's, not Artists'.** `updateShop` is
`withAuth(fn, SHOP_ADMIN)` server-side with no self-branch, matching web's own
`Shop.jsx`: `canEdit = user.role <= ROLES.SHOP_ADMIN`. There is no "shop editing itself" case the
way an artist can edit their own profile - a shop isn't a login.

**`hourlyRate`/`shopMinimum` are rendered as plain dollar numbers, not run through
`utils/money.ts`'s `formatCents`.** These two fields are a deliberate exception to this app's
almost-universal integer-cents convention - `Shop.hourlyRate`/`Shop.shopMinimum` are stored and
displayed as whole dollars everywhere on web (`Shops.jsx`'s own `SHOP_COLUMNS`), and this port
follows that exactly rather than applying the cents convention uniformly and silently misrendering
`$150/hr` as `$1.50`.

**`ShopInput` requires six fields this page never edits** (`shopMinimum`, `hourlyRate`, `logo`,
`billingType`, `status`, `shopCutPercent`) **- all six are echoed back from the fetched `Shop`
unchanged on every save**, matching web's own `buildShopPayload` exactly.

**`shopCutPercent` is a read-only readout with a note, not a working "Change in Settings" link.**
Web's own `Shop.jsx` consolidates this into a read-only display plus a link to Settings (that
page's own comment explains this fixed a real two-editors-one-field bug). Mobile's
`settings/index.tsx` only ports `AccountPanel` (photo/password/calendar color) so far and has no
shop-cut-percent editor to link to - named here as a genuine gap, not silently glossed over with a
link that would 404.

**Square "Connect" opens Square's hosted consent page externally via `Linking.openURL`, with no
automatic return to the app.** `expo-web-browser` isn't an installed mobile dependency, and
building a real deep-link-based return would require changing the OAuth callback's redirect target
server-side (`routes/squareOAuth.js` currently redirects to a web route,
`/shop/:shopId?square=...`) - out of scope for a mobile-only port. The screen says so plainly: the
user finishes in their browser, then has to come back and reopen the screen themselves to see the
updated connection status. `disconnectShopSquare` has none of this complexity - it's a plain
mutation with no redirect involved, ported with no caveats.

**No redirect-status banner.** Web reads a `?square=connected|denied|error` query param on return
from the OAuth redirect and shows a dismissible banner. Mobile has no way to receive that param at
all without the deep link named above, so there is nothing to build here yet - not a cut, just a
consequence of the same gap.

**No "Add Shop" button**, matching web exactly - `Shops.jsx`'s own `IBPageActionBar` has no create
action for this page; shop creation was dead code there already.

**No dedicated screen-level test for either new screen**, matching every prior slice's precedent -
no new pure-logic module was needed this slice (no new permission helper, no new formatting util).

### X25. Global Search built - one screen, grouped by type, no new authorization at all

Fourth of the requested batch. Ports web's dedicated `/search` results page
(`apps/web/src/pages/search/Search.jsx`), not the app bar's live dropdown
(`components/search/GlobalSearch.jsx`) - a full-screen results list is the better fit for mobile,
and the dropdown's "quick jump while typing elsewhere" use case doesn't map onto a phone where
search is already its own destination, not an overlay on top of another screen.

**No new authorization anywhere.** `search` (`server/utils/search.js`) applies zero role floor and
scopes Clients/Projects with the exact same filters `getClients`/`getProjects` already use -
there's nothing to gate here that isn't already gated at the record level, so the header link
shows unconditionally, same as Clients/Projects.

**Named `GlobalSearch`, not `Search`, in `globalSearch.graphql`** - web's `SearchService.js`
defines its own hand-written `Search` gql document locally rather than importing a generated one
from `@inkbooks/api` (unlike `ProjectService.js`, which does), so there's no live collision today,
but this avoids creating one if that page is ever migrated onto the shared package later.

**No `?q=` URL param.** Web's own comment explains that param exists so a link to search results
is shareable/bookmarkable/back-button-able from a browser address bar. Expo-router has no address
bar for that to matter to, so the debounced `TextInput` is simply the only input of record here -
porting a URL-sync mechanism with nothing to sync it FROM would be complexity with no payoff.

**Messages results link straight into the existing conversation screen** (`messages/[id].tsx`,
keyed on `conversationId`) rather than a separate messenger deep-link scheme web needs
(`/messenger?conversation=...`) - mobile's Messages feature already has exactly the screen this
result should open.

**Image results link to the client's own detail screen**, same as web (a SharedImage match isn't
its own destination - it surfaces the client it's filed under, same as the dropdown's own
click-through). `client/[id].tsx`'s current scope (shared-images panel only, per its own header
comment) means this lands somewhere that can actually show the match, not a dead end.

**Constants match web exactly**: `RESULTS_LIMIT = 25`, `DEBOUNCE_MS = 300`,
`MIN_QUERY_LENGTH = 2`, and the same "showing the top N matches" hint when a group comes back
exactly at the cap.

**No dedicated screen-level test**, matching every prior slice's precedent - no new pure-logic
module was needed (row-building is inline JSX, not an extractable pure function the way
`projectStatus.ts` was for the Projects slice, and it already has direct coverage there).

### X26. Income built - the first slice with its own role-gate helper AND its own scoping convention

Fifth of the requested batch. Ports web's `pages/income/Income.jsx` - non-tattoo income only;
tattoo revenue is derived automatically from completed appointments and shows on the (unbuilt on
mobile) dashboard, never logged here.

**New `canManageBusinessLedger` in `utils/permissions.ts`**, a direct port of web's own route gate
on `/income` and `/expenses`: `RoleRoute minRole={ROLES.SHOP_ADMIN} allowIf={(user) => user.userType
=== "artist"}`. `RoleRoute` checks `allowIf` first and skips the role floor entirely when it's true
(see that component's own comment), so the combined rule is "any artist at all, OR a
shop-admin-or-better who isn't" - narrower gates like `isStaffOrBetter` don't express this (an
artist who is NOT staff-or-better, i.e. plain `ROLES.ARTIST`, still needs their own ledger). This is
what lets a plain shop-connected artist reach their own personal ledger even though they're well
under `SHOP_ADMIN` - web's own comment on that route explains this was a deliberate widening: the
server always supported a shop-connected artist's own `artistUserId` scope, the route just didn't
let anyone reach it before.

**New `utils/businessScope.ts`**, a direct port of web's `utils/businessScope.js`
(`businessScopeFor`/`createScopeFor`) - `{ shopId }` for a shop admin managing their shop's books,
`{ artistUserId }` for everyone else `canManageBusinessLedger` admits. `createScopeFor` is the
narrower create-safe version web's own comment explains is necessary: `RecordIncomeInput` has no
`artistUserId` field at all (the server infers it from the caller when `shopId` is omitted), so
spreading the full scope into a create mutation would send a field the schema doesn't define.

**New `utils/businessRanges.ts`**, a trimmed native-Date port of web's `utils/dateRanges.js`
`buildPresetRanges`/`getDefaultRange` (the backward-looking analytics presets - This month/Last
month/This quarter/Year to date/Last 12 months - NOT that file's separate forward-looking
scheduling ranges, which `dateRanges.ts` already covers for appointments). No custom range picker
(two free-form date pickers to define an arbitrary window) - a named scope cut, not an oversight;
the five presets are the whole of this port.

**New `components/DateField.tsx`**, `DateTimeField.tsx`'s date-only sibling - a single
`mode="date"` step with no chained time dialog, since an income entry's date is a pure calendar
date (matching web's own `<input type="date">`, per `Income.jsx`'s "utc-ok: pure calendar date"
comment), not a timestamped instant. Reusing `DateTimeField` directly would force a meaningless
"pick a time too" step onto a field with no time component. Built as its own component (not
inlined into `income/index.tsx`) because the next slice, Expenses, needs the identical thing.

**Category picker is a pill row, not a native `<select>`-style dropdown** - matches
`DurationPicker.tsx`'s own precedent exactly: there is no cross-platform select primitive in this
app, and a short, closed list of income categories doesn't need one. Category management itself
(`createIncomeType`/`updateIncomeType`) stays Settings-only, out of scope here, matching web's own
page/Settings split - this screen only *reads* types for its picker.

**No in-screen role guard beyond the header link's own gate** - matching every other role-gated
mobile screen's precedent (Shops/Artists/Staff/Shop Cut Confirmations all rely on the header link
alone plus the server's real enforcement, not a redirect-style guard mobile has no equivalent of
`RoleRoute` to build anyway).

### X27. Expenses built - same shape as Income, minus the recurring-expense CRUD subsystem

Sixth of the requested batch. Structurally identical to X26's Income (same
`canManageBusinessLedger` gate, same `businessScopeFor`/`createScopeFor` scoping, same five
`businessRanges.ts` presets, same `DateField`/pill-row pickers, same inline edit/delete list),
reused unchanged rather than reimplemented.

**Recurring Expenses is NOT ported.** `RecurringExpensesPanel.jsx` (Settings > Expenses) is a full
separate CRUD subsystem - create/edit/deactivate a TEMPLATE (amount, category, frequency, start/
end date) that a server-side scheduler turns into real `Expense` rows as they come due. That is
real, separate scope on the order of a small feature of its own, not a corner of this ledger page -
named here as a deliberate cut, not an oversight, the same way Income named category management as
Settings-only.

**Only the read-only "Recurring" chip survives**, matching web's own `Expenses.jsx` exactly: a row
with `recurringExpenseId` set renders a small "Recurring" badge next to its amount. Editing or
deleting that row only ever affects the one occurrence, never its template - there is nothing to
special-case beyond the chip itself, on web or here, which is exactly why porting just the chip
(and not the template CRUD behind it) is a coherent, honest slice rather than a half-built feature.

**No dedicated screen-level test**, matching every prior slice's precedent - no new pure-logic
module was needed this slice (every helper `income/index.tsx` needed already exists and is reused
verbatim).

### X28. Forms built - list + Responses only; FormBuilder, the booking-fields editor, and analytics are all named, deliberate cuts

Last of the requested batch (Artists/Staff, Shops, Search, Income/Expenses, Forms) and the largest
by a wide margin on web - four pages (`Forms`, `FormBuilder`, `FormResponses`,
`BookingRequestFieldsEditor`) plus a public fill-out flow. This slice covers the two that don't
require building a field editor: the management list and the response viewer.

**New `canManageForms` in `utils/businessScope.ts`** (co-located with `businessScopeFor`/
`createScopeFor`, which it's built from) - a direct port of web's `/forms` route gate:
`RoleRoute minRole={ROLES.SHOP_ADMIN} allowIf={(user) => !hasShop(user)}`. Narrower than
`canManageBusinessLedger` (Income/Expenses' gate, which admits any artist at all): a plain
shop-connected artist who isn't a shop admin sees none of this, the same way they see none of Shop
Cut Confirmations. Also added a `businessScope.test.ts` this slice that retroactively covers
`businessScopeFor`/`createScopeFor` from X26, which shipped without their own dedicated test -
PR1's "test alongside the feature" rule applies going forward, and this closes that one gap while
the file was already open for `canManageForms`.

**FormBuilder (creating a form, or editing an existing one's fields) is NOT ported - the single
biggest cut in this entire mobile port so far.** Web's `FormBuilder.jsx` reorders fields via
`@dnd-kit/core`/`@dnd-kit/sortable` drag-and-drop, which has no cross-platform equivalent in this
app (`DurationPicker.tsx`'s own header comment already established there is no select primitive
either, and reordering is a strictly harder interaction problem than picking one option). Building
fields from scratch - add/remove/retype/reorder/required-toggle/options-editing, per field type -
is real, separate, feature-sized scope on its own, not a corner of a "management list" port. This
is named here explicitly rather than shipped as a half-built editor: **there is currently no way
to create or edit a form's fields from mobile at all.** A form's title is plain text in the list,
not a link into an editor that doesn't exist.

**Duplicate IS still ported**, despite the FormBuilder gap - it's a plain `createForm` call with
the source form's own fields copied client-side (dropping each field's `key` so the copy gets
fresh ones, matching web's own `handleDuplicate` exactly), no editor involved at all. Publish/
Archive/the guest-link toggle/Delete are every bit as portable, for the same reason - none of the
four touch a form's fields.

**`BookingRequestFieldsEditor` (task #162, the `booking_request` system form's own restricted
reorder/relabel/required/hidden editor) is also NOT ported.** It's a smaller, more constrained
surface than the generic `FormBuilder` (no add/remove/retype, per that editor's own header
comment), but it is still a dedicated editing UI this slice deliberately stops short of. The
`booking_request` row in the list gets no interactive actions at all, matching its narrower action
set on web exactly (no Responses/guest-link/Duplicate either - see `Forms.jsx`'s own `isBookingRequest`
branch).

**`getFormAnalytics` (the per-field answered-count/option-percentage breakdown on `FormResponses.jsx`)
is NOT ported.** It's a real, separate secondary feature layered on top of the response list -
aggregate stats, not "read what one person submitted," which is this screen's actual job. Only the
response list itself (expandable per-response answers) is built.

**New `utils/formAnswers.ts`'s `formatFormAnswer`** - direct port of web's own `formatAnswer`,
carrying the same UTC-vs-local nuance web's comment calls out: `dateValue` is a pure calendar date
read in UTC (a naive local-timezone read rolls it back a day west of UTC), while a signature's
`signedAt` is a real instant read in local time. `file_upload` returns a plain count from the pure
function - the component renders the actual openable rows from the answer's own `fileUrls`
directly via `Linking.openURL`, since a text-formatting function can't itself open a URL.

**No "Copy link" button** - no clipboard library is installed on mobile (same
`expo-web-browser`-shaped gap as the Shops slice's Square flow: avoid a new dependency for one
action). Turning a form's guest link on shows it in a read-only, `selectTextOnFocus` text field
the user can select and copy with the OS's own native text selection - no library needed. The
field shows only the relative path (`form/<token>`), not a full URL: mobile has no reliable source
for the web app's own public origin the way a browser's `window.location.origin` is on web -
turning the link on and reading the full shareable URL from Settings on web remains the real path
for actually sharing it.

**New `utils/formConstants.ts`** (`FORM_STATUS_LABELS`/`formStatusLabel`,
`FORM_FIELD_TYPE_LABELS`/`formFieldTypeLabel`) - same "build the map directly, don't port
`prettyConstantsListValue`" reasoning as `utils/projectStatus.ts` (X20).

### X49. Client detail depth - Stats, Projects, Appointments, Notes, and Flags

Third slice off the mobile/web parity accounting (HANDOFF.md, 2026-09-04), picked as the
next-most-blocking item once Danny's own priority (X47/X48) closed - gap #3, "the client detail
page is a shell of web's." X15 scoped `client/[id].tsx` to exactly the shared-images gallery and
named Stats/Projects/Appointments/Notes/Flags explicitly as future work in its own header comment;
this closes all five in one pass, plus gap #6 (client flags), since both live in the same web
component (`ClientDashboard.jsx`) and the same server query.

**Two sections deliberately NOT ported: `SendAutoResponseButton` and the "Forms" section**
(filling out a published form on the client's behalf via `FormFillOut`). Both are real, separate
features layered on top of `ClientDashboard.jsx` rather than part of "what does this client's
record contain" - this pass is the record itself. Left for a future slice, not overlooked.

**Pagination: "Load more" grows the page LIMIT and refetches from offset 0, not a ported
`EntityListPager`** (web's dual offset+page-size-selector pager) and not a `fetchMore` that merges
two array pages together. A client's own project/appointment history is nowhere near the shop-wide
directories' scale, so re-fetching everything already seen plus one more page costs nothing worth
a more complex pagination model. Notes and Flags aren't paginated at all, matching the server
exactly: Notes are embedded sub-documents `Client` returns in full, and `getClient.flags` takes no
page argument server-side.

**Notes/Flags cache mechanics are a direct port of `ClientDashboard.jsx`'s own
`handleAddNote`/`handleRaiseFlag`/`handleResolveFlag`**, including the `cache.modify` +
`cache.identify` + `makeReference` approach web's own comment describes fixing a real bug for
(`cache.toReference` isn't in Apollo's public API past whatever version that comment refers to;
every flag-raise silently failed until this exact pattern replaced it). Ported the fix, not the
original bug. `updateClientNotes` needs no manual cache surgery at all - it returns the whole
updated notes array plus the Client's id, and Apollo's normalized write updates the cached field
automatically, same as web's own `refetchQueries: []` comment implies.

**`appointmentDate` is read in LOCAL time, not web's `moment.utc(appointment.appointmentDate)`.**
That web call reads like the same class of bug `utils/utcDate.ts`'s own header comment warns
against, just in the opposite direction: `appointmentDate` is a genuine instant (with a time
component), and mobile's own `formatAppointmentTime` (`utils/appointments.ts`) already reads this
exact field in local time everywhere else on this app - a UTC read here would show a different
wall-clock hour than every other appointment list on the phone. Followed mobile's own established,
correct convention instead of reproducing web's read verbatim. Not fixed on web - out of scope,
same as the Projects/Search status-column bug already logged in this file's own "Open" section.

**Flag-type picker is `PillRow`, not a ported `<select>`** - same no-cross-platform-`<select>`
precedent every other web `<select>` port on this app has followed. `manualFlagTypes` excludes
`systemGenerated` types client-side exactly like web does (a hand-raised `NO_SHOWED` is refused by
`raiseClientFlag` regardless - the filter is a UI courtesy, not the boundary).

**New `packages/api/src/operations/clientDashboard.graphql`**: `GetClientDashboard` (mirrors
`ClientService.js`'s `_FETCH_CLIENT_DASHBOARD` field-for-field), `UpdateClientNotes`,
`GetClientFlagTypes` (no `shopId` argument - same call `ClientDashboard.jsx` itself makes, since
neither app currently knows the viewer's own shop at this call site), `RaiseClientFlag`,
`ResolveClientFlag`.

Verification: `packages/api` codegen + build clean (five new generated hooks), `apps/mobile`
`tsc --noEmit` clean (two `cache.modify` field functions needed an explicit `readonly Reference[]`
parameter type - Apollo's own `Modifier<T>` type is contravariant on an array field's existing
value, which TypeScript only accepted once the array type matched exactly, including the
`readonly`), full Jest suite still 247/247 (Apollo-wired screen, no new pure-logic module).

### X48. New Appointment - the calendar's tap-and-book wizard

Second and final slice off the mobile/web parity accounting (HANDOFF.md, 2026-09-04) for Danny's
picked priority "Create new appointment/client/project" - X47 closed the client/artist/staff half;
this closes gap #1, "no way to create a brand-new appointment or consult from mobile." Direct,
faithful port of apps/web's `AppointmentWizard.jsx` as one new `appointment/new.tsx` route, reached
from a new "New" link on `app/index.tsx`'s header (no role gate, matching web's own
`CreateEventButton.jsx` having none).

**ONE COMPONENT WITH AN INTERNAL STEP MACHINE, NOT SEVERAL ROUTES - unlike X47.** X47's three
screens were each a flat form because web's own `EntityWizard` steps are a pacing device, not an
enforced sequence. `AppointmentWizard.jsx` is the opposite: a real seven-state decision tree
(`type` / `personal-form` / `client-email` / `intake-details` / `datetime` / `session-project` /
`session-existing-datetime`) with conditional branching and Back navigation that depends on how you
got there (`client-email`'s Back goes to `session-project` for a session, `type` for a consult).
Splitting that across expo-router routes would mean re-deriving "where does Back go" from route
params instead of local state that already has the answer. So this is a byte-for-byte port of web's
own `step`/`type`/`calendarChoice` state shape and step names, not a redesign.

**Three pipelines, matching web's own three exactly** (see `AppointmentWizard.jsx`'s own header
comment, ported into `appointment/new.tsx`'s for the full reasoning): Personal calls
`createAppointment` directly with `isPersonal: true` and no shopId/projectId, skipping the
client-intake pipeline entirely - a private entry isn't a booking, and forcing it through machinery
built for one would create records that don't belong to any real work. Consult and a
brand-new-project Session share one pipeline (`createBookingRequest` then `convertBookingRequest`
in the same submit, tagged `source: 'artist_created'` so the Booking Requests inbox excludes it -
it was never a real inbound submission). Session-on-an-existing-project skips the client step
entirely (the project already has one) and goes straight to a direct `createAppointment`.

**Email-lookup client step, not a picker** - same replacement web itself already made and explains
in its own header comment: a real user found the old dropdown confusing, and a missing-selection
bug went undetected until the final Save step. Typing an email debounces into a server
`findClientByEmail` lookup (new `clients.graphql` query - NOT a scan of the already-paged client
list mobile's own `clients/index.tsx` fetches, for the same "a miss here silently overwrites a real
name" reasoning `ClientService.js`'s own comment gives); a match shows the client read-only, a miss
reveals name/phone fields for `findOrCreateGuestClient` to create.

**No global success/error alert, unlike web.** Web raises a global `setAlert` specifically because
a small in-dialog error line was once genuinely missable (the real bug its header comment
describes). Mobile has no toast/snackbar system anywhere in this app - every other create/save flow
here (`client/new.tsx`'s error banner, `appointment/[id].tsx`'s own `handleSave`) already relies on
an inline error plus an immediate `router.back()` on success, so this follows that instead of
inventing a new one. `router.back()` relies on `refetchQueries: ['GetAppointmentsByShop',
'GetAppointmentsByArtist']` (the same plain-name-list `BookSessionDatesForm.tsx` and
`appointment/[id].tsx` already each carry) to make the calendar screen's own already-mounted query
show the new appointment without any focus-refetch hook - same `@react-navigation/native` isn't a
resolvable import here reasoning as X47's own `refetchQueries` comment.

**Project picker is `PillRow`, not a ported `IBProjectsByArtistSelect`** (an MUI `Select` with an
avatar + title + description row per option) - same no-cross-platform-`<select>` precedent every
web `<select>` port on this app has followed since `DurationPicker.tsx`. Each pill reads
`"<client first> <client last> - <project title>"` rather than showing an avatar, since a title
alone can repeat across a shop's projects and the client name is what actually disambiguates them.

**Reused rather than rebuilt**: `DateTimeField`/`DurationPicker` (already built for
`BookSessionDatesForm.tsx`/personal-appointment editing), `CONSULT_DEFAULT_MINUTES`/
`SESSION_DEFAULT_MINUTES` (`utils/duration.ts`), `useConvertBookingRequestMutation`/
`useCreateAppointmentMutation`/`useGetProjectsByArtistQuery` (all already generated for other
screens). Only two new operations were needed: `CreateBookingRequest` (`bookingRequests.graphql`)
and `FindClientByEmail` (`clients.graphql`) - `ConvertBookingRequest`, `CreateAppointment`, and
`GetProjectsByArtist` already existed in `packages/api`.

Verification: `packages/api` codegen + build clean (new `useCreateBookingRequestMutation`/
`useFindClientByEmailLazyQuery` hooks), `apps/mobile` `tsc --noEmit` clean, full Jest suite still
247/247 (no new pure-logic module - this screen is Apollo-wired end to end, matching every other
settings/creation screen's no-screen-level-test convention).

**With both halves of Danny's picked priority now closed (X47 client/artist/staff, this entry the
appointment/consult half), the mobile/web parity accounting's gap #1 and gap #2 are both done.**
Nine items remain on that list (client detail depth, dashboard/analytics, gift cards, client flags,
email-notification preferences, the in-app notification feed, group/shop-wide conversations +
search, the booking-request field editor, and registration/first-time password set) - see
HANDOFF.md's own accounting for the full reasoning behind each; priority among them is Danny's call.

### X47. Add Client / Add Artist / Add Staff - account creation from mobile

First slice off the mobile/web parity accounting written into HANDOFF.md on 2026-09-04 (gap #2:
"No client, project, staff, or artist account can be created from mobile at all"). Direct port of
apps/web's three account-creation wizards - `CreateClientWizard`/`CreateArtistWizard`/
`CreateStaffWizard` (`AccountWizards.jsx`) plus `AccountService.js`'s three mutations - split
across three new full-screen routes (`client/new.tsx`, `artist/new.tsx`, `staff/new.tsx`), reached
from a new "Add Client"/"Add Artist"/"Add Staff" button on the matching directory screen.

**Appointment/consult creation (gap #1, the much larger `AppointmentWizard.jsx`) is NOT this
entry.** That flow unifies client-creation and appointment-creation into one pipeline for Consult
and brand-new-Session types (`createBookingRequest` + `convertBookingRequest`, leaning on the
server's `findOrCreateGuestClient`) and is a materially bigger port - branching on personal-vs-shop
calendar, consult-vs-session type, and existing-vs-new-project for a session, on top of its own
date/time picker. Sequenced as its own future slice rather than folded in here, same "one clean
vertical slice at a time" reasoning as splitting Messages across X38-X41.

**Gating matches web's `IBPageActionBar.jsx` exactly**: Add Client is `isStaffOrBetter` (front-desk
work, matching the server's own `ROLES.SHOP_STAFF` floor on `createClientAccount`); Add Artist and
Add Staff are both `isShopAdminOrBetter` (matching the server's `ROLES.SHOP_ADMIN` floor on
`createArtistAccount`/`createStaffAccount`).

**ONE SCREEN PER WIZARD, NOT A PORTED STEP-WIZARD SHELL.** Web's `EntityWizard.jsx` is a generic,
reusable step-array shell - steps are a UX-pacing device (identity now, optional details later),
not an enforced sequence: its own `validateStep` only checks the CURRENT step, so nothing on web
actually depends on the steps being separate screens. Three call sites don't justify building
mobile's own version of that shell (this would be the first multi-field form on this app to need
one), so each wizard's steps survive as labeled sections on one scrollable screen instead, and
validating every field at submit rather than per-step is a strict superset of web's own behavior,
never less correct. Each screen is a real expo-router route, not an inline card or modal, matching
the "opens a real record-creation flow" precedent every other web-modal port on this app has
followed since there's no cross-platform modal primitive.

**No `shopId` sent by any of the three** - the server derives it from the creating admin
(`resolveShopIdForNewAccount` in `mutations/accounts.js`), same as X46's `ConnectArtistToShop`
never sending one either. `AccountWizards.jsx`'s own comment names exactly what a cached client-side
shop id risks: empty (silent no-connection) or stale (a shop the admin no longer belongs to).

**Booking-slug field on Add Artist has no live availability check.** Same call X42's
`settings/your-link.tsx` already made for this identical field on an *existing* artist:
`checkBookingSlugAvailable`'s debounced-and-racy courtesy check is real, separate scope for one
field, and cutting it doesn't cut the actual guarantee (the unique index on `Artist.bookingSlug`).
A taken handle, or one that doesn't meet the server's own format rules, surfaces on submit via the
same `err.graphQLErrors[0].extensions.errors` shape `assertSlugAvailable` and `assertEmailAvailable`
both throw. New `utils/bookingSlug.ts` ports `suggestSlug`/`suggestSlugOrBlank` byte-for-byte
(including the accent-stripping and 40-character truncation, both directly ported test-by-test from
`utils/bookingSlug.test.js`) so the field prefills from the typed name exactly like web's
`BookingSlugField` render prop does, and never assigns a value the admin didn't see on screen.

**New `utils/graphqlFieldError.ts`** (`fieldError`/`fieldErrors`) - the third call site for the
`graphQLErrors[0]?.extensions?.errors[field]` read (`your-link.tsx`'s inline copy was the first
two, both on `bookingSlug`), pulled into a shared helper once a third caller needed the identical
few lines - same "extract once a second/third caller shows up" reasoning as `PillRow`'s own X37
extraction.

**Invite link shown directly, not "an email was sent"** - `utils/email.js` no-ops without a
configured mail provider, so the link is the only thing this app can actually verify, same
reasoning as `AccountWizards.jsx`'s own `InviteResult`. Shown in a read-only, `selectTextOnFocus`
text field for OS-native copy - no clipboard library is installed on mobile (same
avoid-a-new-dependency call as the Shops slice's Square flow and the Forms guest-link field).

**List refresh via `refetchQueries: ['GetClients' | 'GetArtistsList' | 'GetStaffList']` on the
create mutation itself, not a focus-refetch hook.** `useFocusEffect` lives in
`@react-navigation/native`, which expo-router depends on internally but which is not itself a
resolvable import from application code in this repo (confirmed: `require.resolve` fails, and nothing
in `apps/mobile/package.json` lists it) - reaching for it would mean adding a new dependency for
one behavior. Naming the one query each screen needs refreshed is simpler and needs nothing new.

**Client duplicate-email handling matches web exactly** - `createClientAccount` reuses
`findOrCreateGuestClient` server-side and returns `isNewAccount: false` instead of erroring when
the email already has a client record; the success screen branches on that flag the same way
`CreateClientWizard`'s own `onSubmit` does ("was already on file" rather than implying a new
record).

Verification: `packages/api` codegen + build clean (new `useCreateClientAccountMutation`/
`useCreateArtistAccountMutation`/`useCreateStaffAccountMutation` hooks), `apps/mobile`
`tsc --noEmit` clean, full Jest suite 247/247 (233 plus 14 new `bookingSlug.test.ts` cases ported
from `utils/bookingSlug.test.js` - `suggestSlug`/`suggestSlugOrBlank` only, not `bookingUrl`/
`formUrl`, which are `window.location`-dependent and not part of this port).

### X46. ShopConnectionPanel - an artist's own shop connect/disconnect/move flow

Last item from the Settings/Messages follow-up list (X44's own closing note named this as the one
remaining item after Booth Rent, X45). Direct port of apps/web's `ShopConnectionPanel.jsx`: any
artist connects to a shop by ID, disconnects, or moves to a different shop - independent of
whether they admin one.

**Folded into `settings/shop.tsx`, not a new screen** - same reasoning as Booth Rent going into
`rates.tsx`: web renders `ShopConnectionPanel` inside the same "Shop" settings category as
`ShopPanel` (`settingsCategories.jsx`), just gated differently (`ShopPanel` to a shop admin with a
shop, `ShopConnectionPanel` to any artist at all). One screen, two independently-gated sections.

**Widened `settings/index.tsx`'s "Shop" nav gate from `isShopAdminOrBetter(user) && shopId` to
`user.userType === 'artist'`.** This is the one change here that reaches outside the new feature's
own files: the old gate meant an independent artist, or a plain shop-connected artist who isn't an
admin, could never open `settings/shop.tsx` at all - neither has a shopId an admin-only check
would accept, and the independent case has no shopId whatsoever. `shop.tsx` itself gates its two
sections separately now (`showShopMoneyPanel = isShopAdminOrBetter(user) && Boolean(shopId)` for
the admin block, `isArtist` alone for the connection block), matching web's own per-component
gating rather than one screen-wide check.

**`ArtistShopConnectionService.js`'s two mutations got real operation names for this port**
(`ConnectArtistToShop`/`DisconnectArtistFromShop`) - web's own `gql` tags are anonymous, which
`useMutation(TAG)` doesn't care about but generated named hooks need. New
`GetShopForConnection($shopId: ID!)` matches `ShopService.js`'s own `useLazyShop` exactly (id/
name/website only) - fired once, right after a successful connect, to get display fields
`connectArtistToShop`'s own response doesn't carry.

**`login.graphql`'s `Artist.shop` selection gained `website`.** Mobile's cached `CurrentUser` type
had never carried it (nothing read it before this screen), so there was nowhere to put the value
`GetShopForConnection` fetches after a connect, or to read back for an already-connected artist
without a second round trip on every settings visit. Staff's own `shop` selection was left alone -
no Staff-facing screen reads it.

**Both confirmations use RN's native `Alert.alert`, not a ported custom dialog** - same call
`components/ArchiveControl.tsx` already made (its own header comment: "a native alert is the
idiomatic RN equivalent of a modal confirm and needs no bespoke styling"). Web's disconnect
confirm (`window.confirm`, one line) and its transfer confirm (a custom backdrop-and-dialog
component with both shop names and a reassurance paragraph) both collapse into one `Alert.alert`
call each - the transfer case fits its entire message (both shop names, the "will end that
connection" warning, the "past appointments... stay exactly as they are" line) into
`Alert.alert`'s single message string, so this port carries **no `pendingTransfer` render
state at all** - web's own JSX-dialog approach has no mobile equivalent to build, only a mutation
retry to wire into a button's `onPress`.

**Two independent try/catch paths, not one shared error state feeding both forms** - `handleConnectToShop`'s
own `shopActionError` state serves the inline first-connect-attempt form AND the inline
move-to-a-different-shop form (only one is ever mounted at a time, same as web), while the
transfer-confirmed retry's failure surfaces through the same state via the `Alert.alert` Continue
button's own `.catch`, matching web's `handleConfirmTransfer` clearing `pendingTransfer` and
setting the same error state on a failed confirmed retry.

Verification: `packages/api` codegen + build clean (new `useConnectArtistToShopMutation`/
`useDisconnectArtistFromShopMutation`/`useGetShopForConnectionLazyQuery` hooks, widened `Login`
type), `apps/mobile` `tsc --noEmit` clean, full Jest suite 233/233 (unchanged - no new pure-logic
module, matching every other settings screen's no-screen-level-test convention).

This closes the Settings/Messages follow-up list in full - both items X44 named as left over
(Booth Rent, X45; `ShopConnectionPanel.jsx`, this entry) are now done.

### X45. Booth rent - the artist's read-only "Your booth rent" card

Next slice from X44's own follow-up list - the last of the two items named there as their own
future slices (Booth Rent under X37, `ShopConnectionPanel.jsx` under X36). Picked first between
the two: no confirm-before-transfer dialog or native-alert equivalent to design, a single
read/mark-paid mutation, and it slots into a screen (`settings/rates.tsx`) that already exists,
rather than needing one of its own. `ShopConnectionPanel.jsx` remains the one item left on that
list.

Direct port of apps/web's `BoothRentPanel.jsx` scope only - the artist's own read-only view of the
flat-fee terms a shop admin set, plus marking a month paid. Setting the plan
(`setBoothRentPlan`) and confirming payment (`confirmBoothRentPaid`) are shop-admin actions with no
mobile screen to call them from yet, same as the web component itself never calling them.

**Server-side, everything already existed** - `getBoothRentPlans`/`getBoothRentCharges`/
`markBoothRentPaidManually` were already in `server/graphql/typeDefs.js`, so this is client-
operations-only: new `packages/api/src/operations/boothRent.graphql`, field selections copied from
`BoothRentService.js`'s own `PLAN_FIELDS`/`CHARGE_FIELDS` verbatim.

**Folded into `settings/rates.tsx`, not a new screen or nav entry** - matches web exactly:
`BoothRentPanel` renders inside the "Rates" settings category, directly after `RatesPanel`, not as
its own category. Same RENDERS NOTHING behavior when `getBoothRentPlans` comes back empty - no
hidden section, no "you're not on booth rent" message, checked with the same `boothRentPlans.length
> 0` gate web's own component uses as its earliest return.

**Two new small exported functions in `utils/utcDate.ts`, not a moment dependency** -
`formatUtcMonthYear`/`formatUtcMonthDay`, same UTC-fields-not-local-fields technique
`formatUtcCalendarDate` already established (X-prior work), different display shapes for
`periodMonth` ("July 2026", matching web's `moment(periodMonth).utc().format("MMMM YYYY")`) and
`dueDate` ("Jul 1", matching `moment(dueDate).utc().format("MMM D")`). Extending the existing
module rather than inlining the calls, same "the technique is what's shared" reasoning that put
`formatUtcCalendarDate` there in the first place - both new functions get their own test cases in
`utcDate.test.ts`.

**Ordinal due-day suffix ported byte-for-byte, bug included** - web's `BoothRentPanel.jsx` only
special-cases 1st/2nd/3rd and falls through to "th" for everything else, so day 21 renders "21th"
on both platforms. A direct port reproduces existing behavior; fixing an ordinal-suffix edge case
nobody has raised is scope this slice was never asked for.

**Status label/color kept as fixed hex text colors, not a new theme token or a `Chip`-equivalent
component** - same call `styles.error`'s `'#D33'` already makes: `constants/theme.ts`'s `Colors`
has no success/warning/info slot, and a status word reading the same color in light and dark mode
is the correct behavior here, not a gap to fill in the shared theme system for one screen's three
labels. No pill/badge background either - text color alone was enough to distinguish three short
words in a row that already carries the full English label.

**No screen-level test for `rates.tsx` itself** - matches every other Apollo-wired settings screen
this port has shipped (X36/X37/X44 among others), same no-screen-level-test convention.

Verification: `packages/api` codegen + build (new `useGetBoothRentPlansQuery`/
`useGetBoothRentChargesQuery`/`useMarkBoothRentPaidManuallyMutation` hooks generated cleanly),
`apps/mobile` `tsc --noEmit` clean, full Jest suite 233/233 (229 plus 4 new `utcDate.test.ts`
cases, everything else unchanged).

### X44. Security - the audit trail

Last slice in X31's own "roughly in order of likely value" list. Direct port of
`EventLogPanel.jsx`: who changed what, and when, across money/appointment/client-record mutations
- read-only, nothing on this screen writes anything. New route `settings/security.tsx`, new
"Security" card on `settings/index.tsx`.

**Server-side, everything already existed** - `getEventLogs` was already in `server/graphql/
typeDefs.js`, so this slice is client-operations-only (new `packages/api/src/operations/
eventLogs.graphql`). Only `entityType`/`page` are exposed as filters, matching
`EventLogService.js`'s own restraint comment (`EventLogFilter` also takes `shopId`/`actorUserId`/
`from`/`to`, but nothing needs them yet - added when a real caller does, not preemptively).

**New `hasAuditAuthority` export in `utils/businessScope.ts`**, gating this screen - the exact
same predicate (`isShopAdminOrBetter(user) || !hasShop(user)`) already lived on mobile under the
name `canManageForms` (X28, predating web's own generalization of this check across Forms/
Expenses/Income/Security/Taxes/Analytics into one shared `hasAuditAuthority` helper). Rather than
write the identical boolean expression a second time under a Security-specific name, `canManageForms`
now delegates to the new `hasAuditAuthority`, keeping every existing Forms call site (and its own
test file) untouched - confirmed by re-running `businessScope.test.ts` after the change, still
green with no edits needed there.

**No moment dependency, matching `utils/messageTime.ts`'s own established convention** - a small,
screen-local `formatEntryTime` hand-rolls web's `moment(...).format("MMM D, YYYY [at] h:mm A")`
with `toLocaleDateString`/`toLocaleTimeString` rather than adding a date library for one label.
Genuinely a new format (always includes the year, no relative/weekday shorthand), so it's its own
function rather than reusing `messageTime.ts`'s `prettyMessageTime`/`fullMessageTime`, both of
which are tuned for a different display context (a message thread, not an audit log someone scans
top to bottom).

**Page-size picker ported too, not cut** - unlike some of this port's judgment calls to drop a
secondary affordance (X42's live slug-availability check), 10/25/50 is a trivial third `PillRow`
with no new dependency or architecture, so there was no real reason to leave it out.

**`formatChangeValue`'s `Cents$` field-name convention ported directly** - same "money fields are
named, not looked up in a table" reasoning as `server/utils/money.js`'s own comment, reusing
mobile's existing `formatCents` (`utils/money.ts`).

Verification: `packages/api` codegen + build (new `useGetEventLogsQuery` hook generated cleanly),
`apps/mobile` `tsc --noEmit` clean, full Jest suite 229/229 (unchanged, `businessScope.test.ts`
included).

This completes every item on X31's originally-named follow-up list except the two items called
out separately as their own future slices: Booth Rent (`BoothRentPanel.jsx`, named under X37) and
`ShopConnectionPanel.jsx` (named under X36) - neither had existing mobile infrastructure to build
on and both were scoped out explicitly at the time, not overlooked.

### X43. Appearance - account-level light/dark/match-device, not just a device setting

Next slice from X31's own follow-up list, after Forms' "Your link" (X42). Direct port of
`AppearancePanel.jsx`: saved to `User.themePreference` (the account), not this device - so it
follows the user to whatever device they sign into next, matching web's own
`ThemeModeProvider.jsx` reasoning exactly.

**This turned out to be more than a new screen** - mobile's `useTheme()` (the hook nearly every
screen's `StyleSheet` reads colors from) previously only ever called `useColorScheme()`, the raw
OS setting, with no override mechanism at all (X31's own note that this would be "a smaller,
lower-value port than it looks" was checking the wrong assumption - there was no existing
follow-the-account behavior to extend, only the OS read to replace). Fixing that touched three
files beyond the new screen itself:

- **New `hooks/use-effective-color-scheme.ts`** - the one hook that resolves light/dark from
  `user.themePreference` when it's `'light'`/`'dark'`, falling through to the OS read otherwise
  (`'system'`, `null`, or `undefined` all fall through - matching the schema's own "null/absent
  reads as 'system'" comment). This is now the single source of truth for the app's color scheme.
- **`hooks/use-theme.ts` now calls it** instead of `useColorScheme()` directly - every screen's
  color tokens automatically pick up an account override with no per-screen change needed.
- **`_layout.tsx`'s React Navigation `ThemeProvider` (header/nav chrome) now calls it too**,
  moved from `RootLayout` (outside `AuthProvider`, where `useAuth()` isn't callable) into
  `RootNavigator` (already inside `AuthProvider`) for exactly that reason. Left as a raw OS read,
  the header bar would silently disagree with the body content the moment someone picked an
  explicit Light or Dark override - a real, visible bug this port would otherwise have shipped
  quietly, since nothing about the new screen itself would have surfaced it in isolation.

**`packages/api/src/operations/updateUser.graphql` widened to select `themePreference`** on the
mutation response - that file's own header comment had predicted this exact moment back when it
was avatar-only. No new query needed for the CURRENT value: `login.graphql` already selects
`themePreference` on `CurrentUser` (added ahead of any caller needing it), so `user.themePreference`
was already there to read.

**Reuses the existing `useUpdateUserMutation`/`updateCurrentUser` pattern** `settings/index.tsx`'s
own calendar-color picker already established (X18) - `updateUser({ id, email, role,
themePreference })` then merge only the changed field into `CurrentUser`, never replace the whole
object (that file's own warning about the mutation's placeholder `accessToken`).

**No confirmation toast** - unlike this port's other save-then-alert screens, picking an option
here visibly repaints the whole app in the same render pass once the mutation resolves; a "Saved"
message on top of an already-different-colored screen would be redundant here specifically.

**No role gate, matching web's own no-floor visibility** - every other card on `settings/
index.tsx` is gated to some role or user type; this is the first that genuinely isn't, since
Appearance is universal in a way none of this port's business-logic settings are.

Verification: `packages/api` codegen + build, `apps/mobile` `tsc --noEmit` clean, full Jest suite
229/229 (unchanged - no new pure-logic module needed).

### X42. Forms' per-artist "Your link" section

Next slice from X31's own follow-up list, after Messages (X38-X41) completed. Direct port of
`FormsPanel.jsx`'s "Your link" half: the artist's own handle (`Artist.bookingSlug`), which is the
`<ownerHandle>` half of EVERY form's public URL (`/<formSlug>/<ownerHandle>` -
`server/utils/public-form-lookup.js`), booking_request included - not a booking-specific link.
New route `settings/your-link.tsx`, new "Forms" card on `settings/index.tsx` (gated
`user.userType === 'artist'`, matching web's `isArtist`).

**"Manage Forms" (web's other half of this same category) is deliberately NOT rebuilt here** -
mobile's home screen (`index.tsx`) already has its own direct "Forms" button to `forms/index.tsx`
(X28/X30), so adding a second on-ramp inside Settings would be a redundant path to the exact same
screen, not new functionality. This is a genuinely different situation from Rates/Shop, where the
whole feature was previously unreachable on mobile.

**Server-side, everything already existed** - `getArtist.bookingSlug`, `updateMyBookingSlug`, and
`getMyFormLinks` were all already in `server/graphql/typeDefs.js`, so this slice is
client-operations-only (new `packages/api/src/operations/myBookingLink.graphql`).

**NO LIVE AVAILABILITY CHECK, UNLIKE WEB'S `BookingSlugField`** - its own header comment calls the
debounced `checkBookingSlugAvailable` typing-check "a COURTESY... The server re-validates on
write... is the actual guarantee." Cutting the courtesy doesn't cut the guarantee: saving a taken
handle still fails with the same server message, just discovered on Save rather than while typing.
Building a debounced, stale-response-guarded live check (a first for this app - nothing else here
validates as-you-type) for one field was judged real, separate scope, not something to fold in
silently without calling it out.

**GraphQL FIELD-SCOPED ERRORS MATTER HERE, caught before it became a real bug** -
`updateMyBookingSlug` throws `UserInputError('Errors', { errors: { bookingSlug: '...' } })` on a
collision (`server/graphql/mutations/artists.js`), so the top-level `err.message` this port's
other save handlers all just show is the literal, useless word "Errors" for this one mutation.
Read `err.graphQLErrors?.[0]?.extensions?.errors?.bookingSlug` first (typed via `ApolloError`),
falling back to `err.message` only when that's absent - the same place web's own `handleSave`
reads it from. Worth flagging: this is the first screen in this port to need field-scoped
GraphQL-error extraction at all; every earlier slice's mutations either don't throw a
`UserInputError` shape or the plain top-level message happens to already be useful.

**No origin to build a full URL from** - same "no `window.location.origin` equivalent" reasoning
already established (X28/X30/X36): the booking-link preview shows `book/<slug>` and the per-form
links list shows `<formSlug>/<bookingSlug>`, both relative, both read-only `selectTextOnFocus`
fields for the list (no clipboard library installed, same as every other link list in this port).

Verification: `packages/api` codegen + build (new `useGetMyBookingSlugQuery`/
`useUpdateMyBookingSlugMutation`/`useGetMyFormLinksQuery` hooks generated cleanly), `apps/mobile`
`tsc --noEmit` clean, full Jest suite 229/229 (unchanged - no new pure-logic module needed).

### X41. Messages batch 4 - System Message Templates (completes the Messages category)

Fourth and last Messages sub-slice, completing X31's biggest remaining named chunk. Direct port of
`SystemMessageTemplatesPanel.jsx`: an owner-editable override for one of the app's hardcoded
outbound emails. New route `settings/system-message-templates.tsx`, linked from the same
"Messages" card (now all four: Reminders, Auto-Responses, Response Time, System Messages).

**Server-side, everything already existed** - `getSystemMessageTemplates`/
`updateSystemMessageTemplate`/`resetSystemMessageTemplate` were already in `server/graphql/
typeDefs.js`, so this slice is client-operations-only (new `packages/api/src/operations/
systemMessageTemplates.graphql`).

**ACCOUNT-INVITE AND PASSWORD-RESET STAY HARDCODED ON PURPOSE** - identity/security emails, not a
shop or artist's own outreach - confirmed against `SystemMessageTemplateService.js`'s own header
comment; they never appear in `KEY_META` at all, so there was nothing to deliberately omit here,
only to not invent.

**A FIXED LIST OF 7 KEYS, not a create/list-of-arbitrary-rows screen like Auto-Responses (X39)** -
`KEY_META` ported directly (label, merge fields, and the `hasExtraNote`/`shopOnly`/`artistOnly`
flags), and every key always renders a row regardless of whether an override exists yet -
"Customized" vs "Default" is what distinguishes them, editing writes the override row, resetting
deletes it outright (there's no null-override state to reset to, per the type's own comment).
Reused the same inline-editor-card shape X39 established (no cross-platform modal primitive in
this app), but edit-only here, never create, since there's nothing to create - a fixed key list
has no "new" affordance to offer.

**`BOOKING_CONFIRMATION` is the one key with `hasExtraNote` instead of a body field** - ported
directly, including its own helper text explaining that the schedule/deposit/request details stay
code-generated and this is only an appendable note, matching web's own comment on why
(`utils/client-booking-emails.js`).

**Reset uses the `secondary` Button variant, not `danger`** - deliberately different from
Auto-Responses' "Deactivate" (X39), which IS `danger` with a confirm `Alert`. Resetting here
deletes a record with no destructive real-world consequence - the wording just reverts to the
built-in default, and re-customizing is one Edit tap away - unlike deactivating an Auto-Response,
which stops it firing until manually re-created. Matches web's own choice not to confirm a reset
either (`handleReset` fires immediately, no `window.confirm`).

**Shop name for the shop-section title reuses the same `GetShopDetail` second-query approach as
X39/X40**, skipped whenever `canManageShopTemplates` is false.

This completes X31's Messages category - all four sub-slices (X38 Reminders, X39 Auto-Responses,
X40 Response Time, X41 System Messages) are now built.

Verification: `packages/api` codegen + build (new `useGetSystemMessageTemplatesQuery`/
`useUpdateSystemMessageTemplateMutation`/`useResetSystemMessageTemplateMutation` hooks generated
cleanly), `apps/mobile` `tsc --noEmit` clean, full Jest suite 229/229 (unchanged - no new
pure-logic module needed).

### X40. Messages batch 3 - Response Time (unanswered-message nudges)

Continuing down the Messages sub-slice list from X38/X39. Direct port of `ResponseTimePanel.jsx`:
how long a client's message may sit unanswered before the artist is nudged to reply, and how
often the nudge repeats until they do. New route `settings/response-time.tsx`, linked from the
same "Messages" card (now three links: Reminders, Auto-Responses, Response Time).

**Server-side, everything already existed** - `getResponseTimeSettings`/
`updateResponseTimeSettings` were already in `server/graphql/typeDefs.js`, so this slice is
client-operations-only (new `packages/api/src/operations/responseTimeSettings.graphql`).

**MINUTES ON THE WIRE, HOURS ON SCREEN** - `minutesToHours`/`hoursToMinutes` ported directly from
web, same "human unit for editing, minutes for the server" shape as `reminders.tsx`'s own
`minutesToUnit`/`unitToMinutes` (X38), kept screen-local on both platforms since nothing else uses
them.

**ONLY THE ARTIST'S OWN CARD IS EVER EDITABLE - the one real structural difference from
Auto-Responses (X39)**, checked directly against `ResponseTimePanel.jsx`'s own header comment
before assuming the same two-independent-sections shape applied unchanged. An ordinary
shop-connected artist sees the shop's numbers only as a read-only `shopCeiling` on their own row
(rendered as plain text, not a second card) - they have no authority to manage the shop's row,
only to be bound by it (`resolveResponseTimeThresholds`'s ceiling-clamp). A shop-admin who is also
an artist gets both: their own editable card (noting the shop's ceiling) and a second, genuinely
separate "Shop Response Time" card that edits the shop's row itself (`scope={shopId}` -
`ResponseTimeSection` is reused for both, exactly as web reuses its own).

**Client-side ceiling check mirrors the server's rejection**, same reasoning as web's own comment:
the artist sees why a value won't save before hitting Save, not after a failed round trip -
`exceedsCeiling` ported as a plain boolean expression rather than deferred to a submit-time error.

**Singleton per owner, not a list** - `getResponseTimeSettings` always returns one row (real or
lazily-defaulted), matching `ReminderSettings`' own convention, so there's no create/edit-mode
split like Auto-Responses needed - one hydrate-once form per section, same shape as
`reminders.tsx`'s own top-level state (not `rates.tsx`'s uncontrolled pattern, for the same reason
Reminders isn't: every field here is meant to reflect live local state after load).

**Shop name for the shop-section title reuses the same `GetShopDetail` second-query approach as
Auto-Responses (X39)**, skipped whenever `canManageShopResponseTime` is false.

**NOT BUILT HERE**: `SystemMessageTemplatesPanel.jsx` remains the last Messages sub-slice.

Verification: `packages/api` codegen + build (new `useGetResponseTimeSettingsQuery`/
`useUpdateResponseTimeSettingsMutation` hooks generated cleanly), `apps/mobile` `tsc --noEmit`
clean, full Jest suite 229/229 (unchanged - no new pure-logic module needed).

### X39. Messages batch 2 - Auto-Responses (message templates fired on a lifecycle event)

Continuing down the Messages sub-slice list started in X38, per the same "yes, keep going"/"keep
going" instruction. Direct port of `AutoResponsesPanel.jsx`: message templates a shop or artist
owns, fired automatically on a trigger (after a session, a payment received, a client message) or
kept around for a manual send elsewhere. New route `settings/auto-responses.tsx`, linked from the
same "Messages" card on `settings/index.tsx` that X38 added (now two links: Reminders,
Auto-Responses).

**Server-side, everything already existed** - `getAutoResponses`/`createAutoResponse`/
`updateAutoResponse`/`archiveAutoResponse` were all already in `server/graphql/typeDefs.js`, so
this slice is client-operations-only (new `packages/api/src/operations/autoResponses.graphql`).
`sendAutoResponseNow` (the manual "Send a message" picker, `SendAutoResponseButton.jsx`) is
deliberately NOT included - already named as its own cut in `SessionDetailForm.tsx`'s own header
comment, not a new decision made here.

**TWO INDEPENDENT SECTIONS, matching web exactly, not a toggle** - a shop-connected artist who is
also shop-admin-or-better sees BOTH "Your Auto-Responses" (their own `artistUserId` scope) AND the
shop's set (`shopId` scope) at the same time, continuously - `server/models/AutoResponse.js`'s own
design: the artist's own enabled response for a trigger wins, the shop's fires only when the
artist has none enabled for it. `canManageShopAutoResponses` ported as `isShopAdminOrBetter(user)
&& Boolean(shopId)` - mobile's existing `isShopAdminOrBetter` (X21/X22) is the same `role <=
ROLES.SHOP_ADMIN` check web's own inline `user.role <= ROLES.SHOP_ADMIN` is, confirmed by reading
both side by side rather than assumed from the name.

**NO CROSS-PLATFORM MODAL PRIMITIVE EXISTS IN THIS APP** (checked - grepped `apps/mobile/src/app`
for RN's `Modal`, found none), so web's create/edit `Dialog` becomes an inline editor card instead
- opened by a "+ New Auto-Response" button or a row's "Edit", closed by Save/Cancel, one editor
slot per section. This is the same "actions stay on the list, no popover" shape this project
already committed to for FormBuilder (X30) and reuses `recurring-expenses.tsx`'s own
add-a-new-entry-inline-below-the-list layout, extended here to also handle editing an existing
row (recurring-expenses.tsx itself has no edit flow, only toggle/delete, so this is the first
screen that reuses one editor card for both create and edit).

**Trigger is locked after creation, matching web's `disabled={Boolean(draft.autoResponseId)}`** -
the editor shows a plain label instead of the `PillRow` once editing an existing response, so
there's no way to even attempt changing it (a disabled `PillRow` isn't a pattern this component
supports, and wasn't worth adding for a field that's really just not editable past creation).

**Shop name for the shop-section title comes from a second query** (`GetShopDetail`, the same
operation `settings/shop.tsx` already uses) rather than threading it through the auth context -
skipped whenever `canManageShopAutoResponses` is false, so it costs nothing for the common case of
an artist with no shop-admin role.

**`AutoResponseSection` is a local, unexported component in this one file** - same placement as
web's own (only ever used twice, both times from this one screen), not extracted anywhere shared.

**NOT BUILT HERE**: `ResponseTimePanel.jsx` and `SystemMessageTemplatesPanel.jsx` remain the rest
of the Messages category, named as their own next sub-slices.

Verification: `packages/api` codegen + build (new `useGetAutoResponsesQuery`/
`useCreateAutoResponseMutation`/`useUpdateAutoResponseMutation`/`useArchiveAutoResponseMutation`
hooks generated cleanly), `apps/mobile` `tsc --noEmit` clean, full Jest suite 229/229 (unchanged -
no new pure-logic module needed).

### X38. Messages batch 1 - Reminders (appointment nudges to clients, by email and/or text)

Fourth of the four follow-up items, continuing down X31's own "roughly in order of likely value"
list after Shop (X36) and Rates (X37). Messages is web's largest remaining named chunk - four
panels, 1,175 combined lines (`RemindersPanel.jsx` 291, `AutoResponsesPanel.jsx` 396,
`ResponseTimePanel.jsx` 205, `SystemMessageTemplatesPanel.jsx` 283) - too large for one slice with
this project's usual per-feature rigor, so it's being taken the same way Settings itself was: one
coherent screen at a time, named and committed separately. This slice is the first: Reminders.

**Direct port of `RemindersPanel.jsx`**, reached from a new "Messages" card on `settings/
index.tsx` (gated `user.userType === 'artist'`, matching web's `isArtist(user)` - the category-
level gate in `settingsCategories.jsx` itself, not any deeper per-panel gate; `RemindersPanel`
itself has no further internal gating once the category is visible). New route `settings/
reminders.tsx`, registered in `_layout.tsx`.

**Self-scoped, no id argument anywhere** - same authority shape as the Square connection and
Rates (X37): always the signed-in artist's own `ReminderSettings` row
(`server/models/ReminderSettings.js`'s own comment on this). New `packages/api/src/operations/
reminderSettings.graphql` (`GetReminderSettings`/`UpdateReminderSettings`) - both the query and
mutation already existed server-side (`server/graphql/typeDefs.js`), so this slice is
client-operations-only, no server changes.

**ONE SHARED INKBOOKS TEXTING NUMBER, not one per artist** - confirmed directly against
`ReminderSettings.js`'s own design comment before writing the mobile helper text, since getting
this backwards ("this connects your own number") would misrepresent a real product fact, not just
a UI detail. Turning Text reminders on just starts using the number InkBooks already has; the
shared-infrastructure helper text ("shared infrastructure across every artist... keep an eye on
your reply rate") is carried over from web verbatim rather than softened.

**Offsets edited in a human unit, stored/sent as minutes** - `minutesToUnit`/`unitToMinutes`
ported directly from web's own module-local functions (not extracted to a shared util, matching
web's own placement, since nothing else on either platform needs them). A rule's identity is its
`offsetMinutes` value server-side, not any client id - `nextLocalKey()`'s module-level counter for
new, unsaved rows is a straight port of web's identical pattern.

**Fully controlled, hydrated once via a `hydrated` flag** - deliberately NOT the uncontrolled/
edit-tracked pattern rates.tsx (X37) uses for `hourlyRate`/`flatRate`. Every field on this screen
(two Switches, a `PillRow` per rule, three template `TextInput`s) is meant to reflect and freely
change local state after the query resolves, which is exactly what web's own `useEffect`-gated
`hydrated` state does - the uncontrolled pattern exists specifically for `TextInput`'s `value`-
after-first-edit quirk, which doesn't apply here since nothing needs an *initial* value read
independent of later edits.

**Shared `PillRow` (extracted in X37) used for the per-rule unit picker** - the third real call
site (`form/[id].tsx`'s field-type picker, `settings/rates.tsx`'s billing type and rate source,
now this), continuing to avoid a fourth inline copy. `recurring-expenses.tsx`'s own still-inline
`PillRow` (X31, predates the X37 extraction) is left as-is - a drive-by refactor of unrelated,
already-shipped code, not part of this slice's scope.

**NOT BUILT HERE**: `AutoResponsesPanel.jsx` (auto-reply rules, with its own two-tier gating -
`isArtist` for an artist's own auto-responses, `hasAuditAuthority`-and-has-a-shop for a shop-wide
section), `ResponseTimePanel.jsx` (expected-response-time setting shown to clients), and
`SystemMessageTemplatesPanel.jsx` (template text for system-generated messages) - each named as
its own remaining Messages sub-slice, not folded into this one.

Verification: `packages/api` codegen + build (new `useGetReminderSettingsQuery`/
`useUpdateReminderSettingsMutation` hooks generated cleanly), `apps/mobile` `tsc --noEmit` clean,
full Jest suite 229/229 (unchanged - no new pure-logic module needed, matching web's own choice to
keep `minutesToUnit`/`unitToMinutes` screen-local rather than extract them).

### X37. Settings batch 4 - an artist's own Rates (billing type, hourly/flat rate, which-rate-applies)

Next slice from X31/X34/X36's own follow-up list. Direct port of apps/web's RatesPanel.jsx, kept
as one screen for the same reason it's one category on web: "what I charge" and "whose rate
applies to me" are one question with two parts, not two separate settings.

**New `settings/rates.tsx`, gated `user.userType === 'artist'`** (matching web's own
`isVisible: isArtist` on this settings category exactly) - reached from a new "Rates" link on
`settings/index.tsx`.

**`GetMyRateSettings`, not `GetArtistDetail`** - checked `artists.graphql`'s own header comment
before adding anything: that query deliberately drops `hourlyRate`/`flatRate`/`billingType`
because it's the Staff-or-better ROSTER view of an artist (a shop-mate looking up someone else),
and those fields back a dashboard panel deliberately out of scope for that slice (X22). This is a
different, SELF-scoped query - the signed-in artist reading their OWN rate settings - so it gets
its own operation rather than loosening the roster query's deliberate leanness for everyone who
calls it.

**Two different id shapes, easy to conflate, checked against both the mobile call sites already
using them and the server resolvers directly rather than assumed**: `getArtist(artistId)` takes
the Artist PROFILE's own `_id` (`user.userInfo.id` - same id `GetArtistDetail`/`artists/index.tsx`
already navigate with), while `getArtistShopConnections(artistId)`/`setArtistShopRateSource`
take the artist's USER id (`user.id` - confirmed against `resolvers/artistShopConnections.js`'s
own `ArtistShopConnection.find({artistId})` and against `session/[id].tsx`'s existing
`useGetArtistShopConnectionsQuery({variables: {artistId: project.artistId}})` call, where
`project.artistId` is a user id, not an Artist document id). Getting this backwards would silently
return another artist's connections or fail auth - not a value that "looks wrong" that testing
would catch, so this was verified against the resolver source, not inferred from the field name.

**`PillRow` extracted from `form/[id].tsx` into `components/PillRow.tsx`** - it was built there
(X30) as a local, unexported component implementing `DurationPicker.tsx`'s "no cross-platform
`<select>` primitive, use a pill row" precedent for a short string enum. This screen's billing-type
and rate-source pickers are the second real caller, which is what earned the extraction - a third
inline copy would have been the wrong call, a second real use is exactly the right time. No visual
or behavioral change to `form/[id].tsx`'s own field-type picker; same component, same styles,
different file.

**hourlyRate/flatRate use local-edit-tracking state (uncontrolled-style), billingType/rateSource
use plain `useState` hydrated at render** - mirrors web's own `IBInput` (defaultValue-based,
uncontrolled) vs `IBSelect`/radio (value-based, controlled) split exactly, and for the identical
reason web's own comment gives: hydrating an uncontrolled field's value via an effect after a query
resolves updates state that the field never actually reads again after mount.

**Not built**: `BoothRentPanel.jsx`'s "Your booth rent" card - real, separate scope, no existing
mobile infrastructure (`BoothRentService` equivalent, a `boothRentCharge` screen) to build it on
top of. Left as its own named future slice.

**Verified in this sandbox**: `packages/api` codegen + build clean, `apps/mobile` `tsc --noEmit`
clean, full `apps/mobile` Jest suite - still 229/229 (no new pure-logic module - `PillRow`'s
extraction changes its file, not its logic, and every other piece here is Apollo-wired screen
code, matching this port's own no-screen-level-test convention). No server-side changes - all
three mutations/queries used here already existed.

### X36. Settings batch 3 - Shop's shop-cut-percent editor and shop-wide form link

Picked as the next slice from X31/X34's own follow-up list ("More Settings"), highest priority on
that list since it's the one gap named directly in another screen's own comment: `shop/[id].tsx`'s
`ShopCutCard` has said, since X24, "not editable from mobile yet." This closes it.

**New `settings/shop.tsx`, not a third card on `settings/index.tsx`** - direct port of web's
`ShopPanel.jsx`, kept as its own screen (like Income/Expense/Recurring Expenses - X31) rather than
folded into the index screen the way Square's two cards were (X34), because this one needs its own
`GetShopDetail` query (already existed, built for `shop/[id].tsx`) plus a `GetFormsList` query
neither existing settings card needs - a third unrelated data dependency on an already-busy screen,
not two lines fewer of navigation.

**Two fields, matching web's own scope exactly, nothing more**: shop cut percent (save-on-blur,
0-100 integer, same validation as web) and the shop's own form-link handle (`formSlug`, save-on-
blur, lowercase-normalized) plus the resulting list of shop-wide form links. Tax rate/processing
offset are deliberately NOT here, same as web - those belong to `SquarePricingCard` (X34), which
already resolves to the shop for a connected artist; a second editor for the same two fields would
recreate the exact "two editors, one stored field" bug this project already fixed once for
shopCutPercent itself (see `ShopPanel.jsx`'s own header comment on that history).

**`formSlug` needed its own mutation, not `updateShop`'s `ShopInput`** - checked `typeDefs.js`'s
`ShopInput` definition directly rather than assuming: `formSlug` isn't a field on it at all, it has
a dedicated `updateMyShopFormSlug(shopId, slug)` mutation. Shop cut percent, by contrast, IS a
`ShopInput` field, so saving it means resending the same full echoed-back-unchanged payload
`shop/[id].tsx`'s `IdentityCard` already builds (`ShopInput` requires every field non-null or the
resolver nulls it out) - a new `UpdateShopCutPercent` operation against the same `updateShop`
mutation, with its own response selection, since `UpdateShopIdentity`'s doesn't return
`shopCutPercent`.

**Shop-wide links shown via a `selectTextOnFocus` read-only field, not a Copy button** - same
call `form/[id].tsx`'s guest link and `forms/index.tsx`'s public-form link already made (X28/X30):
mobile has no equivalent of `window.location.origin`, which is what web's own `formUrl()` helper
needs to build a full URL, so this shows the relative `<formSlug>/<shop.formSlug>` path and lets
the OS's own text selection do the copying. `GetFormsList`'s selection gained a `shopUseOnly`
field for this screen's own filter (`items.filter(f => f.shopUseOnly)`, mirroring web's identical
filter) - additive, no existing caller of that query is affected.

**`shop/[id].tsx`'s `ShopCutCard` now links here** ("Change in Settings" button →
`router.push('/settings/shop')`) instead of the plain text admitting no such screen existed - that
comment and button are both corrected in the same pass.

**Named, deliberately not folded in**: `ShopConnectionPanel.jsx` (an artist's own shop connect/
disconnect/move flow, including a confirm-before-transfer dialog) - checked directly and found
substantial enough to be its own future slice, not a small addition to this one.

**Verified in this sandbox**: `packages/api` codegen + build clean, `apps/mobile` `tsc --noEmit`
clean, full `apps/mobile` Jest suite - still 229/229 (no new pure-logic module this slice - every
new piece is an Apollo-wired screen, matching every other settings screen's own
no-screen-level-test precedent). No server-side changes at all - both mutations
(`updateShop`/`updateMyShopFormSlug`) already existed; this only added client-side operations
against them.

### X35. Messages follow-ups - image-attachment compose and per-row "mark unread"; group/shop-wide conversations still open

Last of three follow-up items ("Settings batch 2, Messages follow-ups, Mobile deep-link scheme"),
done last since it's the least related to the other two. X16 named three gaps against web's
Messenger/IBChatBox: no image-attachment compose, no group/shop-wide conversations, no per-row
"mark unread"/search. This closes the first and the "mark unread" half of the third - the two
most tractable, self-contained pieces - and leaves group/shop-wide conversations (a real new
query, `getConversationsByShopId`, plus real new UI for a multi-member thread) and the
search-by-name box open, matching this project's own "smallest complete piece, name the rest"
convention every other slice has used.

**Image-attachment compose (`messages/[id].tsx`), direct port of web's `IBChatBox.jsx`.** Upload
happens on selection, not on send - `expo-image-picker` (`allowsMultipleSelection`,
`selectionLimit: MAX_IMAGES_PER_MESSAGE - pendingImageUrls.length`) picks up to 5 images total,
each uploaded immediately via a hand-built multipart `fetch` POST to `routes/messageUploads.js`
(`restApi.ts`'s `restApiUrl`/`getAccessToken` - already built for Square - are this file's second
real caller), so the compose row shows real thumbnails and a real per-file failure before the
message is actually sent, exactly like web. `createMessage`'s `imageUrls` variable already existed
in `messenger.graphql`'s schema and generated types (declared, just never populated from a mobile
call site) - no codegen change needed for this half. Sending is allowed with images and no text
(mirrors `createMessageInputSchema`'s server-side refinement: reject only when BOTH are empty).
RN's `FormData.append('files', {uri, name, type})` stands in for a real `Blob` (there is no `File`
object in RN, only a local file URI) - cast with `as unknown as Blob` since this shape doesn't
satisfy `FormData`'s DOM-`Blob`-typed overload, but is RN's own documented way to attach a local
file to a multipart request.

**Per-row "mark unread" (`ConversationRow.tsx` + `messages/index.tsx`), using the
`markConversationUnread` mutation that already existed server-side** (`conversation-reads.js`'s
`markConversationUnreadForUser` - just clears the same `lastReadAt` field `markConversationRead`
sets, no new storage). New `MarkConversationUnread` operation in `messenger.graphql`, mirroring
`MarkConversationRead`'s exact shape. Rendered as a plain trailing text button, not web's
overflow-`IconButton`-then-MUI-`Menu` shape - there is no icon library anywhere in this mobile app
(matching `settings/index.tsx`'s own plain-text convention throughout this whole port), and a
single hide condition reads more simply as a direct `Pressable` than as a one-item menu. Web hides
the action under two conditions (already unread, OR the currently-open conversation); mobile only
has the first - opening a thread here navigates to its own screen rather than staying on this list
the way web's two-pane layout does, so there is no "currently open, don't offer this" case that
needs a second guard.

**Two stale doc-comments corrected in the same pass, both about claims this entry makes false**:
`messenger.graphql`'s own header no longer lists "mark unread" among what's NOT ported, and
`MessageBubble.tsx`'s header no longer says images "only ever arrived from a web-side sender" -
they can now arrive from either side.

**Verified in this sandbox**: `packages/api` codegen + build clean, `apps/mobile` `tsc --noEmit`
clean, full `apps/mobile` Jest suite - still 229/229 (no new screen-level tests for
`messages/[id].tsx`/`messages/index.tsx`/`ConversationRow.tsx`, matching X16's own established
precedent of not screen-testing this slice's Apollo-wired components). **Not verified**: an actual
multipart upload against a real running server (this sandbox cannot run the server integration
suite - standing `fastdl.mongodb.org` block - and there is no device/simulator to manually attach
a real photo and watch it send). The request shape was built by reading `routes/
messageUploads.js`'s multer configuration and web's own working `IBChatBox.jsx` fetch call
directly, not assumed.

This closes the requested three-item follow-up round in full ("Settings batch 2, Messages
follow-ups, Mobile deep-link scheme").

### X34. Settings batch 2 - the artist's own Square connection and tax/processing pricing

Third of three follow-up items ("Settings batch 2, Messages follow-ups, Mobile deep-link scheme"),
tackled first for the continuity with X33 - same domain, same Square OAuth machinery, done while
that context was fresh. X31 left the rest of web's Settings (thirteen panels, ~2,700 lines) as a
named follow-up list rather than one slice; this closes the two highest-continuity items from that
list - Square Config - and leaves the other five (Shop, Rates/Booth Rent, Messages, Forms'
shop-wide link section, Appearance, Security) exactly as X31 named them, still open.

**Two new cards on `settings/index.tsx`, not two new routes** - `SquareConnectionCard` and
`SquarePricingCard`, direct ports of web's `SquarePanel.jsx`/`SquarePricingPanel.jsx`, added as
sibling cards on the same screen rather than their own screens under `settings/`, since both are
short (142/163 web lines) and this screen already mixes several unrelated settings (photo,
password, Business links, calendar color) the same way. Distinct from `shop/[id].tsx`'s own
`SquareCard`: that one connects the SHOP's own Square account (received cut invoices); this is the
ARTIST's own account, which every artist has regardless of shop membership (DECISIONS.md M9) -
same underlying OAuth machinery, two separate connections, two separate screens, matching web's own
split between `Shop.jsx` and `SquarePanel.jsx`.

**Reuses X33's `platform: "mobile"` deep-link mechanism for free** - `getMySquareAuthorizationUrl`
already gained the same optional `platform` argument as the shop resolver in X33's own server-side
change, so `squareSettings.graphql`'s `GetMySquareAuthorizationUrl` just asks for
`platform: "mobile"` and the callback route already knows to send an ARTIST owner to
`inkbooks://settings?square=<status>` - no new server code needed. This closes the one follow-up
X33 itself named as still open ("`settings/index.tsx` has no equivalent read yet"): the screen now
reads `useLocalSearchParams<{ square?: string }>()`'s `square` field, shows a
connected/cancelled/error banner, and `refetch()`s in a `useEffect` keyed on that param - identical
shape to `shop/[id].tsx`'s own handling, for the same belt-and-suspenders reason.

**One deliberate divergence from `shop/[id].tsx`'s own pattern, not a port of it**:
`SquareConnectionCard`'s disconnect confirms first (`Alert.alert`, matching web's own
`window.confirm` and this app's own `recurring-expenses.tsx` delete-confirm convention) -
`shop/[id].tsx`'s `handleDisconnect` has no confirmation step at all, a real, narrow inconsistency
with web noticed while building this, and named here rather than quietly copied into a second
screen. Not fixed on the shop screen in this pass - out of scope for this slice, worth a one-line
fix whenever that screen is next touched.

**New `utils/money.ts` exports: `basisPointsToPercent`/`percentToBasisPoints`** - promoted out of
`SquarePricingPanel.jsx`'s own local, unexported helpers of the same names, the same "one place
this unit conversion happens" reasoning `money.ts`'s own header comment already states for
cents/dollars. `dollarsToCents` (already existed, used by Recurring Expenses - X31) covers the fee
offset field; the tax rate field needed the new pair. 6 new tests in `money.test.ts`.

**Verified in this sandbox**: `packages/api` codegen + build clean, `apps/mobile` `tsc --noEmit`
clean, full `apps/mobile` Jest suite - 229/229, up from 223. No server-side changes in this entry
at all (typeDefs/resolvers were already touched by X33) - nothing new to `node --check`.

### X33. Mobile's first real deep link - Square OAuth "return to the app", not the password-reset gap

Second of the three follow-up items ("Settings batch 2, Messages follow-ups, Mobile deep-link
scheme"). `app.json` has carried `"scheme": "inkbooks"` since the app was scaffolded, but nothing
server-side or client-side had ever actually constructed or consumed an `inkbooks://...` URL -
every earlier entry in this file describing a "no deep link" gap (X24's Square Connect, the
password-reset flow) meant it literally. This closes exactly one of those two gaps.

**A custom URL scheme is not a Universal Link, and the difference decided what got fixed here.**
An `https://` Universal Link is intercepted by the OS before it ever reaches a browser, so tapping
one in an email client, a text message, anywhere, opens the app directly. A custom scheme like
`inkbooks://` only fires from script or a deliberate tap on an already-loaded page: a link an email
client renders as plain, non-tappable text, an HTTP redirect a mobile browser prompts "Open in
App?" for, or a `window.location.href` assignment on a page the app's own server controls. Square
OAuth fits the last case - InkBooks's own callback route renders the intermediate page - so it's
fixable with the scheme alone. The password-reset email link (X29's gap) does not: it needs a real
Universal Link, which means a registered domain serving `apple-app-site-association` and
`assetlinks.json`, an App Store listing, and signed builds with the matching entitlements - none of
which exist or are buildable in this sandbox. Still an open, named gap, not touched by this entry.

**The mechanism: a `platform` claim riding inside the already-signed OAuth `state` JWT.**
`getSquareAuthorizationUrl`/`getMySquareAuthorizationUrl` (`graphql/typeDefs.js`,
`resolvers/shops.js`) take a new optional `platform: String` argument, defaulted to `'web'` when
omitted so every existing web call site (`apps/web/src/services/ShopService.js`, which defines its
own independent query and never passes this) keeps behaving exactly as before. `routes/
squareOAuth.js`'s `signState(ownerType, ownerId, platform = 'web')` seals it into the same signed
token that already carries `ownerType`/`ownerId`/`purpose` (M9) - riding inside the signature
rather than beside it, for the same reason `ownerType` does: Square hands `state` back to the
callback unmodified and unchecked, so anything not inside the signature is an attacker's to change.
`verifyState` reads it back, defaulting anything other than the literal `'mobile'` to `'web'`
(never trusts an unrecognized value into a different code path).

**The callback route now branches on that claim.** `respondToOAuthResult(res, owner, status)`
replaces the old unconditional `res.redirect(settingsRedirectUrl(...))`: a `'web'` owner still gets
that redirect (`webRedirectUrl`, renamed from `settingsRedirectUrl` for symmetry, otherwise
unchanged), while a `'mobile'` owner gets `mobileReturnPageHtml(...)` - a small, self-contained HTML
page that scripts `window.location.href = 'inkbooks://...'` immediately AND shows a manual "Open
InkBooks" button as a fallback, rather than a bare `res.redirect('inkbooks://...')` that would
degrade badly in a desktop browser or without the app installed. The deep link itself mirrors
`webRedirectUrl`'s own routing exactly: `inkbooks://shop/:shopId?square=<status>` for a shop,
`inkbooks://settings?square=<status>` for an independent artist, `status` one of `connected`/
`denied`/`error`.

**Mobile: `shop/[id].tsx` reads `?square=` and shows a banner.** `packages/api`'s
`GetSquareAuthorizationUrl` operation now passes `platform: "mobile"` as a literal in the query
string (not a variable - this operation is mobile-only, unlike the shared schema field) so every
call already gets the deep-linked flow with no call-site change. The screen reads
`useLocalSearchParams<{ id: string; square?: string }>()`'s new `square` field, shows a
connected/cancelled/error banner via `SquareCard`'s `returnStatus` prop, and calls `refetch()` in a
`useEffect` keyed on that param - belt-and-suspenders alongside the query's existing
`cache-and-network` fetch policy, for the case where expo-router reuses an already-mounted screen
instance rather than remounting it when the OS opens the link. `settings/index.tsx` has no
equivalent read yet: an independent artist's Square connection lives on Settings, not this screen,
and Settings does not currently read a `square` param or show a banner - named here as a real,
narrow follow-up rather than silently incomplete, since Settings batch 2 (this same follow-up
round) is about to touch that screen anyway.

**Not independently verified**: whether `inkbooks://shop/<id>?square=connected` actually resolves
to the `shop/[id]` route with `id` and `square` populated correctly relies on expo-router's default
scheme-based linking (no explicit `linking` config exists or was added - `app.json`'s
`"scheme": "inkbooks"` is the only piece expo-router needs, per its own deep-linking docs) - there
is no device or simulator in this sandbox to actually tap a generated link and watch it land. Every
other piece (`tsc --noEmit`, the full mobile Jest suite, `node --check` on every touched server
file) is confirmed; this one specific claim is asked of whoever runs this on a real device.

**Tests**: new `describe('signState: platform claim')` block in `test/unit/square-oauth-state.
test.js` - default-to-`'web'`, explicit `'mobile'`, explicit `'web'`, and rejecting an unrecognized
platform value, mirroring the file's own existing `ownerType` tests exactly. All four are pure
function calls against `signState`/`jwt.verify` - no `mongod`, no schema, nothing this sandbox's
`node --check`-only ceiling could get wrong the way the previous entry's (X32) invalid test did.
Confirmed the three existing Square test files (`square-oauth-state.test.js`, `mySquareConnection.
test.js`, `square.test.js`) call `signState`/the GraphQL query without a `platform` argument at
every existing call site, so the new optional parameter changes nothing about what they assert.

### X32. Push notifications carry a subject, and tapping one now opens the right screen

Last of the four follow-up items ("do 2, 3, 4 and 5"). Closes a real, standing gap: mobile has
sent and received push notifications since Phase 5 step 7 (`lib/push-notifications.ts`,
`server/utils/push.js`), but a tap on one just opened the app to Home - nothing carried enough
information to open the right screen. Two changes, one on each side of the wire.

**Server: `utils/notifications.js`'s `notify()` now passes `data: { type, subjectType,
subjectId }` into `push.sendPushForRecipients`.** This was NOT already happening, despite an
earlier note in this project's own history claiming otherwise - checked directly against the
current code before writing anything client-side: `sendPushForRecipients` (`utils/push.js`) has
always accepted and forwarded a `data` object (it's been sitting there, unused, since Phase 5 step
7 - `data = {}` in its own signature, spread onto every Expo message), but `notify()`'s one real
call site never passed one. Every in-app `Notification` row already carries `type`/`subjectType`/
`subjectId` (`models/Notification.js`) - this is that same identity, reaching the push payload for
the first time. `subjectId` is coerced with `String(...)` - never a null fallback, since
`subjectId` is `required: true` on the `Notification` schema, so `Notification.insertMany` earlier
in the same function has already thrown for any event missing one; there is no "no subject" case
by the time this line runs. (An earlier draft of this change DID add a null fallback plus a test
for it - `node --check` couldn't catch that the test was invalid, since it never got far enough to
run a real `mongod`. The user's own `npm test` run on a machine with real network access caught
it: the test's `delete event.subjectId` hit the schema's own `required: true` validation error
before ever reaching the push code it meant to exercise. Removed the dead null-fallback branch and
the invalid test along with it - this is what small-sandbox `node --check`-only confirmation
actually buys you, and does not buy you, for a change like this.) One new test in
`test/integration/pushNotifications.test.js` covers the payload shape; `node --check` is this
sandbox's own ceiling for confirming it (no route to `fastdl.mongodb.org` here - see Test status -
so the integration suite itself couldn't be run in this sandbox).

**Mobile: `lib/push-notifications.ts`'s new `resolveNotificationTarget(data)`** reads that payload
back and maps `subjectType` to one of five known mobile screens - `appointment`, `bookingRequest`,
`conversation`, `artist`, `shop` - every `subjectType` currently in real use
(`server/graphql/mutations/*`, `utils/attention.js`, `utils/notification-jobs.js`) that ALSO has a
mobile screen to land on. `boothRentCharge` is the one real `subjectType` with no mapping - Booth
Rent has no mobile screen at all yet (X31) - so that notification opens the app to Home, same as
tapping the icon; named here as a real, current gap rather than a broken navigation attempt.
Malformed, missing, or pre-this-change payloads (an older notification, or a `boothRentCharge`
event) all resolve to `null` the same way - never throws, matching every other function in this
file's own "best-effort, never blocks the caller" convention.

**The actual navigation lives in `app/_layout.tsx`'s `RootNavigator`, not in
`push-notifications.ts`** - `resolveNotificationTarget` deliberately returns a plain `{screen, id}`
rather than an expo-router path string, because `app.json`'s `typedRoutes: true` means
`router.push`'s `Href` type only accepts known literal route strings, and this function's whole
job is picking one of several such strings at runtime. `navigateForNotificationTarget`'s switch
statement keeps every actual `router.push({ pathname: '/appointment/[id]', ... })` call a real
literal, satisfied by typed routes, while the decision logic itself stays pure and unit-tested.

**`Notifications.useLastNotificationResponse()`, not a manually wired
`addNotificationResponseReceivedListener` plus a separate `getLastNotificationResponseAsync` cold-
start check** - the hook already does both in one place (see its own implementation: it seeds from
`getLastNotificationResponse()` on mount, then a live listener updates it from there), which is
less to keep in sync than reimplementing the same two-path merge by hand. `clearLastNotificationResponse()`
is called immediately after acting on a response with a signed-in user, so remounting
`RootNavigator` (a fast refresh in dev, or a quick logout/login) never re-navigates to a tap
that's already been handled - but ONLY when a user is present: a response arriving before login
(cold-starting the app via a notification tap while signed out) is deliberately left uncleared, so
it's still there to act on once `RootNavigator` re-renders signed in, since every mapped screen
lives behind `Stack.Protected`'s `guard={!!user}`.

Not built: any notification action beyond a plain tap (Expo's push categories/actions), and any
navigation for a `subjectType` with no mobile screen. Both are real, separate scope, not corners
cut from this one.

### X31. Settings batch 1 - Income/Expense category management and Recurring Expenses; everything else in Settings named as a follow-up list

Third of the four follow-up items ("do 2, 3, 4 and 5"). Web's Settings is eighteen panels across
twelve categories (`settingsCategories.jsx`) - too large to port as one slice with this project's
usual per-feature rigor (tests, docs, independent verification), so it's being taken the same way
the six-feature batch was: one coherent piece at a time, named and committed separately, with the
remainder listed explicitly rather than left implicit.

**This slice closes the two gaps named directly in X26/X27's own header comments**: Income/Expense
category management (`IncomeTypesPanel.jsx`/`ExpenseTypesPanel.jsx` - "Category management...
is Settings-only on web... out of scope for this page's port") and Recurring Expenses
(`RecurringExpensesPanel.jsx` - "a real, separate feature-sized subsystem"). Both are now built:
new routes `settings/income-types.tsx`, `settings/expense-types.tsx`, `settings/
recurring-expenses.tsx`, each a direct port of its web panel (add/deactivate/reactivate for the
two category screens; add/pause/resume/delete for Recurring Expenses), reached from a new
"Business" section on `settings/index.tsx`, gated the same `canManageBusinessLedger` as
Income/Expenses themselves.

**New `utils/utcDate.ts`'s `formatUtcCalendarDate`** - pulled out of `utils/formAnswers.ts`
(X28, where it started as forms-only and un-exported) once Recurring Expenses' `nextRunDate`/
`endDate` needed the exact same UTC-vs-local fix `formAnswers.ts`'s own `dateValue` case already
had. A second inline copy of the same bug fix would have been the wrong way to reuse it - one
shared, exported, directly-tested function is used by both now. `formAnswers.ts` imports it rather
than keeping its own copy; `formAnswers.test.ts` still passes unchanged since it only exercised
the function indirectly through `formatFormAnswer`.

**Recurring Expenses' date fields use `DateField` (X26) for both start and end**, including when
no end date is set yet - `DateField` requires a real `Date` value, so the "Ends (optional)" field
shows `startDate` as a placeholder value until the user actually picks one, with a separate "Clear
end date" button to go back to no end date at all (`endDate: null` is a real, meaningful state
here - a template with no end date recurs forever - so this needed its own explicit affordance,
unlike a plain optional text field that's empty by default).

**Named, deliberate cuts - the rest of Settings, left for later slices, roughly in order of
likely value**:
- ~~**Shop** (`ShopPanel.jsx`'s shop-cut-percent editor)~~ - **done, see X36.**
  `ShopConnectionPanel.jsx` - an artist's own connect/disconnect/move-to-a-different-shop flow
  (`ArtistShopConnectionService`'s `connectArtistToShop`/`disconnectArtistFromShop`, including a
  confirm-before-transfer dialog when connecting would move them off their current shop) - is a
  real, separate feature checked while scoping X36 and found substantial enough to name as its own
  remaining item, not folded into this pass.
- ~~**Square Config** (`SquarePanel.jsx`, `SquarePricingPanel.jsx`'s tax rate/fee offset
  editor)~~ - **done, see X34.**
- ~~**Rates** (`RatesPanel.jsx`)~~ - **done, see X37.** `BoothRentPanel.jsx` (an artist's own
  read-only view of shop-set flat-fee booth-rent terms, plus a "mark this month paid" action) is
  real, separate scope with no existing mobile infrastructure at all (no `BoothRentService`
  equivalent, no `boothRentCharge` screen - X32's own note on that `subjectType` having nowhere to
  land is still true) - left as its own future slice, not folded into this one.
- ~~**Messages** (`RemindersPanel.jsx`, `AutoResponsesPanel.jsx`, `ResponseTimePanel.jsx`,
  `SystemMessageTemplatesPanel.jsx`)~~ - **done, see X38/X39/X40/X41.** The largest remaining
  chunk (over 1,100 combined web lines), taken as four separate sub-slices, all now built.
- ~~**Forms' per-artist "Your link" section** (`FormsPanel.jsx`'s "Your link"/URL list, absorbed
  from the old Booking category)~~ - **done, see X42.** forms/index.tsx and form/[id].tsx (X28/
  X30) already cover form management itself; this was the separate "here's your handle, here's
  every published form's link built from it" view.
- ~~**Appearance** (`AppearancePanel.jsx`)~~ - **done, see X43.**
- ~~**Security** (`EventLogPanel.jsx`)~~ - **done, see X44.**
- **Account category's remaining pieces are already done** (photo/password/calendar color -
  X18, pre-dating this session).
- **Calendar/Taxes/Analytics categories are `ComingSoonPanel` placeholders on web itself** - no
  real functionality exists yet to port; skipped entirely rather than porting a "coming soon"
  message as its own mobile screen.

### X30. FormBuilder built on mobile - Up/Down buttons replace drag-and-drop, actions stay on the list

Second of the four follow-up items ("do 2, 3, 4 and 5" against the six-feature batch's own "what's
next" list). Closes the single biggest named cut from X28: there is now a way to create and edit a
form's fields from mobile.

**Field reorder: a pair of Up/Down buttons per field row, not drag-and-drop.** X28 named the real
obstacle - web's `FormBuilder.jsx` reorders fields via `@dnd-kit/core`/`@dnd-kit/sortable`
(`FormFieldEditorRow.jsx`'s drag handle, pointer AND keyboard sensors), and no cross-platform drag
primitive exists anywhere in this app. `DurationPicker.tsx`'s own header comment already
established the sibling precedent for select dropdowns - a pill row instead of a native `<select>`
- so the same shape of fix applies here: `utils/formBuilder.ts`'s pure `moveField(fields, index,
direction)` swaps a field with its neighbor, clamped (moving the first field up or the last field
down is a no-op) rather than wrapping, since there's no drag gesture here to simply refuse the way
dropping above the list's top would on web.

**New `utils/formBuilder.ts`** - a direct port of `FormBuilder.jsx`'s `newField`/`fieldFromServer`/
`canSave`/`fieldsForInput`, plus `moveField` and `fieldNeedsMoreOptions` (the per-field version of
`canSave`'s choice-options check, backing the same inline "needs at least two options" notice
`FormFieldEditorRow.jsx` shows). `newLocalField` uses an incrementing counter for its local id
instead of web's `Math.random().toString(36)` - functionally equivalent (a React list key that's
never sent to the server), but deterministic in tests. Five new tests
(`formBuilder.test.ts`) cover all of it, including `fieldsForInput`'s omit-key-for-a-new-field and
strip-options-for-non-choice-type behavior.

**New `FORM_CHOICE_FIELD_TYPES`/`isChoiceFieldType`/`FORM_FIELD_TYPE_OPTIONS` added to
`utils/formConstants.ts`** (extending X28's `FORM_STATUS_LABELS`/`FORM_FIELD_TYPE_LABELS`) -
`FORM_FIELD_TYPE_OPTIONS` is built from the existing label map via `Object.entries` rather than
kept as a second hand-copied list, so the two can't drift out of order with each other.

**New route `app/form/[id].tsx`**, singular like `client/[id]`/`project/[id]`/`shop/[id]` -
`id === 'new'` is the create-mode sentinel, matching web's own `formId === "new"` convention
exactly. Reached from `forms/index.tsx`'s new "New Form" button and from tapping a form's title
(now a link, except the `booking_request` system form, which stays plain text). Redirects back to
the Forms list if it ever loads a `booking_request` form directly - there's no restricted
booking-fields editor on mobile to redirect to instead (X28), so back to the list is the only
sensible landing.

**Publish/Archive/guest-link toggle/Responses are deliberately NOT duplicated in the builder
screen**, unlike web's `FormBuilder.jsx`, which shows all four once a form is real. X28 already put
every one of them on `forms/index.tsx`'s list rows; showing them again here would mean two
screens independently calling the same mutations for no reason. The builder shows the form's
status as a read-only line instead (`formStatusLabel` + a "· Default form" suffix for a seeded
form like `consent`) and leaves the actions where they already work. This is a mobile-specific
information-architecture call, not a missing feature - every action web's `FormBuilder.jsx` offers
is reachable from mobile, just from the list instead of the editor.

**The "always asks First Name/Last Name/Email/Phone first" notice is carried over verbatim** -
same reasoning web's own comment gives (this isn't a form field, it's how a guest's response gets
matched to the right client record). The public-link helper text under the slug field is trimmed
to not reference a full URL, matching the list's own guest-link gap (X28): mobile has no reliable
source for the web app's own public origin.

**Boolean toggles (`shopUseOnly`, a field's `required`) use React Native's `Switch`**, matching the
existing convention (`artists/index.tsx`'s "Show archived" toggle), not a hand-drawn checkbox glyph
- there's an established primitive for this one, unlike the drag-reorder problem above.

Confirmed in this sandbox: `packages/api` codegen + build, `apps/mobile` `tsc --noEmit` clean, and
the full `apps/mobile` Jest suite - 217/217, up from 198.

### X29. Forgot-password recovery built on mobile - request only, never redemption

Requested directly, outside the six-feature batch: mobile's login screen had no self-service
recovery path at all, and Settings' password form requires already being signed in - an artist who
forgets their password on their phone was simply stuck. Ports the logged-out half of web's
`ResetPassword.jsx` (the request form), not its logged-in branch (`IBUpdatePassword` - already
covered by `settings/index.tsx`'s own password-change form, since a signed-in user wants a
different operation with a different guarantee, per that file's own comment).

**New top-level route `app/reset-password.tsx`**, registered under the SAME `Stack.Protected
guard={!user}` block as `login` - a logged-out user needs to reach it too. Reached from a new
"Forgot password?" link below `login.tsx`'s own submit button.

**The confirmation is deliberately unconditional**, matching web's own comment exactly: it says
the same thing whether or not the address belongs to an account, because the server
(`requestPasswordReset`) behaves the same way for the same reason - a form that answers
differently is a tool for checking who a shop's clients are. Both a genuine send and a network
failure land on the identical "Check your email" screen; the mutation's own error is swallowed on
purpose. Tested directly (`reset-password.test.tsx`): the success case and the error case both
assert the same confirmation renders.

**The token-redemption screen is NOT built - the whole reset always finishes in the phone's
browser, never in the app.** Web's `SetPassword.jsx` (where the emailed link actually lands) is
deliberately not ported: the link is a plain web URL, and there is no mobile deep link registered
for it - the same gap already named for Square's OAuth callback in the Shops slice (DECISIONS.md
X24). Tapping the emailed link from the Mail app opens the phone's default browser regardless of
whether a native screen exists for it, so building one on mobile would be unreachable dead code
until a real deep link scheme exists. This screen's only job is sending the email; finishing the
reset is web's job, today, by design.

Only `requestPasswordReset` is ported to `packages/api` (`passwordReset.graphql`) - not
`inspectPasswordToken`/`setPasswordWithToken`, for the same reason.

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

### PR2. `npm install`/`npm ci` never runs directly against the connected-folder mount - only against a local mirror, synced back with a plain file copy

Discovered 2026-08-31/09-01 shipping X13's dependencies (`firebase`, `react-native-webview`,
`expo-image-picker`, `@react-native-community/datetimepicker`) onto the real device: `npm
install`/`npm ci` in the mounted project directory repeatedly failed with `ENOTEMPTY` on
`fs.rename()`, and not only for those new packages - eventually on packages already installed and
completely unrelated to this change (`caniuse-lite`, `esprima`, `jest-expo`, `@expo/fingerprint`,
`@radix-ui/*`). Root cause: npm's install strategy backs up an existing package directory by
renaming it to a hidden `.name-RANDOM` sibling before replacing it, and the connected-folder mount
(a FUSE bridge to the real filesystem, `stat -f`'s `fuseblk` type) does not reliably support an
atomic rename of a non-empty directory - not corruption, a genuine capability gap. Deleting the one
named directory and retrying made progress but never converged (adding one dependency touches the
hoisting/dedup of a large fraction of the whole tree), and repeated 178-second command-timeout
kills of a still-running install compounded it with real partial-write debris on top.

**Fix, and the pattern to reuse next time a mobile/API dependency needs to change:** run
`npm install` in a local mirror OUTSIDE the mounted folder (just the `package.json`s + lockfile,
`--ignore-scripts` since no source is present to run a workspace's own build script against), which
hits none of this - plain local disk, no FUSE, completes in ~2 minutes for the whole monorepo. Then
copy the resulting `node_modules` trees (root + every workspace with its own nested one) into the
mounted project with `rsync -a` run repeatedly until it reports no more work (each pass is a plain
create, never a rename-of-existing-content, so it never hits the same wall - just needs enough
178-second passes for ~1.5GB). **This still leaves `package-lock.json` stale**, since the copy
never touched it - it was updated separately here with `npm install --package-lock-only` (run
directly against the mount; a lockfile-only run never touches `node_modules` so the rename problem
never applies) and verified with `npm ci --dry-run` before committing. Skipping that step is
exactly what shipped once already and broke `npm ci` in CI - see the fix commit on
`feat/push-notifications` (`ea56888`) for what that looked like from the outside.

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

Nothing is blocking. A few things are parked rather than undecided:

- **Web's Projects/Search status column is silently blank** (see X20's own note) -
  `UtilsService.prettyConstantsListValue`'s uppercase `VALUE`/`LABEL` check never matches
  `PROJECT_STATUS`'s lowercase `value`/`label` entries. A real, low-risk web bug found while
  building mobile's own (correct) `projectStatusLabel`; left unfixed since it's outside this
  mobile-port work's own files, not because it isn't worth fixing.
- **The reference-image upload 400.** Parked at the user's direction until it recurs and a payload
  exists. `express.json()` was on Express's 100kb default and is now 2mb, but that is **not**
  confirmed as the cause and should not be recorded as the fix.
- **S2's uneven gates** are known work, not an open question. The rule is decided; the
  `withAuth(fn, SHOP_ADMIN)` call sites have not been moved onto it yet.
- **MSG3's group-thread gap.** `MESSAGE_RECEIVED` currently skips any conversation with more than
  one Artist member rather than picking one. Parked until group threads (a shop general inbox with
  multiple staff, say) actually exist in practice - no rule has been asked for yet.
