import { useGetInboxQuery, useGetPendingBookingRequestCountQuery } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabBar } from '@/components/BottomTabBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { canManageForms } from '@/utils/businessScope';
import { canManageBusinessLedger, isShopAdminOrBetter, isStaffOrBetter } from '@/utils/permissions';

/**
 * Everything that used to be a Pressable text link crammed into index.tsx's header row now lives
 * here, one tap away behind the new bottom tab bar's fifth tab - see BottomTabBar.tsx's own header
 * comment for why that row had to go (Danny's "menu was frozen / couldn't see all the options"
 * report - it was really an unscrollable, unwrapped row of up to 17 links overflowing off real
 * phone widths). Every gate below is copied verbatim from the row it replaces - nothing became
 * visible to a user who couldn't already reach it, and nothing that was reachable is gone, it's
 * just grouped by what it actually is instead of flat and alphabetical-by-accident.
 */
export default function MoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();

  const { data: inboxData } = useGetInboxQuery({
    variables: { includeRead: false },
    skip: !user,
    fetchPolicy: 'cache-and-network',
  });
  const unreadNotificationCount = inboxData?.getInbox?.unreadCount ?? 0;

  const { data: pendingRequestData } = useGetPendingBookingRequestCountQuery({
    skip: !user,
    fetchPolicy: 'cache-and-network',
  });
  const pendingRequestCount = pendingRequestData?.getPendingBookingRequestCount ?? 0;

  type Row = {
    key: string;
    label: string;
    onPress: () => void;
    badge?: number;
    visible?: boolean;
    testID: string;
  };

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Overview',
      rows: [
        { key: 'dashboard', label: 'Dashboard', onPress: () => router.push('/dashboard'), testID: 'more-dashboard' },
        { key: 'search', label: 'Search', onPress: () => router.push('/search'), testID: 'more-search' },
      ],
    },
    {
      title: 'Inbox',
      rows: [
        {
          key: 'notifications',
          label: 'Notifications',
          onPress: () => router.push('/notifications'),
          badge: unreadNotificationCount,
          testID: 'more-notifications',
        },
        {
          key: 'booking-requests',
          label: 'Booking Requests',
          onPress: () => router.push('/booking-requests'),
          badge: pendingRequestCount,
          testID: 'more-booking-requests',
        },
      ],
    },
    {
      title: 'Team',
      rows: [
        {
          key: 'artists',
          label: 'Artists',
          onPress: () => router.push('/artists'),
          visible: isStaffOrBetter(user),
          testID: 'more-artists',
        },
        {
          key: 'staff',
          label: 'Staff',
          onPress: () => router.push('/staff'),
          visible: isStaffOrBetter(user),
          testID: 'more-staff',
        },
      ],
    },
    {
      title: 'Shop',
      rows: [
        {
          key: 'shops',
          label: 'Shops',
          onPress: () => router.push('/shops'),
          visible: isShopAdminOrBetter(user),
          testID: 'more-shops',
        },
        {
          key: 'shop-cut-confirmations',
          label: 'Shop Cut Confirmations',
          onPress: () => router.push('/shop-cut-confirmations'),
          visible: isShopAdminOrBetter(user),
          testID: 'more-shop-cut-confirmations',
        },
      ],
    },
    {
      title: 'Business',
      rows: [
        {
          key: 'income',
          label: 'Income',
          onPress: () => router.push('/income'),
          visible: canManageBusinessLedger(user),
          testID: 'more-income',
        },
        {
          key: 'expenses',
          label: 'Expenses',
          onPress: () => router.push('/expenses'),
          visible: canManageBusinessLedger(user),
          testID: 'more-expenses',
        },
        {
          key: 'gift-cards',
          label: 'Gift Cards',
          onPress: () => router.push('/gift-cards'),
          visible: canManageBusinessLedger(user),
          testID: 'more-gift-cards',
        },
        {
          key: 'forms',
          label: 'Forms',
          onPress: () => router.push('/forms'),
          visible: canManageForms(user),
          testID: 'more-forms',
        },
      ],
    },
    {
      title: 'Account',
      rows: [
        { key: 'settings', label: 'Settings', onPress: () => router.push('/settings'), testID: 'more-settings' },
        { key: 'logout', label: 'Log out', onPress: () => logout(), testID: 'more-logout' },
      ],
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">More</ThemedText>
        </View>
        {/* Was a plain View with flex: 1 (2026-09-10) - fine for a screen that fits one
            viewport, but this one doesn't once more than a couple of sections are visible
            (a shop admin sees all six). A non-scrolling View just clips everything past the
            screen's own bottom edge silently - reported 2026-09-12 as "can't scroll past
            Business". ScrollView, not FlashList: these rows are a fixed handful of Pressables,
            not a data list worth virtualizing. */}
        <ScrollView contentContainerStyle={styles.content}>
          {sections.map((section) => {
            const visibleRows = section.rows.filter((row) => row.visible !== false);
            if (visibleRows.length === 0) {
              return null;
            }
            return (
              <View key={section.title} style={styles.section}>
                <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
                  {section.title.toUpperCase()}
                </ThemedText>
                <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  {visibleRows.map((row, index) => (
                    <Fragment key={row.key}>
                      {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.border }]} /> : null}
                      <Pressable
                        onPress={row.onPress}
                        style={styles.row}
                        testID={row.testID}
                        accessibilityRole="button"
                      >
                        <ThemedText type="default" style={styles.rowLabel}>
                          {row.label}
                        </ThemedText>
                        {row.badge ? (
                          <View style={[styles.badge, { backgroundColor: theme.error }]} testID={`${row.testID}-badge`}>
                            <ThemedText type="small" style={styles.badgeText}>
                              {row.badge > 9 ? '9+' : row.badge}
                            </ThemedText>
                          </View>
                        ) : null}
                        <ThemedText type="default" themeColor="textMuted">
                          {'›'}
                        </ThemedText>
                      </Pressable>
                    </Fragment>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
      <BottomTabBar />
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
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.one,
  },
  card: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowLabel: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    lineHeight: 13,
  },
});
