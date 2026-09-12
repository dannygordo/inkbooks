import { MockedProvider } from '@apollo/client/testing';
import { GetInboxDocument, GetPendingBookingRequestCountDocument, GetUnreadMessageCountDocument } from '@inkbooks/api';
import { useRouter, usePathname } from 'expo-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { BottomTabBar } from '@/components/BottomTabBar';
import { useAuth } from '@/context/auth';

// Same reasoning as index.test.tsx/login.test.tsx: useAuth is mocked directly (AuthContext isn't
// exported), and expo-router's navigation hooks are mocked rather than exercising a real Stack -
// this file only has to prove BottomTabBar reads the active tab off usePathname and calls
// router.push with the right path, not exercise expo-router's own navigation stack.
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

const USER = { id: 'artist-1', email: 'danny@thecopperwolf.com' };

function zeroCountMocks() {
  return [
    {
      request: { query: GetUnreadMessageCountDocument, variables: {} },
      result: { data: { getUnreadMessageCount: 0 } },
    },
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

function renderTabBar(mocks: readonly unknown[], pathname = '/') {
  mockUsePathname.mockReturnValue(pathname);
  return render(
    <MockedProvider mocks={mocks as never}>
      <BottomTabBar />
    </MockedProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: USER });
  mockUseRouter.mockReturnValue({ push: jest.fn() });
});

describe('BottomTabBar', () => {
  it('renders all five destinations', () => {
    renderTabBar(zeroCountMocks());

    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Clients')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByText('Messages')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('marks the tab matching the current pathname as selected, and only that one', () => {
    renderTabBar(zeroCountMocks(), '/clients');

    expect(screen.getByTestId('tab-clients').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('tab-home').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('tab-projects').props.accessibilityState.selected).toBe(false);
  });

  // '/' would otherwise prefix-match every other tab's path (they all start with '/') - see
  // BottomTabBar.tsx's own comment on why home alone needs an exact match.
  it('does not mark Home selected when on a different tab', () => {
    renderTabBar(zeroCountMocks(), '/projects');

    expect(screen.getByTestId('tab-home').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('tab-projects').props.accessibilityState.selected).toBe(true);
  });

  // clients/projects each have a genuinely separate singular detail route (client/[id],
  // project/[id]) outside this tab's own path, so they don't exercise the prefix-match case -
  // messages/[id] is the one real example, nested inside messages/ itself.
  it('keeps a tab selected while a real sub-route under it is open', () => {
    renderTabBar(zeroCountMocks(), '/messages/conv-1');

    expect(screen.getByTestId('tab-messages').props.accessibilityState.selected).toBe(true);
  });

  it('navigates to the tapped tab', () => {
    const push = jest.fn();
    mockUseRouter.mockReturnValue({ push });
    renderTabBar(zeroCountMocks());

    fireEvent.press(screen.getByTestId('tab-messages'));

    expect(push).toHaveBeenCalledWith('/messages');
  });

  it('shows a badge on Messages for unread messages, and none when there are none', async () => {
    const mocks = [
      {
        request: { query: GetUnreadMessageCountDocument, variables: {} },
        result: { data: { getUnreadMessageCount: 3 } },
      },
      zeroCountMocks()[1],
      zeroCountMocks()[2],
    ];
    renderTabBar(mocks);

    await waitFor(() => expect(screen.getByTestId('tab-messages-badge')).toBeTruthy());
    expect(screen.getByTestId('tab-messages-badge')).toHaveTextContent('3');
    expect(screen.queryByTestId('tab-home-badge')).toBeNull();
  });

  it('shows a combined badge on More for unread notifications plus pending booking requests', async () => {
    const mocks = [
      zeroCountMocks()[0],
      {
        request: { query: GetInboxDocument, variables: { includeRead: false } },
        result: { data: { getInbox: { __typename: 'Inbox', unreadCount: 2, items: [] } } },
      },
      {
        request: { query: GetPendingBookingRequestCountDocument, variables: {} },
        result: { data: { getPendingBookingRequestCount: 5 } },
      },
    ];
    renderTabBar(mocks);

    await waitFor(() => expect(screen.getByTestId('tab-more-badge')).toBeTruthy());
    expect(screen.getByTestId('tab-more-badge')).toHaveTextContent('7');
  });

  it('caps a badge at "9+"', async () => {
    const mocks = [
      {
        request: { query: GetUnreadMessageCountDocument, variables: {} },
        result: { data: { getUnreadMessageCount: 42 } },
      },
      zeroCountMocks()[1],
      zeroCountMocks()[2],
    ];
    renderTabBar(mocks);

    await waitFor(() => expect(screen.getByTestId('tab-messages-badge')).toHaveTextContent('9+'));
  });
});
