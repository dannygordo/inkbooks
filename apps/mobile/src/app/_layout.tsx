import { ApolloProvider } from '@apollo/client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { apolloClient } from '@/lib/apollo-client';
import { initSentry } from '@/lib/sentry';

SplashScreen.preventAutoHideAsync();
initSentry();

// No tab bar yet - the template's demo AppTabs (Home/Explore) was removed along with the rest of
// the "Welcome to Expo" scaffolding it existed to navigate between. Real navigation IA (bottom
// tabs vs a different pattern) is a decision for step 6 (PRODUCTION_ROADMAP.md's Phase 5 order-
// of-operations), once there's a second real screen for it to actually navigate between - a tab
// bar with one destination isn't navigation, it's decoration.
export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ApolloProvider client={apolloClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </ApolloProvider>
  );
}
