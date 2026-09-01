import { FlashList } from '@shopify/flash-list';
import type { AppointmentListItemFragment } from '@inkbooks/api';
import { useGetAppointmentsByArtistQuery, useGetAppointmentsByShopQuery } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/OfflineBanner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  buildListEntries,
  formatAppointmentTime,
  getAppointmentArtistName,
  getAppointmentClientName,
  getAppointmentStatusLabel,
  getAppointmentTitle,
} from '@/utils/appointments';
import { getThisWeekFilter } from '@/utils/dateRanges';
import { canManageAppointment } from '@/utils/permissions';
import { getUserShopId } from '@/utils/user';

// A month of one shop's appointments in one response, not paged - same choice
// AppointmentService.js's calendar-view queries make (`page || { limit: 200 }`) and for the same
// reason: this is a bounded window (one week - see dateRanges.ts), not the arbitrary-range list
// AppointmentsList.jsx's own pager exists for. A week's appointments comfortably fit under 200
// regardless of shop size.
const PAGE = { limit: 200 };

/**
 * The appointments screen (guarded by _layout.tsx's Stack.Protected - unreachable while `user` is
 * null). PRODUCTION_ROADMAP.md's Phase 5, step 6: real auth (Phase 1), real data through
 * packages/api, FlashList for the list, Apollo cache persistence for offline reads. The list
 * itself stays read-only here - creating a brand-new appointment is still Phase 3's wizard - but
 * step 8 (see openAppointment below) wired up opening an existing one: personal edit/delete,
 * consult detail + convert-to-session, and a session's Project (Details/Sessions/Notes/Tags).
 *
 * Which queries fire mirrors AppointmentsList.jsx exactly: a shop-connected artist reads the
 * shop's appointments (everyone's, server-scoped) plus their own personal entries (never included
 * in the shop query - see appointments.graphql's own comment); an independent artist reads only
 * their own. All three query hooks are always called (hooks can't be conditional) and each skips
 * itself via its own condition, so only the right ones actually fetch.
 */
export default function AppointmentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const shopId = getUserShopId(user);
  // Computed once, on mount, not on every render - matches AppointmentsList.jsx's own
  // useState(getDefaultScheduleRange), which also fixes the window at the moment the screen opens
  // rather than sliding it every re-render.
  const filter = useMemo(() => getThisWeekFilter(), []);

  const {
    data: shopData,
    loading: shopLoading,
    error: shopError,
  } = useGetAppointmentsByShopQuery({
    variables: { shopId: shopId ?? '', filter, page: PAGE },
    skip: !shopId,
    fetchPolicy: 'cache-and-network',
  });

  const {
    data: artistData,
    loading: artistLoading,
    error: artistError,
  } = useGetAppointmentsByArtistQuery({
    variables: { userId: !shopId && user ? user.id : '', filter, page: PAGE },
    skip: Boolean(shopId) || !user,
    fetchPolicy: 'cache-and-network',
  });

  // This user's own personal-calendar entries - never returned by getAppointmentsByShop (see
  // appointments.graphql) and not what artistData above fetches once there's a shop. Skipped
  // entirely without a shop, since artistData already covers everything this user owns.
  const { data: personalData, loading: personalLoading } = useGetAppointmentsByArtistQuery({
    variables: {
      userId: shopId && user ? user.id : '',
      filter: { ...filter, isPersonal: true },
      page: PAGE,
    },
    skip: !shopId || !user,
    fetchPolicy: 'cache-and-network',
  });

  const loading = shopId ? shopLoading || personalLoading : artistLoading;
  const error = shopId ? shopError : artistError;

  const items = useMemo<AppointmentListItemFragment[]>(() => {
    if (shopId) {
      return [
        ...(shopData?.getAppointmentsByShop.items ?? []),
        ...(personalData?.getAppointmentsByArtist.items ?? []),
      ];
    }
    return artistData?.getAppointmentsByArtist.items ?? [];
  }, [shopId, shopData, personalData, artistData]);

  const entries = useMemo(() => buildListEntries(items), [items]);

  // Same three-way split as apps/web's AppointmentsList.jsx openAppointment(): isPersonal first
  // (it short-circuits type/project entirely - a personal entry has neither), then
  // appointmentType === 'consult', else it has a projectId and IS a session. Gated on
  // canManageAppointment so a fellow artist's row never navigates to a screen the server will
  // just refuse every mutation on - see that util's own comment.
  const openAppointment = (appointment: AppointmentListItemFragment) => {
    if (!canManageAppointment(user, appointment)) {
      return;
    }
    if (appointment.isPersonal) {
      router.push({ pathname: '/appointment/[id]', params: { id: appointment.id } });
    } else if (appointment.appointmentType === 'consult') {
      router.push({ pathname: '/consult/[id]', params: { id: appointment.id } });
    } else if (appointment.projectId) {
      router.push({ pathname: '/project/[id]', params: { id: appointment.projectId } });
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Appointments
          </ThemedText>
          <Pressable onPress={() => logout()} testID="logout-button">
            <ThemedText type="link" themeColor="textSecondary">
              Log out
            </ThemedText>
          </Pressable>
        </View>

        <OfflineBanner />

        {loading && entries.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="appointments-loading" />
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="appointments-empty">
              {/* A query error with nothing cached to fall back on reads the same as "nothing
                  booked" here - OfflineBanner already covers "you're offline", and Phase 3's
                  wizard is where a real error-retry affordance earns its place, not a read-only
                  list. */}
              {error ? 'Could not load appointments.' : 'No appointments this week.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={entries}
            keyExtractor={(entry) => entry.key}
            getItemType={(entry) => entry.kind}
            testID="appointments-list"
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <View style={[styles.dayHeader, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="smallBold">{item.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.count}
                  </ThemedText>
                </View>
              ) : (
                <AppointmentRow
                  appointment={item.appointment}
                  showArtist={Boolean(shopId)}
                  borderColor={theme.backgroundSelected}
                  onPress={() => openAppointment(item.appointment)}
                />
              )
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * One row. Extracted (rather than inlined in renderItem) purely for readability. Tapping it
 * routes through the parent's openAppointment() three-way split (see AppointmentsScreen) - a row
 * this user can't manage (canManageAppointment) still renders normally but its tap is a no-op,
 * same "visible but inert" choice as web's own row-level gate.
 */
function AppointmentRow({
  appointment,
  showArtist,
  borderColor,
  onPress,
}: {
  appointment: AppointmentListItemFragment;
  showArtist: boolean;
  borderColor: string;
  onPress: () => void;
}) {
  const artistName = showArtist ? getAppointmentArtistName(appointment) : '';
  const clientName = getAppointmentClientName(appointment);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { borderColor }]}
      testID={`appointment-row-${appointment.id}`}
    >
      <ThemedText type="small" style={styles.rowTime}>
        {formatAppointmentTime(appointment.appointmentDate)}
      </ThemedText>
      <View style={styles.rowBody}>
        <ThemedText type="default" numberOfLines={1}>
          {getAppointmentTitle(appointment)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[clientName, artistName].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {getAppointmentStatusLabel(appointment)}
      </ThemedText>
    </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: {
    textAlign: 'left',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTime: {
    width: 64,
  },
  rowBody: {
    flex: 1,
  },
});
