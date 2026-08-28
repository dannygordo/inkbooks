import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

// Authenticated home screen (guarded by _layout.tsx's Stack.Protected - unreachable while
// `user` is null). Still the walking-skeleton placeholder from step 4/5, now proven end-to-end
// with a real signed-in session instead of a type-only import: Phase 2 (PRODUCTION_ROADMAP.md's
// Phase 5, step 6) replaces this with the real appointments list, at which point this becomes
// that screen rather than a second one alongside it.
export default function HomeScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          InkBooks
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle} testID="welcome-message">
          {/* firstName is nullable in the schema (server/graphql/typeDefs.js's User type) - a
              signed-in session with no name set falls back to email rather than rendering
              "Welcome, " with nothing after it. */}
          Welcome, {user?.firstName ?? user?.email}
        </ThemedText>

        <Pressable
          onPress={() => logout()}
          testID="logout-button"
          style={[styles.button, { borderColor: theme.backgroundSelected }]}
        >
          <ThemedText type="default">Log out</ThemedText>
        </Pressable>
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
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  button: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
