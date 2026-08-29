import { MockedProvider } from '@apollo/client/testing';
import { GetAppointmentsByArtistDocument, GetAppointmentsByShopDocument } from '@inkbooks/api';
import { render, screen, waitFor } from '@testing-library/react-native';

import AppointmentsScreen from '@/app/index';
import { useAuth } from '@/context/auth';

// Lives outside src/app/ deliberately - see login.test.tsx's own comment on why (expo-router
// treats every file under src/app/ as a candidate route). useAuth is mocked the same way
// login.test.tsx mocks it, for the same reason (AuthContext itself isn't exported).
jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(),
}));

// MockedProvider matches a mock's `request.variables` against what the component actually sends
// by deep equality, not a jest matcher - `expect.anything()` wouldn't work here the way it does
// inside `toHaveBeenCalledWith`. getThisWeekFilter() computes its bounds from `new Date()`, so
// it's pinned to one fixed object both this file's mocks and the component's real call read from,
// rather than each independently computing "this week" and drifting apart at the exact moment a
// test happens to run near a day boundary.
const FIXED_WEEK_FILTER = { from: '2026-08-24T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' };
jest.mock('@/utils/dateRanges', () => ({
  getThisWeekFilter: jest.fn(() => FIXED_WEEK_FILTER),
}));

const mockUseAuth = useAuth as jest.Mock;

const INDEPENDENT_ARTIST = {
  id: 'artist-1',
  email: 'danny@thecopperwolf.com',
  userInfo: { __typename: 'Artist', id: 'artist-1', shop: null },
};

const SHOP_ARTIST = {
  id: 'artist-2',
  email: 'danny@thecopperwolf.com',
  userInfo: { __typename: 'Artist', id: 'artist-2', shop: { __typename: 'Shop', id: 'shop-1' } },
};

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'Appointment',
    id: 'appt-1',
    projectId: null,
    userId: 'artist-1',
    bookingRequestId: null,
    project: null,
    bookingRequest: null,
    shopId: null,
    isPersonal: false,
    user: null,
    title: 'Sleeve session',
    description: null,
    appointmentType: 'session',
    // Fixed rather than relative-to-now: buildListEntries groups by calendar day, so an assertion
    // on a specific day heading needs a date that doesn't drift the test across a day boundary
    // depending on when it happens to run.
    appointmentDate: '2026-08-27T15:00:00.000Z',
    durationMinutes: 60,
    appointmentEnd: '2026-08-27T16:00:00.000Z',
    appointmentStatus: 'scheduled',
    totalCents: null,
    tipCents: null,
    shopCutStatus: 'not_applicable',
    shopCutCents: null,
    shopCutPaymentMethod: null,
    shopCutSquareInvoiceId: null,
    ...overrides,
  };
}

function renderScreen(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <AppointmentsScreen />
    </MockedProvider>,
  );
}

describe('AppointmentsScreen', () => {
  afterEach(() => {
    mockUseAuth.mockReset();
  });

  it('renders an independent artist\'s own appointments', async () => {
    mockUseAuth.mockReturnValue({ user: INDEPENDENT_ARTIST, logout: jest.fn() });

    const mocks = [
      {
        request: {
          query: GetAppointmentsByArtistDocument,
          variables: {
            userId: INDEPENDENT_ARTIST.id,
            filter: FIXED_WEEK_FILTER,
            page: { limit: 200 },
          },
        },
        result: {
          data: {
            getAppointmentsByArtist: {
              __typename: 'AppointmentPage',
              items: [appointment()],
              pageInfo: { __typename: 'PageInfo', totalCount: 1, hasMore: false, limit: 200, offset: 0 },
            },
          },
        },
      },
    ];
    renderScreen(mocks);

    await waitFor(() => expect(screen.getByTestId('appointment-row-appt-1')).toBeTruthy());
    expect(screen.getByText('Sleeve session')).toBeTruthy();
  });

  it('merges a shop-connected artist\'s shop and personal appointments', async () => {
    mockUseAuth.mockReturnValue({ user: SHOP_ARTIST, logout: jest.fn() });

    const mocks = [
      {
        request: {
          query: GetAppointmentsByShopDocument,
          variables: { shopId: 'shop-1', filter: FIXED_WEEK_FILTER, page: { limit: 200 } },
        },
        result: {
          data: {
            getAppointmentsByShop: {
              __typename: 'AppointmentPage',
              items: [appointment({ id: 'shop-appt', title: 'Shop session' })],
              pageInfo: { __typename: 'PageInfo', totalCount: 1, hasMore: false, limit: 200, offset: 0 },
            },
          },
        },
      },
      {
        request: {
          query: GetAppointmentsByArtistDocument,
          variables: {
            userId: SHOP_ARTIST.id,
            filter: { ...FIXED_WEEK_FILTER, isPersonal: true },
            page: { limit: 200 },
          },
        },
        result: {
          data: {
            getAppointmentsByArtist: {
              __typename: 'AppointmentPage',
              items: [
                appointment({
                  id: 'personal-appt',
                  title: 'Dentist',
                  isPersonal: true,
                  appointmentDate: '2026-08-27T18:00:00.000Z',
                  appointmentEnd: '2026-08-27T19:00:00.000Z',
                }),
              ],
              pageInfo: { __typename: 'PageInfo', totalCount: 1, hasMore: false, limit: 200, offset: 0 },
            },
          },
        },
      },
    ];
    renderScreen(mocks);

    await waitFor(() => expect(screen.getByTestId('appointment-row-shop-appt')).toBeTruthy());
    expect(screen.getByTestId('appointment-row-personal-appt')).toBeTruthy();
  });

  it('shows an empty state when there are no appointments this week', async () => {
    mockUseAuth.mockReturnValue({ user: INDEPENDENT_ARTIST, logout: jest.fn() });

    const mocks = [
      {
        request: {
          query: GetAppointmentsByArtistDocument,
          variables: {
            userId: INDEPENDENT_ARTIST.id,
            filter: FIXED_WEEK_FILTER,
            page: { limit: 200 },
          },
        },
        result: {
          data: {
            getAppointmentsByArtist: {
              __typename: 'AppointmentPage',
              items: [],
              pageInfo: { __typename: 'PageInfo', totalCount: 0, hasMore: false, limit: 200, offset: 0 },
            },
          },
        },
      },
    ];
    renderScreen(mocks);

    await waitFor(() => expect(screen.getByTestId('appointments-empty')).toBeTruthy());
  });
});
