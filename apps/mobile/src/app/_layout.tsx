import { ApolloProvider } from '@apollo/client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/context/auth';
import { apolloClient } from '@/lib/apollo-client';
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

  useEffect(() => {
    // Splash stays up through the async SecureStore read (see auth.tsx's `initializing`) so a
    // previously-signed-in user never sees a flash of the login screen before their session
    // restores - hiding it here, gated on `initializing`, is what makes that true instead of
    // just hoped-for.
    if (!initializing) {
      SplashScreen.hideAsync();
    }
  }, [initializing]);

  if (initializing) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" />
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
