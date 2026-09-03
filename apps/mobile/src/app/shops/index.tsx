import { useGetShopsListQuery, type GetShopsListQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPhone } from '@/utils/phone';

type ShopListItem = NonNullable<GetShopsListQuery['getShops']>[number];

/**
 * The shop(s) a shop-admin-or-better is connected to - reached from a header link gated
 * `isShopAdminOrBetter`, matching web's Sidebar.jsx exactly (same gate as Shop Cut
 * Confirmations). See DECISIONS.md X24.
 *
 * `getShops` takes no arguments at all - no page/includeArchived, matching web's own Shops.jsx
 * (there is no shop archiving anywhere in this app - no archiveShop/unarchiveShop mutations
 * exist server-side). No "Add Shop" button either - web's own IBPageActionBar has no create
 * action for this page (shop creation was dead code there, per DECISIONS.md X24's own note).
 *
 * hourlyRate/shopMinimum are whole-dollar fields, NOT cents like nearly everything else in this
 * app - rendered as plain `$${value}` here exactly as web's SHOP_COLUMNS does, never through
 * utils/money.ts's formatCents (which would misrender e.g. $150/hr as $1.50).
 */
export default function ShopsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { data, loading, error } = useGetShopsListQuery({ fetchPolicy: 'cache-and-network' });
  const shops = data?.getShops ?? [];

  const openShop = (shop: ShopListItem) => {
    if (!shop) return;
    router.push({ pathname: '/shop/[id]', params: { id: shop.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {loading && shops.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="shops-loading" />
          </View>
        ) : shops.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="shops-empty">
              {error ? 'Could not load your shops.' : 'No shops yet.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={shops}
            keyExtractor={(shop) => shop?.id ?? ''}
            testID="shops-list"
            renderItem={({ item }) => {
              if (!item) return null;
              return (
                <Pressable
                  onPress={() => openShop(item)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                  testID={`shop-row-${item.id}`}
                >
                  <Avatar imageUri={item.logo} firstName={item.name} size={44} />
                  <View style={styles.rowBody}>
                    <ThemedText type="default" numberOfLines={1}>
                      {item.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {[item.city, item.state].filter(Boolean).join(', ') || formatPhone(item.phone)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {typeof item.hourlyRate === 'number' ? `$${item.hourlyRate}/hr` : ''}
                      {typeof item.hourlyRate === 'number' && typeof item.shopMinimum === 'number' ? ' · ' : ''}
                      {typeof item.shopMinimum === 'number' ? `$${item.shopMinimum} min` : ''}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            }}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
