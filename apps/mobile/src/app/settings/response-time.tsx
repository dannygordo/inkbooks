import {
  useGetResponseTimeSettingsQuery,
  useGetShopDetailQuery,
  useUpdateResponseTimeSettingsMutation,
} from '@inkbooks/api';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { getUserShopId } from '@/utils/user';

const MINUTES_PER_HOUR = 60;

function minutesToHours(minutes: number): number {
  return Math.round((minutes / MINUTES_PER_HOUR) * 100) / 100;
}

function hoursToMinutes(hours: string): number {
  return Math.round(Number(hours) * MINUTES_PER_HOUR);
}

/**
 * One scope (either { artistUserId } or { shopId }), its own card - mirroring web's
 * ResponseTimeSection. UNLIKE AutoResponsesSection (X39), only the artist's OWN card is ever
 * editable here - a shop-connected artist sees their shop's numbers only as a read-only
 * `shopCeiling` on their own row, never as a second editable card, matching web exactly: an
 * ordinary artist has no authority to manage the shop's row, only to be bound by it. The
 * shop-admin's OWN editable "Shop Response Time" card (rendered separately, scope={shopId}) is
 * the one place the shop's numbers are ever writable.
 */
function ResponseTimeSection({
  scope,
  title,
  description,
  ceilingHint,
  testIDPrefix,
}: {
  scope: { artistUserId: string } | { shopId: string };
  title: string;
  description: string;
  ceilingHint?: string;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  const { data, loading } = useGetResponseTimeSettingsQuery({
    variables: scope,
    fetchPolicy: 'cache-and-network',
  });
  const [updateSettings, { loading: saving }] = useUpdateResponseTimeSettingsMutation();

  const settings = data?.getResponseTimeSettings;
  const ceiling = settings?.shopCeiling;

  const [hydrated, setHydrated] = useState(false);
  const [initialHours, setInitialHours] = useState('');
  const [repeatHours, setRepeatHours] = useState('');
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !hydrated) {
      setInitialHours(String(minutesToHours(settings.initialThresholdMinutes)));
      setRepeatHours(String(minutesToHours(settings.repeatIntervalMinutes)));
      setHydrated(true);
    }
  }, [settings, hydrated]);

  if (loading && !data) {
    return <ActivityIndicator color={theme.text} testID={`${testIDPrefix}-loading`} />;
  }

  // The server rejects a write above the ceiling outright - mirrored client-side so the artist
  // sees why before Save, not after a round trip, same as web's own exceedsCeiling check.
  const exceedsCeiling = Boolean(
    ceiling &&
      (hoursToMinutes(initialHours) > ceiling.initialThresholdMinutes ||
        hoursToMinutes(repeatHours) > ceiling.repeatIntervalMinutes),
  );

  const handleSave = () => {
    const initialThresholdMinutes = hoursToMinutes(initialHours);
    const repeatIntervalMinutes = hoursToMinutes(repeatHours);
    if (!initialThresholdMinutes || !repeatIntervalMinutes) {
      return;
    }
    setFormError(null);
    setSaved(false);
    updateSettings({
      variables: {
        input: {
          ...('shopId' in scope ? { shopId: scope.shopId } : {}),
          initialThresholdMinutes,
          repeatIntervalMinutes,
        },
      },
    })
      .then(() => setSaved(true))
      .catch((err) => setFormError((err as Error).message));
  };

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>
      {ceiling ? (
        <ThemedText type="small" themeColor="textSecondary">
          {ceilingHint ?? 'Your shop limits this to at most'} {minutesToHours(ceiling.initialThresholdMinutes)}{' '}
          hour(s) before the first nudge, repeating at most every {minutesToHours(ceiling.repeatIntervalMinutes)}{' '}
          hour(s).
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Nudge after (hours unanswered)
      </ThemedText>
      <TextInput
        value={initialHours}
        onChangeText={setInitialHours}
        keyboardType="decimal-pad"
        editable={!saving}
        style={[
          styles.input,
          { color: theme.text, borderColor: exceedsCeiling ? '#D33' : theme.backgroundSelected },
        ]}
        testID={`${testIDPrefix}-initial-hours`}
      />

      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        Repeat every (hours)
      </ThemedText>
      <TextInput
        value={repeatHours}
        onChangeText={setRepeatHours}
        keyboardType="decimal-pad"
        editable={!saving}
        style={[
          styles.input,
          { color: theme.text, borderColor: exceedsCeiling ? '#D33' : theme.backgroundSelected },
        ]}
        testID={`${testIDPrefix}-repeat-hours`}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Keeps repeating on this interval until you reply.
      </ThemedText>

      {exceedsCeiling && ceiling ? (
        <ThemedText type="small" style={styles.error}>
          Your shop caps this at {minutesToHours(ceiling.initialThresholdMinutes)} hour(s) before the first
          nudge and {minutesToHours(ceiling.repeatIntervalMinutes)} hour(s) between repeats - bring both at
          or under those to save.
        </ThemedText>
      ) : null}
      {formError ? (
        <ThemedText type="small" style={styles.error}>
          {formError}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Save"
          onPress={handleSave}
          loading={saving}
          disabled={!initialHours || !repeatHours || exceedsCeiling}
          testID={`${testIDPrefix}-save`}
        />
        {saved ? (
          <ThemedText type="small" themeColor="textSecondary">
            Saved
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Settings > Messages > Response Time. Third of the four Messages-category screens (X31/X38/X39)
 * - how long a client's message may sit unanswered before the artist is nudged, and how often the
 * nudge repeats. Direct port of apps/web's ResponseTimePanel.jsx. See DECISIONS.md X40.
 *
 * MINUTES ON THE WIRE, HOURS ON SCREEN - ported directly (minutesToHours/hoursToMinutes), same
 * "human unit for editing, minutes for the server" convention as reminders.tsx (X38).
 *
 * TWO INDEPENDENT SECTIONS, same shape as auto-responses.tsx, but ONLY the artist's own card is
 * ever editable - the shop's own numbers show up on the artist's own row as a read-only
 * `shopCeiling`, never as a second editable section for an ordinary artist. A shop-admin who is
 * ALSO an artist sees both: their own editable card (with the shop's ceiling noted on it) and a
 * second, separately-editable "Shop Response Time" card for the shop's row itself.
 *
 * Reached only from settings/index.tsx's own "Messages" card - doesn't re-check the top-level
 * isArtist gate itself, same convention as every other settings/*.tsx screen.
 */
export default function ResponseTimeScreen() {
  const { user } = useAuth();
  const shopId = getUserShopId(user);
  const canManageShopResponseTime = Boolean(user) && isShopAdminOrBetter(user) && Boolean(shopId);
  const isArtist = user?.userInfo?.__typename === 'Artist';

  const { data: shopData } = useGetShopDetailQuery({
    variables: { shopId: shopId ?? '' },
    skip: !canManageShopResponseTime,
  });

  if (!user) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {isArtist ? (
            <ResponseTimeSection
              scope={{ artistUserId: user.id }}
              title="Your Response Time"
              description="How long a client's message can go unanswered before you're nudged to reply, and how often the reminder repeats."
              testIDPrefix="response-time-own"
            />
          ) : null}
          {canManageShopResponseTime && shopId ? (
            <ResponseTimeSection
              scope={{ shopId }}
              title={`${shopData?.getShop?.name ?? 'Shop'} Response Time`}
              description="The most lenient response-time policy any artist here may use. An artist can set a shorter window for themselves, but never a longer one than this."
              testIDPrefix="response-time-shop"
            />
          ) : null}
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
  label: {
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
