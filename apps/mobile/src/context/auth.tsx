import { useApolloClient } from '@apollo/client';
import type { LoginMutation } from '@inkbooks/api';
import { signInWithCustomToken, signOut, type User as FirebaseUser } from 'firebase/auth';
import jwtDecode from 'jwt-decode';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useReducer, useState } from 'react';

import { AUTH_SETTINGS_CONSTANTS } from '@/constants/auth';
import { auth as firebaseAuth } from '@/firebase/firebase';
import { registerForPushNotifications, unregisterPushNotifications } from '@/lib/push-notifications';
import { TokenStorageService } from '@/services/TokenStorageService';

// The full logged-in user record - whatever shape login.graphql's Login mutation actually
// returns, read off the generated type rather than hand-declared, so a field added/removed there
// (running codegen) is a compile error here if this context still assumes the old shape.
export type CurrentUser = LoginMutation['login'];

type AuthState = {
  user: CurrentUser | null;
  firebaseUser: FirebaseUser | null;
};

const initialState: AuthState = { user: null, firebaseUser: null };

type AuthAction =
  | { type: 'LOGIN'; payload: CurrentUser }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: CurrentUser }
  | { type: 'FIREBASE_LOGIN'; payload: FirebaseUser };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
    case 'UPDATE_USER':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      return { ...state, user: null };
    case 'FIREBASE_LOGIN':
      return { ...state, firebaseUser: action.payload };
    default:
      return state;
  }
}

type AuthContextValue = {
  user: CurrentUser | null;
  firebaseUser: FirebaseUser | null;
  login: (userData: CurrentUser) => Promise<void>;
  logout: () => Promise<void>;
  updateCurrentUser: (userData: CurrentUser) => Promise<void>;
  initializing: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firebaseUser: null,
  login: async () => {},
  logout: async () => {},
  updateCurrentUser: async () => {},
  initializing: true,
});

export const useAuth = () => useContext(AuthContext);

// Direct TypeScript port of apps/web's context/auth.jsx, including Firebase sign-in now
// (firebaseUser state, FIREBASE_LOGIN action, signInWithCustomToken/signOut calls) - added once
// mobile grew an actual image-upload feature that needs Storage access, reversing the original
// step-6/step-8 deferral (see DECISIONS.md's X13 entry for why). Still minus the modal/alert/
// loading UI state auth.jsx also carries - those are MUI-page concerns nothing in mobile reads.
// Everything session-lifecycle-related - the cache-wipe-on-session-change bug fix, the async
// storage restore with a JWT expiry check, the initializing flag - is unchanged, because the bug
// class it exists to prevent (a previous user's cached data rendering on the next user's screen)
// applies identically here: this app has exactly one InMemoryCache too.
export function AuthProvider({ children }: { children: ReactNode }) {
  const apollo = useApolloClient();
  const [state, dispatch] = useReducer(authReducer, initialState);
  // Whether the stored session is still being read - see auth.jsx's own comment on why this is
  // distinct from a generic loading flag. Starts true: there is exactly one render, on mount,
  // before the async SecureStore read below resolves.
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const raw = await TokenStorageService.getItemAsync(
        AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
      );

      if (raw) {
        let userData: CurrentUser | null = null;
        let decoded: { exp: number } | undefined;

        try {
          userData = JSON.parse(raw) as CurrentUser;
          decoded = jwtDecode<{ exp: number }>(userData.accessToken);
        } catch {
          // Corrupt/undecodable cache entry (bad JSON, or a token jwt-decode can't parse). Treat
          // it the same as an expired session rather than crashing the mount - see auth.jsx's
          // identical fix for the bug class (unreachable setInitializing(false) below on throw).
          userData = null;
        }

        if (userData && decoded && decoded.exp * 1000 < Date.now()) {
          await TokenStorageService.deleteItemAsync(
            AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
          );
        } else if (userData && decoded && !cancelled) {
          dispatch({ type: 'LOGIN', payload: userData });
          // Fire-and-forget, same as login() below - a permission prompt or a slow Expo round
          // trip must never delay the splash screen clearing on a restored session.
          void registerForPushNotifications(apollo);
        } else if (!userData) {
          await TokenStorageService.deleteItemAsync(
            AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
          );
        }
      }

      if (!cancelled) {
        setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // See auth.jsx's own long comment on the bug this exists for: one InMemoryCache living for
  // the app's lifetime means a second user's screen can otherwise render the first user's data
  // straight out of the cache, with no network request (and so no server-side scoping check)
  // ever happening to catch it.
  const discardSessionCache = () => {
    apollo.cache.reset();
    Promise.resolve(apollo.clearStore()).catch(() => {});
  };

  const setSession = async (userData: CurrentUser | null) => {
    discardSessionCache();

    if (userData) {
      await TokenStorageService.setItemAsync(
        AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
        JSON.stringify(userData),
      );
      dispatch({ type: 'LOGIN', payload: userData });
    } else {
      await TokenStorageService.deleteItemAsync(
        AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
      );
      dispatch({ type: 'LOGOUT' });
    }
  };

  const login = async (userData: CurrentUser) => {
    await setSession(userData);
    // After setSession, not before: registerForPushNotifications' mutation needs the auth token
    // setSession just stored to be attached by lib/apollo-client.ts's authLink. Fire-and-forget -
    // a permission dialog or a slow Expo round trip must never delay the login screen resolving.
    void registerForPushNotifications(apollo);

    // Sign into Firebase as this specific user (for Storage access - project images), using a
    // short-lived custom token the server minted for this exact account. Direct port of
    // auth.jsx's login() - see that file's own comment on why this replaced one shared hardcoded
    // Firebase account. Fire-and-forget, same as push registration above: a slow or failed
    // Firebase handshake must never block the login screen resolving, and app login/auth already
    // fully succeeded via setSession regardless of whether this succeeds - only Storage features
    // (image upload/delete) are affected if it doesn't.
    if (userData.firebaseToken) {
      signInWithCustomToken(firebaseAuth, userData.firebaseToken)
        .then((credential) => {
          dispatch({ type: 'FIREBASE_LOGIN', payload: credential.user });
        })
        .catch((error) => {
          console.log(error.code, error.message);
        });
    } else {
      console.warn(
        'No firebaseToken returned at login - Firebase Storage features ' +
          '(image upload/delete) will not work until the server\'s Firebase Admin SDK is configured.',
      );
    }
  };

  const updateCurrentUser = async (userData: CurrentUser) => {
    await TokenStorageService.setItemAsync(
      AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
      JSON.stringify(userData),
    );
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  const logout = async () => {
    // Before setSession, not after: unregisterDeviceToken requires auth (see
    // server/graphql/resolvers/pushTokens.js), so the session's auth token has to still be in
    // TokenStorageService when this call is made. Awaited, unlike registration - the mutation
    // itself never throws (push-notifications.ts swallows its own failures), so this adds no
    // meaningful delay, and awaiting keeps the unregister call from racing setSession's
    // apollo.clearStore().
    await unregisterPushNotifications(apollo);
    await setSession(null);
    // Ends the Firebase session too, same reason auth.jsx's logout() does - each user now has
    // their own real Firebase identity rather than a shared static one, so leaving it signed in
    // would linger past app logout (a real concern on a shared shop device). Best-effort, after
    // setSession like everything else here: the app-level session is already gone regardless.
    signOut(firebaseAuth).catch((error) => console.log(error.code, error.message));
  };

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        firebaseUser: state.firebaseUser,
        login,
        updateCurrentUser,
        logout,
        initializing,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
