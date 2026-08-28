import * as Sentry from '@sentry/react-native';

// No-DSN-means-off, the same contract apps/web's index.jsx and server/utils/error-reporting.js
// already use (see either file's own comment) - safe to ship before a Sentry React Native project
// exists. EXPO_PUBLIC_ prefix required for the same reason apollo-client.ts's API URL needs it:
// Expo only inlines env vars into the built app when they carry that prefix.
//
// NOT DONE YET, unlike the web/server setup: real crash reporting with readable native stack
// traces also needs @sentry/react-native's Expo config plugin added to app.json (for EAS Build to
// upload source maps) and a real org/project slug + auth token to upload them with - deliberately
// left out of app.json until a real Sentry React Native project exists to point it at, rather than
// wiring a plugin against credentials that don't exist. See DECISIONS.md's step-4 entry for the
// full list of what's left to connect once that project exists.
export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
  });
}
