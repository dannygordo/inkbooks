# Where this project is

**Read this first, then `DECISIONS.md`.** This file is *state* — what is done, what is next, what
has not been verified. `DECISIONS.md` is *rules* — the settled calls and why. They change at
different rates, which is why they are separate files.

Last updated: 2026-08-21.

---

### 2026-08-21: Response-time ceiling was only enforced at read time - an artist could save a value above their shop's limit

Reported after the first real smoke test of Feature 3 (unanswered-message nudges): logging in as an
artist and raising the threshold above the shop's ceiling appeared to work - the save succeeded and
the settings screen echoed the higher number back.

**Root cause**: the "artist may tighten, never loosen past the shop's ceiling" rule
(`models/ResponseTimeSettings.js`'s own header comment; `utils/response-time.js`'s `clamp()`) was
only ever applied where the EFFECTIVE value gets computed - the nudge sweep and the inbox condition.
`updateResponseTimeSettings` (`resolvers/responseTimeSettings.js`) had no equivalent check on the
write path, so it persisted whatever the caller sent. The actual nudge timing was never wrong -
`resolveResponseTimeThresholds` still clamped it correctly on every read - but the artist had no way
to know that; what they saved and what silently applied were two different numbers.

**Fix**: `updateResponseTimeSettings` now looks up the artist's shop ceiling (extracted into a
`getShopCeilingForArtist` helper shared with the `resolveShopCeiling` field resolver - previously
two separate copies of the same query) and rejects, with a `UserInputError` naming the limit, any
`initialThresholdMinutes`/`repeatIntervalMinutes` above it. A silent server-side clamp was considered
and rejected - rewriting what the artist typed to a different number they didn't choose is the same
confusing outcome as no enforcement at all, just quieter about it.

`ResponseTimePanel.jsx` mirrors the same check client-side: the number inputs get a `max` tied to
the ceiling, `error` styling when exceeded, Save disabled, and the old "saving will still take
effect" reassurance replaced with an explicit "your shop caps this at..." message using a new
`.settingsPanelHelpError` class (`--ib-error` token, so it stays correct in dark mode) rather than
the heavier page-level `.errors` box used for full-form failures.

**Verified**: `node --check` on the resolver, `esbuild` syntax check on the panel, full pre-commit
hook suite (schema rebuild, `check-graphql-documents.js`, client import/React-key/timezone checks) -
all green. **Not yet re-verified live** - the user should confirm the same artist-account repro
(raise above the shop's ceiling) now gets rejected with a visible error and the input clamps as
expected, since this sandbox can't reach the real Mongo instance to exercise it end to end.

**Files**: `server/graphql/resolvers/responseTimeSettings.js`,
`client/src/components/settings/ResponseTimePanel.jsx`, `client/src/pages/settings/settings.css`.

### 2026-08-20: Image tag editor - dark-mode-invisible input text, and cramped overlay spacing

`IBImageTagEditor.jsx` (the "add tag" overlay on project images - References/Design/Body lists)
had two issues, both in the same small component.

**Unreadable text was a light/dark mode bug, not a styling typo.** This app has a real light/dark
toggle (`theme/theme.js`, `ThemeModeProvider.jsx`); dark mode's `text.primary` is `#f3ece4` (near-
white). The "Add tag" `TextField` hardcoded `background: "white"` - fine in light mode, but in dark
mode that's near-white theme text on a literal white box, functionally invisible. Fixed by using
`bgcolor: "background.paper"` instead of a literal color - that MUI theme token resolves to
`#ffffff` in light mode and `#241c17` in dark mode, so it always pairs correctly with whatever
`text.primary` the active mode is using. No text color needed setting directly - once the
background is theme-aware, the existing default already has the right contrast in both modes.

