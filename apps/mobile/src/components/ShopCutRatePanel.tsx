import {
  useConfirmBoothRentPaidMutation,
  useGetBoothRentChargesQuery,
  useGetBoothRentPlansQuery,
  useGetShopCutRatesQuery,
  useSetBoothRentPlanMutation,
  useSetShopCutRateMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { FormField } from '@/components/FormField';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/utils/money';
import { formatUtcMonthDay, formatUtcMonthYear } from '@/utils/utcDate';

// Byte-for-byte port of web's ShopCutRatePanel.jsx ordinal-suffix ternary (and settings/rates.tsx's
// own already-ported copy) - a direct port reproduces the existing "11th"-style behavior for
// every day past 3, not a fix.
function ordinalDueDay(dueDayOfMonth: number): string {
  const suffix = dueDayOfMonth === 1 ? 'st' : dueDayOfMonth === 2 ? 'nd' : dueDayOfMonth === 3 ? 'rd' : 'th';
  return `${dueDayOfMonth}${suffix}`;
}

// effectiveFrom is a real instant (DateTime), not a UTC-pure-calendar-date like BoothRentCharge's
// periodMonth/dueDate - read in the viewer's own local time, same reasoning client/[id].tsx's own
// formatDate gives for why this app doesn't follow web's `moment(...).format(...)` (no explicit
// .utc()) read of this exact field either; both already agree it should be local.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MODEL_OPTIONS = [
  { id: 'PERCENTAGE', label: 'Percentage' },
  { id: 'BOOTH_RENT', label: 'Booth rent' },
];

type Model = 'PERCENTAGE' | 'BOOTH_RENT';

/**
 * Mobile port of apps/web's ShopCutRatePanel.jsx - what an artist owes the shop, and from when.
 * Mounted on artist/[id].tsx below the identity card and the performance panel, matching web's
 * own Artist.jsx layout order exactly. See that web component's own header comment (reproduced in
 * spirit, not copied verbatim, across the comments below) for why the history is the UI: a rate
 * change applies forward only and never reprices work already performed (DECISIONS.md M7) - a
 * lone editable percentage would invite the wrong reading.
 *
 * `canEdit` is the SHOP ADMIN check computed by the caller (artist/[id].tsx, mirroring web's own
 * `user.role <= ROLES.SHOP_ADMIN && String(user.id) !== String(artist.userId)`) - an artist
 * viewing their own page sees the history and booth-rent terms with no form at all, the same
 * asymmetry the server enforces (a party cannot set the number they owe).
 *
 * Renders nothing at all for an artist with no shop (shopId falsy) - same as web: there is
 * nothing to owe with no shop to owe it to.
 */
