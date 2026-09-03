import { ApolloProvider } from '@apollo/client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/context/auth';
import { apolloClient, initCachePersistence } from '@/lib/apollo-client';
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

  if (initializing || !cacheReady) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" />
        {/* Phase 5 step 8's three appointment-opening destinations, plus the Session Detail
            screen a Project's Sessions sub-list drills into - the same branches
            AppointmentsList.jsx's openAppointment() picks between, see index.tsx's own row
            onPress. Headers shown (unlike index's own headerShown: false above) since each is a
            real drill-down with a back target, not a tab-level root. */}
        <Stack.Screen name="appointment/[id]" options={{ headerShown: true, title: 'Appointment' }} />
        <Stack.Screen name="consult/[id]" options={{ headerShown: true, title: 'Consult' }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: true, title: 'Project' }} />
        <Stack.Screen name="session/[id]" options={{ headerShown: true, title: 'Session' }} />
        {/* Phase 5 step 8's Settings slice (photo only - see settings/index.tsx's own header
            comment on what's deliberately not here yet). Reached from index.tsx's header, next
            to Log out - the same "who am I, how do I sign out" header spot web's own account
            menu occupies, not a tab. */}
        <Stack.Screen name="settings/index" options={{ headerShown: true, title: 'Settings' }} />
        {/* The client roster - see clients/index.tsx's own header comment. Reached from
            index.tsx's header, and the second (real) entry point into client/[id].tsx below -
            that screen's own X15 comment named this as worth building. */}
        <Stack.Screen name="clients/index" options={{ headerShown: true, title: 'Clients' }} />
        {/* Client Detail (shared-images panel only for now - see client/[id].tsx's own header
            comment). Reached from project/[id].tsx's client name link, and now clients/index.tsx's
            rows too. */}
        <Stack.Screen name="client/[id]" options={{ headerShown: true, title: 'Client' }} />
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
        {/* Staff - the shop's front-desk roster, see staff/index.tsx's own header comment. Also
            gated `isStaffOrBetter` (web's Sidebar.jsx gates Artists and Staff identically). */}
        <Stack.Screen name="staff/index" options={{ headerShown: true, title: 'Staff' }} />
        <Stack.Screen name="staff/[id]" options={{ headerShown: true, title: 'Staff Member' }} />
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
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ApolloProvider client={apolloClient}>
      {/* AuthProvider must be inside ApolloProvider - it calls useApolloClient() to wipe the
          cache on every session change (see auth.tsx's own comment on the bug that prevents). */}
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </ApolloProvider>
  );
}
