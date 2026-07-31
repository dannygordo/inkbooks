
# InkBooks — Production Readiness Roadmap

Prepared July 31, 2026. Scope: pre-launch app, no live customer data yet, "fix and harden in place" (not a rewrite), hosting stack not yet chosen.

This roadmap assumes one thing above all: nothing here needs to happen gracefully around live users, because there aren't any yet. That's the single biggest asset you have right now — use it. Every fix below can be a breaking change if it needs to be.

---

## Phase 0 — Stop the bleeding (do this before anything else, no code changes required)

These are credential rotations and account-security items, not engineering work. They take an afternoon, not a sprint.

1. **Rotate the MongoDB Atlas password** for user `zewolve`. The current password is sitting in git history on two GitHub accounts.
2. **Rotate the JWT `SECRET_KEY`.** This invalidates every existing session — fine, since there are no real users to disrupt yet.
3. **Rotate the shared Firebase account** (`firebase@inkbooks.net`) password, or better, eliminate the pattern entirely (see Phase 2, Firebase Auth section).
4. **Decide on git history.** The `.env.production`/`.env.development` files are in the history of both the `cognitronic` and `dannygordo` repos. Since you're pre-launch, the simplest fix is: rotate every credential (done above), add proper `.gitignore` entries, and don't worry about scrubbing history — the old values are dead the moment you rotate them. If you want a clean repo anyway, `git filter-repo --path server/.env.production --path server/.env.development --invert-paths` rewrites history to remove them, but every collaborator needs to re-clone afterward.
5. **Confirm whether `dannygordo/inkbooks` is public or private**, and set it to private if it isn't already, at least until Phase 1 closes the open endpoints below.

---

## Phase 1 — Fix the actual vulnerabilities (highest priority engineering work, ~1 week)

This is the part that matters most. In order of severity:

### 1. Full account takeover via `forgotPassword` (most severe finding, worse than everything else combined)

`server/graphql/resolvers/users.js` — `forgotPassword(username, password)` looks up a user by username and sets their password directly, with **no verification that the caller owns the account**. No email, no token, no current-password check. The public `/resetPassword` route (outside any auth guard) renders `IBUpdatePassword` with `isPublic={true}`, which asks for nothing but username + new password.

Chained with finding #2 below (unauthenticated `getUsers`, which returns every username in the system), this is a fully automatable, zero-credential attack: enumerate every username, then take over every account, including whichever one ends up being Admin.

**Fix:** replace `forgotPassword` with a real flow — generate a single-use, time-limited reset token, email it to the account's registered address, and only accept a password change when a valid token is presented. This requires transactional email (SendGrid, Postmark, or SES — pick one) which you don't have set up yet; treat standing that up as part of this fix, not a separate task.

### 2. Every read query is unauthenticated

`getArtists`, `getClients`, `getProjects`, `getUsers`, `getStaff`, `getShops`, `getMessages`, `getConversations*`, `getAppointments*` — none of them call `checkAuth`. Anyone who can reach the endpoint gets every client's PII, every project's images/notes, every user's email and role, no login required.

