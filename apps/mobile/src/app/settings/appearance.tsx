import { useUpdateUserMutation } from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

const OPTIONS = [
  { id: 'system', label: 'Match Device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/**
 * Light / dark / match-device. Direct port of apps/web's AppearancePanel.jsx: saved to the
 * ACCOUNT (User.themePreference), not this device, so it follows the user to whatever device
 * they sign into next - see hooks/use-effective-color-scheme.ts's own comment (DECISIONS.md X43)
 * for the resolution rule this whole app's theming now runs through.
 *
 * Reached only from settings/index.tsx's own "Appearance" link - doesn't re-check any gate
 * itself (every signed-in user sees this on web too - no isArtist/isShopAdminOrBetter floor),
 * same convention as every other settings/*.tsx screen.
 *
 * NO SEPARATE "SAVED" CONFIRMATION - picking an option here changes the whole app's colors
 * immediately (the same render pass updateCurrentUser lands in), which IS the confirmation; a
 * "Saved" toast on top of a visibly different-colored screen would be redundant in a way none of
 * this port's other save-then-toast screens are.
 */
export default function AppearanceScreen() {
  const { user, updateCurrentUser } = useAuth();
  const theme = useTheme();
  const [updateUser, { loading: saving }] = useUpdateUserMutation();
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const preference = user.themePreference || 'system';

  const handleChange = async (themePreference: string) => {
    setError(null);
    try {
      const { data } = await updateUser({
        variables: { user: { id: user.id, email: user.email, role: user.role, themePreference } },
      });
      if (data?.updateUser) {
        await updateCurrentUser({ ...user, themePreference: data.updateUser.themePreference });
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <ThemedText type="smallBold">Appearance</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Applies to your account, not just this device - it follows you to whatever device
              you sign into next.
            </ThemedText>
            <PillRow options={OPTIONS} selectedId={preference} onSelect={handleChange} testID="appearance-theme" />
            {saving ? <ActivityIndicator color={theme.text} testID="appearance-saving" /> : null}
            {error ? (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}
          </View>
        </ScrollView>
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
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
