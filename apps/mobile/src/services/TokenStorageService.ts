import * as SecureStore from 'expo-secure-store';

// The real mobile implementation DECISIONS.md's X5 anticipated when apps/web's
// TokenStorageService.js was written: expo-secure-store's setItemAsync/getItemAsync/
// deleteItemAsync ARE the async, string-only, no-JSON-encoding interface X5 shaped the web
// version around specifically so this file could be a three-line re-export with no adapter
// logic. iOS Keychain / Android Keystore-backed, not AsyncStorage - the whole reason that shape
// was chosen over staying synchronous like the old CacheService.
export const TokenStorageService = {
  setItemAsync: SecureStore.setItemAsync,
  getItemAsync: SecureStore.getItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};