export function ShopCutRatePanel({
  artistUserId,
  shopId,
  canEdit,
}: {
  artistUserId: string;
  shopId: string | null | undefined;
  canEdit: boolean;
}) {
  const theme = useTheme();

  const [model, setModel] = useState<Model>('PERCENTAGE');
  const [percent, setPercent] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [rentDueDay, setRentDueDay] = useState('1');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingChargeId, setConfirmingChargeId] = useState<string | null>(null);

  const { data: ratesData, loading: ratesLoading } = useGetShopCutRatesQuery({
    variables: { artistId: artistUserId, shopId: shopId ?? '' },
    skip: !artistUserId || !shopId,
    fetchPolicy: 'cache-and-network',
  });
  const [setShopCutRate, { loading: savingRate }] = useSetShopCutRateMutation({
    refetchQueries: ['GetShopCutRates'],
  });

  const { data: plansData, loading: plansLoading } = useGetBoothRentPlansQuery({
    variables: { artistId: artistUserId, shopId: shopId ?? '' },
    skip: !artistUserId || !shopId,
    fetchPolicy: 'cache-and-network',
  });
  const [setBoothRentPlan, { loading: savingPlan }] = useSetBoothRentPlanMutation({
    refetchQueries: ['GetBoothRentPlans'],
  });

  const { data: chargesData, refetch: refetchCharges } = useGetBoothRentChargesQuery({
    variables: { artistId: artistUserId, shopId: shopId ?? '', status: 'marked_paid' },
    skip: !shopId,
    fetchPolicy: 'cache-and-network',
  });
  const [confirmBoothRentPaid] = useConfirmBoothRentPaidMutation();

  // An artist with no shop owes nobody anything - see this file's own header comment.
  if (!shopId) {
    return null;
  }

  const rates = (ratesData?.getShopCutRates ?? []).filter((rate): rate is NonNullable<typeof rate> => Boolean(rate));
  // Server-sorted newest first, same reasoning as web: the row in force right now is the first
  // one whose effectiveFrom has already passed, not simply rates[0] - a back-dated future rate is
  // a legal thing to record.
  const now = Date.now();
  const current = rates.find((rate) => new Date(rate.effectiveFrom).getTime() <= now);
  const currentModel = current?.compensationModel || 'PERCENTAGE';

  const plans = (plansData?.getBoothRentPlans ?? []).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
  const currentPlan = plans.find((plan) => new Date(plan.effectiveFrom).getTime() <= now);
  const pendingCharges = (chargesData?.getBoothRentCharges?.items ?? []).filter(
    (charge): charge is NonNullable<typeof charge> => Boolean(charge),
  );

  const handleSubmit = async () => {
    setError(null);

    if (model === 'BOOTH_RENT') {
      const dollars = Number(rentAmount);
      const dueDay = Number(rentDueDay);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('Enter a monthly amount of $0 or more.');
        return;
      }
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
        setError('Enter a due day between 1 and 31.');
        return;
      }
      try {
        const isoEffectiveFrom = effectiveFrom.toISOString();
        await setShopCutRate({
          variables: {
            artistId: artistUserId,
            shopId,
            percent: 0,
            compensationModel: 'BOOTH_RENT',
            effectiveFrom: isoEffectiveFrom,
            note,
          },
        });
        await setBoothRentPlan({
          variables: {
            artistId: artistUserId,
            shopId,
            amountCents: Math.round(dollars * 100),
            dueDayOfMonth: dueDay,
            effectiveFrom: isoEffectiveFrom,
          },
        });
        setRentAmount('');
        setNote('');
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }

    const parsed = Number(percent);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Enter a percentage between 0 and 100.');
      return;
    }
    try {
      await setShopCutRate({
        variables: {
          artistId: artistUserId,
          shopId,
          percent: Math.round(parsed),
          compensationModel: 'PERCENTAGE',
          effectiveFrom: effectiveFrom.toISOString(),
          note,
        },
      });
      setPercent('');
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConfirmCharge = (chargeId: string) => {
    setConfirmingChargeId(chargeId);
    setError(null);
    confirmBoothRentPaid({ variables: { boothRentChargeId: chargeId } })
      .then(() => refetchCharges())
      .catch((err) => setError((err as Error).message))
      .finally(() => setConfirmingChargeId(null));
  };

  return (
    <View style={styles.card} testID="shop-cut-rate-panel">
      <ThemedText type="smallBold">Shop cut</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        What this artist owes the shop for their work here - either a percentage of each session,
        or a flat booth rent charged monthly. A change applies from its own date forward and never
        alters work already performed.
      </ThemedText>

      {ratesLoading && rates.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading…
        </ThemedText>
      ) : (
        <>
          <ThemedText type="small" testID="shop-cut-rate-current">
            {current ? (
              currentModel === 'BOOTH_RENT' ? (
                <>
                  <ThemedText type="smallBold">Booth rent</ThemedText>
                  {` since ${formatDate(current.effectiveFrom)}`}
                  {currentPlan
                    ? ` — ${formatCents(currentPlan.amountCents)}/month, due on the ${ordinalDueDay(currentPlan.dueDayOfMonth)}`
                    : ''}
                </>
              ) : (
                <>
                  <ThemedText type="smallBold">{`${current.percent}%`}</ThemedText>
                  {` since ${formatDate(current.effectiveFrom)}`}
                </>
              )
            ) : (
              "No dated rate recorded — the shop's default applies."
            )}
          </ThemedText>

          {rates.length > 0 ? (
            <View style={styles.history}>
              {rates.map((rate) => (
                <View key={rate.id} style={styles.historyRow} testID={`shop-cut-rate-${rate.id}`}>
                  <ThemedText type="small">
                    {rate.compensationModel === 'BOOTH_RENT' ? 'Rent' : `${rate.percent}%`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`from ${formatDate(rate.effectiveFrom)}`}
                    {rate.note ? ` — ${rate.note}` : ''}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}

          {!plansLoading && plans.length > 0 ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Booth rent plan history
              </ThemedText>
              <View style={styles.history}>
                {plans.map((plan) => (
                  <View key={plan.id} style={styles.historyRow} testID={`booth-rent-plan-${plan.id}`}>
                    <ThemedText type="small">{formatCents(plan.amountCents)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {`due day ${plan.dueDayOfMonth}, from ${formatDate(plan.effectiveFrom)}`}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {canEdit && pendingCharges.length > 0 ? (
            <View style={styles.history}>
              <ThemedText type="small" themeColor="textSecondary">
                Awaiting your confirmation
              </ThemedText>
              {pendingCharges.map((charge) => (
                <View key={charge.id} style={styles.pendingChargeRow} testID={`booth-rent-charge-${charge.id}`}>
                  <ThemedText type="small">
                    {`${formatCents(charge.amountCents)} for ${formatUtcMonthYear(charge.periodMonth)} — marked paid ${formatUtcMonthDay(charge.markedPaidAt ?? charge.dueDate)}`}
                  </ThemedText>
                  <Button
                    label={confirmingChargeId === charge.id ? 'Confirming…' : 'Confirm paid'}
                    variant="secondary"
                    onPress={() => handleConfirmCharge(charge.id)}
                    disabled={confirmingChargeId === charge.id}
                    testID={`booth-rent-confirm-${charge.id}`}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}

      {canEdit ? (
        <View style={styles.form}>
          <ThemedText type="small" themeColor="textSecondary">
            New rate
          </ThemedText>
          <PillRow options={MODEL_OPTIONS} selectedId={model} onSelect={(id) => setModel(id as Model)} testID="shop-cut-rate-model" />

          {model === 'BOOTH_RENT' ? (
            <>
              <FormField
                label="Monthly amount ($)"
                value={rentAmount}
                onChangeText={setRentAmount}
                keyboardType="decimal-pad"
                placeholder="500.00"
                testID="shop-cut-rate-rent-amount"
              />
              <FormField
                label="Due day of month"
                value={rentDueDay}
                onChangeText={setRentDueDay}
                keyboardType="number-pad"
                testID="shop-cut-rate-rent-due-day"
              />
            </>
          ) : (
            <FormField
              label="Percent (%)"
              value={percent}
              onChangeText={setPercent}
              keyboardType="number-pad"
              placeholder="40"
              testID="shop-cut-rate-percent"
            />
          )}

          <DateField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} testID="shop-cut-rate-effective-from" />
          <FormField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Why"
            testID="shop-cut-rate-note"
          />

          {error ? (
            <ThemedText type="small" style={{ color: theme.error }}>
              {error}
            </ThemedText>
          ) : null}

          <Button
            label={savingRate || savingPlan ? 'Saving…' : 'Record rate'}
            onPress={handleSubmit}
            loading={savingRate || savingPlan}
            disabled={model === 'PERCENTAGE' ? !percent : !rentAmount}
            testID="shop-cut-rate-submit"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  history: {
    gap: Spacing.one,
  },
  historyRow: {
    gap: Spacing.half,
  },
  pendingChargeRow: {
    gap: Spacing.one,
  },
  form: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
