# InkBooks — Notification System Design

Agreed August 5, 2026. Status: design settled, not yet implemented (except message
notifications, which shipped ahead of this and are described in "What already exists").

This document exists because notification systems fail in a specific, predictable way: they get
built one `sendEmail` call at a time, each one obviously correct on its own, until the product
sends forty emails a week and people filter it to a folder. At that point the system has negative
value — it costs sending reputation and trains users to ignore the one message that mattered.

Everything below is in service of one goal: **every notification that fires should be one somebody
is glad to have received.**

---

## 1. The rule

A notification is justified only when **all three** of these hold:

1. **You didn't cause it.** An artist taking a deposit does not need to be told a deposit was
   taken. This single test removes roughly half of any naive notification list, and it is the same
   rule already enforced in unread message counts — your own messages never count against your own
   badge (see `server/utils/conversation-reads.js`).

2. **You wouldn't otherwise see it.** If it happens on the screen the person is looking at, it
   isn't news. This is why the message email is throttled and skipped for someone actively reading
   the thread.

3. **It changes what you do, or what you decide.** If it changes neither, it belongs in a log, not
   an inbox.

Test 3 is the one that gets skipped, and it is the one that matters most. "Artist updated their
bio" passes tests 1 and 2 and is still noise, because nobody acts differently for knowing it. Most
bad notification systems are systems that only ever applied test 1.

**Corollary — the actor is never a recipient.** This is what makes the shop/artist split fall out
naturally rather than needing to be hand-maintained: the same event notifies different people
depending on who performed it. A deposit collected by Maya notifies the shop admin, not Maya. A
shop cut invoice issued by the shop admin notifies the artist, not the admin.

---

## 2. Stored or derived — the central architectural decision

**Store events. Derive conditions. Never the other way round.**

Two different things get called "a notification", and conflating them is the most expensive mistake
available here.

### Events — store these

A fact about a moment in time. *"$200 deposit collected on the Chen consult, Tuesday 2:14pm."*

- Immutable. It happened; it will always have happened.
- Not cheaply re-derivable — reconstructing "what happened and when" from current state is either
  impossible or an expensive scan.
- There is no other record that the person was told.
- Money events additionally need an audit trail: "did we tell the shop about that payment?" is a
  real question.

### Conditions — derive these, always

A statement that something is currently true. *"3 booking requests unanswered."* *"Shop cut
overdue."* *"Deposit collected but never applied."*

These are `WHERE` clauses over data that already exists. Storing them creates a second record of a
fact that already has a home, and the two drift — the stored notification still says "unanswered"
after the request has been answered, and now reconciliation logic is needed to un-say it.

This is not a hypothetical risk in this codebase. It is the single most repeated bug here:

| Stored copy | Actual truth | What it cost |
|---|---|---|
| `Artist.shopId` | `ArtistShopConnection` | Sessions written with no shop: no shop cut, no revenue, nothing erroring |
| `Project.depositAmount` | the appointment holding the money | Three UI surfaces reporting "None taken" about money that existed |
| Square app id in `client/src/config.js` | server env | Every card charge rejected |
| `User.username` | `User.email` | Invited artists locked out of accounts they had passwords for |

A stored "unanswered request" notification is that same bug wearing a new hat. Derived conditions
cannot drift, because there is nothing to drift from.

### Two pieces of state per stored notification

**Read** (I have seen this) and **done** (this is handled) are different, and they diverge
constantly. Reading "shop cut invoice issued" is not paying it. Linear gets this right; most
inboxes don't, and the result is an inbox people archive wholesale because read-state is the only
tool they have.

Derived conditions have no read state at all — they disappear when they stop being true, which is
the correct behaviour and requires no bookkeeping.

---

## 3. How mature systems handle this

The convergent patterns, and what each one implies here:

- **GitHub — collapse to threads.** Forty comments on an issue is one notification that updates,
  not forty rows. → Notifications group by *subject* (this project, this appointment), not by
  event. Already true for messages; should hold everywhere.

- **Slack — derive counts, store the feed.** Badge counts are `messages after your last_read per
  channel` (exactly the model already built here). Only the Activity feed — mentions, reactions —
  is stored. → Confirms the store/derive split.

- **Stripe — event, notification and delivery are three things.** Events are stored immutably;
  delivery has its own retry and its own success record. → Keep delivery outcomes separate from the
  event. Already done in miniature: `notifyNewMessage` returns per-recipient outcomes
  (`sent` / `throttled` / `no-email` / `failed`) instead of the previous `console.warn`, which made
  "we never tried" and "it failed" indistinguishable.

- **Linear — read ≠ done, plus snooze.** Snooze is really "remind me while this condition still
  holds", which only works if conditions are derived.

- **Intercom — throttling and digesting as core competence,** not an afterthought.

The shared architecture is three stages, kept separate:

```
event  →  subscription (who cares?)  →  delivery (how, and when?)
```

