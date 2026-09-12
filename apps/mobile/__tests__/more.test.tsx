import { MockedProvider } from '@apollo/client/testing';
import { GetInboxDocument, GetPendingBookingRequestCountDocument } from '@inkbooks/api';
import { useRouter, usePathname } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MoreScreen from '@/app/more';
import { useAuth } from '@/context/auth';
import { ROLES } from '@/constants/auth';

// Same mocking approach as index.test.tsx/login.test.tsx - see those files' own comments.
jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;
const mockUsePathname = usePathname as jest.Mock;

// An independent artist (no shop) - clears canManageBusinessLedger/canManageForms (artist +
// !hasShop), but neither isStaffOrBetter nor isShopAdminOrBetter (role ARTIST=20 is looser than
// both SHOP_STAFF=15 and SHOP_ADMIN=10 - see permissions.ts's own comments).
const INDEPENDENT_ARTIST = {
  id: 'artist-1',
  role: ROLES.ARTIST,
  userType: 'artist',
  userInfo: { __typename: 'Artist', id: 'artist-1', shop: null },
};

// A shop admin - clears every gate on the screen.
const SHOP_ADMIN = {
  id: 'artist-2',
  role: ROLES.SHOP_ADMIN,
  userType: 'artist',
  userInfo: { __typename: 'Artist', id: 'artist-2', shop: { __typename: 'Shop', id: 'shop-1' } },
};

function zeroCountMocks() {
  return [
    {
      request: { query: GetInboxDocument, variables: { includeRead: false } },
      result: { data: { getInbox: { __typename: 'Inbox', unreadCount: 0, items: [] } } },
    },
    {
      request: { query: GetPendingBookingRequestCountDocument, variables: {} },
      result: { data: { getPendingBookingRequestCount: 0 } },
    },
  ];
}

function renderMore(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <MoreScreen />
    </MockedProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRouter.mockReturnValue({ push: jest.fn() });
  mockUsePathname.mockReturnValue('/more');
});

describe('MoreScreen', () => {
  it('shows only the gates an independent artist actually clears', () => {
    mockUseAuth.mockReturnValue({ user: INDEPENDENT_ARTIST, logout: jest.fn() });
    renderMore(zeroCountMocks());

    // Always visible, no gate.
    expect(screen.getByTestId('more-dashboard')).toBeTruthy();
    expect(screen.getByTestId('more-search')).toBeTruthy();
    expect(screen.getByTestId('more-notifications')).toBeTruthy();
    expect(screen.getByTestId('more-booking-requests')).toBeTruthy();
    expect(screen.getByTestId('more-settings')).toBeTruthy();
    expect(screen.getByTestId('more-logout')).toBeTruthy();

    // canManageBusinessLedger (artist, regardless of shop) - visible.
    expect(screen.getByTestId('more-income')).toBeTruthy();
    expect(screen.getByTestId('more-expenses')).toBeTruthy();
    expect(screen.getByTestId('more-gift-cards')).toBeTruthy();
    // canManageForms/hasAuditAuthority (no shop) - visible.
    expect(screen.getByTestId('more-forms')).toBeTruthy();

    // isStaffOrBetter/isShopAdminOrBetter - an independent artist clears neither.
    expect(screen.queryByTestId('more-artists')).toBeNull();
    expect(screen.queryByTestId('more-staff')).toBeNull();
    expect(screen.queryByTestId('more-shops')).toBeNull();
    expect(screen.queryByTestId('more-shop-cut-confirmations')).toBeNull();
  });

  it('shows every section for a shop admin', () => {
    mockUseAuth.mockReturnValue({ user: SHOP_ADMIN, logout: jest.fn() });
    renderMore(zeroCountMocks());

    expect(screen.getByTestId('more-artists')).toBeTruthy();
    expect(screen.getByTestId('more-staff')).toBeTruthy();
    expect(screen.getByTestId('more-shops')).toBeTruthy();
    expect(screen.getByTestId('more-shop-cut-confirmations')).toBeTruthy();
    expect(screen.getByTestId('more-income')).toBeTruthy();
    expect(screen.getByTestId('more-forms')).toBeTruthy();
  });

  it('navigates to a row\'s destination on tap', () => {
    const push = jest.fn();
    mockUseRouter.mockReturnValue({ push });
    mockUseAuth.mockReturnValue({ user: SHOP_ADMIN, logout: jest.fn() });
    renderMore(zeroCountMocks());

    fireEvent.press(screen.getByTestId('more-artists'));

    expect(push).toHaveBeenCalledWith('/artists');
  });

  it('calls logout on tap, not a navigation', () => {
    const push = jest.fn();
    const logout = jest.fn();
    mockUseRouter.mockReturnValue({ push });
    mockUseAuth.mockReturnValue({ user: SHOP_ADMIN, logout });
    renderMore(zeroCountMocks());

    fireEvent.press(screen.getByTestId('more-logout'));

    expect(logout).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('badges Notifications and Booking Requests with their own separate counts', async () => {
    mockUseAuth.mockReturnValue({ user: SHOP_ADMIN, logout: jest.fn() });
    renderMore([
      {
        request: { query: GetInboxDocument, variables: { includeRead: false } },
        result: { data: { getInbox: { __typename: 'Inbox', unreadCount: 4, items: [] } } },
      },
      {
        request: { query: GetPendingBookingRequestCountDocument, variables: {} },
        result: { data: { getPendingBookingRequestCount: 2 } },
      },
    ]);

    await waitFor(() => expect(screen.getByTestId('more-notifications-badge')).toHaveTextContent('4'));
    expect(screen.getByTestId('more-booking-requests-badge')).toHaveTextContent('2');
  });
});
