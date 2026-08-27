// Step 3 of the mobile-app monorepo plan (PRODUCTION_ROADMAP.md's Phase 5): replaces
// CacheService with an async interface shaped exactly like expo-secure-store's real API -
// getItemAsync/setItemAsync/deleteItemAsync, strings in, strings out, no JSON encoding done by
// the service itself. That's not a style choice: SecureStore's native backends (iOS Keychain,
// Android Keystore) only ever store strings, so an interface that did its own JSON.stringify
// internally couldn't be swapped for the real mobile implementation without also changing its
// signature. Every caller stringifies before calling setItemAsync and parses what getItemAsync
// returns - see context/auth.jsx, index.jsx's authLink, and IBChatBox.jsx's upload handler. When
// the mobile implementation lands, it will be exactly this:
//
//   import * as SecureStore from "expo-secure-store";
//   export const TokenStorageService = {
//     setItemAsync: SecureStore.setItemAsync,
//     getItemAsync: SecureStore.getItemAsync,
//     deleteItemAsync: SecureStore.deleteItemAsync,
//   };
//
// This also fixes a real (if harmless) bug in the file it replaces: CacheService's setItem/getItem
// did a REDUNDANT double JSON.stringify/JSON.parse (every caller pre-stringified before calling
// setItem, then setItem stringified again). It only ever round-tripped correctly because getItem
// happened to parse twice too - see DECISIONS.md's X5. Removing the service's own encoding is what
// makes the double-encoding impossible to reintroduce, rather than merely fixing today's instance
// of it.
//
// Web implementation only for now, backed by localStorage - closes the XSS/localStorage
// token-theft exposure flagged in the original security audit only once every caller is off
// localStorage entirely, which is a later step (see PRODUCTION_ROADMAP.md); this one gets every
// call site behind the shared interface first so that later change is a one-file swap here
// instead of an app-wide search-and-replace. Wrapped in Promise.resolve() so every call site can
// already treat this as async ahead of the real mobile implementation - nothing here is actually
// asynchronous yet; the async signature is the whole point, since it's the shape both platforms
// have to share and expo-secure-store's calls are genuinely async.
export const TokenStorageService = (() => {
	return {
		setItemAsync: (key, value) => {
			localStorage.setItem(key, value);
			return Promise.resolve();
		},
		getItemAsync: (key) => {
			return Promise.resolve(localStorage.getItem(key));
		},
		deleteItemAsync: (key) => {
			localStorage.removeItem(key);
			return Promise.resolve();
		},
	};
})();
