import { getApp, getApps, initializeApp } from 'firebase/app';
// @ts-expect-error - getReactNativePersistence exists at runtime (the `firebase` package's own
// package.json resolves firebase/auth to @firebase/auth's "react-native" build via Metro's
// bundler-condition resolution - see metro.config.js) but the `firebase` wrapper package's
// published .d.ts for this subpath doesn't forward that condition, only @firebase/auth's own
// (unpublished-to-us-directly) types do. Long-standing upstream gap, not an app bug - tracked at
// github.com/firebase/firebase-js-sdk issues #7584/#7615/#9316, still open as of this SDK version.
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { FIREBASE } from '@/config';

// Mirrors apps/web's firebase/firebase.js, minus getAnalytics (window/DOM-only - has no RN
// equivalent and nothing here would call it anyway, same reasoning as that file's own
// test-mode skip) and getFirestore/db (no Firestore-backed feature is in mobile's scope -
// messaging/IBChatBox stays out, see DECISIONS.md's X13 entry).
const firebaseConfig = {
  apiKey: FIREBASE.API_KEY,
  authDomain: FIREBASE.AUTH_DOMAIN,
  projectId: FIREBASE.PROJECT_ID,
  storageBucket: FIREBASE.STORAGE_BUCKET,
  messagingSenderId: FIREBASE.MESSAGING_SENDER_ID,
  appId: FIREBASE.APP_ID,
};

// getApps().length guard rather than a bare initializeApp() call - Fast Refresh during
// development can re-evaluate this module without the app ever fully unmounting, and
// initializeApp() throws "Firebase App named '[DEFAULT]' already exists" on a second call rather
// than returning the existing instance the way, say, React's useState does.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firebase JS SDK v10.3+'s documented RN pattern (see expo.fyi/firebase-js-auth-setup) -
// initializeAuth() is the RN-specific entry point that wires persistence through AsyncStorage;
// plain getAuth() would work but silently fall back to in-memory persistence, signing every user
// out on every cold start. Wrapped in the same "already initialized" guard as `app` above, for the
// same Fast-Refresh reason - initializeAuth() throws on a second call against the same app,
// whereas getAuth() is safe to call any number of times once auth already exists.
export const auth = (() => {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app);
  }
})();

// Storage's JS SDK needs no RN-specific setup at all - it talks to Firebase over plain
// fetch/XMLHttpRequest, which RN already provides. See firebase/uploadFile.ts's own comment on
// the one real RN adaptation upload itself needs (turning a picked image's local file URI into a
// Blob before uploadBytesResumable can accept it).
export const storage = getStorage(app);
