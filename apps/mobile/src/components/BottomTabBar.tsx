import { useGetInboxQuery, useGetPendingBookingRequestCountQuery, useGetUnreadMessageCountQuery } from '@inkbooks/api';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * The app's primary navigation, replacing index.tsx's old header row - see that screen's own
 * header comment (2026-09-10) for the bug this exists to fix: that row held up to 17 Pressable
 * text links with no wrap and no scroll, so on any real phone width most of them rendered
 * entirely off-screen - invisible, unreachable, and easy to mistake for a frozen/broken menu
 * (Danny's exact report). Five destinations fit a real bottom tab bar; everything else that used
 * to live in that row now lives in more.tsx, reached from the fifth tab, grouped and gated exactly
 * as before (see that screen's own header comment).
 *
 * Rendered at the bottom of each of the five screens it links to (index.tsx, clients/index.tsx,
 * projects/index.tsx, messages/index.tsx, more.tsx) rather than owned by a shared navigator -
 * this app's Stack has no Tabs layout, and adding expo-router's Tabs means installing
 * @react-navigation/bottom-tabs as a new native-ish dependency, unverifiable from this session
 * (see the commit this shipped in for why that path was dropped). A plain component avoids that
 * entirely, at the cost of five call sites instead of one - an acceptable trade for something this
 * small, and easy to consolidate into a real Tabs layout later if @react-navigation/bottom-tabs
 * ever gets installed and verified on a real device.
 */
const TABS = [
  { key: 'home', label: 'Home', path: '/', testID: 'tab-home' },
  { key: 'clients', label: 'Clients', path: '/clients', testID: 'tab-clients' },
  { key: 'projects', label: 'Projects', path: '/projects', testID: 'tab-projects' },
  { key: 'messages', label: 'Messages', path: '/messages', testID: 'tab-messages' },
  { key: 'more', label: 'More', path: '/more', testID: 'tab-more' },
] as const;

export function BottomTabBar() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Same 60s-poll fallback every other badge in this app uses (see index.tsx's own comment on
  // why mobile has no faster, socket-driven path yet) - three small counts, not the full lists,
  // so this stays cheap to mount on every tab-bar-bearing screen.
  const { data: unreadData } = useGetUnreadMessageCountQuery({
    skip: !user,
    fetchPolicy: 'cache-and-network',
    pollInterval: 60000,
  });
  const messagesUnread = unreadData?.getUnreadMessageCount ?? 0;

  const { data: inboxData } = useGetInboxQuery({
    variables: { includeRead: false },
    skip: !user,
    fetchPolicy: 'cache-and-network',
    pollInterval: 60000,
  });
  const { data: pendingRequestData } = useGetPendingBookingRequestCountQuery({
    skip: !user,
    fetchPolicy: 'cache-and-network',
    pollInterval: 60000,
  });
  // Notifications and Booking Requests both now live inside More (no tab of their own) - without
  // this, either badge going unread would be invisible until the user thought to open More on
  // spec. One combined dot on the More tab is the same "something's waiting in here" signal the
  // old header gave each of them individually, just aggregated onto their new shared entry point.
  const moreUnread = (inboxData?.getInbox?.unreadCount ?? 0) + (pendingRequestData?.getPendingBookingRequestCount ?? 0);

  const badgeFor = (key: (typeof TABS)[number]['key']) => {
    if (key === 'messages') return messagesUnread;
    if (key === 'more') return moreUnread;
    return 0;
  };

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: insets.bottom || Spacing.two },
      ]}
    >
      {TABS.map((tab) => {
        // '/' is the only path that would otherwise prefix-match every other tab (everything
        // starts with '/'), so it alone needs an exact match; every other tab's own sub-routes
        // (e.g. a client's detail screen pushed on top) should still show that tab as active.
        const active = tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path);
        const badge = badgeFor(tab.key);
        return (
          <Pressable
            key={tab.key}
            testID={tab.testID}
            onPress={() => router.push(tab.path)}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <View style={styles.tabLabelRow}>
              <ThemedText
                type="smallBold"
                style={[styles.label, { color: active ? theme.primary : theme.textSecondary }]}
              >
                {tab.label}
              </ThemedText>
              {badge > 0 ? (
                <View style={[styles.badge, { backgroundColor: theme.error }]} testID={`${tab.testID}-badge`}>
                  <ThemedText type="small" style={styles.badgeText}>
                    {badge > 9 ? '9+' : badge}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <View style={[styles.indicator, { backgroundColor: active ? theme.primary : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  label: {
    fontSize: 12,
  },
  indicator: {
    marginTop: Spacing.one,
    width: 20,
    height: 3,
    borderRadius: 2,
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
