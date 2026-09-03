import { MockedProvider } from '@apollo/client/testing';
import { RequestPasswordResetDocument } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/reset-password';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

const mockUseRouter = useRouter as jest.Mock;
const EMAIL = 'danny@thecopperwolf.com';

function renderScreen(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <ResetPasswordScreen />
    </MockedProvider>,
  );
}

describe('ResetPasswordScreen', () => {
  const back = jest.fn();

  beforeEach(() => {
    mockUseRouter.mockReturnValue({ back });
  });

  afterEach(() => {
    mockUseRouter.mockReset();
    back.mockReset();
  });

  it('disables submit until an email is entered', () => {
    renderScreen([]);

    expect(screen.getByTestId('reset-password-submit').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('reset-password-email'), EMAIL);
    expect(screen.getByTestId('reset-password-submit').props.accessibilityState.disabled).toBe(false);
  });

  it('shows the unconditional confirmation on success', async () => {
    const mocks = [
      {
        request: { query: RequestPasswordResetDocument, variables: { email: EMAIL } },
        result: { data: { requestPasswordReset: true } },
      },
    ];
    renderScreen(mocks);

    fireEvent.changeText(screen.getByTestId('reset-password-email'), EMAIL);
    fireEvent.press(screen.getByTestId('reset-password-submit'));

    await waitFor(() => expect(screen.getByTestId('reset-password-confirmation')).toBeTruthy());
  });

  // The confirmation is deliberately the SAME whether the address belongs to an account or the
  // request itself fails - see reset-password.tsx's own header comment on why: a form that
  // answers differently is a tool for checking who a shop's clients are.
  it('shows the same unconditional confirmation even when the request errors', async () => {
    const mocks = [
      {
        request: { query: RequestPasswordResetDocument, variables: { email: EMAIL } },
        error: new Error('network down'),
      },
    ];
    renderScreen(mocks);

    fireEvent.changeText(screen.getByTestId('reset-password-email'), EMAIL);
    fireEvent.press(screen.getByTestId('reset-password-submit'));

    await waitFor(() => expect(screen.getByTestId('reset-password-confirmation')).toBeTruthy());
  });

  it('navigates back when "Back to login" is pressed', () => {
    renderScreen([]);

    fireEvent.press(screen.getByTestId('reset-password-cancel'));

    expect(back).toHaveBeenCalled();
  });
});
