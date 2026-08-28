import { MockedProvider } from '@apollo/client/testing';
import { LoginDocument } from '@inkbooks/api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '@/app/login';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { useAuth } from '@/context/auth';

// Same reasoning as index.test.tsx: useAuth is mocked directly (AuthContext isn't exported), so
// this file only has to prove the screen calls login() with whatever the mutation resolves to -
// not that login() itself persists/dispatches correctly, which is auth.test.tsx's job.
jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

const VARIABLES = { email: 'danny@thecopperwolf.com', password: 'hunter2' };

const LOGIN_RESPONSE = {
  __typename: 'User',
  id: '1',
  email: VARIABLES.email,
  firstName: 'Danny',
  lastName: 'Schreiber',
  avatar: null,
  role: 20,
  userType: 'Artist',
  tagColor: null,
  themePreference: null,
  accessToken: 'fake.jwt.token',
  userInfo: {
    __typename: 'Artist',
    id: '1',
    firstName: 'Danny',
    lastName: 'Schreiber',
    avatar: null,
    hourlyRate: 0,
    shop: { __typename: 'Shop', id: 'shop-1', name: 'Copper Wolf' },
  },
};

function renderScreen(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <LoginScreen />
    </MockedProvider>,
  );
}

describe('LoginScreen', () => {
  afterEach(() => {
    mockUseAuth.mockReset();
  });

  it('disables submit until both fields are filled', () => {
    mockUseAuth.mockReturnValue({ login: jest.fn() });
    renderScreen([]);

    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('email-input'), VARIABLES.email);
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('password-input'), VARIABLES.password);
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('calls auth.login with the mutation result on success', async () => {
    const login = jest.fn();
    mockUseAuth.mockReturnValue({ login });

    const mocks = [
      {
        request: { query: LoginDocument, variables: VARIABLES },
        result: { data: { login: LOGIN_RESPONSE } },
      },
    ];
    renderScreen(mocks);

    fireEvent.changeText(screen.getByTestId('email-input'), VARIABLES.email);
    fireEvent.changeText(screen.getByTestId('password-input'), VARIABLES.password);
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(login).toHaveBeenCalledWith(LOGIN_RESPONSE));
  });

  it('shows the generic incorrect-credentials message on a failed attempt', async () => {
    mockUseAuth.mockReturnValue({ login: jest.fn() });

    const mocks = [
      {
        request: { query: LoginDocument, variables: VARIABLES },
        error: new Error('Wrong email or password'),
      },
    ];
    renderScreen(mocks);

    fireEvent.changeText(screen.getByTestId('email-input'), VARIABLES.email);
    fireEvent.changeText(screen.getByTestId('password-input'), VARIABLES.password);
    fireEvent.press(screen.getByTestId('login-submit'));

    // Same fallback message login.tsx renders for any failed attempt, not the raw GraphQL error
    // text (see that file's own comment on why: server error text isn't written for a signed-out
    // user to read verbatim).
    await waitFor(() =>
      expect(screen.getByTestId('login-error')).toHaveTextContent(
        AUTH_ERROR_MESSAGES.INCORRECT_CREDENTIALS,
      ),
    );
  });
});
