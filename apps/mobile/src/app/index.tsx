import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Type-only import, zero runtime cost - proves @inkbooks/api resolves and typechecks from
// apps/mobile the same way it already does from apps/web (packages/api's whole reason to exist -
// see DECISIONS.md's X1/X4). Not referenced at runtime; a real generated hook wired to a real
// query and a real screen is step 6 (PRODUCTION_ROADMAP.md's Phase 5 order-of-operations), not
// this scaffolding step.
import type { GetProjectsQuery } from '@inkbooks/api';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { apiUrl } from '@/lib/apollo-client';

type _ProvesGeneratedTypesResolve = GetProjectsQuery;

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          InkBooks
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
          Mobile scaffold. Real screens start with the calendar/appointments view - see
          PRODUCTION_ROADMAP.md's Phase 5, step 6.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="api-url">
          API: {apiUrl}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
});
