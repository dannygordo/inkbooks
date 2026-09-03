import { useConfirmShopCutPaidMutation, useGetPendingShopCutConfirmationsQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/utils/money';
import { tagColorRowStyle } from '@/utils/tagColor';
import { timeAgo } from '@/utils/timeAgo';
import { getUserShopId } from '@/utils/user';

/**
 * The shop-side inbox for the manual mark-paid/confirm dual-control flow - see
 * PRODUCTION_ROADMAP.md's "Shop-cut ledger" section. An artist marking a shop cut as paid (cash,
 * say) doesn't close the ledger item on its own; a shop admin independently confirms it here
 * first. Reached only from a header link gated to `isShopAdminOrBetter` - the first mobile screen
 * with a real role floor on its own entry point, matching web's Sidebar.jsx exactly (every prior
 * header link - Clients/Projects/Requests/Messages - is shown to any logged-in artist, since
 * mobile has no client login at all yet). Full reasoning: DECISIONS.md X21.
 *
 * `markShopCutPaidManually` (the artist-side half of this flow, called from web's
 * UpdateEventDialog) is NOT built on mobile yet - this screen still has real value on its own,
 * since a shop admin whose artists mark shop cuts paid on web can confirm them from mobile without
 * opening a laptop. Building the artist-side action is real, separate follow-up work.
 *
 * No pagination, matching web's `ShopCutConfirmations.jsx` exactly - this list is inherently
 * small (only ever the shop's currently-pending confirmations, not a growing history), so there's
 * no "Load more" to build.
 */
export default function ShopCutConfirmationsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const shopId = getUserShopId(user);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useGetPendingShopCutConfirmationsQuery({
    variables: { shopId: shopId ?? '' },
    skip: !shopId,
    fetchPolicy: 'cache-and-network',
  });

  const [confirmShopCutPaid] = useConfirmShopCutPaidMutation();

  const items = (data?.getPendingShopCutConfirmations ?? []).filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  const handleConfirm = (appointmentId: string) => {
    setActionError(null);
    setConfirmingId(appointmentId);
    confirmShopCutPaid({ variables: { appointmentId } })
      .then(() => refetch())
      .catch((err) => setActionError((err as Error).message))
      .finally(() => setConfirmingId(null));
  };

  if (!shopId) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="shop-cut-confirmations-no-shop">
              This screen is only available to shop accounts.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {actionError ? (
          <ThemedText type="small" style={styles.error}>
            {actionError}
          </ThemedText>
        ) : null}

        {loading && items.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="shop-cut-confirmations-loading" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="shop-cut-confirmations-empty">
              {error ? 'Could not load pending confirmations.' : 'Nothing waiting on confirmation right now.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.id}
            testID="shop-cut-confirmations-list"
            renderItem={({ item }) => (
              <View
                style={[styles.row, { borderColor: theme.backgroundSelected }, tagColorRowStyle(item.user?.tagColor)]}
                testID={`shop-cut-confirmation-row-${item.id}`}
              >
                <View style={styles.rowBody}>
                  <ThemedText type="default" numberOfLines={1}>
                    {item.user ? `${item.user.firstName} ${item.user.lastName}` : 'Artist'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.title || 'Appointment'} · {new Date(item.appointmentDate).toLocaleDateString()}
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {typeof item.shopCutCents === 'number' ? formatCents(item.shopCutCents) : 'Amount not set'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Marked paid {item.shopCutMarkedPaidAt ? timeAgo(item.shopCutMarkedPaidAt) : ''}
                  </ThemedText>
                </View>
                <Button
                  label="Confirm Received"
                  onPress={() => handleConfirm(item.id)}
                  loading={confirmingId === item.id}
                  disabled={confirmingId !== null && confirmingId !== item.id}
                  testID={`shop-cut-confirm-${item.id}`}
                />
              </View>
            )}
          />
        )}
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
  row: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    gap: Spacing.half,
  },
  error: {
    color: '#D33',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
