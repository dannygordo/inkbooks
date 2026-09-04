import { useGetStaffListQuery, type GetStaffListQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STAFF_STATUS } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatPhone } from '@/utils/phone';
import { isShopAdminOrBetter } from '@/utils/permissions';

type StaffListItem = GetStaffListQuery['getStaff']['items'][number];

// Same server max page size reasoning as artists/index.tsx's own PAGE_SIZE.
const PAGE_SIZE = 200;

/**
 * The shop's front-desk/staff roster - same list+detail+archive shape as artists/index.tsx, and
 * reached from the same `isStaffOrBetter`-gated header link (web's own Sidebar.jsx gates Artists
 * and Staff identically). See DECISIONS.md X23.
 *
 * **"Add Staff" now exists** (see the parity-accounting entry after X46) - gated
 * `isShopAdminOrBetter`, opening `staff/new.tsx`, same as Artists' own "Add Artist".
 */
export default function StaffScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  // "Add Staff" is a shop-admin action on web too - canManageAccounts = role <= ROLES.SHOP_ADMIN
  // (IBPageActionBar.jsx). Closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting.
  const canManageAccounts = isShopAdminOrBetter(user);

  const { data, loading, error, fetchMore, refetch } = useGetStaffListQuery({
    variables: { includeArchived: showArchived, page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });

  const staff = data?.getStaff.items ?? [];
  const pageInfo = data?.getStaff.pageInfo;

  const toggleArchived = (value: boolean) => {
    setShowArchived(value);
    refetch({ includeArchived: value, page: { limit: PAGE_SIZE, offset: 0 } }).catch(() => {});
  };

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({
      variables: { includeArchived: showArchived, page: { limit: PAGE_SIZE, offset: staff.length } },
    }).catch(() => {
      // Same "nothing on screen is lost, try again" reasoning as clients/index.tsx's own
      // loadMore.
    });
  };

  const openStaff = (member: StaffListItem) => {
    router.push({ pathname: '/staff/[id]', params: { id: member.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {canManageAccounts ? (
          <View style={styles.addRow}>
            <Button
              label="Add Staff"
              variant="secondary"
              onPress={() => router.push('/staff/new')}
              testID="staff-add"
            />
          </View>
        ) : null}
        <View style={styles.toggleRow}>
          <ThemedText type="default">Show archived</ThemedText>
          <Switch value={showArchived} onValueChange={toggleArchived} testID="staff-show-archived" />
        </View>

        {loading && staff.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="staff-loading" />
          </View>
        ) : staff.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="staff-empty">
              {error ? 'Could not load your staff.' : 'No staff yet.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={staff}
            keyExtractor={(member) => member.id}
            testID="staff-list"
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            renderItem={({ item }) => {
              const archived = item.status === STAFF_STATUS.ARCHIVED;
              const location = [item.city, item.state].filter(Boolean).join(', ');
              return (
                <Pressable
                  onPress={() => openStaff(item)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }, archived && styles.rowArchived]}
                  testID={`staff-row-${item.id}`}
                >
                  <Avatar
                    imageUri={item.user?.avatar || item.avatar}
                    firstName={item.firstName}
                    lastName={item.lastName}
                    size={44}
                  />
                  <View style={styles.rowBody}>
                    <ThemedText type="default" numberOfLines={1}>
                      {item.firstName} {item.lastName}
                      {archived ? ' (Archived)' : ''}
                    </ThemedText>
                    {item.title ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {item.title}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {[item.email, formatPhone(item.phone)].filter(Boolean).join(' · ')}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {[item.shop?.name, location].filter(Boolean).join(' · ')}
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
  addRow: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    alignItems: 'flex-start',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
  rowArchived: {
    opacity: 0.5,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
