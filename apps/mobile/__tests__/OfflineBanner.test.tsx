import { useNetInfo } from '@react-native-community/netinfo';
import { render, screen } from '@testing-library/react-native';

import { OfflineBanner } from '@/components/OfflineBanner';

const mockUseNetInfo = useNetInfo as jest.Mock;

describe('OfflineBanner', () => {
  afterEach(() => {
    mockUseNetInfo.mockReset();
  });

  it('renders nothing while connected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: true });
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('renders nothing while connectivity is still being determined', () => {
    // isConnected starts null until NetInfo reports in - see the component's own comment on why
    // that's treated as "online" rather than flashing the banner on every cold start.
    mockUseNetInfo.mockReturnValue({ isConnected: null });
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('renders the banner when the device is confirmed offline', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: false });
    render(<OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByText('Offline - showing cached data')).toBeTruthy();
  });
});
