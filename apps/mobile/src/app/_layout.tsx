import { ApolloProvider } from '@apollo/client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/context/auth';
import { useEffectiveColorScheme } from '@/hooks/use-effective-color-scheme';
import { apolloClient, initCachePersistence } from '@/lib/apollo-client';
import { navigateForNotificationTarget, resolveNotificationTarget } from '@/lib/push-notifications';
import { initSentry } from '@/lib/sentry';

SplashScreen.preventAutoHideAsync();
initSentry();

// Now that there's a second real screen (login), this is the navigation-IA decision the previous
// version of this file deferred: Stack.Protected's guard prop, not a manually-managed <Redirect>.
// It re-evaluates on every render, so the moment auth's `user` flips (login()/logout() dispatch),
// the Stack swaps which screen group is reachable on its own - no navigate() call needed at either
// call site. Still no tab bar - one destination past login isn't navigation, it's decoration; a
// second real authenticated screen (Phase 2's appointments list) is what actually decides that.
function RootNavigator() {
  const { user, initializing } = useAuth();
  const router = useRouter();
  // Same account-preference-first resolution as hooks/use-theme.ts's own StyleSheet color
  // tokens, so the nav chrome (headers, back buttons) never disagrees with the screen content
  // underneath it - see that hook's own comment (DECISIONS.md X43) on why both go through this
  // one hook rather than each reading the OS setting independently.
  const effectiveColorScheme = useEffectiveColorScheme();
  // Mirrors `initializing` above - a second, independent async bootstrap step (restoring the
  // persisted Apollo cache from AsyncStorage - see apollo-client.ts's own comment) that has to
  // finish before the appointments screen's first query runs, or a cold launch offline renders an
  // empty list for one frame instead of what cache persistence exists to show. Started once, here,
  // rather than inside the appointments screen itself - screen-mount timing would race the
  // Stack.Protected guard below rendering that screen at all.
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initCachePersistence().finally(() => {
      if (!cancelled) {
        setCacheReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Splash stays up through both async bootstrap steps (the SecureStore session read - see
    // auth.tsx's `initializing` - and the cache restore above) so nothing renders half-ready
    // underneath it: a previously-signed-in user never sees a flash of the login screen, and the
    // appointments screen never mounts before its offline cache is actually in place.
    if (!initializing && cacheReady) {
      SplashScreen.hideAsync();
    }
  }, [initializing, cacheReady]);

  // Notification-tap deep-linking (push-notifications.ts's own header comment has the full
  // design). useLastNotificationResponse covers both a cold start (the app was launched BY the
  // tap) and a live tap while already running, in one hook - see that hook's own implementation.
  // Cleared immediately after handling so remounting this component (a fast-refresh in dev, or
  // user flipping false->true->false->true across a quick logout/login) never re-navigates to a
  // tap that was already acted on.
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    // Every route resolveNotificationTarget can produce lives behind Stack.Protected's
    // guard={!!user} below - nothing to navigate to for a signed-out user, so this simply waits;
    // the response stays available (it's not cleared) until a signed-in RootNavigator can act on
    // it.
    if (!user || !lastNotificationResponse) {
      return;
    }
    const target = resolveNotificationTarget(lastNotificationResponse.notification.request.content.data);
    if (target) {
      navigateForNotificationTarget(router, target);
    }
    Notifications.clearLastNotificationResponse();
  }, [user, lastNotificationResponse, router]);

  if (initializing || !cacheReady) {
    return null;
  }

  return (
    <ThemeProvider value={effectiveColorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
          {/* Forgot-password request - see reset-password.tsx's own header comment. Logged-out
              only, same guard as login itself; a signed-in user changes a password they know from
              settings/index.tsx instead. */}
          <Stack.Screen name="reset-password" options={{ headerShown: true, title: 'Reset Password' }} />
          {/* Where an invite or reset link actually lands - see set-password/[token].tsx's own
              header comment and passwordReset.graphql's for the deep-link scope this closes and
              what's still a deliberate follow-up (the emailed link itself still points at web). */}
          <Stack.Screen name="set-password/[token]" options={{ headerShown: true, title: 'Set Password' }} />
          {/* Cold self-signup (gap #11, X55) - see register.tsx's own header comment for why it's
              scoped to account creation only, deferring notifications/rates/shop-cut to Settings. */}
          <Stack.Screen name="register" options={{ headerShown: true, title: 'Create Account' }} />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="index" />
          {/* Grouped catch-all for everything that used to be a Pressable text link in
              index.tsx's header (2026-09-10) - see BottomTabBar.tsx's and more.tsx's own header
              comments for why: that row overflowed off real phone widths, reported as a frozen/
              broken menu. Reached from the bottom tab bar's fifth tab, same headerShown: false
              pattern as index above (more.tsx renders its own title). */}
          <Stack.Screen name="more" />
          {/* The in-app notification feed - closes gap #8 of HANDOFF.md's 2026-09-04 parity
              accounting (X52). Reached from a new bell-style "Notifications" link on index.tsx's
              header, no role gate - every signed-in user has an inbox. */}
          <Stack.Screen name="notifications/index" options={{ headerShown: true, title: 'Notifications' }} />
          {/* Dashboard - closes gap #4 of HANDOFF.md's 2026-09-04 parity accounting (the mobile
              counterpart to web's pages/home/Home.jsx). Reached from a new "Dashboard" link on
              index.tsx's header, open to any signed-in user - see dashboard.tsx's own header
              comment for the full scope, including three named V1 cuts. */}
          <Stack.Screen name="dashboard" options={{ headerShown: true, title: 'Dashboard' }} />
          {/* Phase 5 step 8's three appointment-opening destinations, plus the Session Detail
              screen a Project's Sessions sub-list drills into - the same branches
              AppointmentsList.jsx's openAppointment() picks between, see index.tsx's own row
              onPress. Headers shown (unlike index's own headerShown: false above) since each is a
              real drill-down with a back target, not a tab-level root. */}
          <Stack.Screen name="appointment/[id]" options={{ headerShown: true, title: 'Appointment' }} />
          {/* New Appointment - closes gap #1 of HANDOFF.md's 2026-09-04 parity accounting (X48).
              Reached from a new "New" link on index.tsx's header, open to any artist. */}
          <Stack.Screen name="appointment/new" options={{ headerShown: true, title: 'New Appointment' }} />
          <Stack.Screen name="consult/[id]" options={{ headerShown: true, title: 'Consult' }} />
          <Stack.Screen name="project/[id]" options={{ headerShown: true, title: 'Project' }} />
          <Stack.Screen name="session/[id]" options={{ headerShown: true, title: 'Session' }} />
          {/* Phase 5 step 8's Settings slice (see settings/index.tsx's own header comment on
              what's deliberately not here yet). Reached from index.tsx's header, next to Log out -
              the same "who am I, how do I sign out" header spot web's own account menu occupies,
              not a tab. */}
          <Stack.Screen name="settings/index" options={{ headerShown: true, title: 'Settings' }} />
          {/* Income/Expense category management + Recurring Expenses (X31) - reached from
              settings/index.tsx's own "Business" section, gated the same `canManageBusinessLedger`
              as Income/Expenses themselves. */}
          <Stack.Screen name="settings/income-types" options={{ headerShown: true, title: 'Income Categories' }} />
          <Stack.Screen name="settings/expense-types" options={{ headerShown: true, title: 'Expense Categories' }} />
          <Stack.Screen name="settings/recurring-expenses" options={{ headerShown: true, title: 'Recurring Expenses' }} />
          {/* Shop-wide money config (X36) - reached from settings/index.tsx's own "Shop" link. */}
          <Stack.Screen name="settings/shop" options={{ headerShown: true, title: 'Shop' }} />
          {/* An artist's own rates + which-rate-applies (X37) - reached from settings/index.tsx's
              own "Rates" link. */}
          <Stack.Screen name="settings/rates" options={{ headerShown: true, title: 'Rates' }} />
          {/* Messages category, first sub-slice (X38) - Reminders, reached from settings/index.tsx's
              own "Messages" section. AutoResponsesPanel/ResponseTimePanel/SystemMessageTemplatesPanel
              remain open, named in DECISIONS.md X31/X38. */}
          <Stack.Screen name="settings/reminders" options={{ headerShown: true, title: 'Reminders' }} />
          {/* Messages category, second sub-slice (X39) - Auto-Responses, reached from
              settings/index.tsx's own "Messages" section. ResponseTimePanel/
              SystemMessageTemplatesPanel remain open, named in DECISIONS.md X31/X38/X39. */}
          <Stack.Screen name="settings/auto-responses" options={{ headerShown: true, title: 'Auto-Responses' }} />
          {/* Messages category, third sub-slice (X40) - Response Time, reached from
              settings/index.tsx's own "Messages" section. SystemMessageTemplatesPanel remains
              open, named in DECISIONS.md X31/X38/X39/X40. */}
          <Stack.Screen name="settings/response-time" options={{ headerShown: true, title: 'Response Time' }} />
          {/* Messages category, fourth and last sub-slice (X41) - System Messages, reached from
              settings/index.tsx's own "Messages" section. Completes the Messages category named
              in DECISIONS.md X31/X38/X39/X40. */}
          <Stack.Screen name="settings/system-message-templates" options={{ headerShown: true, title: 'System Messages' }} />
          {/* Forms' per-artist "Your link" section (X42) - reached from settings/index.tsx's own
              "Forms" card. "Manage Forms" isn't duplicated here - mobile's home screen already has
              its own direct button to forms/index.tsx. */}
          <Stack.Screen name="settings/your-link" options={{ headerShown: true, title: 'Your Link' }} />
          {/* Light/dark/match-device (X43) - reached from settings/index.tsx's own
              "Appearance" link. Every signed-in user sees this, matching web's own
              no-role-floor gate. */}
          <Stack.Screen name="settings/appearance" options={{ headerShown: true, title: 'Appearance' }} />
          {/* Email-notification preferences - closes gap #7 of HANDOFF.md's 2026-09-04 parity
              accounting (X51). Reached from settings/index.tsx's own "Notifications" link, no
              role gate, matching web's own `isVisible: () => true` on this settings category. */}
          <Stack.Screen name="settings/notifications" options={{ headerShown: true, title: 'Notifications' }} />
          {/* The audit trail (X44) - reached from settings/index.tsx's own "Security" link,
              gated `hasAuditAuthority`. Read-only; nothing here writes anything. */}
          <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Security' }} />
          {/* The client roster - see clients/index.tsx's own header comment. Reached from
              index.tsx's header, and the second (real) entry point into client/[id].tsx below -
              that screen's own X15 comment named this as worth building. */}
          <Stack.Screen name="clients/index" options={{ headerShown: true, title: 'Clients' }} />
          {/* Client Detail (shared-images panel only for now - see client/[id].tsx's own header
              comment). Reached from project/[id].tsx's client name link, and now clients/index.tsx's
              rows too. */}
          <Stack.Screen name="client/[id]" options={{ headerShown: true, title: 'Client' }} />
          {/* Add Client - closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting. Reached from
              a new "Add Client" button on clients/index.tsx, gated isStaffOrBetter. */}
          <Stack.Screen name="client/new" options={{ headerShown: true, title: 'Add Client' }} />
          {/* Messages - inbox + thread, see messages/index.tsx and messages/[id].tsx. Reached from
              index.tsx's header, next to the Settings avatar and Log out. */}
          <Stack.Screen name="messages/index" options={{ headerShown: true, title: 'Messages' }} />
          <Stack.Screen name="messages/[id]" options={{ headerShown: true, title: 'Conversation' }} />
          {/* Booking Requests - inbox + detail, see booking-requests/index.tsx and [id].tsx's own
              header comments. Reached from index.tsx's header, next to Messages - same funnel a
              prospective client's public intake form (apps/web's BookingRequest.jsx, out of scope
              here - see DECISIONS.md X19) feeds into. */}
          <Stack.Screen name="booking-requests/index" options={{ headerShown: true, title: 'Booking Requests' }} />
          <Stack.Screen name="booking-requests/[id]" options={{ headerShown: true, title: 'Request' }} />
          {/* Projects - see projects/index.tsx's own header comment. Reached from index.tsx's
              header, and now the browsable entry point project/[id].tsx (built in this step's
              original PR) had been missing ever since. */}
          <Stack.Screen name="projects/index" options={{ headerShown: true, title: 'Projects' }} />
          {/* Shop Cut Confirmations - see shop-cut-confirmations/index.tsx's own header comment.
              The first screen reached only from a role-gated header link (isShopAdminOrBetter),
              matching web's own Sidebar.jsx gate on this exact item. */}
          <Stack.Screen
            name="shop-cut-confirmations/index"
            options={{ headerShown: true, title: 'Shop Cut Confirmations' }}
          />
          {/* Artists - the shop's own team roster, see artists/index.tsx's own header comment.
              Gated `isStaffOrBetter`, matching web's Sidebar.jsx exactly. */}
          <Stack.Screen name="artists/index" options={{ headerShown: true, title: 'Artists' }} />
          <Stack.Screen name="artist/[id]" options={{ headerShown: true, title: 'Artist' }} />
          {/* Add Artist - closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting. Reached from
              a new "Add Artist" button on artists/index.tsx, gated isShopAdminOrBetter. */}
          <Stack.Screen name="artist/new" options={{ headerShown: true, title: 'Add Artist' }} />
          {/* Staff - the shop's front-desk roster, see staff/index.tsx's own header comment. Also
              gated `isStaffOrBetter` (web's Sidebar.jsx gates Artists and Staff identically). */}
          <Stack.Screen name="staff/index" options={{ headerShown: true, title: 'Staff' }} />
          <Stack.Screen name="staff/[id]" options={{ headerShown: true, title: 'Staff Member' }} />
          {/* Add Staff - closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting. Reached from
              a new "Add Staff" button on staff/index.tsx, gated isShopAdminOrBetter. */}
          <Stack.Screen name="staff/new" options={{ headerShown: true, title: 'Add Staff' }} />
          {/* Shops - the shop-admin's own shop(s), see shops/index.tsx's own header comment. Gated
              `isShopAdminOrBetter`, matching web's Sidebar.jsx exactly (same gate as Shop Cut
              Confirmations). */}
          <Stack.Screen name="shops/index" options={{ headerShown: true, title: 'Shops' }} />
          <Stack.Screen name="shop/[id]" options={{ headerShown: true, title: 'Shop' }} />
          {/* Global search - see search/index.tsx's own header comment. No role gate on the header
              link itself, matching Clients/Projects - `search` applies no authorization beyond the
              same scope filters those list queries already use. */}
          <Stack.Screen name="search/index" options={{ headerShown: true, title: 'Search' }} />
          {/* Income - non-tattoo income only, see income/index.tsx's own header comment. Gated
              `canManageBusinessLedger` (any artist, or a shop-admin-or-better), matching web's own
              RoleRoute on /income exactly. */}
          <Stack.Screen name="income/index" options={{ headerShown: true, title: 'Income' }} />
          {/* Expenses - structurally identical to Income, see expenses/index.tsx's own header
              comment. Same `canManageBusinessLedger` gate. */}
          <Stack.Screen name="expenses/index" options={{ headerShown: true, title: 'Expenses' }} />
          {/* Forms - see forms/index.tsx's own header comment for the full scope (list, Responses,
              FormBuilder, and the booking_request system form's own restricted editor; getFormAnalytics
              remains deliberately not ported - see forms.graphql). Gated `canManageForms`, narrower
              than Income/Expenses' gate. */}
          <Stack.Screen name="forms/index" options={{ headerShown: true, title: 'Forms' }} />
          <Stack.Screen name="form-responses/[id]" options={{ headerShown: true, title: 'Responses' }} />
          <Stack.Screen name="form/[id]" options={{ headerShown: true, title: 'Form' }} />
          <Stack.Screen name="form-booking-fields/[id]" options={{ headerShown: true, title: 'Booking Request Fields' }} />
          {/* Gift cards - see gift-cards/index.tsx's own header comment (mobile port of
              DECISIONS.md M6 + its 2026-09-04 payment-collection follow-up, closing gap 5 of
              HANDOFF.md's 2026-09-04 parity accounting). Gated by isArtist OR
              isShopAdminOrBetter on the header link below - wider than canManageForms, since
              every artist qualifies for at least the artist-issued-card half of the screen. */}
          <Stack.Screen name="gift-cards/index" options={{ headerShown: true, title: 'Gift Cards' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    // react-native-gesture-handler's own docs require this wrapping the whole app root - see
    // https://docs.swmansion.com/react-native-gesture-handler/docs/installation. It was
    // missing entirely before 2026-09-12: react-native-screens' native stack (what expo-router's
    // <Stack> renders on top of) depends on RNGH for its own gesture recognizers, and without
    // this root view RNGH's gesture handling silently misbehaves - the concrete symptom Danny
    // reported was ScrollViews across the app (Project detail chief among them) rendering their
    // content but never responding to a scroll pan, not any one screen's own layout - because
    // every screen sits under the same unwrapped root. The ScrollViews themselves were already
    // correct (RN's own <ScrollView> applies flexGrow: 1 to itself internally - see
    // ScrollView.js's baseVertical - so no per-screen style was missing); this is the fix.
    <GestureHandlerRootView style={styles.gestureRoot}>
      <ApolloProvider client={apolloClient}>
        {/* AuthProvider must be inside ApolloProvider - it calls useApolloClient() to wipe the
            cache on every session change (see auth.tsx's own comment on the bug that prevents).
            RootNavigator's own ThemeProvider (not this component) resolves the effective color
            scheme, because that resolution needs useAuth() - AuthProvider has to be mounted above
            it, not the other way around (X43). */}
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ApolloProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
});
