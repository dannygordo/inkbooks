import { useGetBookingRequestsQuery, type GetBookingRequestsQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  BOOKING_REQUEST_FILTERS,
  bookingRequestStatusLabel,
  type BookingRequestFilterKey,
} from '@/utils/bookingRequests';

type BookingRequestListItem = GetBookingRequestsQuery['getBookingRequests']['items'][number];

const PAGE_SIZE = 25;

/**
 * The Booking Requests inbox - the funnel for a prospective client before any Appointment exists.
 * List half of a list+detail split (see [id].tsx), unlike apps/web's ArtistBookingRequests.jsx,
 * which renders both in one master-detail page - same reasoning Messages' own inbox/thread split
 * used: a phone doesn't have the screen width for two panes side by side. Reassignment to another
 * artist at the same shop ("Forward to...") isn't built on either screen - a real, secondary
 * feature (needs a shop-mates picker), deliberately left for later. Full reasoning: DECISIONS.md
 * X19.
 */
export default function BookingRequestsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [filterKey, setFilterKey] = useState<BookingRequestFilterKey>('pending');

  const filter = BOOKING_REQUEST_FILTERS.find((f) => f.key === filterKey) ?? BOOKING_REQUEST_FILTERS[0];

  const { data, loading, error, fetchMore } = useGetBookingRequestsQuery({
    variables: {
      artistId: user?.id ?? '',
      statuses: filter.statuses,
      page: { limit: PAGE_SIZE, offset: 0 },
    },
    skip: !user?.id,
    fetchPolicy: 'network-only',
  });

  const requests = data?.getBookingRequests.items ?? [];
  const pageInfo = data?.getBookingRequests.pageInfo;

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({
      variables: { page: { limit: PAGE_SIZE, offset: requests.length } },
    }).catch(() => {
      // Same "nothing on screen is lost, try again" reasoning as clients/index.tsx's own
      // loadMore.
    });
  };

  const openRequest = (request: BookingRequestListItem) => {
    router.push({ pathname: '/booking-requests/[id]', params: { id: request.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.filterRow}>
          {BOOKING_REQUEST_FILTERS.map((f) => {
            const selected = f.key === filterKey;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilterKey(f.key)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: selected ? theme.text : theme.backgroundElement,
                  },
                ]}
                testID={`booking-requests-filter-${f.key}`}
              >
                <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                  {f.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {loading && requests.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="booking-requests-loading" />
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="booking-requests-empty">
              {error ? 'Could not load booking requests.' : 'No requests here.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={requests}
            keyExtractor={(request) => request.id}
            testID="booking-requests-list"
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            renderItem={({ item }) => {
              const unread = item.conversation?.unreadCount ?? 0;
              const name = [item.client?.firstName, item.client?.lastName].filter(Boolean).join(' ') || 'Unknown';
              return (
                <Pressable
                  onPress={() => openRequest(item)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                  testID={`booking-request-row-${item.id}`}
                >
                  <View style={styles.rowBody}>
                    <View style={styles.rowHeader}>
                      <ThemedText type={unread > 0 ? 'smallBold' : 'default'} numberOfLines={1} style={styles.rowName}>
                        {name}
                      </ThemedText>
                      {filterKey !== 'pending' ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {bookingRequestStatusLabel(item.status)}
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {item.description}
                    </ThemedText>
                  </View>
                  {unread > 0 ? (
                    <View style={styles.badge} testID={`booking-request-unread-${item.id}`}>
                      <ThemedText type="small" style={styles.badgeText}>
                        {unread > 9 ? '9+' : unread}
                      </ThemedText>
                    </View>
                  ) : null}
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  filterPill: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowName: {
    flex: 1,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#D33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
});
