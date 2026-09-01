import { ApolloClient, ApolloProvider, HttpLink, InMemoryCache } from '@apollo/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { Pressable, Text } from 'react-native';

import { AUTH_SETTINGS_CONSTANTS } from '@/constants/auth';
import { AuthProvider, useAuth } from '@/context/auth';

// expo-secure-store isn't mocked by jest-expo's preset (there's nothing native to fake past a
// key/value pair), so it's stubbed here directly with an in-memory Map standing in for iOS
// Keychain / Android Keystore - close enough for auth.tsx's async get/set/delete calls to behave
// like the real thing across a single test.
// Jest's module-factory scoping rule only allows referencing out-of-scope variables whose name
// starts with "mock" (case-insensitive) - renamed from `store` to satisfy that, not for clarity.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

// jwt-decode only parses the payload, it doesn't verify a signature - so a real signature isn't
// needed to exercise auth.tsx's expiry check, just a well-formed base64url payload segment. Built
// by hand (not Buffer) since the test package's tsconfig doesn't carry Node's type declarations.
function base64UrlEncode(json: string) {
  // The payload here is always plain-ASCII JSON (just an "exp" number), so no UTF-8 handling is
  // needed beyond what btoa already does.
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeToken(exp: number) {
  const payload = base64UrlEncode(JSON.stringify({ exp }));
  return `header.${payload}.signature`;
}

const USER = {
  id: '1',
  email: 'danny@thecopperwolf.com',
  firstName: 'Danny',
  lastName: 'Schreiber',
  avatar: null,
  role: 20,
  userType: 'Artist',
  tagColor: null,
  themePreference: null,
  userInfo: null,
};

function makeClient() {
  // AuthProvider only ever calls apollo.cache.reset()/clearStore() - nothing here issues a real
  // request - but ApolloClient's own `uri` shorthand is deprecated in this version in favor of an
  // explicit HttpLink, so that's what silences the constructor warning.
  return new ApolloClient({ cache: new InMemoryCache(), link: new HttpLink({ uri: 'http://localhost:5500' }) });
}

function Consumer() {
  const { user, firebaseUser, login, logout, initializing } = useAuth();
  if (initializing) {
    return <Text testID="state">initializing</Text>;
  }
  return (
    <>
      <Text testID="state">{user ? `signed-in:${user.email}` : 'signed-out'}</Text>
      <Text testID="firebase-state">
        {firebaseUser ? `firebase:${firebaseUser.uid}` : 'firebase:signed-out'}
      </Text>
      <Pressable
        testID="login-with-firebase-token"
        onPress={() => login({ ...USER, accessToken: fakeToken(Math.floor(Date.now() / 1000) + 3600), firebaseToken: 'a-real-custom-token' })}
      >
        <Text>Log in</Text>
      </Pressable>
      <Pressable testID="logout" onPress={() => logout()}>
        <Text>Log out</Text>
      </Pressable>
    </>
  );
}

function renderWithProvider(client: ApolloClient<unknown> = makeClient()) {
  return render(
    <ApolloProvider client={client}>
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    </ApolloProvider>,
  );
}

describe('AuthProvider', () => {
  afterEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('starts signed out when nothing is stored', async () => {
    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));
  });

  it('restores a session whose token has not expired', async () => {
    const userData = { ...USER, accessToken: fakeToken(Math.floor(Date.now() / 1000) + 3600) };
    mockStore.set(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE, JSON.stringify(userData));

    renderWithProvider();

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('signed-in:danny@thecopperwolf.com'),
    );
  });

  it('discards a stored session whose token has already expired', async () => {
    const userData = { ...USER, accessToken: fakeToken(Math.floor(Date.now() / 1000) - 3600) };
    mockStore.set(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE, JSON.stringify(userData));

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));
    expect(mockStore.has(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).toBe(false);
  });

  it('discards an undecodable token instead of hanging on "initializing"', async () => {
    // Ported verbatim from auth.jsx during Phase 1, this file had the identical bug: jwtDecode
    // throwing synchronously on a corrupted/non-JWT accessToken was uncaught inside the restore
    // effect's async IIFE, so setInitializing(false) never ran and every screen gated on
    // `initializing` (Stack.Protected in _layout.tsx) hung on the splash screen forever.
    const userData = { ...USER, accessToken: 'not-a-jwt' };
    mockStore.set(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE, JSON.stringify(userData));

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));
    expect(mockStore.has(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).toBe(false);
  });

  it('discards a cache entry that is not valid JSON instead of hanging on "initializing"', async () => {
    mockStore.set(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE, '{not-json');

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));
    expect(mockStore.has(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE)).toBe(false);
  });

  it('signs into Firebase with the server-minted custom token on login()', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));

    fireEvent.press(screen.getByTestId('login-with-firebase-token'));

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('signed-in:danny@thecopperwolf.com'),
    );
    expect(signInWithCustomToken).toHaveBeenCalledWith(
      expect.anything(),
      'a-real-custom-token',
    );
    // FIREBASE_LOGIN dispatches only after signInWithCustomToken's promise resolves - login()
    // itself doesn't await it (see auth.tsx's own comment on why: a slow/failed Firebase
    // handshake must never block the login screen), so this has to be its own waitFor rather than
    // asserted in the same one as the app-session state above.
    await waitFor(() =>
      expect(screen.getByTestId('firebase-state')).toHaveTextContent('firebase:test-firebase-uid'),
    );
  });

  it('signs out of Firebase on logout()', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));

    fireEvent.press(screen.getByTestId('login-with-firebase-token'));
    await waitFor(() =>
      expect(screen.getByTestId('firebase-state')).toHaveTextContent('firebase:test-firebase-uid'),
    );

    fireEvent.press(screen.getByTestId('logout'));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signed-out'));
    expect(signOut).toHaveBeenCalled();
  });
});
