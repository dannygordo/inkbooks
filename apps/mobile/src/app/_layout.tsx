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
