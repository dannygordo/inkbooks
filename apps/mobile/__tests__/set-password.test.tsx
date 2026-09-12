import { MockedProvider } from '@apollo/client/testing';
import {
  InspectPasswordTokenDocument,
  SetPasswordWithTokenDocument,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SetPasswordScreen from '@/app/set-password/[token]';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

const mockUseRouter = useRouter as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const TOKEN = 'raw-token-123';

function renderScreen(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <SetPasswordScreen />
    </MockedProvider>,
  );
}

describe('SetPasswordScreen', () => {
  const replace = jest.fn();

  beforeEach(() => {
    mockUseRouter.mockReturnValue({ replace });
    mockUseLocalSearchParams.mockReturnValue({ token: TOKEN });
  });

  afterEach(() => {
    mockUseRouter.mockReset();
    mockUseLocalSearchParams.mockReset();
    replace.mockReset();
  });

  it('shows the invalid-link message when the token does not check out', async () => {
    const mocks = [
      {
        request: { query: InspectPasswordTokenDocument, variables: { token: TOKEN } },
        result: { data: { inspectPasswordToken: { valid: false, purpose: null, firstName: null } } },
      },
    ];
    renderScreen(mocks);

    await waitFor(() => expect(screen.getByTestId('set-password-invalid')).toBeTruthy());
  });

  it('shows the invite greeting for an invite-purpose token and submits a new password', async () => {
    const mocks = [
      {
        request: { query: InspectPasswordTokenDocument, variables: { token: TOKEN } },
        result: {
          data: { inspectPasswordToken: { valid: true, purpose: 'invite', firstName: 'Gordo' } },
        },
      },
      {
        request: {
          query: SetPasswordWithTokenDocument,
          variables: { token: TOKEN, newPassword: 'a-real-password' },
        },
        result: { data: { setPasswordWithToken: true } },
      },
    ];
    renderScreen(mocks);

    await waitFor(() => expect(screen.getByText(/Welcome to InkBooks/)).toBeTruthy());
    expect(screen.getByText(/Hi Gordo/)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('set-password-new'), 'a-real-password');
    fireEvent.changeText(screen.getByTestId('set-password-confirm'), 'a-real-password');
    fireEvent.press(screen.getByTestId('set-password-submit'));

    await waitFor(() => expect(screen.getByText('Password set')).toBeTruthy());
  });

  it('shows the reset framing (not the invite one) for a reset-purpose token', async () => {
    const mocks = [
      {
        request: { query: InspectPasswordTokenDocument, variables: { token: TOKEN } },
        result: {
          data: { inspectPasswordToken: { valid: true, purpose: 'reset', firstName: 'Gordo' } },
        },
      },
    ];
    renderScreen(mocks);

    await waitFor(() => expect(screen.getByText('Choose a new password')).toBeTruthy());
  });

  it('rejects a too-short password before ever calling the mutation', async () => {
    const mocks = [
      {
        request: { query: InspectPasswordTokenDocument, variables: { token: TOKEN } },
        result: {
          data: { inspectPasswordToken: { valid: true, purpose: 'reset', firstName: 'Gordo' } },
        },
      },
    ];
    renderScreen(mocks);
    await waitFor(() => expect(screen.getByTestId('set-password-submit')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('set-password-new'), 'short');
    fireEvent.changeText(screen.getByTestId('set-password-confirm'), 'short');
    fireEvent.press(screen.getByTestId('set-password-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('set-password-error').props.children).toMatch(/at least 8/i),
    );
  });

  it('rejects two passwords that do not match', async () => {
    const mocks = [
      {
        request: { query: InspectPasswordTokenDocument, variables: { token: TOKEN } },
        result: {
          data: { inspectPasswordToken: { valid: true, purpose: 'reset', firstName: 'Gordo' } },
        },
      },
    ];
    renderScreen(mocks);
    await waitFor(() => expect(screen.getByTestId('set-password-submit')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('set-password-new'), 'a-real-password');
    fireEvent.changeText(screen.getByTestId('set-password-confirm'), 'a-different-one');
    fireEvent.press(screen.getByTestId('set-password-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('set-password-error').props.children).toMatch(/don't match/i),
    );
  });
});
