import type { GetInboxQuery } from '@inkbooks/api';
import { useGetInboxQuery, useMarkNotificationsDoneMutation, useMarkNotificationsReadMutation } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { navigateForNotificationTarget, resolveNotificationTarget } from '@/lib/push-notifications';
import { formatCents } from '@/utils/money';
import { timeAgo } from '@/utils/timeAgo';

type InboxItem = GetInboxQuery['getInbox']['items'][number];

const CATEGORY_LABEL: Record<string, string> = {
  money: 'Money',
  schedule: 'Schedule',
  roster: 'Team',
  message: 'Message',
};

function NotificationRow({ item, onMarkDone, marking }: { item: InboxItem; onMarkDone: (key: string) => void; marking: boolean }) {
  const router = useRouter();
  const unread = !item.isCondition && !item.readAt;
  const done = Boolean(item.doneAt);
  const target = resolveNotificationTarget({ subjectType: item.subjectType, subjectId: item.subjectId });

  const body = (
    <View style={[styles.row, unread && styles.rowUnread, done && styles.rowDone]} testID={`notification-${item.key}`}>
      <View style={styles.rowTop}>
        <ThemedText type="small" themeColor="textSecondary">
          {CATEGORY_LABEL[item.category] ?? item.category}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {timeAgo(item.createdAt)}
        </ThemedText>
      </View>
      <ThemedText type="default">{item.title}</ThemedText>
      {item.body ? (
        <ThemedText type="small" themeColor="textSecondary">
          {item.body}
        </ThemedText>
      ) : null}
      {typeof item.amountCents === 'number' && item.amountCents > 0 ? (
        <ThemedText type="smallBold">{formatCents(item.amountCents)}</ThemedText>
      ) : null}
      {!item.isCondition && !done ? (
        <View style={styles.actions}>
          {/* Done, not read - reading "shop cut invoice issued" is not paying it, matching web's
              own NotificationItem.jsx reasoning exactly. */}
          <Button
            label="Mark handled"
            variant="secondary"
            onPress={() => onMarkDone(item.key)}
            loading={marking}
            testID={`notification-${item.key}-done`}
          />
        </View>
      ) : null}
      {item.isCondition ? (
        <ThemedText type="small" themeColor="textSecondary">
          Clears itself once this is sorted.
        </ThemedText>
      ) : null}
    </View>
  );

  // Web's own NotificationItem.jsx doesn't link anywhere despite selecting subjectType/subjectId -
  // this is a deliberate mobile addition, not a gap in the port: push-notifications.ts's
  // resolveNotificationTarget/navigateForNotificationTarget already exist for a tap on the exact
  // same subjectType/subjectId shape (a push notification's data payload), so reusing them here
  // for an in-app row is the same mapping mobile's push handling already relies on, not a second
  // one invented for this screen. See DECISIONS.md X52.
  if (!target) {
    return body;
  }
  return (
    <Pressable onPress={() => navigateForNotificationTarget(router, target)} testID={`notification-${item.key}-link`}>
      {body}
    </Pressable>
  );
}

/**
 * The in-app notification feed - closes gap #8 of HANDOFF.md's 2026-09-04 parity accounting.
 * Direct port of apps/web's NotificationBell.jsx + NotificationItem.jsx as one full-screen route
 * (a web MUI Menu popover becomes a real screen here, same "no cross-platform modal/dropdown
 * primitive" precedent every other ported dialog in this app already follows), reached from a new
 * bell-style "Notifications" link on index.tsx's header carrying the same unread badge shape as
 * the existing Requests/Messages links.
 *
 * Shows stored events and live conditions together, indistinguishably, matching web exactly -
 * which one is a database row and which is a query is an implementation detail the person reading
 * this list should never have to think about (server/graphql/resolvers/notifications.js).
 *
 * Opening this screen does NOT mark everything read - glancing at a list is not the same as
 * dealing with what's in it, and auto-clearing on open is how an inbox becomes something people
 * stop trusting. "Mark all read" is a deliberate, separate action, shown only when there is a
 * stored unread item to act on (conditions can't be marked read - they clear themselves).
 *
 * No pagination, matching web's own unpaged `InboxSummary` - this list is the shop's/artist's
 * currently-live attention items, not a growing history, same reasoning
 * shop-cut-confirmations/index.tsx's own header comment gives for the same choice.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const { data, loading } = useGetInboxQuery({
    variables: { includeRead: true },
    fetchPolicy: 'cache-and-network',
  });
  const [markRead, { loading: markingAllRead }] = useMarkNotificationsReadMutation({
    refetchQueries: ['GetInbox'],
  });
  const [markDone] = useMarkNotificationsDoneMutation({
    refetchQueries: ['GetInbox'],
  });
  const [markingDoneKey, setMarkingDoneKey] = useState<string | null>(null);

  const inbox = data?.getInbox;
  const items = inbox?.items ?? [];
  const hasStoredUnread = items.some((item) => !item.isCondition && !item.readAt);

  const handleMarkAllRead = () => {
    markRead({ variables: {} }).catch(() => {
      // Deliberately quiet, matching web's own markAllRead - a badge that stays up is a wrong
      // number, not lost data.
    });
  };

  const handleMarkDone = (key: string) => {
    setMarkingDoneKey(key);
    markDone({ variables: { notificationIds: [key] } })
      .catch(() => {})
      .finally(() => setMarkingDoneKey(null));
  };

  if (loading && !inbox) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ActivityIndicator color={theme.text} style={styles.loading} testID="notifications-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {hasStoredUnread ? (
            <Button
              label="Mark all read"
              variant="secondary"
              onPress={handleMarkAllRead}
              loading={markingAllRead}
              testID="notifications-mark-all-read"
            />
          ) : null}

          {items.length === 0 ? (
            // Deliberately not phrased as a failure - an empty inbox means nothing needs
            // attention, which is the good state, matching web's own copy exactly.
            <ThemedText type="small" themeColor="textSecondary">
              Nothing needs your attention.
            </ThemedText>
          ) : (
            items.map((item) => (
              <NotificationRow
                key={item.key}
                item={item}
                onMarkDone={handleMarkDone}
                marking={markingDoneKey === item.key}
              />
            ))
          )}
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
  row: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  rowUnread: {
    backgroundColor: 'rgba(211, 51, 51, 0.06)',
  },
  rowDone: {
    opacity: 0.6,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
  },
});
