import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';
import { useAuth } from '@/context/auth';

// Lives outside src/app/ deliberately, not next to the screen it tests - expo-router treats every
// file under src/app/ as a candidate route, and there's no documented guarantee it skips
// .test.tsx files the way some bundlers skip __tests__ directories by convention. Keeping test
// files out of the routes tree entirely removes the question rather than relying on unverified
// exclusion behavior.
//
// useAuth is mocked directly rather than wrapping this render in a real AuthProvider (+ Apollo
// MockedProvider + a mocked expo-secure-store) - AuthContext itself isn't exported from auth.tsx,
// only AuthProvider/useAuth are, and this screen only ever reads the hook's return value. The
// session-restore/cache-wipe/token-persistence logic AuthProvider owns is auth.test.tsx's job to
// cover, not this screen's.
jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

describe('HomeScreen', () => {
  afterEach(() => {
    mockUseAuth.mockReset();
  });

  it('greets the signed-in user by first name', () => {
    mockUseAuth.mockReturnValue({
      user: { firstName: 'Danny', email: 'danny@thecopperwolf.com' },
      logout: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByText('InkBooks')).toBeTruthy();
    expect(screen.getByTestId('welcome-message')).toHaveTextContent('Welcome, Danny');
  });

  it('falls back to email when firstName is not set', () => {
    // firstName is nullable in the schema (server/graphql/typeDefs.js's User type) - see
    // index.tsx's own comment on why the fallback exists.
    mockUseAuth.mockReturnValue({
      user: { firstName: null, email: 'danny@thecopperwolf.com' },
      logout: jest.fn(),
    });

    render(<HomeScreen />);

    expect(screen.getByTestId('welcome-message')).toHaveTextContent('Welcome, danny@thecopperwolf.com');
  });

  it('calls logout when the log out button is pressed', () => {
    const logout = jest.fn();
    mockUseAuth.mockReturnValue({
      user: { firstName: 'Danny', email: 'danny@thecopperwolf.com' },
      logout,
    });

    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('logout-button'));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