Separation is what allows a new channel, a new role, or a new event to be added without touching
the other two stages.

---

## 4. The catalogue

Legend: **Now** = immediate. **Digest** = rolled into a daily summary. **—** = no notification
(usually because they caused it).

### Money

| Event | Artist | Shop admin | Client |
|---|---|---|---|
| Deposit collected | — | Digest | Receipt |
| Session charged | — | Digest | Receipt |
| Payment failed / card declined | **Now** | **Now** | — |
| Shop cut invoice issued | **Now** | — | — |
| Artist marks shop cut paid | — | **Now** *(needs their confirmation)* | — |
| Shop confirms shop cut paid | **Now** | — | — |
| Shop cut overdue *(condition)* | **Now** | **Now** | — |
| Deposit collected, never applied *(condition)* | **Now** | Digest | — |
| Refund issued | Depends who issued | Depends who issued | Receipt |

### Schedule

| Event | Artist | Shop admin | Client |
|---|---|---|---|
| Booking request received | **Now** | Digest | Confirmation |
| Booking request unanswered 48h *(condition)* | **Now** | **Now** *(lost revenue)* | — |
| Consult converted to session | — | Digest | Confirmation |
| Appointment booked | **Now** *(if client booked)* | Digest | Confirmation |
| Appointment cancelled | **Now** | Digest *(Now if money attached)* | — |
| Appointment tomorrow *(condition)* | Digest | — | **Now** |
| Client no-show marked | — | Digest | — |
| Session completed, no payment recorded *(condition)* | **Now** | **Now** | — |

### Roster / operational

| Event | Artist | Shop admin |
|---|---|---|
| Artist connected to shop | — | **Now** |
| Artist disconnected from shop | — | **Now** |
| Rate changed by shop | **Now** | — |
| Invite unredeemed after 3 days *(condition)* | — | **Now** |
| Square disconnected / token expired *(condition)* | — | **Now** |
| Email delivery failing *(condition)* | — | **Now** |

### Messages — already built

| Event | Recipient |
|---|---|
| New message | The other party, throttled to one per 15 min per conversation, reset on read |

---

## 5. The highest-value category: silent-failure catchers

Marked *(condition)* above, and worth more than the entire activity feed combined. These are cases
where **nothing errors and nobody notices**:

- Square disconnected or OAuth token expired → shop-cut invoicing quietly stops
- Email delivery failing → *every other notification quietly stops*
- Session marked completed with no payment recorded → revenue leak
- Deposit collected, never applied → money owed to a client that nobody is tracking
- Invite never redeemed after 3 days → somebody who cannot log in
- Booking request unanswered → a lost customer nobody knows was lost

This is not speculative. **The session that produced this document generated two live examples of
exactly this class:** a guest notification email that failed into a `console.warn` and was never
seen, and `updateArtistRateSettings` which had been broken since the day it was written — an artist
had never once been able to save their own rates, and nothing anywhere said so.

Both were found by accident. That is the argument for this category.

All of these are conditions, so under §2 they are derived queries: no new storage, no drift, and
they self-resolve when fixed.

---

## 6. Volume, and why shops and artists differ

The events are largely the same. What differs is **volume** and **whether you performed the
action**.

- A solo artist generates roughly 8 notification-worthy events a week. All can be immediate.
- A six-artist shop generates 60–80. Individually that is unusable noise.

So the default posture differs by role:

> **Normal flow digests. Exceptions interrupt.**

For a shop admin, routine money and schedule events roll into one daily summary; only exceptions
(payment failed, shop cut overdue, Square disconnected, a request going unanswered) arrive
immediately. For a solo artist, nearly everything can arrive immediately because there isn't enough
of it to drown in.

This is a *default*, not a restriction — preferences can override.

