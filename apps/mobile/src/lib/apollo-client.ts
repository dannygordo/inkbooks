import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { AsyncStorageWrapper, persistCache } from 'apollo3-cache-persist';
import Constants from 'expo-constants';

import { AUTH_SETTINGS_CONSTANTS } from '@/constants/auth';
import { TokenStorageService } from '@/services/TokenStorageService';

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

const httpLink = createHttpLink({ uri: apiUrl });

// Direct port of apps/web's index.jsx authLink - TokenStorageService.getItemAsync was already
// shaped for this (see that file's own comment), so nothing about the link chain itself needed to
// change to go from web's localStorage-backed version to this SecureStore-backed one.
const authLink = setContext(async (_, { headers }) => {
  const raw = await TokenStorageService.getItemAsync(
    AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
  );
  const token = raw ? JSON.parse(raw) : null;
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token.accessToken}` : '',
    },
  };
});

// A named export (not created inside the ApolloClient constructor call) because
// initCachePersistence below needs the same instance the client reads from - persistCache
// rehydrates it in place before anything renders, then keeps writing every update back to
// AsyncStorage as normal reads/writes happen.
export const cache = new InMemoryCache();

export const apolloClient = new ApolloClient({
  link: from([authLink, httpLink]),
  cache,
  clientAwareness: { name: 'InkBooks Mobile' },
});

// PRODUCTION_ROADMAP.md's Phase 5 step 6: "Apollo cache persistence for offline reads." Restoring
// AsyncStorage's saved cache into `cache` is itself async, and has to finish before the
// appointments screen's first query runs - otherwise a cold app launch offline renders an empty
// list for one frame (nothing restored yet) instead of what was last seen, which is the entire
// point of persisting it. `_layout.tsx` awaits this the same way auth.tsx's `initializing` gates
// the session restore - one root-level readiness flag per async bootstrap step, not layered ad
// hoc per screen.
//
// No `maxSize` override: apollo3-cache-persist's own default (1MB) comfortably covers a
// currently-signed-in user's own upcoming appointment window, which is all this persists.
export async function initCachePersistence(): Promise<void> {
  await persistCache({
    cache,
    storage: new AsyncStorageWrapper(AsyncStorage),
  });
}