**Fix:** every Query resolver needs a `checkAuth(context)` call at minimum, and most need an additional ownership/role check (a Client should only ever see their own projects and profile, not everyone's). Don't do this by hand-editing 20 resolvers one at a time — see the "resolver wrapper" pattern in Phase 2, which fixes this and prevents it from regressing.

### 3. `register` accepts a client-supplied `role`

Nothing stops a direct API call (bypassing the React form, which hardcodes `role: 30`) from registering with `role: 1` (Admin). **Fix:** the `register` mutation should hardcode `role: CLIENT` / `userType: 'client'` server-side, full stop. Elevated roles (Artist, Staff, Shop Admin, Admin) should only be assignable through a separate, authenticated, Admin-only mutation — never through public self-registration.

### 4. Registration is currently broken, two independent ways

`Register.js`'s GraphQL mutation string has `tagColor; $tagColor` (semicolon, not colon) — a syntax error that will fail to parse client-side. Separately, the server's `register` resolver references a bare `tagColor` variable that's never destructured from its arguments — a `ReferenceError` the moment it's hit. Both need fixing regardless of anything else; right now no one can create an account.

### 5. Copy-pasted bug in every delete mutation

`deleteArtist`, `deleteClient`, `deleteStaff`, `deleteShop`, `deleteConversation`, `deleteMessage`, `deleteAppointment` all do `const x = Model.findById(id)` without `await` — that's a Query object, not a document, so the existence check is meaningless. `deleteAppointment`/`updateAppointment` also compare a JWT string `user.id` against a Mongoose `ObjectId` `appointment.userId` with `===`, which never matches. **Fix:** add the missing `await`, and centralize ID comparison in a helper (`String(a) === String(b)`) so this class of bug can't recur.

### 6. Authorization gap that likely blocks real usage

`updateProject`, `updateProjectNotes`, `updateProjectTags` require `role <= SHOP_ADMIN` (10). Artists are role 20 — so an Artist can't add notes or tags to their own project, a feature your own git history shows was built. Decide the intended rule (probably: Admin, Shop Admin, or the assigned Artist on that specific project) and fix the check to match.

### 7. Cleanup while you're in these files

Delete `server/models/Material.js` (unused), `server/graphql/mutations/users.js` (orphaned type def, never wired in), `client/src/utils/hooks/useForm.js` (unused), and either build out or delete `client/src/context/global.js` (empty stub provider).

---

## Phase 2 — Structural hardening (prevents the Phase 1 bugs from coming back)

The reason Phase 1's bugs exist is that every resolver repeats the same `checkAuth` + role-check boilerplate by hand, so it's trivially easy to forget it (as happened on every single Query resolver). Fix the pattern, not just the instances:

- **Resolver-level auth wrapper.** ✅ Done — `server/utils/with-auth.js` wraps every Query resolver and every mutation across all 8 entities. It calls `checkAuth`, enforces an optional `minRole`, and passes the authenticated `user` as a 5th resolver argument for the OR-ownership cases (Admin, or the record's own artist/user) that can't be expressed as a flat role gate. New resolvers inherit protection by wrapping in `withAuth` instead of remembering to call `checkAuth` by hand.
- **Input validation library.** ✅ Done — hand-rolled `validators.js` is deleted; `server/utils/validation.js` has zod schemas for login/register/change-password, including a real minimum password length (8 chars) that never existed before, and catches the "silently ignored extra field" class of bug (`tagColor` is now in the schema and the resolver's destructure).
- **Firebase Auth, done properly.** ✅ Done and verified live (real login, real custom token, real `signInWithCustomToken` success in the browser) — replaced the shared static account (`firebase@inkbooks.net`) with real per-user Firebase Auth: the Express backend mints a custom Firebase token via the Admin SDK at login/register (using the user's own Mongo `_id` as the Firebase UID), the client signs in with `signInWithCustomToken`, and the shared credential is gone from the client bundle entirely. Storage Security Rules now require genuine authentication rather than one shared identity.

  Getting this working end-to-end surfaced three separate issues, worth recording since two of them had nothing to do with this rewrite:
  - `firebase-admin` 14.x removed the legacy `admin.credential.cert(...)`/`admin.auth()` API from its default export in favor of modular imports (`require('firebase-admin/app')`, `require('firebase-admin/auth')`). `server/utils/firebase-admin.js` is updated for this. Anyone bumping `firebase-admin` again later should check this hasn't moved further.
  - `client/src/config.js`'s `FIREBASE` block pointed at a stale, wrong project (`inkbooks-872df`) that matched neither the service account key nor the account's actual project (`inkbooks-cd85b`) — pre-existing, unrelated to this work, just never surfaced until real per-user auth started actually validating the token's issuing project. Fixed to the correct project's config; the unused/mislabeled `DATABASE_URL` field (a `gs://` Storage URI, not a real Realtime Database URL - nothing in the app uses Realtime Database) was dropped along with it.
  - The `inkbooks-cd85b` Firebase project had never had Authentication switched on in the console at all (Storage can be enabled independently). No code fix - just Firebase Console → Authentication → Get Started.
- **Consolidate the two backend listeners.** ✅ Done — `server/index.js` now bootstraps `@apollo/server` v5 as Express middleware (`expressMiddleware` from `@as-integrations/express5`) mounted at `/`, and `socket.io` is attached to the same `http.createServer(app)` instance instead of its own listener on port 4000. One process, one port (5500 in dev), one CORS origin list to maintain. This absorbed the Phase 3 `apollo-server` → `@apollo/server` migration too, since it's the same bootstrapping code either way — see Phase 3 table below, that row is also done now.

  Two things worth flagging from this pass:
  - **`createShop` now requires `SHOP_ADMIN`.** It previously had no role check at all — any authenticated user, including a Client, could create a Shop. That's inconsistent with every other create-mutation and was almost certainly an oversight, not intentional, so I tightened it to match the others. If you actually need unprivileged shop creation for some signup flow, tell me and I'll back it out.
  - **CORS is now enforced on GraphQL, not just socket.io.** Apollo Server v3's standalone mode had no CORS restriction by default (any origin). `Constants.URLS.INKBOOKS_WEBAPP` is now also the allowed origin for the Express/Apollo layer, and I made that constant environment-aware (`http://localhost:3000` in dev, `http://www.inkbooks.net` in production) since it was previously hardcoded to localhost even in the production branch — that would have silently broken production CORS the moment this got enforced. Confirm `www.inkbooks.net` is actually the right production domain before deploying.
  - **Node ≥20 is now required** (`@as-integrations/express5` enforces this via `engines`). Run `node -v` before you `npm install` — if you're on an older Node, the install or runtime will fail.
  - You'll need to run `npm install` in `server/` yourself (sandbox can't reach the npm registry) — `apollo-server` is removed and `@apollo/server`, `@as-integrations/express5`, `express`, `cors`, `graphql-tag`, and `zod` are added to `package.json`.

### Ownership-scoped queries — now a bigger decision than originally scoped

The original plan here was simple: a Client's `getClient` should only resolve their own record, a Shop Admin's `getArtists` should scope to their shop. That assumed the current shop-centric schema (`Artist.shopId`, `Staff.shopId` as hard foreign keys — an artist *belongs to* a shop) was staying as-is.

It isn't. The actual direction is artist-centric: an artist is the independent entity, and a shop is better modeled as a subscriber that gets granted visibility into a specific artist's schedule/projects/clients — for a dashboard with analytics and forecasting across the artists a shop is connected to. That's a many-to-many relationship with connection state (requested/approved/revoked) and likely per-connection permission granularity (a shop might see schedule but not client contact details, for example), not a single foreign key.

This needs its own design pass before implementation — new schema (something like an `ArtistShopConnection` collection: `artistId`, `shopId`, `status`, `permissions`, timestamps), a migration path for existing `Artist.shopId`/`Staff.shopId` data, the connect/follow request flow itself, and the shape of the shop-facing analytics dashboard this is ultimately in service of. Two things already work in its favor: `Project` already stores `artistId`/`clientId` directly with no `shopId` at all, and `Appointment` carries its own independent `shopId` separate from the artist's "home" shop — both read like the schema half-anticipated an artist working across shops even before this decision. Treat this as its own phase, tackled deliberately, not folded into the auth-wrapper/validation work above.

### Dependency vulnerability audit (`npm audit`) — result

Ran after the Apollo/Express/socket.io consolidation and the Node 16 → 24 upgrade. Started at 33 vulnerabilities, closed to 6, all deliberately:

- **`jsonwebtoken`** (2 CVEs, incl. a `jwt.verify()` insecure-default-algorithm bypass) — fixed properly, not just patched: bumped to `9.0.3` and explicitly pinned `{ algorithms: ['HS256'] }` on `check-auth.js`'s `jwt.verify()` and `{ algorithm: 'HS256' }` on `generateToken()`'s `jwt.sign()`, so the fix doesn't depend on the package's default behavior.
- **`mongoose`/`mongodb`** (prototype pollution, NoSQL injection via `sanitizeFilter`/`$nor`) — the highest-relevance fix in this batch, since several mutations pass raw client-submitted objects straight into `findByIdAndUpdate()`. Patched via `npm audit fix` within the existing `^6.2.0` range. The underlying pattern (unvalidated client objects going straight into Mongoose writes) is still a separate, open gap — tracked below, not yet fixed.
- **`nodemon`** (`brace-expansion`, `semver` ReDoS/DoS, only patchable via a major bump) — bumped `2.0.15` → `3.1.14`. Dev-only tool, no production exposure either way.
- **Stray `nvm` npm dependency** — removed. Not the real nvm (a shell script, never an npm package); an unrelated, unmaintained package that had somehow ended up in `package.json` doing nothing.
- **`firebase-admin`** `13.10.0` → `14.2.0` — closed the `@google-cloud/firestore`-side half of a `uuid` buffer-bounds-check chain. Required Node ≥22 (already covered by the Node 24 upgrade).
- **Remaining 6 (moderate, all `uuid`)** — accepted, not fixed. `@google-cloud/storage@7.19.0` (Google's own current release, confirmed directly against the registry — not something we're behind on) pins `uuid@^8.0.0` internally, and there's no newer release that changes this. The only fix `npm audit` offers is downgrading `firebase-admin` to `10.3.0`, a 3-major regression on the package the entire per-user auth system now depends on, to patch a code path (`@google-cloud/storage`'s Admin-SDK internals) this app's server code never actually calls — `firebase-admin.js` only touches `admin.auth().createCustomToken()`. Revisit only if Google patches `@google-cloud/storage` upstream, or if this app ever calls Storage through the Admin SDK directly (it currently doesn't — Storage is client-side only, via the Firebase client SDK).

### Known follow-up: unvalidated client input in Mongoose writes

`updateProject`, `updateAppointment`, `updateConversation`, and `updateMessage` all do the equivalent of `Model.findByIdAndUpdate({ _id: id }, clientSubmittedObject, { new: true })` — the entire args object from the client goes into the update with no key allowlist. The patched Mongoose closes the specific published CVEs, but the pattern itself is still a live gap: a client could submit unexpected keys (`role`, `_id`, Mongo operators) and have them written verbatim. Worth a dedicated pass — likely zod schemas per update-mutation, mirroring what `validation.js` already does for login/register, picking only the fields each mutation is supposed to accept.

---

## Phase 3 — Dependency & framework modernization

You're several major versions behind across the stack. Current latest-stable as of this writing, checked directly against the npm registry:

| Package | You're on | Current latest | Notes |
|---|---|---|---|
| `apollo-server` (standalone) | — | `@apollo/server` 5.5.1 | ✅ Done in Phase 2 — migrated to `@apollo/server` + Express (`@as-integrations/express5`) together with the listener-consolidation work. |
| `mongoose` | 6.2.0 | 9.6.3 | Requires Node ≥20.19. Multiple major versions of breaking changes (query behavior, TypeScript types, some deprecated methods) — read the 7.x, 8.x, and 9.x migration guides in sequence rather than jumping straight there. |
| `graphql` | 16.3.0 | still 16.x line, patch-level behind | Low risk to bump. |
| `react` | 17.0.2 | 19.2.6 | React 17→18 is the bigger behavioral jump (automatic batching, new root API via `createRoot`); 18→19 is smaller. Do it in two steps, not one. |
| `react-router-dom` | 6.2.1 | 6.x is current major, later 6.x releases exist | You're already on the current major; bump the minor/patch. |
| `@mui/material` | 5.2.8 | 9.1.0 | MUI 9's peer deps accept React 17/18/19, so this can be upgraded independently of the React bump, but MUI 6→7 dropped some legacy APIs (`@mui/styles` is deprecated — you use it, see below) — budget real time here. |
| `react-scripts` (CRA) | 5.0.0 | — (Create React App is unmaintained) | Recommend migrating off CRA entirely to **Vite** (currently 8.0.14). This is the single highest-leverage modernization step: faster dev server, faster builds, actively maintained, and CRA's `react-scripts` hasn't shipped a real update in years. |

Recommended sequencing, since doing all of this simultaneously is how migrations turn into multi-week yak-shaves:

1. Vite migration first (isolated, mostly config/tooling, doesn't touch app logic).
2. `@apollo/server` v5 + Express consolidation (also isolated — swaps the server bootstrapping, not the resolvers).
3. Mongoose major-version bump (do it in stages: 6→7→8→9, running your test suite — which you need to build, see Phase 5 — after each step).
4. React 17→18→19, then MUI 5→9 (MUI's `@mui/styles` package you currently use is deprecated in favor of `sx` prop / `styled()` — worth migrating call sites while you're touching this anyway, not as a separate future project).

**Revised call on TypeScript:** the original version of this section said to skip it, on the logic that it's a parallel investment that doesn't block a web-only production launch. That logic no longer holds now that a mobile app is in scope (Phase 6) — once two clients need to consume the same GraphQL API and stay in lockstep with schema changes, TypeScript plus schema-driven codegen stops being a nice-to-have and becomes the actual mechanism that prevents the two from drifting apart. Introduce it as part of the Phase 6 monorepo setup below, not bolted on twice later.

---

## Phase 4 — Payments

Square isn't actually wired up: `squareConfig.js` posts to `http://localhost:4000/process-payment`, but that port only runs the socket.io server — there's no route handling that path anywhere in `server/index.js`. The "production" Square config in `client/src/config.js` is a copy-paste of the sandbox app ID, not real production credentials.

To finish this:
1. Build the actual Express route (this ties into the Phase 2 "consolidate listeners" work — you'll have an Express app to add a route to) using Square's Node SDK to create a payment from the nonce.
2. Test the full sandbox flow end-to-end.
3. Apply for Square production access, get real production credentials, and store them as environment variables — never hardcoded, this time with the lesson from Phase 0 applied from day one.
4. You're already using Square's hosted card fields, which keeps you out of most PCI DSS scope — don't change that; don't ever let raw card numbers touch your server.

---

## Phase 5 — Mobile app

You need feature parity with the web app on mobile, and you want web and mobile to stay in sync without maintaining two divergent implementations of the same business logic. Three real options, weighed against what you're actually optimizing for:

**Full native (Swift/Kotlin, separate codebases per platform).** Best possible performance and platform-idiomatic UX. Rejected for you: it triples the surface area (web + iOS + Android as three unrelated codebases in three languages) and does the opposite of "easy to keep in sync" — every feature gets built three times by design.

**Flutter (Dart, single codebase for iOS + Android).** Genuinely excellent mobile performance and one codebase for both mobile platforms. Rejected for you specifically: zero code-sharing with your existing React/GraphQL web app. You'd be maintaining the business logic (auth flow, validation rules, API contracts) twice, in two different languages, which is the exact drift problem you're trying to avoid. Makes sense for a team building mobile-only or starting from scratch; doesn't make sense bolted onto an existing React codebase.

**Capacitor (wrap the existing React web build in a native shell).** The fastest path to an app-store listing — almost no new UI code, since it's your existing MUI/React app running in a native WebView with plugins bridging camera, push notifications, etc. Rejected as the primary approach for you, specifically because of what this app does: the core workflow is photo-heavy (reference images, body images, design images, cropping) and WebView camera/gallery performance and feel is noticeably worse than a true native camera component. It also caps how good push notifications and offline behavior can get. Worth knowing about as a cheap fallback if you ever need an app-store presence fast, but not the long-term answer.

**Recommendation: React Native via Expo, as its own app, sharing logic (not UI) with the web app through a monorepo.**

Why this wins on all three criteria you named:

- *Team velocity / ease of sync:* it's still React and still JavaScript — no new language, and your engineers (you) don't context-switch between two paradigms. The actual synchronization problem — API contracts and business logic drifting between clients — gets solved architecturally, not by hoping people remember to update both places.
- *Performance:* modern React Native (0.85.x as of this writing) runs on the New Architecture (Fabric renderer + JSI), which is close to native performance for the CRUD/list/form-heavy screens that make up most of this app. Camera capture and push notifications are first-class, well-supported Expo APIs — not framework afterthoughts.

**On photo editing specifically** (relevant since `referenceImages`/`designImages`/`bodyImages` with crop/rotate is core to the app, not incidental): the current `CropEasy.js` + `cropImage.js` combo — free pan, continuous zoom, 0-360° rotation slider, canvas rasterization — is built on `react-easy-crop`, which is a web-only package (pointer events + HTML canvas). It doesn't run in React Native, full stop, so this isn't a drop-in swap. The replacement is two pieces: `expo-image-manipulator` as the transform backend (crop/rotate/resize/flip/compress via native OS image APIs — actually handles full-resolution phone-camera photos better than a browser canvas does), plus a small custom cropper UI built with `react-native-gesture-handler` + `react-native-reanimated` to reproduce the pan/zoom/rotate interaction (`react-native-image-crop-picker` is a faster off-the-shelf alternative, but its rotation is typically 90°-increment only — a downgrade from the slider you have now). Both approaches include native modules, which means testing requires a custom Expo dev client via EAS Build, not the plain Expo Go app.
- *Functionality:* full native camera/gallery access, real push notifications through Expo's push service (APNs/FCM abstracted for you) — which is a genuine feature upgrade over the web app, not just parity. Appointment reminders and new-message notifications work properly on mobile in a way browser push never reliably does on iOS.

### How to structure it so web and mobile actually stay in sync

Don't build the mobile app as a bolted-on second project. Restructure the repo into a monorepo (Turborepo, currently 2.9.14, is the standard choice here) with this shape:

```
apps/
  web/       — your existing React app (post-Vite migration from Phase 3)
  mobile/    — new Expo/React Native app
packages/
  api/       — GraphQL operations (the ProjectService/ClientService/etc. pattern
              you already have — these are just gql tag definitions, already
              framework-agnostic and directly reusable as-is)
  shared/    — TypeScript types, zod validation schemas (from Phase 2), constants,
              pure utility functions (UtilsService-equivalent)
```

The mechanism that actually keeps web and mobile "in sync" isn't shared UI — it's **GraphQL Code Generator** (`@graphql-codegen/cli`, currently 7.1.3) pointed at your server's schema, generating TypeScript types and typed Apollo hooks into `packages/api`. Both apps import the same generated, typed operations. When the schema changes, both clients get compile errors at the exact call sites that break — not a silent runtime mismatch discovered by a user. This is also the concrete reason to stop deferring TypeScript (see the revised note in Phase 3).

What does *not* get shared: UI components. MUI doesn't run in React Native, and that's fine — mobile navigation (bottom tabs, native stack navigation via `expo-router` or React Navigation) should look and behave like a mobile app, not a squeezed-down web layout. The React Native screens get built fresh, using a lightweight RN component library (React Native Paper or Tamagui) rather than trying to port MUI.

Other things that need a cross-platform abstraction rather than direct reuse:
- **Auth token storage:** replace `CacheService`'s direct `localStorage` calls with a small storage interface — `expo-secure-store` (Keychain/Keystore-backed) on mobile, `localStorage` on web. Worth doing this refactor once, now, since it also fixes the XSS/localStorage token-theft exposure flagged back in the original audit.
- **Socket.io:** `socket.io-client` works in React Native without changes — no new work needed once the Phase 2 "consolidate listeners" work lands.
- **Firebase Storage uploads:** the Firebase JS SDK has a React Native-compatible path (`@react-native-firebase` or the same `firebase` JS SDK with RN's fetch polyfills); needs verification but isn't a rewrite.

### Honest scope-setting

This is not a small addition to the roadmap — be clear-eyed about it. You're not "reusing 80% of the app," you're reusing the data/logic layer (services, types, validation, auth flow) and rebuilding the entire UI layer for mobile conventions. Realistically, that's comparable in size to building the original web client's component layer again, just re-skinned for mobile navigation patterns and native capabilities. Sequence it after Phase 0-2 (security) are done and the monorepo scaffolding happens alongside the Phase 3 Vite migration — don't start mobile UI work against an API that's still wide open.

### iPad / tablet support

Setting `ios.supportsTablet: true` gets the same binary installing and launching on iPad — that part is free. It does not make the app good on iPad: without deliberate adaptive layouts, you get a phone-sized single-column UI stretched onto a much bigger screen. Given a front-desk iPad running the shop calendar and client project galleries all day is a realistic device for this app (not an edge case), budget explicit work for tablet layouts — a master-detail split view (project list + detail side by side, calendar with a persistent sidebar) switched in above a width breakpoint via `useWindowDimensions` or React Navigation/`expo-router`'s adaptive patterns.

### Confirmed platform scope: iOS-first, Android deferred

Target is iPhone + iPad, engineered for maximum UX on those two — not a lowest-common-denominator cross-platform app. Decision: build iOS-first and hold off spending design effort on Android, but keep the codebase Android-capable (plain React Native/Expo, no iOS-only native modules where an equivalent Android path exists) so a Play Store build is a smaller lift later rather than a rewrite. Concretely, this means:

- **Component choices lean iOS-native now.** Since Android isn't being designed for yet, don't default to a Material Design component library purely for cross-platform safety — build (or pick a kit oriented around) iOS Human Interface Guidelines conventions: native-feeling navigation transitions, sheet/modal presentations, swipe-back gesture, SF Symbols-style iconography. Revisit component choices when Android design work actually starts.
- **Haptics.** `expo-haptics` on key actions — appointment created, message sent, payment confirmed. Small, cheap, and it's the kind of detail that makes an app feel considered rather than generic.
- **Apple Pencil support on iPad.** Directly relevant to this app's actual domain, not a generic nice-to-have: annotating placement on body/reference images, marking up design references, capturing a signature on intake/consent forms. The `react-native-skia` canvas layer already recommended above for photo editing is the same technical foundation for this — build it once, use it for both.
- **iPad multitasking.** Verify the app behaves correctly in Split View and Slide Over, not just full-screen — plausible for shop staff running it alongside another app.
- **Dark mode**, via RN's `useColorScheme` — both a real request in low-lit shop environments and a baseline expectation of a well-built iOS app in 2026.
- **Dynamic Type and accessibility.** Respect the user's iOS text-size setting, proper VoiceOver labels, real tap-target sizing — this is a tool people will use all day, every day; accessibility here isn't a compliance checkbox, it's daily usability.
- **Face ID / Touch ID app unlock**, via `expo-local-authentication` — pairs naturally with the `expo-secure-store` token storage already planned above, and is a meaningfully better login experience than typing a password on a phone every time.
- **Stretch, not core scope:** a home-screen widget or Lock Screen Live Activity showing today's appointments. Worth a line in a future planning pass once the core app is built and stable — not something to scope into the initial build.

---

## Phase 6 — Testing, monitoring, and the production checklist

There are currently zero tests (`"test": "echo \"Error: no test specified\" && exit 1"` in `server/package.json`). Before calling this production-ready:

- **Server:** Jest + a GraphQL testing helper for resolvers, focused first on the auth wrapper from Phase 2 (prove unauthenticated requests get rejected) and the password-reset flow from Phase 1 (prove a token is required).
- **Client:** React Testing Library for the login/register/project-creation flows at minimum — the ones most likely to silently break during the Phase 3 migrations.
- **CI:** GitHub Actions running lint + tests + build on every PR. Cheap to set up, catches regressions during the dependency upgrades.
- **Error monitoring:** Sentry (or similar) on both client and server — right now errors just go to `console.log`, including some that log full user objects, which you'll want to stop doing before this touches real client PII.
- **Logging:** replace the `console.log(user)` / `console.log(appointment)` debug statements scattered through the mutations with structured logging (`pino`), and make sure nothing sensitive (passwords, tokens) ever hits a log line.
- **Backups:** enable automated MongoDB Atlas snapshots before real client data exists in that cluster, not after.
- **Legal:** a privacy policy and terms of service before collecting client PII and reference images for real — this is a legal/compliance conversation, not an engineering one, and it's worth having before Phase 1's data-model decisions get locked in.

### Hosting recommendation (since none is chosen yet)

- **Frontend:** Vercel or Netlify — static Vite build, trivial to deploy, generous free tier for pre-launch traffic.
- **Backend (Express + socket.io):** Render or Railway. Both support long-running Node processes with persistent WebSocket connections, which Vercel's serverless functions do not handle well — this matters once you consolidate onto one Express+socket.io process in Phase 2.
- **Database:** stay on MongoDB Atlas, but create a new database user with least-privilege scoped access (read/write to the `inkbook` database only, not an admin-equivalent account) as part of the Phase 0 credential rotation, and enable IP allowlisting.
- **Firebase:** keep for Storage; fix the auth pattern per Phase 2.

---

## Suggested sequencing

Phase 0 today. Phase 1 this week — it's the part where real damage is currently possible. Phase 2 the following 1-2 weeks, since it's what keeps Phase 1 fixed. Phase 3 (modernization, including the monorepo/TypeScript scaffolding that Phase 5 needs) can run in parallel with Phase 2 once the auth wrapper pattern is settled. Phase 4 (real payments) whenever you're ready to actually take deposits. Phase 5 (mobile) starts once Phase 0-2 are done and the monorepo shape from Phase 3 exists — don't build a mobile UI against an API that's still wide open. Phase 6 items — tests, CI, monitoring — should be stood up incrementally starting in Phase 1, not bolted on at the end; retrofitting tests onto already-migrated code (or two clients instead of one) is much more expensive than writing them alongside the fixes.
