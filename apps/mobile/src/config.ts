// Firebase's client-side config, mirroring apps/web's config.js verbatim. These are NOT secrets -
// see that file's own comment: apiKey/authDomain/projectId/etc. are public identifiers Firebase
// itself documents as safe to ship in a client bundle (Storage/Auth access is actually governed
// by Firebase's server-side Security Rules and each user's own custom-token identity, not by
// keeping this object hidden). Duplicated here rather than imported from apps/web, the same way
// every other cross-cutting constant in this app (Spacing, Colors, AUTH_SETTINGS_CONSTANTS) is its
// own copy rather than a shared import - apps/web and apps/mobile are still two separate
// deployables with no shared runtime package between them apart from @inkbooks/api.
//
// EXPO_PUBLIC_FIREBASE_* overrides exist for the same reason apollo-client.ts's apiUrl and
// sentry.ts's dsn read process.env.EXPO_PUBLIC_* first - a future staging/production Firebase
// project can be swapped in per EAS build profile without editing source, while still falling back
// to the one real project this app has today so local development needs no .env file at all.
export const FIREBASE = {
  API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyC-LKgnpiw2dUqhh5b-p1EZfRorTdJaSqo',
  AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'inkbooks-cd85b.firebaseapp.com',
  PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'inkbooks-cd85b',
  STORAGE_BUCKET:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'inkbooks-cd85b.firebasestorage.app',
  MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '437606997241',
  APP_ID:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    '1:437606997241:web:d99ee8cf975e0031551628',
};
