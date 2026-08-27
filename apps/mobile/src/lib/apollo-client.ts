import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import Constants from 'expo-constants';

// Mirrors apps/web's index.jsx httpLink setup (see that file's own header comment for the same
// "one place this is read" reasoning). The RN/Expo equivalent of Vite's import.meta.env.VITE_*
// build-time env vars is EXPO_PUBLIC_*-prefixed ones - Expo only inlines env vars into the app
// bundle when they carry that prefix, same reason Vite requires VITE_. Constants.expoConfig.extra
// is the fallback for a value baked into app.json/eas.json build profiles instead of a .env file
// (the more common path for EAS Build's dev/preview/production channels - see eas.json).
export const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:5500';

// No auth link yet, unlike apps/web's client (index.jsx's authLink). That's step 6
// (PRODUCTION_ROADMAP.md's Phase 5 order-of-operations) - it needs a real, expo-secure-store-
// backed TokenStorageService implementation and a real login screen to read a token from, neither
// of which exist yet at this scaffolding step. Wiring an authLink against nothing to authenticate
// would be dead code, not a head start.
export const apolloClient = new ApolloClient({
  link: createHttpLink({ uri: apiUrl }),
  cache: new InMemoryCache(),
  clientAwareness: { name: 'InkBooks Mobile' },
});
