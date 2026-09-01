// react-native-safe-area-context ships its own jest mock (real insets/frame values, no native
// module calls) - required because jest-expo's preset does not wire it up automatically. Without
// this, any test that renders a SafeAreaView (index.tsx's AppointmentsScreen and login.tsx both
// do) throws on the native dimensions lookup jsdom/jest has no way to satisfy.
//
// The mock module is `export default {...}` (no named exports), so requiring it directly hands
// back `{ default: {...} }` under CJS interop - every named import (SafeAreaView included) would
// resolve to undefined. Unwrapping `.default` here puts SafeAreaView, useSafeAreaInsets, etc. back
// at the top level, matching the real module's named-export shape.
// eslint-disable-next-line no-undef
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line no-undef
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

// @react-native-community/netinfo ships its own jest mock too (useNetInfo defaulting to
// isConnected: true) - same reason as above, no real native connectivity module to call from
// jest/jsdom. Global rather than per-test: OfflineBanner (and so this mock) is pulled in by every
// screen that renders it, not just one.
// eslint-disable-next-line no-undef
jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line no-undef
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

// @react-native-async-storage/async-storage ships its own jest mock too (an in-memory Map
// standing in for the native module) - same reason as react-native-safe-area-context/netinfo
// above. Needed now that @/firebase/firebase.ts imports the real package at module load
// (initializeAuth's getReactNativePersistence(AsyncStorage) call) - without this, EVERY test that
// transitively imports @/context/auth.tsx throws "NativeModule: AsyncStorage is null" before a
// single test body runs, not just auth.test.tsx.
// eslint-disable-next-line no-undef
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line no-undef
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// firebase's JS SDK has no jest-friendly mock of its own, and initializeApp/initializeAuth
// attempting a real project handshake under Jest is exactly the kind of test-environment mismatch
// already hit once for apps/web's own firebase.js (see that file's getAnalytics comment - the same
// "a module-level Firebase call breaks every test that transitively imports it" bug class, this
// time for RN/Jest instead of Vite/Vitest). Mocked globally, not per-test: @/context/auth.tsx
// (and so @/firebase/firebase.ts) is pulled in by every screen/test that renders AuthProvider, not
// just auth.test.tsx - and @/firebase/uploadFile.ts / deleteFile.ts need firebase/storage mocked
// the same way for the image-upload component tests.
// eslint-disable-next-line no-undef
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({})),
}));
// eslint-disable-next-line no-undef
jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => ({})),
  getAuth: jest.fn(() => ({})),
  getReactNativePersistence: jest.fn(() => ({})),
  signInWithCustomToken: jest.fn(() =>
    Promise.resolve({ user: { uid: 'test-firebase-uid' } }),
  ),
  signOut: jest.fn(() => Promise.resolve()),
}));
// eslint-disable-next-line no-undef
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
  ref: jest.fn(() => ({})),
  uploadBytesResumable: jest.fn(() => ({
    on: jest.fn(),
  })),
  getDownloadURL: jest.fn(() => Promise.resolve('https://example.com/mock-image.jpg')),
  deleteObject: jest.fn(() => Promise.resolve()),
}));