**Decided:** notifications to shop admins name the artist and the amount (*"Maya collected a $200
deposit from J. Chen"*). The shop admin can already see this on the appointment itself; a
notification that withheld it would only force them to go look it up.

---

## 7. Preferences

**Per category × per channel.** Three categories (money / schedule / roster) × two channels (in-app
/ email) = six toggles, with role-appropriate defaults.

Deliberately *not* per event type. A settings page with forty checkboxes is one nobody reads and
everybody leaves at default — so the defaults do all the work anyway, with far more code behind
them. Six toggles are few enough that someone annoyed by one thing will actually go and fix it
rather than muting everything.

Suggested defaults:

| | Artist (solo) | Artist (in shop) | Shop admin | Staff | Client |
|---|---|---|---|---|---|
| Money — in-app | on | on | on | off | n/a |
| Money — email | on | on | digest | off | receipts only |
| Schedule — in-app | on | on | on | on | n/a |
| Schedule — email | on | on | digest | off | reminders only |
| Roster — in-app | n/a | on | on | off | n/a |
| Roster — email | n/a | on | on | off | n/a |

In-app notifications are never fully disabled — the inbox is a record, and silently dropping
records makes the audit question unanswerable.

---

## 8. Architecture

### Data model sketch

```
Notification                      (stored EVENTS only)
  userId          — recipient
  type            — 'deposit_collected' | 'shop_cut_invoiced' | ...
  category        — 'money' | 'schedule' | 'roster' | 'message'
  subjectType     — 'appointment' | 'project' | 'conversation' | 'artist'
  subjectId       — for grouping and deep-linking
  actorId         — who caused it (never equal to userId; see §1)
  payloadCents    — money events carry the amount
  title / body    — rendered at write time, so a later code change can't rewrite history
  readAt          — I have seen it
  doneAt          — it is handled (distinct from read)
  createdAt
```

Indexes: `{ userId, readAt }` for the badge, `{ userId, createdAt }` for the inbox,
`{ subjectType, subjectId }` for grouping.

**Conditions have no model.** They are functions in `utils/attention.js` returning the same shape as
a `Notification` so the inbox can render both without knowing which is which. Each is a single
indexed query.

### Rendering at write time, not read time

`title` and `body` are stored as text rather than re-rendered from `payload` on read. A notification
is a record of what somebody was told; if the copy changes next month, last month's notification
should still say what it said. This is the same reasoning that keeps money as integer cents on the
appointment rather than recomputed from a rate that might since have changed.

### Delivery, and the scheduler

**In-process interval on the API server**, with a lock row so two instances cannot double-send.

The lock is not optional. A `setInterval` in a process that gets scaled to two instances sends
every digest twice, and the failure is invisible in dev, where there is only ever one instance.
A `ScheduledRun` collection with a unique key on `{ job, periodStart }` makes double-send a
duplicate-key error rather than a duplicate email — the same shape as the unique index on
`Artist.bookingSlug`, where the check is a courtesy and the index is the guarantee.

Jobs needed:

| Job | Cadence | Produces |
|---|---|---|
| Daily digest | Once daily, per user timezone eventually | Rolled-up money + schedule |
| Appointment reminders | Hourly | Client reminders for tomorrow |
| Condition sweep | Hourly | Overdue cuts, unanswered requests, unredeemed invites, Square health |

This is the biggest hidden cost in this whole design, and it unlocks the most valuable category
(§5). It is worth doing properly.

### Throttling

Already solved for messages and the pattern generalises: a `lastNotifiedAt` per (recipient,
subject), with the throttle window resetting when the person reads the subject. Someone who has
caught up and then receives something new is in the same position as someone being told for the
first time — staying quiet because we emailed them ten minutes ago would drop a genuinely new
notification.

---

## 9. Build order

**One system, both halves — sequenced so something is verifiable early.**

Building the derived half first with its own UI, then bolting stored events on, would mean building
the inbox twice. The two halves share the inbox, the preferences, and the GraphQL shape, so they
should share an implementation.

The refinement: build the *shared shape* first, then bring up the **derived** producer end-to-end
before the stored one. Derived conditions need no new collection and no scheduler for the on-read
cases, so the system can be exercised for real while it is still small. This session has repeatedly
demonstrated the cost of work that isn't verifiable until it's finished.

1. **The shape.** `Notification` model, the unified GraphQL type both producers return, the inbox
   query, read/done mutations.
2. **Derived conditions.** `utils/attention.js` + the on-read conditions. Inbox becomes genuinely
   useful with zero new storage.
3. **The scheduler.** Interval + lock + the condition sweep. Time-based catchers light up.
4. **Stored events.** Emit from the money and schedule mutations. Inbox now shows both.
5. **Preferences + digests.** Six toggles, defaults per §7, daily digest job.
6. **Inbox UI.** Bell, grouping by subject, read/done.

---

## 10. What already exists

Shipped ahead of this document, and consistent with it:

- **Per-conversation read state** (`Conversation.reads[]` — `lastReadAt`, `lastNotifiedAt`), which
  is the derived-count model in §2 applied to messages.
- **`utils/conversation-reads.js`** — one definition of "unread", including the *not-your-own*
  clause from §1.
- **`utils/message-notifications.js`** — one notification path for both directions, throttled per
  conversation, returning per-recipient outcomes rather than logging failures.
- **Server-stamped message timestamps** — the prerequisite that makes any timestamp-based read
  model sound.
- **Unread badges** on the Messenger nav and per conversation.

---

## 11. Open questions

- **Timezones.** A "daily digest" needs a day boundary. Shops have opening hours; artists travel.
  Deferred deliberately — first implementation can use a fixed UTC hour, but this will need
  revisiting before it annoys anyone.
- **Client-side notification preferences.** Clients currently have no settings surface at all. Their
  notifications (receipts, reminders) are transactional enough to arguably not need one.
- **Do staff need money notifications?** Defaulted to off above on the grounds that a front desk
  manages the schedule, not the books. Worth confirming against how a real shop runs.
- **Retention.** Stored notifications grow without bound. Ninety days then archive is the obvious
  answer; it needs deciding before the collection is large enough to make the decision expensive.
