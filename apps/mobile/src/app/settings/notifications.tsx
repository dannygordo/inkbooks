import { useGetNotificationSettingsQuery, useUpdateNotificationSettingsMutation } from '@inkbooks/api';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/FormField';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Category key (the mutation input's boolean field) paired with its resolved-mode field - direct
// port of web's NotificationSettingsPanel.jsx CATEGORIES. Per category, not per event type - six
// (four here) is few enough that someone annoyed by one thing turns off that one thing, rather
// than a forty-checkbox page nobody reads.
const CATEGORIES = [
  { key: 'moneyEmail', modeKey: 'moneyMode', label: 'Money', hint: 'Deposits, payments, shop cuts.' },
  { key: 'scheduleEmail', modeKey: 'scheduleMode', label: 'Schedule', hint: 'Booking requests, bookings, cancellations.' },
  { key: 'rosterEmail', modeKey: 'rosterMode', label: 'Your team', hint: 'Artists joining or leaving, rate changes.' },
  { key: 'messageEmail', modeKey: 'messageMode', label: 'Messages', hint: 'New messages from clients and artists.' },
] as const;

// What a resolved mode actually means, in words - same MODE_TEXT web keeps, so a toggle that
// resolves to a digest says so rather than reading as a plain on/off.
const MODE_TEXT: Record<string, string> = {
  immediate: 'Emailed as it happens',
  digest: 'Rolled into your daily summary',
  off: 'In-app only',
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/**
 * Settings > Notifications - closes gap #7 of HANDOFF.md's 2026-09-04 parity accounting. Direct
 * port of apps/web's NotificationSettingsPanel.jsx: four category toggles (email only - in-app is
 * always on, since the inbox is also the record) plus a digest hour and timezone, shown only once
 * something actually digests. Not to be confused with Reminders/Auto-Responses/Response Time
 * (client-facing message nudges, already built) - this is the account owner's own inbound-email
 * preferences.
 *
 * Reached from settings/index.tsx's own "Notifications" card, no role gate - matches web's own
 * `isVisible: () => true` on this settings category (every real account type has one).
 *
 * DIGEST HOUR uses a PillRow of all 24 hours rather than web's MUI `<select>` - same "no
 * cross-platform select primitive" precedent DurationPicker.tsx/PillRow.tsx already established,
 * just a longer, horizontally-scrollable list than this app's other pill rows.
 *
 * TIMEZONE is a plain text field, matching web's own free-text TextField (not a picker on either
 * platform) - saved onBlur like every other field here, with the device's own detected zone shown
 * as a hint when it differs, same as web's `detectedZone` line. Offered, not applied silently -
 * it's the account's setting, and a value that appears without being chosen is one nobody can
 * explain later.
 */
export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { data, loading } = useGetNotificationSettingsQuery({ fetchPolicy: 'cache-and-network' });
  const [updateSettings, { loading: saving }] = useUpdateNotificationSettingsMutation();

  const settings = data?.getNotificationSettings;

  const detectedZone =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  const [localTimezone, setLocalTimezone] = useState<string | null>(null);
  useEffect(() => {
    if (settings && localTimezone === null) {
      setLocalTimezone(settings.timezone);
    }
  }, [settings, localTimezone]);

  if (loading && !settings) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ActivityIndicator color={theme.text} style={styles.loading} testID="notifications-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }
  if (!settings) {
    return null;
  }

  // Deliberately quiet on failure, matching web's own save() - a preference that failed to save
  // shows its old value on the next render, which tells the person more accurately than a toast.
  const save = (changes: { prefs?: Record<string, boolean>; timezone?: string; digestHour?: number }) => {
    updateSettings({ variables: changes }).catch(() => {});
  };

  const toggle = (key: string, next: boolean) => save({ prefs: { [key]: next } });

  // An unset preference resolves to the role default - a toggle reflects the RESOLVED mode, not
  // the raw null, so an untouched switch never reads as "off" when it isn't.
  const isOn = (modeKey: (typeof CATEGORIES)[number]['modeKey']) => settings[modeKey] !== 'off';
  const usesDigest = CATEGORIES.some((c) => settings[c.modeKey] === 'digest');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            These control email only. Everything still appears in your notifications here, because
            that list is also the record of what happened.
          </ThemedText>

          <View style={styles.card}>
            {CATEGORIES.map((category) => (
              <View key={category.key} style={styles.prefRow} testID={`notifications-${category.key}`}>
                <View style={styles.switchRow}>
                  <ThemedText type="default">{category.label}</ThemedText>
                  <Switch
                    value={isOn(category.modeKey)}
                    onValueChange={(next) => toggle(category.key, next)}
                    disabled={saving}
                    testID={`notifications-${category.key}-switch`}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {category.hint} <ThemedText type="smallBold">{MODE_TEXT[settings[category.modeKey]]}</ThemedText>
                </ThemedText>
              </View>
            ))}
          </View>

          {usesDigest ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Daily summary arrives at</ThemedText>
              <PillRow
                options={HOURS.map((h) => ({ id: String(h), label: hourLabel(h) }))}
                selectedId={String(settings.digestHour)}
                onSelect={(id) => save({ digestHour: Number(id) })}
                testID="notifications-digest-hour"
              />

              <FormField
                label="Your timezone"
                value={localTimezone ?? ''}
                onChangeText={setLocalTimezone}
                onBlur={() => localTimezone && save({ timezone: localTimezone })}
                editable={!saving}
                testID="notifications-timezone"
              />
              {detectedZone && detectedZone !== settings.timezone ? (
                <ThemedText type="small" themeColor="textSecondary">
                  This device says {detectedZone}.
                </ThemedText>
              ) : null}
            </View>
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
  loading: {
    marginTop: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  prefRow: {
    gap: Spacing.half,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
