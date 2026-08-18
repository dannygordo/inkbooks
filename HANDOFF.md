# Where this project is

**Read this first, then `DECISIONS.md`.** This file is *state* — what is done, what is next, what
has not been verified. `DECISIONS.md` is *rules* — the settled calls and why. They change at
different rates, which is why they are separate files.

Last updated: 2026-08-16.

---

## Test status

The server suite is green — 781 tests across 52 files, run on a real machine (this environment
cannot reach `fastdl.mongodb.org` for `mongodb-memory-server`, so the integration half has to run
outside it). One real bug turned up on that run and is fixed: `redeemGiftCard` only called
`applyShopCut` inside the artist-issued branch, so a shop-issued redemption updated the card's
balance and wrote the M6 payout figure but never actually computed the session's own ordinary
`shopCutCents` at all. Fixed by always calling `applyShopCut` — see `server/graphql/resolvers/
giftCards.js` and the git history for the full account.

| Suite | Files | Tests | Status |
|---|---|---|---|
| `server` (unit + integration) | 52 | 781 | green, verified on a real machine |
| `client` | ~23 | — | see below — **not fully re-run end to end** |

**`test/integration/appointments.test.js` (pre-existing) was not re-run against the personal-
calendar changes above** — same sandbox limitation (`mongodb-memory-server` cannot download a
binary here). `node --check` confirms every touched server file parses, `check-graphql-documents.js`
confirms every appointment query/mutation still matches the schema, and a schema build via
`ApolloServer({ typeDefs, resolvers })` succeeds — but the actual privacy assertions (a shop admin
never sees another user's `isPersonal` appointment, `createAppointment` rejects `isPersonal` +
`shopId`/`projectId` combinations, `updateAppointment` refuses to flip `isPersonal`) are unverified
by the test suite itself. Worth a dedicated integration test file before trusting this in production,
not just a re-run of the existing one — nothing in `appointments.test.js` today exercises
`isPersonal` at all.

**Three new server integration files, added 2026-08-15, have never been run at all** —
`test/integration/adjustments.test.js`, `test/integration/clientFlags.test.js` (recordAdjustment/
Appointment.adjustments and raiseClientFlag/Client.flags/getClientFlagTypes), and
`test/integration/expenses.test.js` (the expense/income/recurring-expense feature — ownership
authorization, `generateDueRecurringExpenses`' catch-up/idempotency/endDate behaviour, and the three
new analytics figures — see Done below). This sandbox cannot reach `fastdl.mongodb.org` at all, so
unlike the client spot-checks elsewhere in this file, there was no way to execute these even once —
`node --check` confirms they parse and `check-graphql-documents.js` confirms every query/mutation
they send matches the schema, but the assertions themselves are unverified. Run them before trusting
the authorization logic they pin.

Green is the standing expectation now, not an achievement — treat a failure as a real regression
rather than as a test nobody had ever run.

**The client suite could not be run end to end in this sandbox.** `npm test` takes roughly five
minutes here, and every shell command in this environment is capped at well under that per
invocation — a foreground run times out, and a backgrounded one doesn't survive between commands.
What *is* verified from this environment, every round, without exception: all 7 pre-commit checks
(imports, GraphQL documents against the schema, React-in-tested-components, `moment.utc` in the
client, unstable React keys, session-scoped storage) and a full production `vite build`, both
clean throughout the theme/gift-card/pagination/inline-editing/search/reminders/login work below.
On top of that, every test file touched by this work was run directly and passes: `Login.test.jsx`
(rewritten this round) and a 13-file batch covering the calendar's `UpdateEventDialog` and every
`components/inputs/*` control (which is what the theme sweep touched most). Nothing in `client/src`
changed shape in a way the untouched test files would need to know about — same as the Aug 11 note
below, still true.

**Run it once, for real, before shipping anything:**

```
cd client && npm test
```

### 2026-08-16: personal-calendar test coverage push, and one real bug it found

