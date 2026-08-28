import { ApolloClient, ApolloProvider, HttpLink, InMemoryCache } from '@apollo/client';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

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
  const { user, initializing } = useAuth();
  if (initializing) {
    return <Text testID="state">initializing</Text>;
  }
  return <Text testID="state">{user ? `signed-in:${user.email}` : 'signed-out'}</Text>;
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
});