**Cramped spacing** - gaps and padding were 3px throughout (`Box` gap/padding, chip height 20px,
add-tag button 22px, textfield padding 2px 6px). Loosened to 6px gaps/padding, 24px chips, 26px
button, 8px textfield padding, plus a subtle `box-shadow` on the chips/button/textfield (matching
the shadow weight already used on the chatbox's pending-image remove button) so the overlay reads
as one deliberate control instead of a handful of tiny elements floating loose on the thumbnail.
Deliberately still compact, not resized to `IBInput`/`FormField` scale - this sits on top of a
121px-tall image thumbnail (`IBImagesList.jsx`'s `rowHeight`), and a full-size control would cover
more of the image than the tag it's labeling.

**Verified**: `esbuild` on `IBImageTagEditor.jsx`. **Not visually checked in light AND dark mode** -
worth toggling the theme and opening a project's image tags in both to confirm the contrast fix
actually holds (this session can't render the app to check visually).

**Files**: `client/src/components/ibImagesList/IBImageTagEditor.jsx`.

### 2026-08-20: App-bar search box clears on click-away or Tab-away

Request: clear the search input when the user clicks or tabs away from it.

Scoped to `GlobalSearch.jsx` (the app-bar dropdown) only, not `Search.jsx` (the `/search` results
page) - that page's input is tied to the `?q=` URL param and represents "the query these results
are for," so clearing it on blur would drop what you were looking at while the results underneath
kept showing it. The app-bar box has no such contract; it already clears on selecting a result
(`goTo()`), this just extends the same idea to leaving without selecting one.

Implemented as a single `onBlur` handler rather than piggybacking on the existing mousedown-based
"click outside" listener, and specifically checks `e.relatedTarget` (the element about to gain
focus) against the search widget's own container before clearing. That check is load-bearing, not
defensive dressing: the dropdown's result rows are real `<button>`s sitting right after the input
in the DOM, so Tab-ing off the input lands on the first result, and clicking any result also blurs
the input a beat before that click's own `onClick` fires (mousedown blurs before click dispatches).
An unconditional clear-on-blur would unmount the dropdown out from under that Tab-press or click,
breaking result selection entirely. Checking containment lets "still inside this widget" (a result)
stay open while "actually left it" clears the box - the existing mousedown listener still owns
closing the dropdown on an unrelated outside click; this only adds the clearing behavior.

Side effect, not a special case: pressing Escape already called `e.target.blur()`, which now also
runs through this same handler and clears the box - previously Escape only closed the dropdown and
left the typed text in place. Left as-is rather than special-cased around, since "Escape clears"
reads as more expected, not less.

**Verified**: `esbuild` on `GlobalSearch.jsx`. **Not manually re-tested** - worth confirming
Tab-ing from the input into a result row still works, and that clicking a result still navigates
(the exact case the relatedTarget check exists to protect).

**Files**: `client/src/components/search/GlobalSearch.jsx`.

### 2026-08-20: Global search now covers image tags - both project images and shared images

Feature request: "Search should also include looking through tags on images." Image tags live in
two separate places, and both are now searchable, per the explicit "both" scope decision:

**Project images** (`IBImage.tags` nested inside `Project.referenceImages`/`designImages`/
`bodyImages`) - widened `Project`'s existing `ProjectTextIndex` (models/Project.js) to also index
`referenceImages.tags`/`designImages.tags`/`bodyImages.tags`. Mongo text indexes DO reach inside
arrays of subdocuments, tokenizing every string across every element - no aggregation pipeline or
new collection needed. A tag match surfaces the whole Project, same as any other Project-field
match; there is no separate "which image" result for these, since IBImage isn't its own searchable
collection. Weighted at 4, just under Project's own top-level `tags` (5).

**Shared images** (`SharedImage.tags`, the client-dashboard triage list, pre-project-assignment) -
a genuinely separate top-level collection with no existing search coverage at all. Added a new
`SharedImageTextIndex` on `tags`, and a new `images` result group scoped by `projectScopeFilter`
reused UNCHANGED from Projects - `SharedImage` deliberately carries the same `artistId`/`clientId`
field names `Project` does specifically for this kind of reuse (see the model's own header
comment), and that filter shape already matches `canManageClientSharedImages`'s per-record rule at
the bulk-query level. No new authorization logic was written.

**Schema/API**: `SearchResults` (typeDefs.js) gained `images: [SharedImage!]!`, reusing the
existing `SharedImage` GraphQL type (already had `userInfo`/`assignedProject` field resolvers from
the shared-images feature - no resolver changes needed). `utils/search.js`'s `searchAll` now runs a
fourth parallel `textSearch` call and returns the fourth list.

**Client**: `GlobalSearch.jsx` (app-bar dropdown) and `Search.jsx` (`/search` results page) both
gained a "Shared Images" section. The dropdown renders each match as a small thumbnail + tags +
filed-or-not status, linking to the client's dashboard (`SharedImagesPanel.jsx` - a SharedImage
isn't its own page). The results page reuses `EntityList` exactly as every other result type does,
passing the image's own URL as the row's `avatar` - the same component, doing the same job it
always does, just with a photo instead of a headshot.

**Deployment gotcha - action needed on your end**: both text indexes changed their FIELD LIST under
the SAME index name (`ProjectTextIndex` widened; `SharedImageTextIndex` is brand new but still a
name-based add). Mongoose's default `autoIndex` only adds indexes missing by name - it does not
notice an existing index's fields changed, and MongoDB refuses to silently redefine an index under
its old name (`IndexKeySpecsConflict`). A new, NON-destructive script,
`scripts/sync-search-indexes.js`, reconciles this (`Model.syncIndexes()` - drops what doesn't match
the schema, creates what's missing, touches zero documents). **Run this once**, from `server/`:
```
node scripts/sync-search-indexes.js
```
Same reason I can't run this myself as every other DB script this session - `device_bash` can't
reach your local Mongo.

**Verified**: `node --check` on every touched/new server file; a live `makeExecutableSchema` build
against the real `graphql-scalars`/resolvers on your machine (via `device_bash`) - confirmed the
schema still constructs cleanly; `scripts/check-graphql-documents.js` - confirmed the client's
widened Search query still matches the schema (341 documents, same as before - this only added
fields to an existing document, not a new one). `esbuild` on every touched `.jsx`/`.js` client
file. **Not yet run against live data** - needs `sync-search-indexes.js` run first, then a manual
test: tag a project image and a shared image with the same word and confirm both show up.

**Files**: `server/models/Project.js`, `server/models/SharedImage.js`, `server/utils/search.js`,
`server/graphql/typeDefs.js`, `server/scripts/sync-search-indexes.js` (new),
`client/src/services/SearchService.js`, `client/src/components/search/GlobalSearch.jsx`,
`client/src/components/search/globalSearch.css`, `client/src/pages/search/Search.jsx`.

### 2026-08-20: Per-image "Add tag" rebuilt as a Popover - was never going to fit inline

Report: the add-tag control on a Project's image lists (References/Design/Body) was cramped and
its text unreadable when adding a new tag.

The unreadable-text half had actually already been attempted (`IBImageTagEditor.jsx` had its own
comment explaining a switch from a hardcoded white background to theme-aware `background.paper`) -
but the cramped half was the real, unfixed problem, and looking at `IBImagesList.jsx` explains why
padding alone was never going to solve it: the tag editor is an absolutely-positioned overlay
(`right: 32`) constrained to the underlying thumbnail's own pixel width, and on the grid's smaller
1x1 tiles (`imageLayoutPattern`, `rowHeight: 121`) that leaves under 90px of usable width - nowhere
near enough for a 120px-wide text input sitting next to existing tag chips. No amount of padding or
color tuning fixes an input that's wider than the box it's forced into.

Rebuilt the "add tag" input as a MUI `Popover` anchored to the tag button instead of an inline
field squeezed into the overlay. A Popover renders in a portal (mounted at `document.body`), so its
content lays out with real room regardless of the thumbnail's size, and - as a direct consequence -
picks up the app's theme-aware `Paper` background/text color automatically, with no risk of
inheriting anything from the dark image-overlay context around it. Removed the now-unneeded
`ClickAwayListener` (Popover's own `onClose` already covers click-away) and the manual
`background.paper`/inherited-color reasoning, since the Popover's own `Paper` already resolves that
correctly.

**Verified**: `esbuild` on `IBImageTagEditor.jsx`. **Not visually re-tested** - worth opening a
Project's image list and confirming the popover positions itself sensibly on both a 1x1 and a 2x2
tile, and reads cleanly in both light and dark mode.

**Files**: `client/src/components/ibImagesList/IBImageTagEditor.jsx`.

### 2026-08-20: notFuture() correction - clamp the timestamp, not the day-count

Follow-up on the entry directly below. After re-running `seed-large.js` with the first version of
`notFuture()`, Marta's conversation still showed 2 messages permanently unread - smaller than the
original 3, but the same symptom. Cause: that first version clamped the *day offset* fed into
`daysAgo()` (`daysAgo(Math.max(0, n))`), but `daysAgo()` also rolls a random hour between 10am-5pm
onto whatever day it lands on - so `daysAgo(0)` ("today") could still land a few hours *later* than
the actual moment someone was testing at. A message dated 3pm today is exactly as permanently
unread at 11am today as one dated next month is right now, for the identical reason.

Fixed by changing `notFuture()` to take the resulting `Date` and clamp that directly
(`date > now ? now : date`), applied as `notFuture(daysAgo(n))` instead of `daysAgo(notFuture(n))`
at all 7 call sites. This closes the gap regardless of the hour jitter - a seeded row can now never
be dated later than the exact moment the seed script ran, full stop.

**Verified**: `node --check`. **Not yet re-run against a live re-seed by me** - needs
`node scripts/seed-large.js` run again and a fresh check that Marta's (or any) conversation clears
normally now.

**Files**: `server/scripts/seed-large.js`.

### 2026-08-20: Marta's "stuck at 3 unread forever" traced to seed-large.js, not app code - fixed

Closes the loop on the unread-badge report. The duplicate-Conversation theory (previous entry)
turned out to be wrong - `merge-duplicate-conversations.js --dry-run` found zero duplicate
member-sets. Rather than guess again, wrote a read-only diagnostic
(`scripts/debug-conversation-unread.js`) that dumps the raw `Conversation.reads`/`Message` data and
runs the actual production `unreadCountForConversation` function directly. That surfaced the real
cause immediately: 3 of Marta's 5 seeded messages had `createdAt` timestamps in **September
2026** - about three weeks *after* the actual current date. `unreadCount` is `createdAt >
lastReadAt`; a message dated in the future can never be "read" by clicking or reloading, because
`lastReadAt` gets stamped to the real current time, which cannot exceed a date that hasn't happened
yet. Every prior click genuinely worked - it just could never be enough.

**Root cause, precisely**: `scripts/seed-large.js` already computes every date relative to
run-time (`daysAgo(n)` uses `new Date()`, not a hardcoded calendar date) - that part was never the
problem. The actual bug: `CONFIG.weeksOfFuture` deliberately seeds some projects up to 3 weeks in
the future (to populate upcoming bookings for testing), and several `createdAt`/`updatedAt` fields
- Conversation, BookingRequest, Project, both Appointment records, the conversation's seeded
Messages, and `shopCutMarkedPaidAt`/`shopCutConfirmedAt` - derived their offset from that same
project's `consultDaysAgo`/`dayCursor`, which is allowed to go negative for a future project. A
negative offset into `daysAgo()` produces a future date - meaning the DB ROW itself (not just the
appointment it describes) could be seeded as "created" after right now, which nothing in the real
app can ever do (`createMessage`/`createBookingRequest`/etc. all stamp these fields server-side at
the actual moment of the call). `appointmentDate`/`consultDate`/`sessionDate` themselves are
correctly still allowed to be future - that's the intended "three weeks of future bookings" -
only the record-creation timestamps needed clamping.

**Fix, first pass (incomplete - see Update below)**: added `notFuture(n) = Math.max(0, n)` next to
`daysAgo()`, wrapped as `daysAgo(notFuture(n))` at every `createdAt`/`updatedAt` call site deriving
from `consultDaysAgo`/`dayCursor` (conversation, booking request, project, both appointment
records, the seeded messages, the two shop-cut-paid timestamps). `seed.js` (the small hand-written
fixture) was checked too and never had this bug - every one of its `daysAgo()` calls uses a fixed
positive constant.

**Update, same day**: user re-ran the seed and reported Marta *still* stuck, now at 2 unread
instead of 3 - "no matter what I do." The first pass only clamped the DAY integer fed into
`daysAgo()`. `daysAgo()` also rolls a random hour (10am-5pm) onto whatever day it lands on, so
`daysAgo(0)` ("today") can still come out a few hours *later* than the actual moment someone is
testing at - the identical bug, just shrunk from weeks to hours. Rewrote `notFuture` to take and
clamp the resulting `Date` instead of the day-count: `notFuture(date) { const now = new Date();
return date > now ? now : date; }`, and flipped every call site from `daysAgo(notFuture(n))` to
`notFuture(daysAgo(n))` (still the same 14 individual `createdAt`/`updatedAt` expressions - some
call sites shared one expression string across multiple fields, e.g. all three of
conversation/bookingRequest/project use `consultDaysAgo + 7`). This is a real, materially different
fix, not a cosmetic rename - it clamps on the actual timestamp value now, so no hour/minute jitter
can slip a "today" row past the real current moment either.

**To pick up the fix**: re-run `node scripts/seed-large.js` to get a fresh dataset without any
future-dated rows. (Not required for real user data - this only ever affected the local dev seed.)

**Verified**: `node --check` on `seed-large.js` after both passes. **Not re-run against a live
re-seed since the second pass** - worth confirming with `node scripts/seed-large.js` and then
spot-checking that Marta's conversation (or any project seeded with `consultDaysAgo` deep in the
future window) shows zero unread immediately after opening it, not just "fewer than before."

**Files**: `server/scripts/seed-large.js`, `server/scripts/debug-conversation-unread.js` (new,
read-only diagnostic - safe to keep and reuse for any future "one specific badge/count looks
wrong" report).

### 2026-08-20: Session-detail modal (Projects page) brought onto the same modal chrome; thumbnail clearance raised further

Two follow-ups on the previous round's spacing pass.

**1. "The session modal in the Projects page still doesn't have the proper spacing and looks
cramped."** Correct call - the earlier pass covered `AssignImageForm` but missed
`SessionDetail.jsx` (opened via `ProjectSessionsList.jsx`), which had exactly the same root cause:
dropped directly into `IBModal`'s content slot (which applies no padding of its own) as a plain
`<div className="sessionDetail">` with only `padding: 8px` - the sole margin between the dialog
edge and this form's densest content (the timer, both money rows, the deposits/adjustments
blocks). Rebuilt on the same `DialogContent dividers` / `DialogActions` pattern as
`EntityWizard.jsx`/`UpdateEventDialog.jsx`/`AssignImageForm`: `sessionDetailContent` now carries
`width: 560px` and `padding: 24px 28px` (matching `entityWizard.css` exactly, not reinvented),
`sessionDetailActions` carries `padding: 16px 28px` and `gap: 10px`. Same width as every other
modal in the app now, per the standing ask to keep modals uniform.

Hit the exact clobbering hazard flagged earlier this session while pushing this: `SessionDetail.jsx`
had been staged into this working copy in an earlier turn and never re-staged fresh at the start of
this one, so my edit landed on a slightly stale cached copy. `device_commit_files` correctly
rejected the push (mtime guard) rather than silently overwriting whatever was actually on disk.
Re-staged, confirmed the live file was functionally identical to what I'd edited (a harmless mtime
bump, not a real change - tail-diffed to be sure before touching anything), and reapplied the same
edit cleanly. No data was lost, but worth knowing this can still happen with any file that sat in
the cache across turns without an explicit re-stage.

**2. "The chatbox thumbnail still touches the input's top border - needs another 10px."** The
`margin-bottom: 8px` from the last pass wasn't enough. Raised to `18px` (total clearance ≈ 26px
once `.ibChatBoxPendingImages`' own 8px bottom padding is added in) - same reserved-space-on-the-
thumbnail approach as before, just more of it.

**Verified**: `esbuild` on `SessionDetail.jsx`; brace-balance check on both touched CSS files.
**Not re-tested in a real browser** - worth opening a session from the Projects page to confirm the
modal now reads at the same visual weight as the others, and re-checking the chatbox thumbnail
clearance with an actual attached image.

**Files**: `client/src/components/projectSessions/SessionDetail.jsx`,
`client/src/components/projectSessions/projectSessions.css`,
`client/src/components/ibChatBox/ibChatBox.css`.

### 2026-08-20: Migration script also needed a Web Crypto polyfill (`ReferenceError: crypto is not defined`)

Fixing the MONGODB-not-set error (below) surfaced a second, unrelated environment problem the
first run hit next: `ReferenceError: crypto is not defined` inside
`mongoose/node_modules/mongodb/lib/utils.js`'s `uuidV4`, thrown from `ServerSession`/
`ClientSession.endSession` while a cursor was cleaning up. Not a bug in this script's logic - the
MongoDB Node driver bundled under mongoose reads `globalThis.crypto` directly for session ids, and
Node only puts the Web Crypto API on the global object by default starting v19. Whatever Node
version is actually running `node scripts/merge-duplicate-conversations.js` from a fresh terminal
is apparently older than that (or at least older than whatever the app's own server process runs
under via nodemon/an npm script, which pins its own version).

Fixed by polyfilling `globalThis.crypto = require('crypto').webcrypto` at the very top of the
script, before `mongoose` is required - `node:crypto`'s `webcrypto` export has had the same
implementation available since Node 16.17, just not wired onto `global` before v19. If `webcrypto`
itself is somehow unavailable (a much older Node), the script now exits with a clear message
naming the actual Node version detected rather than the driver's own confusing internal
`ReferenceError`.

**Caught and fixed a mistake of my own before it reached you**: the first version of this comment
had one continuation line missing its `//` prefix, which would have been an actual syntax error
(a bare `#` token) rather than a comment - caught by the same `node --check` this project's
verification step always runs before anything gets pushed. Fixed and re-verified before pushing.

**Verified**: `node --check`; on-device (real Node, real `node_modules`), confirmed `require('mongoose')`
no longer throws the crypto `ReferenceError` and the script proceeds to its connection attempt
(this sandbox still can't reach your local Mongo to go further - same limitation as always). Try
the dry-run again:
```
node scripts/merge-duplicate-conversations.js --dry-run
```

**Files**: `server/scripts/merge-duplicate-conversations.js`.

### 2026-08-20: Assign-to-project modal rebuilt on the app's real modal pattern; thumbnail button clearance; migration script's MONGODB fix

Four follow-up reports, all fixed.

**1 & 2. "The sharedImagesAssignForm div isn't formatted properly... use the same controls you're
using on the Edit Form across the entire application. You keep using different controls when
adding new features."**

Fair, and correct: `AssignImageForm` (`SharedImagesPanel.jsx`) was a hand-rolled `<form>` with two
native `<select>` elements and bespoke CSS (`.sharedImagesAssignForm`/`.sharedImagesAssignSelect`)
- visibly different fonts, borders, and focus states from every other modal in this app, and zero
padding of its own. Root cause of "not formatted properly": `IBModal.jsx` (the shared `Dialog`
every feature's modal content renders through) applies **no padding or width of its own** - it's a
bare `<Dialog>`+`<DialogTitle>` with `{modal.content}` dropped in directly. Every modal that looks
right (`EntityWizard.jsx`, `UpdateEventDialog.jsx`) supplies its own `DialogContent
dividers`/`DialogActions` with real padding and a fixed width - that's not optional chrome IBModal
hands you, it's each caller's job, and this one skipped it.

Rebuilt `AssignImageForm` on that exact pattern: `DialogContent dividers` /
`DialogActions`, `width: 560px` (matching `EntityWizard`'s own dialog width, so modals across the
app are a consistent size), `padding: 24px 28px` / `16px 28px` (copied from `entityWizard.css`,
not reinvented). The two native `<select>`s are now `IBSelect` - the same component
`FormFieldEditorRow.jsx` already uses for the Edit Form's own field-type dropdown - forced to full
width via `.sharedImagesAssignContent .MuiFormControl-root { width: 100% }` (`IBSelect` isn't
`fullWidth` by default and has no prop for it; this targets its rendered MUI class the same way
`ibChatBox.css` already strips a MUI internal border elsewhere, so `IBSelect`'s many *other*
callers at their natural width are unaffected). `IBSelect` supplies its own MUI label internally,
so it's deliberately **not** wrapped in `FormField` - that would be the two-labels-for-one-field
mistake `FormField.jsx`'s own header comment warns against; `FormField` is for bare inputs
(`IBInput`/`IBMultilineInput`) that don't already carry a label.

**Noticed but out of scope for this pass**: `.clientDashboardFlagTypeSelect` (the Flag form,
inline on the dashboard, not in a modal) is also a native `<select>` with its own bespoke CSS,
predating this session's shared-images work. Left alone since it's inline-on-page rather than
modal-hosted and wasn't part of what was reported, but flagging it now rather than let it sit
quietly - happy to bring it onto `IBSelect` too if wanted.

**3. "The delete button on the pending-image thumbnail overlaps the input's border."**

`.ibChatBoxRemovePendingImage` sits at `top: -8px; right: -8px` relative to its 56px thumbnail, by
design (it needs to poke out over the corner to read as "remove this," not "part of the image").
It had no bottom clearance of its own - `.ibChatBoxPendingImages`' 8px bottom padding was the only
thing separating the whole row from the input below it, and depending on wrap/content length that
wasn't enough to keep the protruding button off the input's edge. Added `margin-bottom: 8px`
directly on `.ibChatBoxPendingImage` (not the container's padding), so the clearance travels with
each thumbnail even if a second row wraps.

**4. "The migration script says MONGODB is not set."**

`merge-duplicate-conversations.js` assumed `MONGODB` was already exported in the shell - every
other one-off script in `scripts/` (`seed.js`, `seed-large.js`) instead loads
`server/.env.development` itself via `dotenv`, precisely so this isn't required. Added the same
`dotenv.config({ path: path.join(__dirname, '..', '.env.development') })` this file was missing.
Also reworded the missing-`MONGODB` error to point at `.env.development` specifically rather than
just "export it," since that's now the actual thing to check if it still fires.

**You should be able to run this now** (from `server/`):
```
node scripts/merge-duplicate-conversations.js --dry-run
```
Still my ask from the entry below: run the dry-run first, tell me what it reports for Marta (and
anyone else), then run it for real once you've reviewed the output. This is still the one piece of
the duplicate-conversation fix I can't do for you.

**Verified**: `node --check` on the migration script; `esbuild` on `SharedImagesPanel.jsx`; brace-
balance check on both touched CSS files. **Not re-tested in a real browser** - worth opening the
"Assign to project" modal and confirming it's the same visual weight as, say, the session-detail
modal, and re-attaching an image in Messenger to confirm the remove button now clears the input.

**Files**: `server/scripts/merge-duplicate-conversations.js`,
`client/src/components/clientDashboard/SharedImagesPanel.jsx`,
`client/src/components/clientDashboard/clientDashboard.css`,
`client/src/components/ibChatBox/ibChatBox.css`.

### 2026-08-20: Root cause of "the first client's unread count never clears" — duplicate Conversation documents from booking requests

The Messenger fix below (item 1, "mark read on click") turned out to be insufficient — the user
reported the top conversation's badge was still permanently stuck, even without clicking it, always
the same conversation (Marta), and surviving a page reload. Those three answers (via
`AskUserQuestion`) ruled out the original click-handler-no-op theory outright: a stuck badge that
persists across reloads and doesn't depend on what gets clicked is a server-side data problem, not a
React effect-dependency problem.

**Root cause found**: `mutations/bookingRequests.js`'s `createBookingRequest` created a brand new
`Conversation` unconditionally on every call — `new Conversation({members: [artist.id,
clientUser.id]}).save()` — instead of reusing an existing thread the way every other conversation-
opening path in this codebase already does, via `utils/conversations.js`'s
`findOrCreateConversationForMembers` (used by `Project.conversation` and `getProjectConversation`;
its own header comment specifically documents booking-request conversations as the canonical thread
those other paths expect to reuse — a contract this mutation was silently violating). A client who
submits a second booking request to an artist they already have a thread with — a genuine
re-inquiry, or just testing the form twice — got a second, disconnected `Conversation` document for
the exact same two people.

**Why this produces exactly the reported symptom**: `getConversationsByMemberId`
(`resolvers/conversations.js`) lists every `Conversation` a user belongs to as its own row.
`IBConversation.jsx` only renders the other member's name, never a conversation id, so two
duplicates for the same person render as two visually identical rows. Real message traffic keeps
flowing through one of them; the other sits there with whatever unread state it was last left in.
Marking "that row" read via a click always genuinely worked server-side — it just wasn't the row
carrying the traffic, so the badge the user was actually looking at never moved.

**Fixed**: `createBookingRequest` now calls `findOrCreateConversationForMembers([artist.id,
clientUser.id])` instead of constructing a new `Conversation` directly. This prevents any *new*
duplicates going forward but does nothing for duplicates that already exist in the live database
(Marta's included, presumably).

**New**: `server/scripts/merge-duplicate-conversations.js` — one-time cleanup for existing
duplicates. Groups all `Conversation` documents by identical member set, keeps the oldest as
canonical, reassigns every `Message.conversationId` / `BookingRequest.conversationId` /
`SharedImage.conversationId` pointing at a duplicate over to the keeper, merges each member's read
state (`Conversation.reads`) across every copy keeping whichever `lastReadAt`/`lastNotifiedAt` is
*later* (merging can only make a thread look as read as either copy already genuinely was, never
less), bumps the keeper's `updatedAt` to the newest across the merged copies, then deletes the
duplicates.

**I could not run this myself or confirm the theory against live data.** `device_bash` runs in an
isolated Linux VM, not literally on this Mac — a direct-DB diagnostic attempt this session failed
with `ECONNREFUSED 127.0.0.1:27017` against `MONGODB=mongodb://localhost:27017/inkbooks-dev`
(`server/.env.development`), confirming it cannot reach a local dev MongoDB. **You need to run this
yourself, from `server/`:**

```
node scripts/merge-duplicate-conversations.js --dry-run
```

first — it writes nothing, just reports what it *would* merge, including per-group message/
booking-request/shared-image counts. If it reports a duplicate group for Marta (or anyone else),
that confirms this theory against your real data. Once you've reviewed the dry-run output, run it
again without `--dry-run` to apply the merge for real.

**Verified**: `node --check` on both files; a full on-device `ApolloServer` schema rebuild
(`typeDefs`/`resolvers` construct without error); `scripts/check-graphql-documents.js` (341
documents, all still matching). **Not yet confirmed against live data** — that's what the dry-run
above is for. Once you've run it, let me know what it found and I'll close the loop on this being
the actual fix for "the first client is never marked read."

**Files**: `server/graphql/mutations/bookingRequests.js`,
`server/scripts/merge-duplicate-conversations.js` (new).

### 2026-08-20: Client-dashboard shared-images list + "assign to project" (item 4 of the Messenger report)

The fourth item from the same Messenger report below - now implemented, on top of a small new
model. Scoped via three `AskUserQuestion` answers, all recorded in full in `DECISIONS.md`'s new
MSG6: every shared image shows always (no "unassigned only" filter), assigning one to a project
badges it rather than removing it from the list, and the list is artist-and-shop-admin visible
only (never the client, never plain staff).

**New**: `server/models/SharedImage.js` - one row per image URL shared via a message, either
direction (client or artist), indexed for the client-dashboard list. Populated automatically by
`server/utils/shared-images.js`'s `recordSharedImagesForMessage`, called as a best-effort side
effect from `createMessage` (`mutations/messages.js`) right after a message with `imageUrls` is
saved - same never-throws contract as the notify/auto-response calls already in that function. A
no-op for any conversation that isn't a genuine one-client-one-artist thread (mirrors
`sendAutoResponseForIncomingMessage`'s own guard in `utils/auto-responses.js`).

**New GraphQL**: `getSharedImagesForClient(clientId)`, `getProjectsForClient(clientId)` (feeds the
assign-picker), `assignSharedImageToProject`, `updateSharedImageTags`, `removeSharedImageFromList` -
all in `resolvers/sharedImages.js`, authorized via a new `canManageClientSharedImages`
(`utils/shop-membership.js`) that is deliberately narrower than the existing `canAccessClient`
(excludes the client themselves and plain staff - see MSG6).

**New client UI**: `SharedImagesPanel.jsx`, mounted on `ClientDashboard.jsx` next to Notes/Flags
(same `!isSelf`-only gating). Reuses `IBImagesList.jsx` - the same tag-editor/lightbox component
the project image lists already use - via three new optional, backward-compatible props
(`onDelete`, `deleteLabel`, `extraActions` on `IBImagesList`/`IBImagesListOptions`; `renderBadge`
on `IBImagesList`) so `Project.jsx`'s existing three image lists are completely unaffected.
"Assign to project" opens the app's existing modal (`useAuth()`'s `modal`/`setModal`) with a small
project + list-type picker.

**Read `DECISIONS.md`'s MSG6 before touching this again** - in particular, "Delete" on this list
calls a non-destructive `removeSharedImageFromList` (drops only the tracking row), NOT the
`IBDeleteFile` Firebase-Storage delete the project image lists' own "Delete" uses. That divergence
from "same functionality as the project image lists" was deliberate and flagged, not missed: this
URL is also the image actually shown in the client's real chat history, and the project lists'
delete would silently break that thread's display.

**Not yet re-tested in a real browser** - verified via `esbuild`/schema-build/
`check-graphql-documents.js` only (341 documents pass, including the new ones). Worth a real
click-through before trusting it: share an image as a client and as an artist, confirm both show
up on the client's dashboard tagged with the right sender, assign one to a project and confirm it
lands in the right list (References/Design/Finished Tattoo) AND the badge appears, and confirm
"Remove from this list" drops the row without touching the original message's own image.

**Files**: `server/models/SharedImage.js` (new), `server/utils/shared-images.js` (new),
`server/graphql/resolvers/sharedImages.js` (new), `server/graphql/resolvers/index.js`,
`server/graphql/typeDefs.js`, `server/graphql/mutations/messages.js`,
`server/utils/shop-membership.js`, `client/src/services/SharedImageService.js` (new),
`client/src/components/clientDashboard/SharedImagesPanel.jsx` (new),
`client/src/components/clientDashboard/ClientDashboard.jsx`,
`client/src/components/clientDashboard/clientDashboard.css`,
`client/src/components/ibImagesList/IBImagesList.jsx`,
`client/src/components/ibImagesList/IBImagesListOptions.jsx`.

### 2026-08-20: Messenger — Marta's conversation never marked read, no active-row highlight, image-only messages silently never sent

Three related reports about the Messenger, all in `client/`. All three are fixed and pushed - the
fourth item from the same message (the client-dashboard shared-images list above) is now also
done, see the entry above this one.

**1. "The first client in the list is never marked read when clicked."**

`Messenger.jsx`'s mark-read `useEffect` only fires when `activeConversationId` (or the active
conversation's `unreadCount`) actually *changes* — React skips an effect whose dependencies compare
equal to the previous render. `handleConversationClick` called `setActiveConversationId(conversation.id)`
unconditionally, which is a same-value no-op for whichever conversation the auto-select effect
already picked on page load (`conversations[0]`, the most recently active thread — exactly whoever
the user calls "the first in the list"). Clicking that specific row was therefore always invisible to
the mark-read effect; every other row worked because clicking it genuinely changed the id.

Fixed by also calling `markConversationRead` directly inside `handleConversationClick` when the
clicked conversation has `unreadCount > 0`. Safe to double up with the effect on a real selection
change — `markConversationRead` (`utils/conversation-reads.js`) is idempotent by design.

**2. "Highlight the selected/loaded conversation, especially on initial load."**

The wiring for this already existed (`isActive={conversation.id === activeConversationId}` in
`Messenger.jsx`, rendered as `.ibConversationActive` in `IBConversation.jsx`) and the auto-select
effect does pick a conversation on load — but `.ibConversationActive` was a flat 6% black tint,
nearly identical to `.ibConversation:hover`'s own tint, so the "selected" state read as invisible in
practice. Restyled with a left accent bar (`var(--ib-primary)`) plus the app's `--ib-primary-bg`
tint (theme-aware, unlike the old hardcoded black), and added `.ibConversationActive:hover` so
hovering the open thread doesn't visually demote it back to a plain hover state.

**3. "Uploading an image gave no error, but it never shows up anywhere — disappears on refresh."**

Not a upload or rendering bug — the `imageUrls` pipeline (upload → `pendingImageUrls` → `createMessage`
mutation → server storage → `IBMessage.jsx`'s gallery rendering) is correct end to end. The actual
bug: `IBChatBox.jsx` had **no visible Send button** — the only way to send anything, ever, was
pressing Enter while focused in the text field. A user who attaches an image and never also types
text has no discoverable reason to go click into an empty text box and press Enter, so the message
is never created; the pending-preview thumbnail is local-only state that resets on refresh, matching
exactly "I could see a thumbnail, then it disappeared and isn't available anywhere."

Fixed by adding a real Send icon button next to the input (enabled whenever there's typed text or a
pending image), tracked via a new `hasText` state fed by the input's `onChange` (the field itself
stays uncontrolled — `messageRef` is still what actually gets read on send). Enter-to-send still
works unchanged for anyone already used to it.

**Not yet re-tested in a real browser** — verified via `esbuild` only, same limitation as the prior
token-upload fix (this sandbox has no browser). Worth clicking through all three before trusting
them fully: (a) open Messenger, confirm the top conversation's badge clears without a second click
elsewhere first; (b) confirm the open thread is visibly highlighted on load; (c) attach an image
with no text typed, hit Send, refresh, confirm the image is still there in the thread.

**Files**: `client/src/pages/messenger/Messenger.jsx`,
`client/src/components/ibConversation/ibConversation.css`,
`client/src/components/ibChatBox/IBChatBox.jsx`.


### 2026-08-20: "Invalid/expired token" on every message-image upload

Reported directly: attaching an image to a message failed with `{"error": "Invalid/expired
token"}` from `routes/messageUploads.js`. Not actually a token problem — `checkAuth`
(`utils/check-auth.js`) throws that exact message for ANY reason `jwt.verify` rejects the string it
was handed, including "this isn't a JWT at all."

Root cause: `IBChatBox.jsx`'s hand-built `Authorization` header used
`` `Bearer ${CacheService.getItem("token")}` `` directly. `CacheService.getItem("token")` returns
the whole stored user object (`{id, email, accessToken, ...}`), not the raw JWT — every other
caller that reads it for a token knows this: `index.jsx`'s Apollo `authLink` reads
`token.accessToken`, and `IBSquarePaymentForm.jsx`'s own hand-built Authorization header (the only
other authenticated plain-REST upload in the app) reads `user.accessToken`. Interpolating the bare
object stringifies it to the literal text `"[object Object]"`, which is never a valid JWT under any
circumstances — so this had been broken for every caller, not intermittently, since Feature 1
(image attachments) shipped.

Fixed by reading `token?.accessToken` instead of `token` in `IBChatBox.jsx`'s upload fetch, matching
the other two call sites. **Not yet re-tested against a real upload** — verified via `esbuild` only
(this sandbox has no browser to click through); worth a real "attach an image" click-through before
trusting it fully.

**Files**: `client/src/components/ibChatBox/IBChatBox.jsx`.

### 2026-08-19: five feature requests from one message — images, manageable system text,
unanswered-message nudges, mark-unread, booth rent

All five confirmed via a single "do it" after the plan (`server/`/`client/`-spanning) was laid out
and four sub-decisions were locked via `AskUserQuestion` (see `DECISIONS.md`'s MSG4, MSG5, and M12
for the reasoning behind each). Shipped in the order recommended in the plan — smallest/most
self-contained first, booth rent (touches real money) last:

**Feature 4 — mark a conversation unread.** No schema change: `Conversation.reads[].lastReadAt`
already treats "no row" as "everything unread", so `markConversationUnreadForUser`
(`utils/conversation-reads.js`) just clears it. New `markConversationUnread` mutation, membership-
checked the same way `updateMessage`/the read mutation already are; a "Mark as unread" action in
the Messenger's conversation-list row menu.

**Feature 1 — image attachments on messages.** Reuses the exact upload pipeline `Form`'s
`file_upload` fields already share: `uploadMessageAttachment` in `firebase-admin.js`
(`folder: 'message-uploads'`), a new `routes/messageUploads.js` mirroring `formUploads.js`'s
multer/allowlist/rate-limit shape, `Message.imageUrls` (capped array, validated in
`createMessageInputSchema`), never sent through GraphQL. Client compose box gets the same upload
widget already built for `FormFieldsRenderer.jsx`; message bubbles render a small gallery above
the text when `imageUrls` is present.

**Feature 3 — unanswered-message nudges (8h default, then every 3h, shop sets a ceiling).**
New `ResponseTimeSettings` model + `utils/response-time.js`'s `resolveResponseTimeThresholds` —
the first **min-clamp** owner-precedence shape in this codebase (see MSG4), not "one wins
outright" the way every other resolver here works. `utils/attention.js`'s `findUnansweredMessages`/
`unansweredMessages` surface the passive inbox condition (restricted to clean 1:1 client/artist
threads, mirroring `sendAutoResponseForIncomingMessage`'s own restriction); `utils/notification-
jobs.js`'s new `sendMessageNudges` (hourly) is the **first job that actively escalates a derived
condition into a real, stored `Notification` row on a repeating interval**, rather than just
reporting it passively — deduped by query (`Notification.exists` on a time window) rather than a
unique index, since the repeat interval is per-artist-configurable. New `ResponseTimePanel.jsx` in
Settings > Messages.

**Feature 2 — manageable system-generated text.** New `SystemMessageTemplate` model (7 keys) +
`utils/system-message-templates.js`, extending the exact `AutoResponse`/`resolveAutoResponseForTrigger`
owner-precedence shape (artist wins outright, else shop, else the built-in default) to the 7
currently-hardcoded outbound emails that fire unconditionally rather than on an enable/disable
toggle. Two identity/security emails (account invite, password reset) deliberately excluded — see
MSG5. `BOOKING_CONFIRMATION` gets a narrower treatment (subject + one appendable note, not the
whole body) since that email is assembled from arrays/conditionals a full override could break.
Every real call site (`bookingRequests.js`, `shopCutPayments.js`, `message-notifications.js`'s
`notifyNewMessage`) now resolves its shop/artist context and asks `resolveSystemMessageTemplate`
instead of using a literal string. New `SystemMessageTemplatesPanel.jsx` in Settings > Messages.

**Feature 5 — booth rent vs. percentage cut.** See M12 for the full design. `ShopCutRate` gained
one field (`compensationModel`) rather than a parallel history table — booth rent IS 0% by
construction, so `resolveShopCutPercentAt` needed no changes. New append-only `BoothRentPlan`
(terms: amount, due day) and generated `BoothRentCharge` (one row per artist per due month, unique
on `{artistId, periodMonth}` — the same idempotency role `Expense`'s `{recurringExpenseId, date}`
index plays for `RecurringExpense`). New `utils/booth-rent.js`'s `generateDueBoothRentCharges`
mirrors `generateDueRecurringExpenses`'s catch-up/idempotent shape, structured around resolving
whichever `BoothRentPlan` row governed each missed period rather than a single live template — and
re-checks `ShopCutRate.compensationModel` on every run rather than trusting a cached flag, so an
artist switched back to `PERCENTAGE` stops accruing charges immediately. Payment lifecycle
(`due -> marked_paid -> confirmed`) is a direct structural mirror of `shopCutPayments.js`'s
`markShopCutPaidManually`/`confirmShopCutPaid`; `confirmBoothRentPaid` is the one mutation that
actually writes ledger rows (an artist-owned `Expense` + a shop-owned `Income`, against an owned
"Booth Rent" `ExpenseType`/`IncomeType`, found-or-created on first use). Overdue rent escalates via
a new `sendBoothRentNudges` job (`utils/notification-jobs.js`, hourly, 3-day repeat — my own
default, flagged in M12), notifying **both directions** per overdue charge since `notify()`'s own
actor rule means one call can only ever reach the side that isn't the actor — the shop admin who
set the plan (`BoothRentPlan.setByUserId`) is the actor when notifying the artist, and the artist
is the actor when notifying the shop admins. Client: the compensation-model toggle + booth-rent
plan history + a shop admin's "confirm paid" queue all live in
`components/artistDashboard/ShopCutRatePanel.jsx` (extending the existing shop-cut panel rather
than a new one, since the authorization/props it already has are exactly what booth rent needs
too); a new `components/settings/BoothRentPanel.jsx` gives the artist their own read-only view of
the current terms plus a "Mark this month's rent paid" action, rendering nothing at all for an
artist with no booth-rent history.

**Verification, every feature**: `node --check` on every new/touched server file, a full
`makeExecutableSchema` rebuild, `scripts/check-graphql-documents.js` (328 → 331 → 336 GraphQL
documents across the batch, each increase accounted for by the feature that added it), `esbuild`
syntax checks on every new/touched `.jsx`/service file — all green. **`npm test` has NOT been run
against this batch** — this sandbox still has no route to `fastdl.mongodb.org` (see Test status
below); needs a real run on Danny's machine, same as every other change in this log. Worth
particular attention: Feature 5's money paths (`confirmBoothRentPaid`'s ledger-row creation, the
generator's catch-up loop across a mid-history rent change) and Feature 3's clamp direction
(MSG4) are exactly the kind of logic a unit test catches and a read-through doesn't.

**Files**: `models/ResponseTimeSettings.js`, `models/SystemMessageTemplate.js`,
`models/BoothRentPlan.js`, `models/BoothRentCharge.js`, `models/ShopCutRate.js` (+`compensationModel`),
`models/Message.js` (+`imageUrls`), `utils/response-time.js`, `utils/system-message-templates.js`,
`utils/booth-rent.js`, `utils/shop-cut.js` (+`resolveCompensationModelAt`), `utils/attention.js`
(+`unansweredMessages`, `overdueBoothRent`), `utils/notification-jobs.js`
(+`sendMessageNudges`, `sendBoothRentNudges`), `utils/business-jobs.js` (+`booth-rent-charges`),
`utils/conversation-reads.js`, `utils/firebase-admin.js`, `routes/messageUploads.js`,
`graphql/resolvers/{responseTimeSettings,systemMessageTemplates,boothRent}.js`,
`graphql/mutations/boothRentPayments.js`, `graphql/typeDefs.js`, `graphql/resolvers/index.js`,
`client/src/components/settings/{ResponseTimePanel,SystemMessageTemplatesPanel,BoothRentPanel}.jsx`,
`client/src/components/artistDashboard/ShopCutRatePanel.jsx`,
`client/src/services/{ResponseTimeSettingsService,SystemMessageTemplateService,BoothRentService}.js`,
`client/src/pages/settings/settingsCategories.jsx`.

### 2026-08-19: consent form duplicate fields, then "No client record found for this account."

Two related reports on the same Consent Form, in sequence - the first led directly to the second
being found.

**1 - Danny added his own First Name/Last Name/Email/Phone # fields to the Consent Form**, which
duplicated the always-present, hardcoded guest-identity block every public fill-out page already
renders above `form.fields` (see `PublicFormBySlugFillOut.jsx`/`PublicFormFillOut.jsx` - both have
an identical `.publicFormFillOutGuestFields` block, submitted as top-level `firstName`/`lastName`/
`email`/`phone` args, never part of `answers`; `utils/seed-default-forms.js`'s own comment on
`CONSENT_FORM_FIELDS` explains why those four are deliberately excluded from the default field set).
Asked whether to just delete the 4 duplicates; the follow-up question ("why are those fields not
showing up when i go to edit it?") turned out to mean something different than it first read - the
fields DID show in the `FormBuilder` editor. What was actually missing was any indication in the
editor that the built-in block exists at all, so it reads as safe to duplicate. Fixed by adding a
permanent, non-editable notice block to `FormBuilder.jsx` (right before the field list) describing
the block, why it's there, and that it can't be edited/removed from this screen - plus its styling
in `forms.css` (`.formBuilderGuestFieldsNotice`). The 4 duplicate fields themselves were removed
directly on the live form - not by me (never got an explicit go-ahead in chat), confirmed after the
fact via a `getPublicFormBySlug` query showing the Consent Form back down to its original 2 fields.

**2 - Submitting the Consent Form threw `"No client record found for this account."`
(`BAD_USER_INPUT`, `resolvers/forms.js:734`)** for Danny himself, logged in as Shop Admin, visiting
his own shop's public `/consent/dana-wolfe` link. Root cause: `submitFormResponse` picked its
branch (guest / staff-entered / self-service) off `authenticatedCaller` truthiness alone - "is this
browser logged in at all" - not off which shape of request was actually made. A public guest link
always sends `formSlug`+`ownerHandle`+`firstName`/`lastName`/`email`, whether or not the visitor
happens to be logged in; a logged-in visitor with no `Client` record (any artist or staff account,
not just Danny's) got routed into the self-service branch regardless, which requires
`Client.findOne({userId: authenticatedCaller.id})` to succeed and throws exactly this error when it
doesn't. A logged-in visitor who *does* have a Client record would have hit a quieter version of the
same bug - typed-in guest info silently discarded in favor of their own account.

Fixed by deciding the guest branch from how the form was resolved (`data.publicToken` set, or
resolved via `formSlug`+`ownerHandle`) rather than from `authenticatedCaller`, checked first and
independent of login state; the staff-entered (`data.clientId`) and self-service branches are
otherwise unchanged and still require `authenticatedCaller`. **Verified live**: schema rebuild +
`check-graphql-documents.js` (325 documents, unchanged), then reproduced the exact scenario in the
browser - Danny, still logged in as Shop Admin, submitted `/consent/dana-wolfe` with a test guest
identity and file upload, got `"Thanks, Verify"` instead of the error. **`npm test` confirmed green
on a real machine** (see Test status) after this fix - no new test file added for this one, unlike
the entries below.

Housekeeping: that browser verification created a real guest `Client` (Verify Testclient,
`verify-testclient-20260819@example.com`) in the live database - not deleted, since removing client
records isn't something to do without being asked. Worth deleting from Clients if it's not wanted.

**Files**: `graphql/resolvers/forms.js` (`submitFormResponse` branch selection),
`pages/forms/FormBuilder.jsx` (guest-block notice), `pages/forms/forms.css`
(`.formBuilderGuestFieldsNotice`).

---

### 2026-08-19: three real bugs found using Auto-Responses for the first time, all fixed

All three surfaced from actually using the feature (real `npm test` runs plus clicking through the
UI), not from review - see the Auto-Responses entry below for the feature itself.

**1 and 2 - `models/AutoResponse.js`'s pre-validate hook and `models/AutoResponseLog.js`'s dedup
index.** Covered in detail further down (search "next is not a function" and "has no dedup
constraint"); both fixed, both closed out the full 907-test suite.

**3 - `createAutoResponse` rejected every save from Settings** with `Field "artistUserId" is not
defined by type "CreateAutoResponseInput"`. `CreateAutoResponseInput` never had an `artistUserId`
field, deliberately - `resolveBusinessOwner` resolves the personal scope from the caller's own
identity server-side (see the resolver's own comment). But
`components/settings/AutoResponsesPanel.jsx`'s `handleSave` spread the SAME `scope` prop into both
the `getAutoResponses` query (where `{artistUserId}` is a real, needed arg) and the
`createAutoResponse` mutation (where it isn't a field at all). Fixed by only forwarding
`scope.shopId` into the create input, never `scope.artistUserId`.

**4 - an artist's name change didn't show up in the sidebar or the Home welcome message,** even
after a full page reload. Root cause was NOT a stale client cache - `Artist.firstName/lastName`
(what `pages/artists/Artist.jsx`'s profile editor writes) and `User.firstName/lastName` (what
`login()` returns, cached into `AuthContext`, and what `Sidebar.jsx`/`Home.jsx` both read) are two
separate stored copies of the same fact. They start equal at signup and nothing kept them in sync
after that - editing one has never touched the other, for anyone, ever. Fixed in two parts:
`updateArtist` (`graphql/mutations/artists.js`) now writes any changed firstName/lastName through
to the linked `User` row too, so the database itself stops disagreeing with itself, regardless of
whether the editor is the artist or a shop admin editing someone else. `Artist.jsx` additionally
calls `useAuth()`'s `updateCurrentUser` right after a self-edit succeeds, so the CURRENT tab updates
immediately rather than waiting for a fresh login to re-read `User`.
**Not verified beyond `node --check`/`esbuild`** - this sandbox can't run the Mongo-backed suite
(see Test status); worth confirming with a real save-and-look before trusting it fully.

---

### 2026-08-19: MESSAGE_RECEIVED - the auto-reply-to-incoming-messages trigger

**This was the actual point of the feature, per direct correction from the person who requested
it** - the original plan's decision #1 scoped Auto-Responses to email/SMS only, "not the in-app
Messenger," on the assumption that was the whole ask. It wasn't: "the auto reply to incoming
message is literally the point of the feature... an auto-reply message that is automatically sent
to anyone who messages the artist while that flag is turned on." This entry adds that trigger
without reopening anything already built - SESSION_COMPLETED/PAYMENT_RECEIVED/MANUAL, the
precedence rule, and the manual send picker are all unchanged.

**Two decisions confirmed directly, not assumed:**
- **Delivery is BOTH**: the response posts as a real `Message` into the client's conversation
  thread (so it reads as an actual reply, the way a human's would) AND, per the response's own
  `emailEnabled`/`smsEnabled` toggles, goes out as a standalone email/SMS too - an away-message is
  meant to reach someone who isn't actively watching the thread, which in-app-only can't do.
- **Throttle is NONE - once per message, not once per conversation or per day.** A client who
  sends 3 messages while the flag is on gets 3 replies, matching a real email out-of-office
  responder (which answers every inbound message) rather than a "one nudge per day" pattern. The
  dedup key is the triggering Message's own id, not the conversation - see
  `models/AutoResponseLog.js`'s new `messageId` field and partial index, parallel to the existing
  `appointmentId` one.

**Routing rule, not directly asked but necessary to implement anything**: fires only when the
message's sender is a Client AND the conversation has EXACTLY ONE other member who resolves to an
Artist. Zero (staff-only thread) or more than one (group thread) is left alone rather than guessed
at - every ordinary client/artist Messages thread is this shape, and `Conversation` has no
artistId/shopId field to resolve it any other way (membership-only, see `utils/conversations.js`'s
own comment). Worth reconsidering if group threads become common.

**Files**: `models/AutoResponse.js` (new `MESSAGE_RECEIVED` trigger value),
`models/AutoResponseLog.js` (`messageId` field, `channel: 'thread'`, new partial unique index),
`utils/auto-responses.js` (new `sendAutoResponseForIncomingMessage`, best-effort/never-throws, same
`sendEmailFn`/`sendSmsFn` DI pattern as the other two send paths; new `DEFAULT_TEMPLATES.
MESSAGE_RECEIVED`), `graphql/mutations/messages.js` (wired into `createMessage`, right after the
existing `notifyNewMessage` call), `utils/validation.js` (`autoResponseTriggerSchema`),
`components/settings/AutoResponsesPanel.jsx` (trigger picker option + explanatory helper text -
this is the one trigger whose behavior isn't obvious from its label alone).

**New test file**: `test/integration/autoResponseMessages.test.js` - six cases covering the
in-thread-post-plus-email happy path, replying to every message in a back-and-forth (not just the
first), messageId-keyed dedup against a retried call, never firing for an artist's own reply (also
what stops this from ever triggering itself off its own auto-reply), skipping a staff-only/group
thread, and doing nothing when the flag is actually off. **Confirmed green on a real machine**
(see Test status) - all six cases pass.

No typeDefs change was needed: `trigger` is a plain `String!`, not a GraphQL enum, so
`MESSAGE_RECEIVED` only had to be added to the model's own enum and to `validation.js`'s Zod schema
(both confirmed via schema rebuild + `check-graphql-documents.js`, 325 documents, unchanged).

---

### 2026-08-18: Rules-of-Hooks crash in the Forms editors, seed script completeness, tests reported green

Danny reports both server and client suites green on a real machine — the first time either has
been confirmed outside this sandbox's standing `fastdl.mongodb.org` block (see Test status below,
still accurate for what a cloud session can verify on its own). Taken at face value; not
independently re-run from here.

**Fixed: `BookingRequestFieldsEditor.jsx` and `FormBuilder.jsx` both crashed on open** with `Rendered
more hooks than during the previous render`, reported from the browser console when clicking either
the Booking Request or Consent form from the Forms page. Root cause was identical in both files:
`useSensors(useSensor(...), useSensor(...))` (dnd-kit, needed for the field-reorder drag handle) was
called AFTER an early `if (loading) return <IBPageLoader />` / not-found return. `useSensors`/
`useSensor` call `useMemo` internally, so the "still loading" render skipped those hook calls
entirely while the "form loaded" render did not — a textbook Rules-of-Hooks violation, not a dnd-kit
bug. Fixed by moving both `useSensors` calls above every early return in both files, so they run
unconditionally on every render. Grepped the rest of `client/src` for `useSensor` first — only these
two files use it, so this is the complete fix, not a partial one. Syntax-verified with `esbuild`
(this sandbox has no route to run the client suite itself — see Test status); not yet re-clicked in
a browser from here.

**Fixed: `scripts/seed.js` and `scripts/seed-large.js` were missing roughly a dozen models added
after they were last updated** — `Adjustment`, `ClientFlag`, `ClientFlagType`, `ExpenseType`,
`Expense`, `IncomeType`, `Income`, `GiftCard`, `GiftCardRedemption`, `ShopCutRate` (in `seed.js`
only — `seed-large.js` already had it), `SquareAccount` (`seed.js` only), `EventLog`,
`ReminderSettings`, `ReminderLog`, `ClientScheduleEmail`. None were in either script's wipe/
`syncIndexes` list, so every re-run left them behind as orphans pointing at a shop/artist/client id
that run had just deleted and recreated with a fresh id — same class of gap `BookingRequest`/
`PasswordToken` were already fixed for (see the 2026-08-1x note further down), just never extended
to what shipped afterward. Nothing in this class of bug ever crashed a re-seed, which is exactly why
it went unnoticed for this long.

**Found in the process, and fixed where it was in scope: `ClientFlagType.ensureSeeded()` — the
model's own idempotent helper for writing the app's platform-wide default flag types (`NO_SHOWED`/
`MOVED_APPOINTMENT`/`NO_TIP`), explicitly documented in `models/ClientFlagType.js` as "safe to run on
every boot and from a seed script" — was called from NEITHER.** `seed.js` had no `ClientFlagType`
handling at all. `seed-large.js` hand-rolled its own different list instead (`NO_SHOWED`,
`CHRONIC_LATE`, `HAGGLES`, `GREAT_SITTER` — matching the model's canonical set only on `NO_SHOWED`).
Both now call `ensureSeeded()` first (`seed-large.js` keeps its extra three as demo-only additions on
top). **Bigger finding, left unresolved and out of scope of what was asked: nothing in application
boot code (`index.js`) calls `ensureSeeded()` either**, which on the evidence gathered here means
`ClientFlagType` currently has zero rows in any environment that wasn't hand-seeded locally —
i.e., the Client Flags feature has nothing to offer in a real deploy today. Worth its own item; see
Next.

**Also added to `seed.js` only, resolving an already-flagged open question from 2026-08-17 (see the
migration note further down): a disconnected `SquareAccount` row for the shop and for the
independent artist**, matching `seed-large.js`'s existing pattern and its own comment on why
disconnected is the honest fixture. `seed.js` previously created none at all.

**Fixed, found right after the above: the Consent form's Description field went blank every time
the edit page was reopened, even though `getForm` was correctly returning the saved text** (Danny
confirmed this by inspecting the query response directly). Root cause was in
`components/inputs/IBMultilineInput.jsx`, not in the Forms feature at all: the component only ever
accepted a `defaultValue` prop (uncontrolled) and had no `value` prop, so when a caller passed
`value` — `FormBuilder.jsx`'s description field (`value={description}`) — it was silently dropped,
never reaching the underlying MUI `TextField`. `onChange` still fired and still updated the
caller's own React state correctly, which is why SAVING always worked and the server always had the
right text; only the on-screen box itself rendered blank, unconditionally, on every mount. This is
the exact `value`/`defaultValue` gap `IBInput.jsx` was already fixed for (see that file's own
comment, `{...(value !== undefined ? { value } : { defaultValue })}`) — `IBMultilineInput.jsx` just
never got the same pass. Fixed by applying the identical pattern there. Same bug, second live site:
`FormFieldsRenderer.jsx`'s "paragraph" field type in form fill-out also passes `value` to this same
component for the same reason (visible right next to a working `IBInput` `value={...}` for the
"short_text" case) — never separately reported, but was equally broken, and is fixed by the same
one-file change with no edit needed at that call site. Every other caller of
`IBMultilineInput` (`ClientDashboard.jsx` x2, `AppointmentWizard.jsx` x2, `UpdateEventDialog.jsx`,
`SessionDetail.jsx`) already used `defaultValue`, which this change leaves untouched — confirmed by
grepping every caller before making the change, not just the one that was reported. No test file
exists for `IBMultilineInput.jsx` today (unlike its sibling `IBInput.test.jsx`) — worth adding one
that exercises both the controlled and uncontrolled paths, given this is exactly the kind of
regression a render-output assertion would have caught immediately.

**Changed, per explicit request: Expenses/Income are no longer shop-admin-or-independent-artist
only — every artist now manages their own personal ledger.** The server already supported this
(`resolveBusinessOwner`/`assertCanManageBusinessRecord`, `utils/shop-membership.js`, scope to the
caller's own `artistUserId` whenever `shopId` is omitted) and this exact gap was already flagged
below under Known gaps as "deliberate scope, not a bug" — Danny asked for it to change. Fixed by
widening three client-side visibility gates that all shared the old `hasAuditAuthority`/`!hasShop`
check verbatim: `App.jsx`'s `/expenses`/`/income` route `allowIf`, `settingsCategories.jsx`'s
`isVisible` for both categories, and `Sidebar.jsx`'s two `ListItemButton` gates — all now
`isArtist`/`user.userType === "artist"`, matching the same floor `Rates`/`Square Config` already
use. No server change and no `businessScopeFor` change were needed — `utils/businessScope.js`
already returned `{ artistUserId: user.id }` correctly for this exact case; only the UI was hiding
the door. `Forms`' own gate on the same Sidebar/Settings surfaces was deliberately left untouched —
Forms follows a different ownership model (shop-shared, not per-artist-always) and wasn't part of
this request. Syntax-verified with `esbuild`; not yet re-clicked in a browser from here.

### 2026-08-18: Auto-Responses (Settings > Messages) — new feature, built end to end

Requested: a place to manage message templates (aftercare after a session, receipt/out-of-studio
text) that vary by artist, toggleable on/off, and attachable to a message sent by hand. Planned via
`AskUserQuestion` (channel = email + SMS, placement = inside the existing "Messages" Settings
category, ownership = **both** a shop's set and an artist's own personal set coexisting, not one or
the other) and built per the resulting plan. Full design record and the "why" behind every decision
below lives in the plan file this shipped from; `DECISIONS.md` should get its own entry the next
time it's touched, since this is now a standing rule, not just a build log.

**Data model.** `models/AutoResponse.js` — `shopId` XOR `artistUserId` (same shape as
`Expense`/`Form`), `trigger` (`SESSION_COMPLETED` | `PAYMENT_RECEIVED` | `MANUAL`), `enabled`
(governs automatic firing only — a disabled response still shows in the manual send picker as long
as `active` is true), `emailEnabled`/`smsEnabled`, three nullable template fields (null = built-in
default, same convention as `ReminderSettings`), `active` (deactivate, never delete). At most one
ENABLED non-`MANUAL` row per owner per trigger, enforced by a partial unique index — **worth
knowing:** MongoDB partial indexes don't support `$ne`/`$in`/`$or`, so excluding `MANUAL` from that
constraint isn't done with a filter at all — a `pre('validate')` hook forces `enabled: false`
whenever `trigger === 'MANUAL'` (meaningless for a trigger that never auto-fires anyway), so a plain
`enabled: true` partial filter already excludes every `MANUAL` row. `models/AutoResponseLog.js`
mirrors `ReminderLog.js`'s claim-before-send shape, with `appointmentId` nullable (a manual send
isn't always tied to one) and no dedup constraint on the manual path — every manual send is a
deliberate action, never something to collapse against a previous one.

**Precedence rule (decision #4): the artist's own enabled response for a trigger wins; the shop's
fires only when the artist has none.** `utils/auto-responses.js`'s `resolveAutoResponseForTrigger`
is the one place this is decided, unit-and-integration-tested in isolation (see Test status).

**Backend.** `renderTemplate` extracted out of `utils/reminders.js` into a new shared
`utils/message-templates.js` (re-exported from `reminders.js` unchanged, so nothing else had to
change its import) — this is what a second feature needing the identical `{{field}}` substitution
looked like. `utils/auto-responses.js` holds `DEFAULT_TEMPLATES`, the precedence resolver, the
automatic send path (`sendAutoResponsesForTrigger` — best-effort, never throws, same contract as
`syncNoShowFlag` at its own call sites), and the manual send path (`sendManualAutoResponse` — throws
real errors, since it's behind a deliberate mutation). Both send paths take injectable
`sendEmailFn`/`sendSmsFn` for testability, matching `client-booking-emails.js`'s own precedent.
Trigger wiring is two call sites, both best-effort and both restricted to `appointmentType ===
'session'`: `mutations/appointments.js`'s `updateAppointment` (the "Close Session" transition) and
`routes/squarePayments.js` (a card charge auto-completing a session) — same duplication reasoning
as the existing `appointmentDate`-stamping logic right next to each, since a session can complete
either way. `PAYMENT_RECEIVED` is modeled in the schema (a Receipt template can be created and
toggled today) but **has no auto-fire hook** — deliberately deferred, since real Square payments are
already a separate deferred item (see Next #1) and this shouldn't get ahead of that verification.
GraphQL: `typeDefs.js` additions, `utils/validation.js` zod schemas, a new
`resolvers/autoResponses.js` (same two-step authorization shape as `resolvers/expenses.js` —
`resolveBusinessOwner` on create, `assertCanManageBusinessRecord` re-checked on every read/update),
registered in `resolvers/index.js`. Both seed scripts updated (`AutoResponse`/`AutoResponseLog` in
the wipe/`syncIndexes` lists from the start — the gap fixed for other models earlier this session
isn't repeated here); `seed-large.js` also seeds a shop-wide aftercare response, one shop artist's
personal override of it (demonstrating the precedence rule), and an independent artist's `MANUAL`
"Out of studio" template.

**Frontend.** `components/settings/AutoResponsesPanel.jsx` — two independently-gated sections
(`isArtist` for "Your Auto-Responses", `hasAuditAuthority`-and-actually-has-a-shop for the shop-wide
one) that can BOTH render for the same shop-connected artist at once — deliberately not a toggle
between them, since that's the whole point of the shop-can-set-policy-artist-can-override model.
Wired into `settingsCategories.jsx`'s existing `"messages"` category alongside `RemindersPanel`.
`components/autoResponses/SendAutoResponseButton.jsx` — the manual "Send a message" picker, grouped
"Yours"/"From [shop]"; wired into `ClientDashboard.jsx` (staff/artist view only, same rule as
Notes/Flags) and `SessionDetail.jsx`'s action row. `services/AutoResponseService.js` follows
`ExpenseService.js`'s shape. New CSS in `settings.css` (`.autoResponseRow*`) and
`clientDashboard.css` (`.clientDashboardSendAutoResponse`) — small additions, not called out in the
original file list, needed once the panel/button actually had somewhere to render.

**Verified from this sandbox:** `node --check` on every new/edited server file, a full
`makeExecutableSchema` rebuild, and `scripts/check-graphql-documents.js` (325 documents checked, up
from 320 — the five new `AutoResponseService.js` documents all matched the schema on the first try).
`esbuild` syntax checks on every new/edited client file. **Not verified from this sandbox:** actually
clicking through the Settings panel or the send picker in a browser (this environment cannot reach
`fastdl.mongodb.org`, unlike the user's own machine — see below).

**New test files, run for real on 2026-08-18, one real bug found and fixed:** `test/unit/
message-templates.test.js` (pure `renderTemplate` cases) and `test/integration/
autoResponses.test.js` (the precedence rule in all four directions, the MANUAL-forces-`enabled:false`
schema hook, the enabled-uniqueness partial index actually rejecting a duplicate, the automatic
path's claim-before-send dedup firing exactly once across two calls for the same appointment, and the
manual path's lack of a dedup constraint). The real `npm test` run surfaced `TypeError: next is not a
function` thrown from `models/AutoResponse.js`'s `forceManualDisabled` pre-`validate` hook on every
single `AutoResponse.save()` call (11 of the 11 new integration tests failed on this, all before
reaching their own assertions) — the hook was written in the traditional
`function(next) { ...; next(); }` callback style, but this repo's Mongoose/Kareem version does not
supply a callback for this hook registration. Fixed by dropping the `next` parameter and callback
entirely (a plain zero-arg synchronous hook function is the correct modern-Mongoose form here — see
`models/AutoResponse.js`'s current source). This bug was universal, not integration-test-only: it
broke every code path that ever saves an `AutoResponse` document, including the `createAutoResponse`
mutation, the Settings UI, and `seed-large.js`'s three sample rows.

**Second real bug, found on the next `npm test` run after the fix above (906/907 passing, one
failure left):** `AutoResponseLog`'s dedup unique index (`{autoResponseId, appointmentId, channel}`,
partial on `appointmentId` existing) was meant to constrain the automatic path only, but its partial
filter didn't actually say that — it just said "appointmentId is set," which is also true of a manual
send made from a session page (`SessionDetail.jsx` passes `appointmentId` for audit context even
though the send is manual). Two manual sends for the same appointment/channel hit the same unique
key and the second `AutoResponseLog.create` threw `E11000 duplicate key error`, contradicting
decision #7/#8 ("manual sends have no dedup constraint at all"). Fixed by adding
`triggeredByUserId: { $eq: null }` to the partial filter — `triggeredByUserId` is only ever null on
the automatic path (`sendAutoResponsesForTrigger` never sets it; `sendManualAutoResponse` always
does), so the index now only ever fires for a genuinely automatic row, regardless of whether a
manual send happens to also carry an `appointmentId`. See `models/AutoResponseLog.js`'s updated
header comment and index definition. Re-run `npm test` after pulling this fix to confirm all 907
tests are green.

## Test status

**2026-08-19: Danny reports the full suite green on a real machine**, after the Auto-Responses
fixes, the new `MESSAGE_RECEIVED` trigger (including its new `test/integration/
autoResponseMessages.test.js`, six cases), and the `submitFormResponse` guest-routing fix above.
Taken at face value, same as the 2026-08-18 report below — not independently re-run from here.

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

### 2026-08-17: default Booking Request / Consent forms, slug-based public links, Settings > Forms

Same environment limitation as every entry above — this sandbox still cannot reach
`fastdl.mongodb.org`, so nothing in this round has ever run against a real `mongod`, and unlike the
2026-08-15/16 pushes **no new integration or unit test files were written for this feature at all**
(see Known gaps). What is verified, every step: `node --check` on every touched/new server file, a
full schema rebuild via `makeExecutableSchema({ typeDefs, resolvers })`, `server/scripts/
check-graphql-documents.js` (320 documents, zero mismatches — up from 316), and a full production-mode
`esbuild` bundle of `client/src/App.jsx` (4.0mb, clean) plus targeted bundles of every individual
touched/new `.jsx` file. Treat the authorization logic (`updateBookingRequestFields`'s exact-key-set
enforcement, `getMyFormLinks`'s self-scoping, the slug resolver's `ARTIST_STATUS.ARCHIVED` short-
circuit, `submitFormResponse`'s new slug-resolved guest path) as unverified by a real test run, same
as the standing caveat on every other feature in this file.

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

**Standing convention, as of 2026-08-17: a migration written for existing data also gets folded
into BOTH `scripts/seed.js` and `scripts/seed-large.js`, not left as a separate step.** This was
missed for `scripts/migrate-seed-default-forms.js` (see Done below) — both seed scripts build their
fixtures by constructing Mongoose documents directly (`new Shop(...).save()`), never through
`createShop`/`registerAccount`, so a hook wired only into those resolvers silently never fires for
seeded data, and the gap is invisible until someone notices a feature "isn't there" in a freshly
seeded database. `seed.js`/`seed-large.js` now both call `seedDefaultForms` directly after creating
their shop and independent artist, so `npm run seed`/`node scripts/seed-large.js` are a complete,
currently-correct database on their own — no second script to remember. `scripts/migrate-square-accounts.js` is NOT yet folded in this same way — it predates this
convention, and checking while fixing the forms gap turned up the same class of miss: `seed-large.js`
writes a `SquareAccount` row directly (disconnected, by design — see that script's own comment), so
it never needs the migration; but `seed.js`, the small one, creates NO `SquareAccount` row for its
shop or artists at all, migrated or not — a `npm run seed` database has never had one. Whether that
is itself worth fixing (either seed it disconnected, matching `seed-large.js`, or confirm the app
tolerates a shop/artist with no `SquareAccount` row at all) is unresolved; flagged here rather than
silently left for someone to trip over the same way the forms gap was found.

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
  (`updateForm`), with add/remove/reorder/type-picker/required-toggle/choice-option editing and,
  once the form is real, inline publish/archive/guest-link controls. Reordering was plain up/down
  buttons at first; see the 2026-08-17 entry below for the `dnd-kit` drag-and-drop rewrite, and note
  that the "Settings' 'Forms' category gate...`hasAuditAuthority`" sentence a few lines up was
  loosened again the same day — see below for the current gate. `components/forms/
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
- **Default Booking Request and Consent forms, generalized slug-based public links
  (`/<formSlug>/<ownerHandle>`), and Settings folded into "Forms."** Three decisions locked in up
  front: (1) the real `BookingRequest` pipeline (`createBookingRequest`, its model, the static
  `/book/:artistHandle` route) stays completely untouched byte-for-byte — the `booking_request`
  system form only controls order/label/required/hidden on its fixed 7 optional slots, through a
  RESTRICTED editor, never the generic `FormBuilder`; (2) a shop-use-only form gets ONE shop-wide
  link (`Shop.formSlug` as the URL's own `ownerHandle` segment) instead of one per artist; (3) form
  management stays gated to shop-admin-or-better and independent artists, unchanged.

  **Server.** `Shop.formSlug` + `utils/shop-slug.js`, generalizing the same slug/reserved-word/
  partial-unique-index pattern `utils/booking-slug.js` already used for `Artist.bookingSlug` — now a
  third instance, `utils/form-slug.js`, for `Form.slug` itself. `Form` gained `slug`, `shopUseOnly`
  (meaningless, left false, on an artist-owned form), `systemKey` (`'booking_request'` | `'consent'`
  | `null`, non-deletable, one-per-owner via a partial unique index), and `fields[].hidden` (settable
  ONLY through `updateBookingRequestFields`, never the generic `createForm`/`updateForm` —
  `FormFieldInput` has no `hidden` argument at all, since a generic form's only way to remove a field
  is real deletion, but the `booking_request` form's 7 slots can't be deleted). `"book"` is reserved
  in `form-slug.js`'s `RESERVED_SLUGS` to everyone except the seed script, which writes it directly:
  the seeded `booking_request` form is *displayed* with slug `"book"`, but its real public URL is
  still the untouched static route, never the new dynamic resolver — React Router ranks a static
  first segment above a dynamic one at the same position, so the two coexist with zero special-
  casing in `App.jsx`.

  `utils/seed-default-forms.js` provisions both defaults — idempotent, called from `createShop`, the
  shop branch of `registerAccount`, and the independent-artist branch of `registerAccount` (NOT for
  a shop-affiliated artist joining an existing shop, who is already covered by that shop's own
  forms). The Consent Form's description is the full legal text captured verbatim from
  `thecopperwolf.com/pages/consent-form`, plus a required ID-photo upload and a required typed
  signature field. **Fixed in this pass**: the seed originally left `allowGuestSubmissions` at its
  schema default of `false` on the Consent Form, which would have made every fresh `/consent/<handle>`
  link render fine (the slug resolver only checks `status`, not guest-access) but fail at actual
  submission with "Action not allowed" — a broken default for the one form whose entire point is a
  guest signing before their account exists. Now seeded with `allowGuestSubmissions: true` and a
  minted `publicToken`, mirroring `setFormGuestAccess`'s own side effect exactly.
  `scripts/migrate-seed-default-forms.js --dry-run`/`(apply)` backfills every shop/independent-artist
  row that predates this feature, reusing the same `seedDefaultForms`/`DEFAULT_FORM_DEFS` so the
  `allowGuestSubmissions` fix applies there too with no separate change needed.

  `utils/public-form-lookup.js`'s `resolvePublicFormBySlug` is the one place both the new
  `getPublicFormBySlug` query and `submitFormResponse`'s guest path decide what `/<formSlug>/
  <ownerHandle>` actually points at: `ownerHandle` checked against `Artist.bookingSlug` first
  (archived artist short-circuits to `'artist_gone'` before even looking for a form — only ARCHIVED
  counts as gone, INACTIVE/BOOKS_CLOSED still resolve, matching what `createBookingRequest` itself
  already tolerates for the same artist), then that artist's own form, then their shop's non-
  `shopUseOnly` form of that slug; failing that, `Shop.formSlug` matched only against `shopUseOnly:
  true` forms. Four states — `ok`/`not_found`/`inactive`/`artist_gone` — a deliberate departure from
  the older `getPublicForm`/`publicToken` mechanism's single generic dead end. `submitFormResponse`
  now accepts a guest via EITHER a `publicToken` OR a resolved `formSlug`+`ownerHandle` pair, both
  still gated by the real authorization boundary, `Form.allowGuestSubmissions`, re-checked server-side
  regardless of which path resolved the form.

  `PublicArtistProfile` (the OLDER `getPublicArtistProfile` query the untouched `/book/:artistHandle`
  page itself uses) gained a matching `archived: Boolean!` field, extending the same "don't collapse
  ARCHIVED into generic not-found" fix to that pipeline too — it used to return `null` for an
  archived artist exactly like a mistyped link, and now `BookingRequest.jsx` shows "This artist is no
  longer on the platform." instead of "We couldn't find this artist," while a genuinely nonexistent
  handle still gets the generic message (`null` now means only that).

  A new self-scoped `getMyFormLinks` query closes an access gap the existing `getForms(shopId)`
  had: that query requires shop-admin-or-better (`assertCanManageBusinessRecord`), so a plain
  shop-connected artist (not an admin) could never see even their own shop's default form links.
  `getMyFormLinks` takes no scope argument at all — server-derives from the caller's own `user.id` +
  `getShopIdsForUser` — and returns only `{title, slug}`, never enough to manage or delete anything.

  **Client.** `FormBuilder.jsx`'s field list is now drag-and-drop (`@dnd-kit/core`/`sortable`/
  `utilities`, newly installed — `useSortable` rows with a dedicated small drag-handle button rather
  than the whole row, so dragging doesn't fight with editing a label mid-drag) in place of the old
  up/down buttons, plus new `slug`/`shopUseOnly` fields and a "Default form" badge; a `useEffect`
  redirects straight to a dedicated `/forms/:formId/booking-fields` editor
  (`BookingRequestFieldsEditor.jsx`) the instant a `booking_request` form is opened there instead —
  that restricted editor exposes only label/required/hidden per fixed slot (no type, no add/remove),
  saving through `updateBookingRequestFields`. `Forms.jsx` hides Delete for any `systemKey` form and
  links a `booking_request` row to its own editor instead of the generic one.
  `PublicFormBySlugFillOut.jsx` is the new guest fill-out page at `/:formSlug/:ownerHandle`. renders
  the right one of the 4 states above, styled after the older `PublicFormFillOut.jsx` it mirrors.

  **Settings: "Booking" absorbed into "Forms," not just renamed.** Booking became one form among
  several sharing the same link scheme, so the old standalone "Booking" category
  (`BookingLinkPanel.jsx` — its `isArtist(user)` gate, and its slug field + copy button, both moved)
  is gone from `settingsCategories.jsx`; `BookingLinkPanel.jsx` itself is left in place, unreferenced
  by any route or category, rather than deleted (touched-once-written files under this project's own
  folder can't be silently removed — see the file-deletion convention). `FormsPanel.jsx` is rewritten
  around two independently-gated sections, so folding Booking in doesn't regress the artist who used
  to see it: "Your link" (the same `BookingSlugField`/save/copy pattern `BookingLinkPanel.jsx` had,
  relabeled — visible to any artist, matching Booking's old gate exactly) plus a list of that artist's
  own published, non-`shopUseOnly` form links (from `getMyFormLinks`, each rendered via a new
  `formUrl(slug, ownerHandle)` helper mirroring `bookingUrl`'s exact shape), and "Manage Forms" (an
  on-ramp button, `hasAuditAuthority`-gated, unchanged from before). `settingsCategories.jsx`'s
  `"forms"` category `isVisible` is now `isArtist(user) || hasAuditAuthority(user)` — the union of
  both sections' own floors, so the category itself doesn't vanish for someone who can only see one
  half. `ShopPanel.jsx` gained the shop-wide counterpart: an editable `Shop.formSlug` field (via the
  new `updateMyShopFormSlug` mutation) plus a list of the shop's own `shopUseOnly` form links, built
  the same way. New shared CSS (`.formLinksList`/`.formLinksRow*` in `settings.css`) covers both link
  lists; `.settingsSaveState`'s base class had been in use with no actual rule since the shop-cut-%
  autosave field was built (2026-08-11-ish) — every save/error state rendered as unstyled plain text —
  fixed in the same pass rather than shipping a second unstyled instance for the new link field.

  A pre-existing gap, unrelated to this feature but hit while wiring the new `ShopPanel.jsx` query:
  `ArtistService.fetchArtist(artistId)` had no `skip` option at all, so any caller without a
  guaranteed non-null id (every existing caller happened to always have one, since each was only ever
  rendered when `isArtist(user)` was already true) would fire the query with a null `$artistId` on
  every render. `FormsPanel.jsx` is the first caller that ISN'T `isArtist`-gated at the component
  level (it renders for shop-admins who aren't artists too), so this was fixed at the source —
  `_fetchArtist` now defaults `skip: !artistId` and accepts an `options` override — rather than
  worked around locally.

  **Known, deliberate gap, matching an existing pattern**: same as Expense/Income's own documented
  gap below, `createForm`'s `resolveBusinessOwner(user, data.shopId)` gives ANY authenticated user a
  personal `artistUserId`-scoped form when `shopId` is omitted — a Client- or Staff-typed account
  could call `createForm` directly (not through any UI, which stays gated to
  `hasAuditAuthority`/`isArtist`) and own a form nobody else can see. Confirmed still present, not
  fixed here (task #159 in this round's plan) — same "server is more permissive than the UI exposes"
  tradeoff this codebase already accepts for Expense/Income, not a new decision.
- **Both dev seed scripts now seed the two default forms too — found because they didn't, on a
  real account.** Reported directly: a shop that already existed before 2026-08-17 had neither
  form, which traced to the expected cause (`scripts/migrate-seed-default-forms.js` never run
  against it — see that script's own header). But checking `npm run seed`/`node scripts/
  seed-large.js` turned up a second, more surprising instance of the same root problem: BOTH seed
  scripts build their fixtures with `new Shop(...).save()`/`new Artist(...).save()` directly, never
  through `createShop`/`registerAccount` — so `seedDefaultForms`, wired only into those two
  resolvers, silently never ran for seeded data either. A brand-new `npm run seed` database has
  never had the two default forms, since the feature shipped, and nothing said so.

  Fixed by calling `seedDefaultForms` directly from both scripts — once for the shop (right after
  `setShopCutRate` zeroes the owner's own cut in `seed.js`; right after `owner`/`independent` are
  resolved from the artists loop in `seed-large.js`) and once for the independent artist in each.
  `Form`/`FormResponse` were also missing from both scripts' wipe-and-`syncIndexes` passes — added,
  for the same "a stale unique index makes a re-seed fail for a reason nothing explains" reason
  those two passes already exist. Both scripts' closing console output now prints the seeded
  `/consent/<slug>` links alongside the existing `/book/<slug>` ones.

  **This is now a standing convention, not a one-off fix** — see the note in Test status above
  ("Standing convention, as of 2026-08-17"): going forward, a migration written for existing data is
  folded into both seed scripts in the same change, specifically so `npm run seed`/`node scripts/
  seed-large.js` are always a complete, currently-correct database, and nobody has to remember a
  second script exists. `scripts/migrate-square-accounts.js` predates this convention and was
  checked while fixing this — still not folded in, and `seed.js` (not `seed-large.js`) turned out to
  create no `SquareAccount` row at all, migrated or not. See Test status above for the open question
  on whether that's worth fixing.

## Next

**0 and 1 below (the shop-admin migration, and a real Square payment) are explicitly deferred as of
2026-08-18 — Danny said not to worry about either yet and will say when to pick them back up.** Left
written out below rather than deleted, since the "Run it once, for real" suite item is now reported
done (see 2026-08-18 note above) and the rest of each item's own detail is still accurate and will
still be needed whenever this is picked up again.

0. ~~Run both suites on a real machine~~ — **done, reported green 2026-08-18** (see above). **Then
   the shop-admin migration** — deferred, not urgent: `node scripts/migrate-shop-admins-to-artists.js
   --dry-run` first. Until it runs, a `STAFF`-typed shop admin still has no Settings page — which is
   how this was found. See `DECISIONS.md` S0 for what the migration costs. Explicitly NOT migration-
   script work right now per Danny (this is dev data he can reseed at will) — this item is about
   *production/pre-existing* data specifically, which is why it's still deferred rather than dropped.

1. **DEFERRED — take one real payment end to end**, when told to pick it back up. Nothing in the
   charge path has ever touched Square. It was
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
1 (a real Square payment) and 0 (the two suites — done — then the migration) — both deferred, see
above, not because there's other feature work queued ahead of them. A resolve-by-id mutation for a
manually-raised client flag is a real, stated gap (see Known gaps) but nobody has asked for it yet.

**New candidate item, found 2026-08-18: wire `ClientFlagType.ensureSeeded()` into application boot
(`index.js`), or some other real call site outside the dev seed scripts.** It's currently called from
nowhere except `scripts/seed.js`/`scripts/seed-large.js` (both fixed today — see above), despite the
model's own header comment describing it as safe "on every boot." On the evidence gathered fixing the
seed scripts, this means `ClientFlagType` likely has zero rows in production and any other
non-locally-seeded environment right now — the Client Flags feature has nothing to flag with. Not
independently confirmed against a real deploy, and not touched here since it's a production boot-code
change, out of scope of "fix the seed scripts." Worth a look next time client flags come up.

**New candidate item, found 2026-08-18: wire the `PAYMENT_RECEIVED` Auto-Response trigger to an
actual auto-fire hook once real Square payments (item 1 above) are picked back up.** The trigger
value already exists in the schema and a Receipt template can be created/toggled in Settings today
— see the Auto-Responses entry above — but nothing calls
`sendAutoResponsesForTrigger({ trigger: 'PAYMENT_RECEIVED', ... })` anywhere yet, deliberately, since
wiring a receipt to a charge path that's never been verified against real Square would be building
on top of an unverified foundation. The natural call site is the same success path in
`routes/squarePayments.js` that `SESSION_COMPLETED` already hooks into — add a parallel best-effort
call there once item 1 is unblocked.

**Resolved 2026-08-18: `npm test` was run for real on the new Auto-Responses test files and found a
real bug**, now fixed — see the Auto-Responses entry above for the full account
(`models/AutoResponse.js`'s `forceManualDisabled` hook was throwing `TypeError: next is not a
function` on every `AutoResponse.save()`). Still worth a confirming re-run of the full suite after
pulling the fix, same as any bug fix, but this is no longer an unexecuted-test gap — it's a fixed
regression.

## Known gaps, not bugs

- **Every existing shop and artist has a tax rate of 0.** Not a migration oversight — there was no
  way to set one until now, so every row is genuinely unconfigured. Any charge taken before someone
  visits Settings collects no sales tax, and the panel says so on screen rather than leaving it to
  be noticed from a receipt. Worth setting for every real shop before the charge path goes live.
- **Nothing writes a `ShopCutRate` row automatically.** Until an admin records one, every lookup
  falls through to the connection or shop value exactly as before. Behaviour is unchanged.
- ~~`S2` is unevenly implemented~~ — **stale, already fixed; this bullet should have been removed
  when it was.** Confirmed 2026-08-21 by reading every affected file directly:
  `hasAdminAuthority`/`assertAdminAuthority` (`utils/shop-membership.js`) is exactly the shared
  helper this bullet asked for, and it's already wired into `archiveClient`/`unarchiveClient`/
  `redactClient`/`updateClient` (`mutations/clients.js`), `archiveArtist`/`unarchiveArtist`
  (`mutations/artists.js`, with its own "NO ROLE FLOOR, deliberately - DECISIONS.md S2" comment),
  and `updateSquarePricingSettings` (`mutations/squarePricing.js`). Matches the "Done" section's
  own "S2 is implemented" entry above - this gap and that done-item were just never reconciled.
  The bare `SHOP_ADMIN` floors that remain elsewhere (`updateShop`, `disconnectShopSquare`,
  `confirmShopCutPaid`, `confirmBoothRentPaid`, `createStaffAccount`, and similar) are correctly
  left alone - each is a genuinely shop-only action with no independent-artist equivalent to grant,
  exactly as `hasAdminAuthority`'s own header comment enumerates.
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
- ~~A shop-connected plain artist's personal expense/income ledger has no UI~~ — **resolved
  2026-08-18, see the note near the top of this file.** Was deliberate scope, changed on request.
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
- **The Forms client code has no automated tests yet** (no `FormBuilder.test.jsx`,
  `FormFillOut.test.jsx`, `PublicFormBySlugFillOut.test.jsx`, `BookingRequestFieldsEditor.test.jsx`,
  `FormsPanel.test.jsx`, etc.), and the full client `vitest` suite could not be run end-to-end in the
  sandbox that built any of it (times out before finishing — see Test status above). Verified instead
  via a production `vite build`/`esbuild` bundle, `check-graphql-documents.js` (320 documents, clean),
  and the complete pre-commit hook where applicable. Continuing the testing initiative (see the
  `isPersonal`/unit-test gaps above) into this feature — both the 2026-08-14 Forms base and the
  2026-08-17 default-forms/slug-link/Settings work on top of it — is real, queued work with zero
  coverage today, not just thin coverage.
- **The 2026-08-17 default-forms/slug-link feature has no server test coverage either** — unlike
  `adjustments.test.js`/`clientFlags.test.js`/`expenses.test.js` (written but unrun, see above), no
  test file was even written for `utils/form-slug.js`, `utils/shop-slug.js`, `utils/
  public-form-lookup.js`, `utils/seed-default-forms.js`, `updateBookingRequestFields`'s exact-key-set
  enforcement, `getMyFormLinks`'s self-scoping, or the new `getPublicArtistProfile.archived`/
  `getPublicFormBySlug` state logic. `node --check`, a full schema rebuild, and
  `check-graphql-documents.js` all pass, but none of the actual behavior — including the authorization
  logic — has run against a database even once. Highest-priority gap to close before trusting this
  feature with a real shop's forms.

## How this repo carries context

Sessions end; the repo does not. Three places, on purpose:

- **`DECISIONS.md`** — the rule and why, including the rejected alternative.
- **Commit messages** — why a specific change was made, and what was verified versus written.
- **Code comments** — why *this* line is the way it is, usually naming the bug that caused it.

A new session should be able to start from these alone. If something important lives only in a chat,
it is not written down.
