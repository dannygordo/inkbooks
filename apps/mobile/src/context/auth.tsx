import { useApolloClient } from '@apollo/client';
import type { LoginMutation } from '@inkbooks/api';
import jwtDecode from 'jwt-decode';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useReducer, useState } from 'react';

import { AUTH_SETTINGS_CONSTANTS } from '@/constants/auth';
import { TokenStorageService } from '@/services/TokenStorageService';

// The full logged-in user record - whatever shape login.graphql's Login mutation actually
// returns, read off the generated type rather than hand-declared, so a field added/removed there
// (running codegen) is a compile error here if this context still assumes the old shape.
export type CurrentUser = LoginMutation['login'];

type AuthState = {
  user: CurrentUser | null;
};

const initialState: AuthState = { user: null };

type AuthAction =
  | { type: 'LOGIN'; payload: CurrentUser }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: CurrentUser };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
    case 'UPDATE_USER':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      return { ...state, user: null };
    default:
      return state;
  }
}

type AuthContextValue = {
  user: CurrentUser | null;
  login: (userData: CurrentUser) => Promise<void>;
  logout: () => Promise<void>;
  updateCurrentUser: (userData: CurrentUser) => Promise<void>;
  initializing: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: async () => {},
  logout: async () => {},
  updateCurrentUser: async () => {},
  initializing: true,
});

export const useAuth = () => useContext(AuthContext);

// Direct TypeScript port of apps/web's context/auth.jsx, minus every Firebase-specific piece
// (firebaseUser state, FIREBASE_LOGIN action, signInWithCustomToken/signOut calls) and the
// modal/alert/loading UI state that file also carries - those are MUI-page concerns nothing in
// mobile currently reads. Firebase sign-in exists on web for Storage access (image uploads);
// mobile has no image-upload feature yet to need it for (deliberate scope decision, not an
// oversight - see DECISIONS.md's step-6 entry). Everything session-lifecycle-related - the
// cache-wipe-on-session-change bug fix, the async storage restore with a JWT expiry check, the
// initializing flag - is unchanged, because the bug class it exists to prevent (a previous user's
// cached data rendering on the next user's screen) applies identically here: this app has exactly
// one InMemoryCache too.
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
        const userData: CurrentUser = JSON.parse(raw);
        const decoded = jwtDecode<{ exp: number }>(userData.accessToken);

        if (decoded.exp * 1000 < Date.now()) {
          await TokenStorageService.deleteItemAsync(
            AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
          );
        } else if (!cancelled) {
          dispatch({ type: 'LOGIN', payload: userData });
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
  };

  const updateCurrentUser = async (userData: CurrentUser) => {
    await TokenStorageService.setItemAsync(
      AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
      JSON.stringify(userData),
    );
    dispatch({ type: 'UPDATE_USER', payload: userData });
  };

  const logout = async () => {
    await setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{ user: state.user, login, updateCurrentUser, logout, initializing }}
    >
      {children}
    </AuthContext.Provider>
  );
}
