import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

// Lives outside src/app/ deliberately, not next to the screen it tests - expo-router treats every
// file under src/app/ as a candidate route, and there's no documented guarantee it skips
// .test.tsx files the way some bundlers skip __tests__ directories by convention. Keeping test
// files out of the routes tree entirely removes the question rather than relying on unverified
// exclusion behavior.
describe('HomeScreen', () => {
  it('renders the InkBooks placeholder screen with the configured API URL', () => {
    render(<HomeScreen />);

    expect(screen.getByText('InkBooks')).toBeTruthy();

    // No EXPO_PUBLIC_API_URL is set in the test environment, so apollo-client.ts's apiUrl falls
    // back to its hardcoded localhost default - asserting on it here means this test breaks (not
    // silently passes) the day someone changes that fallback without meaning to.
    expect(screen.getByTestId('api-url')).toHaveTextContent('API: http://localhost:5500');
  });
});
