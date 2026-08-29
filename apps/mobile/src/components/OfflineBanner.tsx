import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

// PRODUCTION_ROADMAP.md's Phase 5 step 6 calls for "a visible 'offline - showing cached data'
// banner" specifically, not a global connectivity indicator - so this renders nothing by default
// and is placed by the one screen (the appointments list) whose data it's actually describing,
// the same way apollo-client.ts's cache persistence exists for that screen's reads specifically.
//
// Driven by NetInfo's own device-level connectivity signal, not by inspecting the appointments
// query's Apollo result (e.g. "networkStatus === error" or "data present but fetch failed").
// Those two things usually agree, but they're not the same fact: NetInfo answers "is this device
// connected right now", which is what a user standing in a dead zone actually wants confirmed.
// Deriving it from one query's error state instead would tie this banner's correctness to that
// query's own retry/error-policy behavior, which is a coincidence, not a guarantee. isConnected
// starts `null` (not yet determined) - treated as "online" rather than flashing the banner on
// every cold start before NetInfo has reported in.
export function OfflineBanner() {
  const netInfo = useNetInfo();

  if (netInfo.isConnected !== false) {
    return null;
  }

  return (
    <View style={styles.banner} testID="offline-banner">
      <ThemedText type="small" style={styles.text}>
        Offline - showing cached data
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3CD',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  text: {
    color: '#8A6D00',
    textAlign: 'center',
  },
});