Started against an explicit "as close to 100% coverage as possible by end of V1" goal — realistically
a multi-session effort at this codebase's size (client: ~88 components, ~28 pages, ~12 utils, ~25
services; server: ~32 models, ~50 utils, ~25 resolvers, ~16 mutations), so this round targeted the
personal-calendar feature specifically (2026-08-15's work, shipped with zero test coverage) plus a
handful of small, high-leverage server utils, rather than attempting the whole surface at once.

**Client: 7 new test files, 73 new tests, all run directly in this sandbox and passing** —
`utils/calendarFilters.test.js`, `components/appointments/AppointmentTypeChip.test.jsx`,
`components/appointments/MyCalendarsFilter.test.jsx`, `components/ibCalendar/Day.test.jsx`,
`components/ibCalendar/IBCalendar.test.jsx`, `components/appointments/AppointmentsList.test.jsx`,
`components/ibCalendar/AppointmentWizard.test.jsx`, and `components/analytics/DateRangePicker.test.jsx`
(8 files, not 7 — see below). Two pre-existing components needed an explicit `import React from
"react"` they'd never needed before (`Day.jsx`, `IBCalendar.jsx`) — see
`scripts/check-react-in-tested-components.mjs` for why Vitest's classic JSX runtime requires it, and
`CalendarContext` had to be exported from `context/calendar.jsx` (it previously wasn't) the same way
`AuthContext` already is, for tests to inject state directly.

**A real bug turned up and is fixed: `AppointmentWizard.jsx`'s multi-step form could leak a typed
value from one field into another.** Every step returned its own JSX with no `key`, so React
reconciled by tree shape rather than by which step this was — and two unrelated steps can have an
identical shape at the top (the client-email step's first field and the session/new-project intake
step's Project Title field are both the first plain `IBInput` under a `DialogContent`). React reused
the same uncontrolled `<input>` DOM node across the step change instead of mounting a fresh one, and
since `defaultValue` (not `value`) only applies on initial mount, whatever an artist had typed as a
client's email was still sitting in the DOM when they started typing a project title next — silently
prefixing it (`new.client@example.comBack piece`, reproduced exactly in the test that caught it).
Fixed by adding `key={step}` to each step's root element, forcing a real remount on every step change.
See `AppointmentWizard.jsx`'s own comment at the top of the `if (step === "type")` block for the full
account. This was caught by the test suite, not by manual testing — exactly the kind of thing a
coverage push is supposed to surface.

**Also fixed in passing:** `DateRangePicker.jsx` used the removed MUI v9 `InputLabelProps` prop
(logged "React does not recognize the `InputLabelProps` prop on a DOM element" the instant its custom
date fields rendered under test) — swapped for `slotProps.inputLabel`, the same migration
`IBInput.jsx`'s `inputProps` → `slotProps.htmlInput` already made for the same reason.

**Server: 4 new integration tests added to `appointments.test.js` (isPersonal exclusivity/
immutability/privacy) and 4 new pure-unit test files (`money.test.js`, `object-id.test.js`,
`errors.test.js`, `pagination.test.js`) — none of them have ever actually run, and importantly,
neither could any pre-existing file in `server/test/unit/` be re-verified either.** This is a new,
more precise finding than the standing "integration tests can't run here" note above: `vitest.config.js`
has ONE shared `globalSetup`/`setupFiles` pair for the whole server suite, unit and integration alike,
so `mongodb-memory-server`'s blocked download (`fastdl.mongodb.org` → 403, `X-Proxy-Error:
blocked-by-allowlist`) fails at `globalSetup` before a single test file is even collected — confirmed
by running the pre-existing, genuinely DB-free `test/unit/rate-limit.test.js` in isolation and watching
it fail on the same download, not just the new files. So "the server unit tests are DB-free" was true
of the code but not of this sandbox: every file under `server/test/` is currently unrunnable here,
full stop, not just the integration half. All 4 new server files were syntax-checked
(`node --check`) and the 4 new GraphQL documents pass `check-graphql-documents.js` (303/303 documents
in the repo now match the schema), but none of the assertions themselves are verified — same
convention as `adjustments.test.js`/`clientFlags.test.js`/`expenses.test.js` below, and each file's
own header comment says so explicitly. Run the whole server suite — old files included — on a real
machine before trusting any of it.

### Every failure so far has been in a test, never in the code

Worth knowing, because it should change how the next one is read — though the gift-card
`shopCutCents` bug above (2026-08-14) is the first exception: that run's one failure was real code,
not a fixture or a leaked rate limiter. The pattern below still held for every failure before it.
Across three integration runs:

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
- **A client pays the artist; the shop is paid afterwards, by the artist.** Two `SquareAccount`s and
  they are never interchangeable — the artist's own takes client money, the shop's receives cut
  invoices. `resolveArtistChargeAccount` never falls back to the shop. See `DECISIONS.md` M9,
  including the mistake it corrects.
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
- **S2 is implemented.** An independent artist can archive their own client and themselves.
  `hasAdminAuthority` in `utils/shop-membership.js`; two different fixes for two different
  underlying checks — see `DECISIONS.md` S2.
- **`npm run seed:large`** — four months of a working shop: six artists (five at the shop, one
  independent), ~275 projects, ~950 appointments, the full shop-cut lifecycle, effective-dated
  rates, a membership that closed and reopened, no-show flags. Money computed by
  `computeChargeBreakdown` and `applyShopCut` rather than by the script, so it cannot drift from
  M2/M3/M5/M8/M11. `npm run seed` is still the small readable fixture.

  **Square is seeded DISCONNECTED**, deliberately. No seed can produce working credentials, so a row
  claiming a connection is one the app cannot tell from the real thing until money is supposed to
  move. Taking a *new* payment needs a real Square sandbox seller connected through Settings first —
  Next item 1. The seeded appointments still carry the money a real charge would have written.
- **Every shop admin is an artist.** One shape, from `registerAccount`, the seed and the migration
  alike. See `DECISIONS.md` S0 — a shop owner is essentially always a tattoo artist, so a migrated
  admin appearing on the roster is correct rather than a compromise.
- **An independent artist can connect Square, end to end.** `getMySquareConnection`,
  `getMySquareAuthorizationUrl` and `disconnectMySquare`, with a panel in
  `components/settings/SquarePanel.jsx`. It renders for shop artists too and tells them the shop
  holds the connection, naming it — that is the only place in the product that answers "where does
  my money go".
- **Gift cards, end to end — M6's OPEN liability item is closed.** Issuer-locked design:
  artist-issued (`issuerType: 'ARTIST'`) is sold by one artist for that artist alone, cut at the
  sale like a deposit, and locked to them at redemption — refused outright against any other
  artist's session, not just hidden in the UI. Shop-issued (`'SHOP'`) is always sold by a shop
  admin into the shop's own ledger, needs no `Client` record at sale, and settles its
  shop-vs-artist liability at redemption via `(session_total × shop_rate) − gift_card_applied`
  (positive: artist owes shop; negative: shop owes artist). Both worked examples from `DECISIONS.md`
  M6 are pinned in `test/integration/giftCards.test.js`. `server/models/GiftCard.js`,
  `GiftCardRedemption.js`, `utils/gift-card.js`, `resolvers/giftCards.js`.
- **One coherent visual theme, light and dark.** `theme/tokens.css` — CSS custom properties keyed
  off a single `[data-theme]` attribute, read by both plain CSS and MUI's own `cssVariables` theme
  (`theme/theme.js`), so the two styling systems the client actually uses move together. Palette is
  copper, with a dark/brightened variant for dark mode paired with *dark*, not white, contrast text
  (light copper fails contrast against white outright). Per-user, DB-backed
  (`User.themePreference`, not local storage), settable from a new Appearance panel in Settings. The
  sweep to get every existing file onto the tokens took several passes as gaps kept surfacing in
  shapes a hex-literal sweep can't see on its own: the keyword `white`, `rgb()` literals, a
  component's own local CSS-variable indirection, and colour living in a JS object (`styled()`,
  inline `sx`) rather than in a stylesheet at all. The calendar and the login page were the two
  most recent finds of this kind — see their own commits/comments for specifics.
- **Every list has pages.** `EntityListPager` got a page-size selector; the dashboard's own
  Upcoming/Completed appointment lists (`ArtistPerformancePanel`) were hard-capped at 5 rows with
  no way to see a 6th even though the underlying query already returned `pageInfo` — now paged for
  real, independently per list. A client's own dashboard lists (Projects/Appointments/Notes) are
  paged client-side, since those fields have no `page` args on the resolver side yet (a schema
  change, not done here).
- **The corner "Edit" button's replacement got built.** It was removed with nothing standing in
  for it — Client/Artist/Staff/Shop each had a route to a dedicated edit page and no way to reach
  it. Replaced with inline autosave-on-blur editing directly on each detail page (same pattern
  `Project.jsx`'s own Details panel already used), and the four now-dead `EditX.jsx` pages/routes
  are deleted rather than left as an unreachable second implementation.
- **A dashboard for Staff and Shop Admin logins**, which had shown nothing but a bare greeting
  until now — `ShopAnalyticsPanel`, money hidden below Shop Admin (the server returns `null` for
  every currency field for Staff, this is presentation on top of that, not the boundary).
- **An activity log.** `EventLog` + `recordEvent`, wired into every money-moving mutation
  (appointments, deposits, clients, shop-cut payments, the Square payment route, gift cards), with
  a viewer panel in Settings.
- **Global search**, first as an AppBar dropdown (`GlobalSearch.jsx`) and then a full results page
  once the dropdown's five-per-type cap stopped being enough for a shop with real history. Text
  indexes on Client/Project/Message; `getGlobalSearch` resolver, capped and shop-scoped.
- **SMS session reminders**, via Twilio — `utils/reminders.js`/`sms.js`, a scheduler job, and a
  per-client opt-out panel.
- **Settings rebuilt from one flat page into categorized panels** (`settingsCategories.jsx`) so
  Appearance/Reminders/Activity Log had somewhere sane to live rather than getting bolted onto the
  end of an already-long page.
- **The login page matches the rest of the app.** It predated `IBInput`/`FormField`/
  `IBCardWrapper`/the themed MUI `Button` entirely and was still on plain `<input>`/`<button>` tags
  styled by `App.css`'s generic element rules — different input height, different border-radius,
  and a submit button with no background colour of its own (one was written, then commented out,
  so it fell through to the unthemed global default). Rebuilt on the same shared components
  everything else now uses.
- **The shop cut percentage has one editor, not two.** `ShopPanel` on `/settings` is now the only
  place it's writable; `/shop/:shopId` shows it read-only with a link back to Settings. Found and
  fixed in the same pass: `ShopPanel`'s "Edit shop details" link pointed at `/shop/edit/:shopId`, a
  route deleted when the corner-Edit-button work replaced it with inline editing on `/shop/:shopId`
  itself — a dead link on every shop admin's Settings page until now.
- **A client's own Projects and Appointments lists are real paged connections, server-side.**
  `Client.projects`/`Client.appointments` take `page: PageInput` and return a `ProjectPage`/
  `AppointmentPage` now, same shape as every other directory in the app (`utils/pagination.js`).
  The one thing this could have silently broken: `ClientDashboard.jsx`'s stat cards (Total spent,
  Total tipped, Average tip, Projects, Upcoming) used to be summed client-side from the full
  arrays — paginating those arrays without changing anything else would have made every stat card
  reflect only whatever page happened to be on screen. Fixed by adding `Client.stats`, a separate
  field that aggregates the client's FULL history in Mongo regardless of either list's page, the
  same figures-separate-from-lists split `ArtistPerformancePanel`/`utils/analytics.js` already
  established. Notes stayed client-side-paged — see Known gaps below for why.
- **Adjustment records — `DECISIONS.md` M4.** New `Adjustment` model: `appointmentId`, `shopId`
  (null for an independent artist), `artistUserId`, a positive-magnitude `amountCents`, a required
  `reason`, `createdByUserId`, `createdAt`. Exposed as `Appointment.adjustments` (resolved on
  demand, newest first) plus a `recordAdjustment` mutation, both in `resolvers/adjustments.js`.
  Deliberately NOT a rewrite of anything: recording one never touches the appointment's own
  `totalCents`/`tipCents`/`shopCutCents`, and nothing calls Square's refund API — the real reversal
  already happened by hand in the Square app, and this is only the documented record of it, exactly
  as M4 describes. Authorization reuses `canManageArtist`/`assertCanManageArtist`
  (`utils/shop-membership.js`) at its default floor rather than writing a second version of the
  rule — the artist themselves always passes for their own appointments, and otherwise only a shop
  admin who shares a shop with that artist does, which **is** "shop-admin only where there is a
  shop; an unaffiliated artist adjusts their own." UI: a new Adjustments section on the session
  detail view (`SessionDetail.jsx`) — a list of what's recorded plus an amount/reason form. Pinned
  by `test/integration/adjustments.test.js` (independent artist on their own; a shop admin at the
  artist's own shop; refused for an unrelated artist and for a different shop's admin; a zero
  amount and an empty reason both refused; the appointment's own totals unchanged after two
  adjustments) — **not yet run**, see Test status above.
- **GraphQL surface for client flags.** `utils/client-flags.js`'s business logic (raise/resolve/
  recount, all pre-existing) had no API surface at all before this — only the automatic
  `NO_SHOWED` path, wired internally into an appointment's status changing, was reachable. Added:
  `Client.flags` (live/unresolved only, newest first), `getClientFlagTypes(shopId)` for a manual-
  flag picker (platform-wide types, plus a shop's own when a shopId is passed and the caller
  belongs there), and `raiseClientFlag` wrapping the existing util with `systemGenerated: false`
  always — the automatic path is still the only way a `systemGenerated` type like `NO_SHOWED` gets
  written; this mutation refuses one typed in by hand, same as the util already did internally.
  Authorization mirrors `updateClientNotes` exactly, including its self-check: a client cannot
  raise a flag about themselves, and `assertCanAccessClient` gates everyone else, because a flag is
  the same kind of thing as a note (a candid internal record about someone's conduct) and never
  client-visible — see `models/ClientFlag.js`'s own comment. UI: a Flags panel on
  `ClientDashboard.jsx`, shop-side only (same `!isSelf` gate the Notes panel already uses) — a type
  picker, an optional note, and the existing list. **No resolve-by-id mutation exists yet** — the
  only way to resolve a flag today is still the automatic one wired into an appointment's status
  changing; a manually-raised flag has no UI path to mark resolved. Stated here rather than
  silently missing — see Known gaps below. Pinned by `test/integration/clientFlags.test.js` — **not
  yet run**, see Test status above.
- **Expense/income tracking, recurring expenses, and a financial dashboard widget.** Five new
  collections (`ExpenseType`, `IncomeType`, `Expense`, `Income`, `RecurringExpense`), all sharing
  one ownership shape: every row carries exactly one of `shopId`/`artistUserId`, never both, never
  neither — a shop's own books (shop admin only) or a personal ledger under an artist's own user id
  (an independent artist, or a shop-affiliated artist's own tracking kept separate from the shop's —
  see `utils/shop-membership.js`'s header comment on `resolveBusinessOwner`/
  `assertCanManageBusinessRecord` for the full design, including why this deliberately differs from
  how `Appointment.shopId` resolves through membership). A shop-connected plain artist or Staff
  member has no UI surface for any of this — `settingsCategories.jsx`'s `hasAuditAuthority` and the
  matching gates on `/expenses`, `/income`, and both sidebar entries all restrict it to shop-admin-or-
  better or an independent artist with no shop — but the server itself is more permissive than the
  UI exposes (any authenticated user gets a personal `artistUserId` scope when `shopId` is omitted);
  that gap between what the server allows and what the UI shows is deliberate, the same
  presentation-vs-boundary split this codebase uses everywhere else, not a bug.

  **Recurring expenses auto-generate real entries.** A `RecurringExpense` is a template; the
  scheduled job (`utils/recurring-expenses.js`'s `generateDueRecurringExpenses`, registered hourly
  in `utils/business-jobs.js` alongside the existing notification jobs) writes real `Expense` rows
  as each occurrence comes due, catching up **every** missed occurrence in one run (capped at 60 per
  template per run) rather than jumping straight to "now" — a missed month of rent is still a real
  historical fact. Idempotent via a partial unique index on `Expense{recurringExpenseId, date}`, not
  just in-memory locking. Editing or deleting a generated `Expense` only touches that one row; the
  template and every other occurrence are untouched.

  **Dashboard figures**: three new `Analytics` fields — `expensesCents`, `otherIncomeCents`,
  `netCents` (= tattoo revenue + other income − expenses) — computed in `utils/analytics.js`
  alongside the existing revenue/shop-cut/deposit figures, Staff-masked the same way every other
  money field is (added to `MONEY_FIELDS` in `resolvers/analytics.js`). Shown as three new
  `StatCard`s on `ArtistPerformancePanel`, in **both** branches per the explicit answer to "shop-wide
  for admins, personal for artists" — the shop-wide view sums the whole shop's books; every artist's
  own view (including a shop-connected artist's) shows their own personal ledger, which reads as an
  honest `$0.00` for anyone who's never used the feature rather than being hidden.

  UI: separate `/expenses` and `/income` pages (ledger list, date-range filtered via the same
  `DateRangePicker` the dashboard uses, inline edit/delete, an add-entry form, each with its own
  sidebar link), and two separate Settings categories — "Expenses" (`ExpenseTypesPanel` +
  `RecurringExpensesPanel`) and "Income" (`IncomeTypesPanel`). Originally shipped as one combined
  "Expenses & Income" nav entry/category/page pair; split into two on request the same day so a shop
  tracking only one side of the ledger isn't stuck landing on the other one first. Pinned by
  `test/integration/expenses.test.js` — **not yet run**, see Test status above.
- **`DateRangePicker` (shared by both dashboards and the Appointments list) still had two
  hardcoded-gray leftovers from before the copper theme sweep.** Its selected-preset button, the
  "Custom" toggle button, and the "Apply" button all set `sx={{ backgroundColor: "#333" }}` directly
  - a flat gray that never got swept, so those three buttons (and their hover states, which MUI
  computes off a button's actual theme colour, not off a raw `sx` override) never matched the rest
  of the app. Fixed by removing the overrides entirely - `variant="contained"` with no `color` prop
  already resolves to `theme.palette.primary` (the copper), same as every other themed button (see
  `ibCalendar/CreateEventButton.jsx`'s own comment on the same pattern). The "Custom" date-range
  form's container also had a hardcoded `background-color: #fafafa` that didn't flip for dark mode
  at all - swapped for `var(--ib-surface-subtle)`.
- **A personal calendar, private even from shop admins.** `Appointment.isPersonal` (default
  `false`) — mutually exclusive with `shopId`/`projectId` by construction (`createAppointment`
  rejects a personal appointment carrying either, and forces `userId` to the caller regardless of
  what's sent, so nobody can attribute a "private" appointment to someone else) and immutable after
  creation (`updateAppointment` refuses any attempt to flip it either direction — personal-to-shop
  would surface a previously-private appointment to an admin who never knew it existed; shop-to-
  personal would let a real, financially-real appointment vanish from the shop's ledger). Enforced
  at the query layer with a belt-and-suspenders pattern: `getAppointmentsByShop` excludes
  `isPersonal` explicitly even though a personal appointment can never carry that shop's id anyway;
  `getAppointmentsByArtist` forces the same exclusion whenever the caller isn't the artist being
  asked about (a shop admin/staff member browsing someone else's schedule), regardless of what
  `filter.isPersonal` they send; `getAppointment` denies outright before falling back to any
  shop-membership check. See `server/graphql/resolvers/appointments.js` and `mutations/
  appointments.js`.

  **Personal entries are a simple quick-entry form, not the full client-intake pipeline — and have
  no Consult/Session question at all.** `AppointmentWizard.jsx`'s "Other" type button is gone — a
  SHOP appointment now only offers Consult or Session, per request — and a new "Calendar" dropdown
  (Shop/Personal, defaults Shop, shown on every account including an independent artist's) sits
  above that choice. Picking Personal replaces the "what are you scheduling?" prompt and its two
  buttons with a single Continue button, since neither Consult nor Session means anything for a
  private entry ("dentist," "kid's recital") — Continue goes straight to a flat title/description/
  date form (the old "Other" form's shape, repurposed) that calls `createAppointment` directly with
  `isPersonal: true`, `appointmentType: 'other'` (an internal storage bucket only — never shown; see
  next paragraph) and no `shopId`/`projectId`. Deliberate scope decision on the intake side: routing
  a private calendar entry through the real client-intake pipeline would create Client/Project
  records and could send real confirmation emails for something that was never a booking — see that
  file's own header comment for the full reasoning.

  **UI**: a "My Calendars" checkbox section (`MyCalendarsFilter.jsx`, state shared via
  `context/calendar.jsx`'s `calendarFilters` so List view and Calendar view — two separate component
  trees, mounted one at a time — don't each keep their own copy that resets on toggle) filters both
  `AppointmentsList.jsx` and `IBCalendar.jsx`; both now additionally fetch this user's own
  `isPersonal: true` appointments (via `getAppointmentsByArtist`, reusing the existing calendar
  query with an extra filter) and merge them with the shop's own feed when shop-connected — an
  independent artist's existing self-query already returns everything they own, personal or not, so
  no second fetch runs for that case. Filtering itself (`utils/calendarFilters.js`) happens
  client-side over an already-safe result set — a display preference layered on top of the real
  privacy boundary above, not the boundary itself. In the list, a personal appointment's chip reads
  "Personal" (not the underlying `appointmentType`) and renders outlined in the owner's own
  `tagColor` with a transparent fill instead of the type's usual solid colour and label
  (`AppointmentTypeChip.jsx`'s `personal` prop) — a click on one opens the same quick-edit dialog
  the calendar already uses (`UpdateEventDialog.jsx`) instead of navigating to a Consult/Project
  page that doesn't exist for it; that dialog also hides its now-meaningless read-only Type/Project
  rows for a personal appointment, showing only Calendar: Personal. The calendar's own month-grid
  chip (`Day.jsx`'s `.ibCalendarEventChip`) gets the same outline-not-fill treatment for a personal
  appointment — border in the owner's `tagColor`, transparent background — rather than the solid
  tagColor fill every shop event gets; its text switches from the filled chip's fixed white to
  `var(--ib-text-primary)` since a transparent chip sits directly on the app's own background and
  has to track the current light/dark appearance setting instead of assuming a dark fill is always
  behind it. `ProjectSessionsList.jsx`'s "Add Session" and
  `BookSessionDatesForm.jsx` were deliberately left untouched — both always create a shop-attributed
  session and were never given a Calendar choice, per the explicit ask that "Add Session" always
  stays a shop appointment.
- **A forms builder — consent forms, waivers, custom intake, entirely separate from Booking
  Requests.** Scoped from four clarifying-question answers up front: (1) `BookingRequest`'s own
  client-lookup → intake → convert-to-appointment pipeline is untouched — this is a second,
  independent feature for consent/waiver/custom-intake, not a replacement; (2) ownership is shop
  admins and independent artists only, reusing the exact `shopId`/`artistUserId` XOR shape and the
  exact `resolveBusinessOwner`/`assertCanManageBusinessRecord` helpers Expense/Income already use
  (`server/utils/shop-membership.js`) — a plain shop-connected artist or Staff member manages
  neither a shop's forms nor has an independent set of their own, same floor as Expenses/Income/
  Security/Taxes/Analytics; (3) V1 field types are short answer, paragraph, single choice, multi
  choice, date, file upload, and a TYPED signature (full legal name + a server-set timestamp) — NOT
  a drawn/canvas signature pad, which is a deliberately separate, deferred future effort (see Known
  gaps below); (4) a submitted response can be tied to an existing Client (self-service, or staff
  entering it on a client's behalf) OR be a public/guest submission, chosen per-form via a boolean
  `allowGuestSubmissions` flag rather than a hard per-form requirement — an authenticated staff
  member can always submit on behalf of any client they can access regardless of that flag; the
  flag only gates the unauthenticated path.

  **Server** (`server/models/Form.js`, `server/models/FormResponse.js`, `server/graphql/
  resolvers/forms.js`). `Form.fields` is an embedded array, not a separate collection — each field
  carries a stable `key` (default `crypto.randomUUID()`, independent of array position or label) so
  editing, reordering, or relabeling a form's fields never orphans a response's
  `answers[].fieldKey`. `FormResponse.fieldsSnapshot` is a full, deliberately DUPLICATED copy (not a
  live reference, not an import) of `Form.fields` as they existed at submission time — the
  load-bearing decision for a waiver specifically: what someone agreed to is whatever the form said
  the day they signed it, and every answer is resolved against this snapshot, never against the
  live `Form`, so a later edit to a question's wording or options can never retroactively change
  what an already-submitted response is interpreted as having asked. `FormResponse` also carries its
  own denormalized `shopId`/`artistUserId` copied from the `Form` at submission time, mirroring
  `Expense` rows, so authorization never has to join back through `formId`. Required-field
  enforcement is server-side and authoritative (`assertAnswersMatchFields` in `resolvers/forms.js`)
  — a required field with no real answer, an answer citing an unknown option, or an answer for a
  `fieldKey` not on the form are all rejected with per-field messages, never left to client
  validation alone; that function and three siblings are exported via a `_internal` object
  specifically so they're unit-testable without a DB, a pattern introduced here because this
  sandbox cannot run `mongodb-memory-server`-backed tests (see Test status above).

  Submission has three paths, resolved in `submitFormResponse`: guest (unauthenticated, resolved
  ONLY by `publicToken` — a random 24-byte hex string proof of holding the real shareable link,
  never by `formId` alone, since a Mongo ObjectId is comparatively guessable — running through the
  same `findOrCreateGuestClient` `createBookingRequest` already uses), staff-entered (authenticated
  caller supplies `clientId`; requires BOTH `assertCanManageBusinessRecord` on the form's own scope
  AND `assertCanAccessClient` on that specific client), and self-service (authenticated caller, no
  `clientId` — resolves their own `Client` record). `status`/`allowGuestSubmissions` are
  deliberately NOT part of the generic update input — `publishForm`/`archiveForm`/
  `setFormGuestAccess` are separate explicit mutations, matching the shop-cut-payments/adjustment-
  record convention that a state change shouldn't be silently bundled into a title edit.
  `publicToken` is minted once, the first time guest access turns on, and never regenerated, so
  toggling it off and back on doesn't invalidate a link already handed out. `deleteForm` refuses
  outright once any `FormResponse` references the form (archive instead) — same "refuse rather than
  silently destroy a legal record" rule `deleteAppointment` already follows. `PublicForm` is a
  separate, stripped-down GraphQL type (no `shopId`/`artistUserId`/`status`/`createdByUserId`/
  `publicToken`) so an unauthenticated stranger holding a link can never read a shop's internal
  identity data even by accident. File-upload fields go through a plain REST route
  (`server/routes/formUploads.js`, `POST /form-uploads`) mirroring `/booking-uploads` exactly —
  multer memory storage, a jpeg/png/webp/gif allowlist, its own rate limit — reusing a newly
  generalized `uploadPublicFile(buffer, {extension, folder})` in `utils/firebase-admin.js` that both
  this and `uploadGuestReferenceImage` now call.

  **Client** (`client/src/services/FormService.js`, `client/src/pages/forms/*`, `client/src/
  components/forms/*`). `FormService.js` follows `ExpenseService.js`'s exact IIFE shape — one
  caveat worth naming: its field-shape strings are kept fully self-contained rather than
  interpolating one bare `const` inside another, because `server/scripts/check-graphql-
  documents.js` only resolves one level of `${name}` splicing for untagged literals — a nested
  reference silently produced an empty, invalid selection set the first time this was tried; the
  fix was duplicating the six-line field shape in three places rather than chasing a second level of
  substitution the checker was never built to do. `pages/forms/Forms.jsx` is the management list
  (draft/published/archived filter, publish/archive/duplicate/delete, turn the public link on/off
  and copy it) — scoped and gated exactly like `pages/expenses/Expenses.jsx`
  (`RoleRoute minRole={ROLES.SHOP_ADMIN} allowIf={(user) => !hasShop(user)}`), reachable from its own
  sidebar entry and from Settings > Forms (`components/settings/FormsPanel.jsx`, a thin link out —
  unlike `ExpenseTypesPanel`, a form's fields are too much to build inline in a settings panel).
  Settings' "Forms" category gate was tightened from `isArtist` to the same `hasAuditAuthority` every
  other business-record category uses, to match the server's real ownership floor. There is no
  "create an empty form" — `createFormInputSchema` requires at least one field — so "New Form"
  hands off to `pages/forms/FormBuilder.jsx` at `/forms/new`, one component that covers both
  not-yet-created (local-only state until Save calls `createForm`) and editing-in-place
  (`updateForm`), with add/remove/reorder(up-down)/type-picker/required-toggle/choice-option editing
  and, once the form is real, inline publish/archive/guest-link controls. `components/forms/
  FormFieldsRenderer.jsx` is the one dynamic-field renderer shared by both fill-out paths — an
  `answers` map keyed by `fieldKey`, owned by the caller, matching `FormAnswerInput`'s shape exactly
  so it can be submitted with no reshaping; file fields upload straight to `/form-uploads` before
  the field's value is set. `components/forms/FormFillOut.jsx` is the authenticated path (mounted in
  the app's existing global modal — see `IBModal.jsx` — from a new "Forms" section on
  `ClientDashboard.jsx`, staff/artist view only, listing that viewer's own published forms with a
  "Fill Out" button that submits with `clientId` set); self-service fill-out from a client's own
  account isn't wired up yet (see Known gaps). `pages/forms/PublicFormFillOut.jsx` is the guest path
  at the new unauthenticated route `/form/:publicToken` — same shape as `pages/booking/
  BookingRequest.jsx` (no `AuthRoute` wrapper, resolved through `getPublicForm`, collects
  name/email/phone for the same `findOrCreateGuestClient`). `pages/forms/FormResponses.jsx` shows a
  form's paginated response list (each answer rendered against ITS OWN `fieldsSnapshot`, never the
  live form) plus a `getFormAnalytics`-driven per-field breakdown with option-count bars.

  Verified via a full `vite build`, `server/scripts/check-graphql-documents.js` (316 documents,
  zero mismatches), and the complete pre-commit hook (import resolution, React-in-tested-components,
  no `moment.utc()`, no clock/random-derived React keys, no cross-session client storage) — all
  clean. The full client `vitest` suite times out in this sandbox before finishing (a pre-existing
  environment constraint, not something this change caused — a targeted subset covering the touched
  areas passed); see Test status above for the same limitation on the server side.

## Next

0. **Run both suites on a real machine, then the shop-admin migration.** Neither suite completes in
   every environment: the server integration half needs a route to `fastdl.mongodb.org` for
   `mongodb-memory-server`, and the full client suite needs roughly five minutes of wall time that
   at least one CI-style sandbox in use on this project cannot give a single command. Then
   `node scripts/migrate-shop-admins-to-artists.js --dry-run` first. Until it runs, a `STAFF`-typed
   shop admin still has no Settings page — which is how this was found. See `DECISIONS.md` S0 for
   what the migration costs.

1. **Take one real payment end to end.** Nothing in the charge path has ever touched Square. It was
   built against their published REST docs, and `utils/square.js` has said so at the top since it
   was written. The sequence: run `scripts/migrate-square-accounts.js`, connect a Square **sandbox**
   seller through the OAuth flow, set a tax rate and offset in Settings, then charge a session and a
   deposit and confirm the figures in Square's dashboard match what InkBooks recorded. Everything
   below is built on arithmetic that has only ever been checked against itself.

   **Launch the sandbox seller first.** Square's authorize page refuses with *"To start the OAuth
   flow for a sandbox account, first launch the seller test account from the Developer Console"* —
   open the test account from developer.squareup.com/apps → your app → Sandbox → Test accounts, and
   leave that session active. The error comes from Square's own hosted page, so InkBooks never sees
   it and cannot explain it for you.

   **Any account connected before 2026-08-11 must disconnect and reconnect.** `PAYMENTS_WRITE` was
   added to the requested scopes only once client charges moved onto the artist's own connection —
   before that the list was written for the Invoices-only flow. Scopes are granted at authorization
   and a refresh returns the original set, so there is no way to gain one without reconnecting. A
   charge on such a token fails with a message saying exactly that.

   **Verified against a real sandbox seller on 2026-08-11, as far as the Payments call.**
   Authorization URL → consent → token exchange → encrypted storage → decrypt → `POST /v2/payments`
   all ran against Square rather than against its documentation. The charge was refused for the
   missing scope — which is granted at authorization, so the refusal itself proves the handshake
   completed and the stored token was genuinely usable.

   **Still unverified:** a payment that succeeds, and everything downstream — `createShopCutInvoice`,
   publishing it, and the webhook flipping an appointment to `paid`.
2. **Drop the old `Shop` Square fields.** Once the migration has run and a charge has worked, delete
   the seven now-unread `square*` fields from stored shop documents. Deliberately left in place for
   one deploy — see M9.

Gift cards, adjustment records, and the client-flags GraphQL surface (previously items 3/4 here)
are all done — see Done above. What's actually left before this app could take real money is items
1 (a real Square payment) and 0 (the two suites, then the migration) — there is no other queued
feature work right now. A resolve-by-id mutation for a manually-raised client flag is a real,
stated gap (see Known gaps) but nobody has asked for it yet; worth raising as a candidate next item
when there's nothing higher-priority queued.

## Known gaps, not bugs

- **Every existing shop and artist has a tax rate of 0.** Not a migration oversight — there was no
  way to set one until now, so every row is genuinely unconfigured. Any charge taken before someone
  visits Settings collects no sales tax, and the panel says so on screen rather than leaving it to
  be noticed from a receipt. Worth setting for every real shop before the charge path goes live.
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
- **The full client test suite has not been run end to end since 2026-08-11**, and could not be
  from the environment that did this round of work — see Test status above for why. Every file the
  work actually touched was spot-checked and passes; the untouched majority is unobserved, not
  failing. Run `cd client && npm test` on a real machine before trusting it either way.
- **A client's own Notes list on their dashboard pages by slicing an array client-side**, not a
  paged query — deliberately, since notes are embedded sub-documents on `Client`, not a separate
  collection `paginate()` can query with its own skip/limit. Projects and Appointments are NOT in
  this gap any more (see Done below) — this is now the one remaining list on that page that isn't
  a real server-paged connection, and it's also the smallest of the three in practice.
- **A manually-raised client flag has no resolve path.** `resolveClientFlagsForAppointment` only
  resolves by `appointmentId` + `typeKey`, which is what the automatic `NO_SHOWED` path needs and
  all it was built for — there's no "resolve this one row by its own id" function, so there's
  nothing for a `resolveClientFlag` mutation to wrap yet. A manually-raised flag (e.g.
  `MOVED_APPOINTMENT`) is permanent on today's UI once written. Genuine gap, not an oversight in
  the GraphQL layer added 2026-08-15 — the read/raise surface is what was asked for.
- **`adjustments.test.js`, `clientFlags.test.js`, and `expenses.test.js` (added 2026-08-15) have
  never actually run** — see Test status above. They parse and their GraphQL documents check out
  against the schema, but nothing has executed the assertions inside them yet.
- **The 2026-08-16 `isPersonal` additions to `appointments.test.js`, and all 4 new
  `server/test/unit/*.test.js` files (`money`, `object-id`, `errors`, `pagination`), have never
  actually run either** — see Test status above for why this now includes even the pure, DB-free
  unit tests, not just integration files. Test coverage remains a stated, explicit, multi-session V1
  goal (client is close to caught up for the personal-calendar feature; server utils/resolvers/
  mutations are largely still unaudited for gaps) — continue from the client's
  `ibCalendar`/`appointments` components not yet covered (`AppointmentSlotPicker`, `DaySchedule`,
  `DurationPicker`, `CalendarHeader`, `Month`, `ViewEventDialog`) and from auditing the remaining
  ~46 `server/utils/*.js` files against the 14 that now have unit tests.
- **A shop-connected plain artist's personal expense/income ledger has no UI**, even though the
  server permits it (`resolveBusinessOwner` scopes to the caller's own `artistUserId` whenever
  `shopId` is omitted, for any authenticated user — see `utils/shop-membership.js`'s header comment).
  `settingsCategories.jsx`, the `/expenses`/`/income` routes, and both sidebar entries all gate on
  shop-admin-or-better-or-no-shop, matching the explicit "Both shop admins and independent artists"
  scope this feature was built for. Reachable today only by calling the mutations directly (e.g. via
  a GraphQL client) — deliberate scope, not a bug, but worth knowing before assuming "no UI" means
  "no data can exist there."
- **`ExpenseType`/`IncomeType` have no delete, only deactivate** — matching `ClientFlagType`'s own
  pattern (see the answer to "where do the flag types get managed?" earlier this session: seeded
  defaults, no admin UI to add/edit those either). A category already referenced by an `Expense`/
  `Income` row can't disappear out from under it; deactivating removes it from new-entry pickers
  without orphaning history.
- **The Forms feature's `signature` field type is a TYPED signature only — full legal name typed in
  plus a server-set timestamp — not a drawn/canvas signature pad.** This was an explicit V1 scope
  decision, not an oversight: a drawn pad is a materially bigger UI (canvas capture, touch/mouse
  input handling, storing an image rather than a string) and was called out as a deliberately
  separate, deferred future effort at design time. Treat today's signature field as "meaningful
  e-signature consent," not as strong biometric proof of identity, when deciding what a shop can
  rely on it for.
- **Self-service form fill-out (a client filling out their own copy of a form from their own
  account) has no UI yet.** `submitFormResponse`'s self-service path — an authenticated caller with
  no `clientId`, resolving their own `Client` record — is fully built and works today via any
  GraphQL client; `FormFillOut.jsx` supports it (it's just `clientId` omitted). What's missing is a
  surface: `ClientDashboard.jsx`'s new "Forms" section only renders on the staff/artist view
  (`!isSelf`), gated there because it fetches forms via `businessScopeFor(user)`, which resolves to
  the LOGGED-IN staff/artist's own scope — nonsensical for a client, who has no shop/artist scope of
  their own to look forms up by. Building this needs a different lookup (which shop/artist actually
  owns forms this specific client should see), which wasn't scoped for this pass.
- **`getFormAnalytics`'s per-field breakdown reads the LIVE `Form.fields`, not each response's own
  `fieldsSnapshot`.** A question that's since been deleted from the form won't get its own analytics
  row even though old responses still hold that answer — visible in the raw response list
  (`FormResponses.jsx`, which does read each response's own snapshot) but not summarized. Deliberate
  scope cut for V1 (see `resolvers/forms.js`'s own comment), not a bug.
- **"Duplicate" on the Forms management list is client-side only** — `Forms.jsx`'s `handleDuplicate`
  calls `createForm` with the source form's own fields (keys stripped, so the copy gets fresh stable
  keys of its own), there is no server `duplicateForm` mutation. Functionally complete, just worth
  knowing where the logic actually lives if it ever needs to move server-side.
- **No drag-and-drop field reordering in the form builder** — `FormBuilder.jsx` uses plain up/down
  buttons (`moveField`), because nothing in this codebase already has a drag-reorder pattern to
  reuse and none of `react-beautiful-dnd`/`dnd-kit`/`react-dnd` is an existing dependency. Adding one
  of those is a reasonable follow-up if a form ever has enough fields for up/down clicking to be
  tedious.
- **The Forms client code has no automated tests yet** (no `FormBuilder.test.jsx`,
  `FormFillOut.test.jsx`, etc.), and the full client `vitest` suite could not be run end-to-end in
  the sandbox that built it (times out before finishing — see Test status above). Verified instead
  via a production `vite build`, `check-graphql-documents.js` (316 documents, clean), the complete
  pre-commit hook, and a targeted `vitest` run over files actually touched. Continuing the testing
  initiative (see the `isPersonal`/unit-test gaps above) into this feature is real, queued work.

## How this repo carries context

Sessions end; the repo does not. Three places, on purpose:

- **`DECISIONS.md`** — the rule and why, including the rejected alternative.
- **Commit messages** — why a specific change was made, and what was verified versus written.
- **Code comments** — why *this* line is the way it is, usually naming the bug that caused it.

A new session should be able to start from these alone. If something important lives only in a chat,
it is not written down.
