import {
  useGetArtistShopConnectionsQuery,
  useGetBoothRentChargesQuery,
  useGetBoothRentPlansQuery,
  useGetMyRateSettingsQuery,
  useMarkBoothRentPaidManuallyMutation,
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
import { formatCents } from '@/utils/money';
import { formatUtcMonthDay, formatUtcMonthYear } from '@/utils/utcDate';
import { getUserShopId } from '@/utils/user';

const BILLING_TYPE_OPTIONS = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'flat_rate', label: 'Flat Rate' },
];

// Matches BoothRentPanel.jsx's own STATUS_LABEL/STATUS_COLOR maps exactly. Fixed hex colors
// rather than theme tokens - same call as styles.error's '#D33' just below: there's no
// success/warning/info slot in constants/theme.ts's Colors, and a status label reading the same
// color in light and dark mode is the simpler, correct behavior for a semantic status word, not a
// gap to fill in the theme system for one screen.
const BOOTH_RENT_STATUS_LABEL: Record<string, string> = {
  due: 'Due',
  marked_paid: 'Awaiting confirmation',
  confirmed: 'Confirmed paid',
};
const BOOTH_RENT_STATUS_COLOR: Record<string, string> = {
  due: '#B36B00',
  marked_paid: '#0B5FA5',
  confirmed: '#1B8A5A',
};

// Same ternary web's BoothRentPanel.jsx uses, kept byte-for-byte - a direct port reproduces the
// existing "11th"-style behavior for every day past 3, not a fix, since fixing an ordinal-suffix
// edge case is scope this slice was never asked for.
function ordinalDueDay(dueDayOfMonth: number): string {
  const suffix = dueDayOfMonth === 1 ? 'st' : dueDayOfMonth === 2 ? 'nd' : dueDayOfMonth === 3 ? 'rd' : 'th';
  return `${dueDayOfMonth}${suffix}`;
}

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
 * BUILT HERE, as of X45: BoothRentPanel's "Your booth rent" card - a read-only view of the
 * flat-fee terms a shop admin set for this artist, plus marking a month paid. Same placement as
 * web (Rates category, right after the rate fields), same RENDERS NOTHING behavior when there is
 * no booth-rent plan history at all - see the empty-state check just below the query reads.
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
  const [markingChargeId, setMarkingChargeId] = useState<string | null>(null);
  const [markPaidError, setMarkPaidError] = useState<string | null>(null);

  const { data, loading, error } = useGetMyRateSettingsQuery({
    variables: { artistId: artistUserInfoId ?? '' },
    skip: !artistUserInfoId,
  });
  const { data: connectionsData } = useGetArtistShopConnectionsQuery({
    variables: { artistId: user?.id ?? '' },
    skip: !user?.id || !shopId,
  });
  // Same scope as BoothRentPanel.jsx: getBoothRentPlans skipped entirely without a shop (an
  // independent artist has never had booth-rent terms to read), getBoothRentCharges scoped to
  // this artist only, un-paged beyond the same 12-item window web uses.
  const { data: boothRentPlansData } = useGetBoothRentPlansQuery({
    variables: { artistId: user?.id ?? '', shopId: shopId ?? '' },
    skip: !user?.id || !shopId,
  });
  const { data: boothRentChargesData, refetch: refetchBoothRentCharges } = useGetBoothRentChargesQuery({
    variables: { artistId: user?.id ?? '', page: { limit: 12 } },
    skip: !user?.id,
  });
  const [markBoothRentPaidManually] = useMarkBoothRentPaidManuallyMutation();

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

  const boothRentPlans = (boothRentPlansData?.getBoothRentPlans ?? []).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );
  const boothRentCharges = (boothRentChargesData?.getBoothRentCharges?.items ?? []).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );
  const now = Date.now();
  const currentBoothRentPlan = boothRentPlans
    .filter((plan) => new Date(plan.effectiveFrom).getTime() <= now)
    .reduce<typeof boothRentPlans[number] | null>(
      (latest, plan) =>
        !latest || new Date(plan.effectiveFrom).getTime() > new Date(latest.effectiveFrom).getTime()
          ? plan
          : latest,
      null,
    );

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

  const handleMarkBoothRentPaid = (chargeId: string) => {
    setMarkPaidError(null);
    setMarkingChargeId(chargeId);
    markBoothRentPaidManually({ variables: { boothRentChargeId: chargeId } })
      .then(() => refetchBoothRentCharges())
      .catch((err) => setMarkPaidError((err as Error).message))
      .finally(() => setMarkingChargeId(null));
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

          {/* Renders nothing at all - not even an empty card - when there's no booth-rent plan
              history for this artist. Matches BoothRentPanel.jsx's own header comment: an artist
              on the ordinary percentage cut has never had a reason to think about booth rent. */}
          {boothRentPlans.length > 0 ? (
            <View style={styles.card} testID="booth-rent-card">
              <ThemedText type="smallBold">Your booth rent</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Set by your shop, not by you - this is a read-only view of the terms. Mark a month
                paid once you've settled it; your shop confirms independently before it counts as
                settled.
              </ThemedText>

              {currentBoothRentPlan ? (
                <ThemedText type="small">
                  <ThemedText type="smallBold">{formatCents(currentBoothRentPlan.amountCents)}</ThemedText>
                  {`/month, due on the ${ordinalDueDay(currentBoothRentPlan.dueDayOfMonth)} of each month`}
                </ThemedText>
              ) : null}

              {boothRentCharges.length > 0 ? (
                <View style={styles.boothRentHistory}>
                  {boothRentCharges.map((charge) => (
                    <View key={charge.id} style={styles.boothRentRow} testID={`booth-rent-charge-${charge.id}`}>
                      <View style={styles.boothRentRowLine}>
                        <ThemedText type="smallBold">{formatCents(charge.amountCents)}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {`${formatUtcMonthYear(charge.periodMonth)} — due ${formatUtcMonthDay(charge.dueDate)}`}
                        </ThemedText>
                      </View>
                      <View style={styles.boothRentRowLine}>
                        <ThemedText
                          type="small"
                          style={{ color: BOOTH_RENT_STATUS_COLOR[charge.status] ?? theme.textSecondary }}
                        >
                          {BOOTH_RENT_STATUS_LABEL[charge.status] ?? charge.status}
                        </ThemedText>
                        {charge.status === 'due' ? (
                          <Button
                            label={markingChargeId === charge.id ? 'Marking…' : 'Mark paid'}
                            variant="secondary"
                            loading={markingChargeId === charge.id}
                            onPress={() => handleMarkBoothRentPaid(charge.id)}
                            testID={`booth-rent-mark-paid-${charge.id}`}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {markPaidError ? (
                <ThemedText type="small" style={styles.error}>
                  {markPaidError}
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
  boothRentHistory: {
    gap: Spacing.three,
  },
  boothRentRow: {
    gap: Spacing.one,
  },
  boothRentRowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
