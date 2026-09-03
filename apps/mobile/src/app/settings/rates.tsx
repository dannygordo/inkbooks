import {
  useGetArtistShopConnectionsQuery,
  useGetMyRateSettingsQuery,
  useSetArtistShopRateSourceMutation,
  useUpdateArtistRateSettingsMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { getUserShopId } from '@/utils/user';

const BILLING_TYPE_OPTIONS = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'flat_rate', label: 'Flat Rate' },
];

/**
 * What this artist charges, and - for a shop-connected artist - whose rate actually applies to
 * their sessions. Direct port of apps/web's RatesPanel.jsx, one category on web for the same
 * reason it's one screen here: both are "how this artist bills," not two separate questions.
 * See DECISIONS.md X37.
 *
 * Reached only from settings/index.tsx's own "Rates" link (isArtist) - this screen doesn't
 * re-check that gate itself, same convention as settings/shop.tsx (X36).
 *
 * hourlyRate/flatRate use uncontrolled-style local edit tracking, matching web's own IBInput
 * (defaultValue, not value) reasoning exactly: a value hydrated by an effect after the query
 * resolves would update state but never actually reach what's rendered, since a TextInput's own
 * initial `value` is only meaningful before the user's first edit. Read straight from the query
 * result for the base value, and only fall back to local state for what's actually been edited.
 *
 * billingType/rateSource, by contrast, use PillRow - a controlled component, so hydrating them
 * from the query on load is safe (same distinction web's own comment draws between IBSelect/radio
 * and IBInput).
 *
 * NOT BUILT HERE: BoothRentPanel's "Your booth rent" card - a real, separate feature (own read
 * history of shop-set flat-fee terms, its own "mark paid" action) with no existing mobile
 * infrastructure at all, named as its own future slice rather than folded in.
 */
export default function RatesScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const shopId = getUserShopId(user);
  const artistUserInfoId = user?.userInfo?.__typename === 'Artist' ? user.userInfo.id : undefined;

  const [editedHourlyRate, setEditedHourlyRate] = useState<string | undefined>(undefined);
  const [editedFlatRate, setEditedFlatRate] = useState<string | undefined>(undefined);
  const [billingType, setBillingType] = useState<string | undefined>(undefined);
  const [rateSource, setRateSource] = useState<string | undefined>(undefined);
  const [savedRates, setSavedRates] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [rateSourceError, setRateSourceError] = useState<string | null>(null);

  const { data, loading, error } = useGetMyRateSettingsQuery({
    variables: { artistId: artistUserInfoId ?? '' },
    skip: !artistUserInfoId,
  });
  const { data: connectionsData } = useGetArtistShopConnectionsQuery({
    variables: { artistId: user?.id ?? '' },
    skip: !user?.id || !shopId,
  });

  const [updateRates, { loading: savingRates }] = useUpdateArtistRateSettingsMutation();
  const [setRateSourceMutation, { loading: savingRateSource }] = useSetArtistShopRateSourceMutation();

  if (!artistUserInfoId) {
    return null;
  }

  if (loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="rates-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const artist = data?.getArtist;
  if (error || !artist) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="rates-error">
            Couldn't load your rate settings.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const hourlyRateValue = editedHourlyRate ?? (artist.hourlyRate != null ? String(artist.hourlyRate) : '');
  const flatRateValue = editedFlatRate ?? (artist.flatRate != null ? String(artist.flatRate) : '');
  const billingTypeValue = billingType ?? artist.billingType ?? 'hourly';

  const activeConnection = (connectionsData?.getArtistShopConnections ?? [])
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .find((c) => c.status === 'active' && String(c.shopId) === String(shopId));
  const rateSourceValue = rateSource ?? activeConnection?.rateSource ?? 'shop';

  const handleSaveRates = () => {
    setRatesError(null);
    setSavedRates(false);
    const parsedHourly = hourlyRateValue.trim() === '' ? null : parseInt(hourlyRateValue, 10);
    const parsedFlat = flatRateValue.trim() === '' ? null : parseInt(flatRateValue, 10);
    updateRates({
      variables: {
        hourlyRate: parsedHourly,
        flatRate: parsedFlat,
        billingType: billingTypeValue,
      },
    })
      .then(() => setSavedRates(true))
      .catch((err) => setRatesError((err as Error).message));
  };

  const handleRateSourceChange = (value: string) => {
    if (!shopId) {
      return;
    }
    setRateSource(value);
    setRateSourceError(null);
    setRateSourceMutation({ variables: { artistId: user!.id, shopId, rateSource: value } }).catch((err) => {
      setRateSourceError((err as Error).message);
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.content}>
          <View style={styles.card}>
            <ThemedText type="smallBold">Rates</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Used to auto-compute a session's total from time worked - can always be edited by
              hand on the session itself.
            </ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Billing Type
            </ThemedText>
            <PillRow
              options={BILLING_TYPE_OPTIONS}
              selectedId={billingTypeValue}
              onSelect={setBillingType}
              testID="rates-billing-type"
            />

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Hourly Rate ($)
            </ThemedText>
            <TextInput
              value={hourlyRateValue}
              onChangeText={setEditedHourlyRate}
              keyboardType="number-pad"
              placeholder="150"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="rates-hourly-rate"
            />

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Flat Rate ($)
            </ThemedText>
            <TextInput
              value={flatRateValue}
              onChangeText={setEditedFlatRate}
              keyboardType="number-pad"
              placeholder="500"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="rates-flat-rate"
            />

            {ratesError ? (
              <ThemedText type="small" style={styles.error}>
                {ratesError}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              <Button
                label="Save Rates"
                onPress={handleSaveRates}
                loading={savingRates}
                testID="rates-save"
              />
              {savedRates ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Saved
                </ThemedText>
              ) : null}
            </View>
          </View>

          {shopId ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Which Rate Applies</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                At your connected shop, sessions can bill against the shop's rate or your own.
              </ThemedText>
              <PillRow
                options={[
                  { id: 'shop', label: "Use the shop's rate" },
                  { id: 'own', label: 'Use my own rate' },
                ]}
                selectedId={rateSourceValue}
                onSelect={handleRateSourceChange}
                testID="rates-source"
              />
              {savingRateSource ? (
                <ActivityIndicator color={theme.text} testID="rates-source-saving" />
              ) : null}
              {rateSourceError ? (
                <ThemedText type="small" style={styles.error}>
                  {rateSourceError}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
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
