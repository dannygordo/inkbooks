import type { AppointmentListItemFragment, GetShopAnalyticsQuery } from '@inkbooks/api';
import {
  useGetAppointmentsByArtistQuery,
  useGetAppointmentsByShopQuery,
  useGetArtistAnalyticsQuery,
  useGetShopAnalyticsQuery,
} from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PillRow } from '@/components/PillRow';
import { StatCard } from '@/components/StatCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ROLES } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  getAppointmentArtistName,
  getAppointmentClientName,
  getAppointmentStatusLabel,
  getAppointmentTitle,
} from '@/utils/appointments';
import { buildPresetRanges, type RangeKey } from '@/utils/businessRanges';
import { formatCents } from '@/utils/money';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { tagColorRowStyle } from '@/utils/tagColor';
import { getUserShopId } from '@/utils/user';

type Analytics = NonNullable<GetShopAnalyticsQuery['getShopAnalytics']>;
type ArtistAnalyticsRow = Analytics['artists'][number];

// How many rows each appointment list shows before the first "Load more" - matches web's own
// ArtistPerformancePanel.jsx APPOINTMENT_LIST_LIMIT exactly.
const APPOINTMENT_LIST_LIMIT = 5;

// Same date-formatting choice as client/[id].tsx (X49): local time, not web's `moment.utc` read
// of this same field - see that file's own header comment on why this is a deliberate deviation
// from web rather than an oversight. Duplicated rather than shared, matching income/index.tsx's
// own un-migrated local PillRow copy - this app doesn't retroactively consolidate every prior
// inline instance the moment a second caller shows up.
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

// null means "not available to you" (a Staff caller on the shop-wide query - see
// server/graphql/resolvers/analytics.js) - formatCents(null) would silently print "$0.00" and
// erase that distinction, which is the whole reason StatCard exists. This keeps the null and lets
// StatCard render the em dash.
function money(cents: number | null | undefined): string | null {
  return cents === null || cents === undefined ? null : formatCents(cents);
}

// Web's appointmentLinkTo (ArtistPerformancePanel.jsx): a session carries a projectId
// (convertBookingRequest auto-creates a Project for a session_booked outcome); a consult never
// gets one but carries a bookingRequestId, which is enough to open consult/[id].tsx. Anything
// else (an "other" appointment, or a consult predating bookingRequestId) isn't clickable.
function appointmentLinkTo(appt: AppointmentListItemFragment): { pathname: '/project/[id]' | '/consult/[id]'; params: { id: string } } | null {
  if (appt.projectId) {
    return { pathname: '/project/[id]', params: { id: appt.projectId } };
  }
  if (appt.appointmentType === 'consult' && appt.bookingRequestId) {
    return { pathname: '/consult/[id]', params: { id: appt.id } };
  }
  return null;
}

function AppointmentRow({
  appt,
  showEarnings = false,
  showArtist = false,
  router,
}: {
  appt: AppointmentListItemFragment;
  showEarnings?: boolean;
  showArtist?: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const linkTo = appointmentLinkTo(appt);
  const clientName = getAppointmentClientName(appt);
  const detailParts = [formatDateTime(appt.appointmentDate), clientName, getAppointmentStatusLabel(appt)].filter(Boolean);
  if (showArtist) {
    detailParts.push(getAppointmentArtistName(appt));
  }
  const body = (
    <View style={[styles.listRow, tagColorRowStyle(appt.user?.tagColor)]} testID={`dashboard-appointment-${appt.id}`}>
      <ThemedText type="default" numberOfLines={1}>
        {getAppointmentTitle(appt)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {detailParts.join(' - ')}
      </ThemedText>
      {showEarnings ? (
        <ThemedText type="small" themeColor="textSecondary">
          {formatCents(appt.totalCents)}
          {appt.tipCents ? ` (${formatCents(appt.tipCents)} tip)` : ''}
        </ThemedText>
      ) : null}
    </View>
  );
  if (!linkTo) {
    return body;
  }
  return (
    <Pressable onPress={() => router.push(linkTo)} testID={`dashboard-appointment-link-${appt.id}`}>
      {body}
    </Pressable>
  );
}

// shopWide "Artist Totals" (ArtistPerformancePanel.jsx) - what each artist actually takes home:
// revenue minus their FULL assessed shop cut (earned + outstanding + awaiting confirmation), not
// just the settled portion. Same artistTakeHomeCents reasoning as web's own comment on that
// function.
function ArtistTotalsRow({ row }: { row: ArtistAnalyticsRow }) {
  const name = row.user ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim() || 'Unknown artist' : 'Unknown artist';
  const shopCut = (row.shopCutEarnedCents ?? 0) + (row.shopCutOutstandingCents ?? 0) + (row.shopCutAwaitingConfirmationCents ?? 0);
  const takeHome = (row.revenueCents ?? 0) - shopCut;
  return (
    <View style={[styles.listRow, tagColorRowStyle(row.user?.tagColor)]} testID={`dashboard-artist-total-${row.userId}`}>
      <ThemedText type="default">{name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Revenue {formatCents(row.revenueCents)} - Shop cut {formatCents(shopCut)} - Take-home {formatCents(takeHome)}
      </ThemedText>
    </View>
  );
}

// Staff's "By artist" (ShopAnalyticsPanel.jsx) - clickable to artist/[id].tsx when artistId
// resolved server-side (the Artist DOCUMENT's id, not the User id these rows are keyed by - see
// that file's own comment); unclickable rather than linking somewhere that 404s when it's absent.
function ByArtistRow({ row, canSeeMoney, router }: { row: ArtistAnalyticsRow; canSeeMoney: boolean; router: ReturnType<typeof useRouter> }) {
  const name = row.user ? `${row.user.firstName ?? ''} ${row.user.lastName ?? ''}`.trim() || 'Unknown artist' : 'Unknown artist';
  const sessionsLabel = `${row.completedSessionCount} session${row.completedSessionCount === 1 ? '' : 's'}`;
  const moneyLabel = canSeeMoney
    ? ` - ${formatCents(row.revenueCents)} revenue - ${formatCents(row.tipsCents)} tips - ${formatCents(row.shopCutOutstandingCents)} cut owed`
    : '';
  const body = (
    <View style={[styles.listRow, tagColorRowStyle(row.user?.tagColor)]} testID={`dashboard-artist-${row.userId}`}>
      <ThemedText type="default">{name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {sessionsLabel}
        {moneyLabel}
      </ThemedText>
    </View>
  );
  if (!row.artistId) {
    return body;
  }
  const artistId = row.artistId;
  return (
    <Pressable onPress={() => router.push({ pathname: '/artist/[id]', params: { id: artistId } })} testID={`dashboard-artist-link-${row.userId}`}>
      {body}
    </Pressable>
  );
}

/**
 * Gap #4 of HANDOFF.md's 2026-09-04 parity accounting ("No dashboard or analytics screen exists
 * on mobile at all") - the mobile counterpart to web's pages/home/Home.jsx, branching the same way
 * that file does: Artist -> ArtistPerformancePanel.jsx, Staff -> ShopAnalyticsPanel.jsx. Client is
 * not a branch here at all - mobile has no client login (X15's own note carried forward through
 * every screen since).
 *
 * Reached from a new "Dashboard" header link on index.tsx (open to any signed-in user, no role
 * gate - every Artist and Staff account gets a dashboard) rather than replacing the landing
 * screen - index.tsx's own header comment already settled that the calendar stays the app's root
 * (X22), and nothing about this slice reopens that.
 *
 * shopWide mirrors web's own condition exactly: an ARTIST-typed shop admin's OWN dashboard
 * (mobile never renders anyone else's - there is no isSelf=false caller here, unlike web's
 * Artist.jsx) becomes the shop-wide view once they actually have a shop connected. A plain
 * artist, or a shop-connected artist below Shop Admin, stays on their own personal figures.
 *
 * SCOPED DOWN FOR V1, three ways, each named rather than silently dropped:
 *
 * 1. DATE RANGE - the five presets utils/businessRanges.ts already builds for Income/Expenses
 *    (X26), not web's DateRangePicker.jsx (five presets + a two-date-input custom range). X26's
 *    own header comment already named "no custom range" as a scope cut for that screen; this
 *    dashboard just inherits the same cut from the same file rather than re-litigating it.
 *
 * 2. SHOP CUT PAYOUTS - web's ShopCutPayoutList (the artist-side "mark this cut paid" action) is
 *    NOT here. shop-cut-confirmations/index.tsx's own header comment already flags
 *    `markShopCutPaidManually` as not built on mobile - that's the mutation this section would
 *    need, so there is nothing for it to call yet. Confirming a cut (the other half of that dual-
 *    control flow) already has its own mobile screen; the artist-side mark-paid action, and this
 *    dashboard section once it exists, are real, separate follow-up work.
 *
 * 3. PAGINATION - "Load more" grows the page LIMIT and refetches from offset 0, matching
 *    client/[id].tsx's own X49 convention, rather than web's EntityListPager (offset + a page-size
 *    selector). Same reasoning as that file's header comment: apollo-client.ts has no
 *    typePolicies/merge functions configured, so fetchMore's array-merge behavior on this codebase
 *    is unverified, and these lists are modest enough that limit-growth is simpler and sidesteps
 *    the question entirely.
 *
 * Viewing ONE OTHER specific artist's performance (web's Artist.jsx, isSelf=false) is not this
 * screen and is not built on mobile at all yet - artist/[id].tsx today only shows the artist's own
 * record fields, not their performance panel. Named here as its own future slice, not folded into
 * this one, since it is a different question (someone else's numbers) than "my own dashboard".
 */
export default function DashboardScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const shopId = getUserShopId(user);
  const userInfo = user?.userInfo;
  const isArtist = userInfo?.__typename === 'Artist';
  const isStaff = userInfo?.__typename === 'Staff';
  const canSeeMoney = isShopAdminOrBetter(user);
  const shopWide = isArtist && Boolean(shopId) && canSeeMoney;

  const presets = buildPresetRanges();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const range = presets.find((p) => p.key === rangeKey) ?? presets[0];
  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();

  // Independent "how many rows" state per list, reset back to the default whenever the question
  // being asked changes (the range, or personal-vs-shop-wide) - an offset that made sense against
  // last month's rows is meaningless against this month's, same reasoning web's own
  // upcomingOffset/completedOffset reset effect gives.
  const [upcomingLimit, setUpcomingLimit] = useState(APPOINTMENT_LIST_LIMIT);
  const [completedLimit, setCompletedLimit] = useState(APPOINTMENT_LIST_LIMIT);
  useEffect(() => {
    setUpcomingLimit(APPOINTMENT_LIST_LIMIT);
    setCompletedLimit(APPOINTMENT_LIST_LIMIT);
  }, [rangeKey, shopWide]);

  // Two hooks, each skipping itself - same dual-hook pattern web's own ArtistPerformancePanel.jsx
  // uses for "ask the shop-wide question instead" (hooks can't be called conditionally). Staff
  // always reads the shop-wide aggregate; an artist reads it only once shopWide is true.
  const { data: artistAnalyticsData, loading: artistAnalyticsLoading } = useGetArtistAnalyticsQuery({
    variables: { userId: user?.id ?? '', start: startISO, end: endISO },
    skip: !isArtist || shopWide || !user?.id,
    fetchPolicy: 'cache-and-network',
  });
  const { data: shopAnalyticsData, loading: shopAnalyticsLoading } = useGetShopAnalyticsQuery({
    variables: { shopId: shopId ?? '', start: startISO, end: endISO },
    skip: !shopId || (isArtist && !shopWide),
    fetchPolicy: 'cache-and-network',
  });
  const usingShopAnalytics = isStaff || shopWide;
  const analytics = usingShopAnalytics ? shopAnalyticsData?.getShopAnalytics : artistAnalyticsData?.getArtistAnalytics;
  const analyticsLoading = usingShopAnalytics ? shopAnalyticsLoading : artistAnalyticsLoading;
  const artistRows = shopAnalyticsData?.getShopAnalytics?.artists ?? [];

  // The appointment lists are an Artist-only section (ShopAnalyticsPanel has no appointment list
  // of its own, just the By-artist table below) - skipped outright whenever isStaff.
  const upcomingFilter = { upcomingOnly: true, from: startISO, to: endISO };
  const completedFilter = { appointmentStatus: 'completed', from: startISO, to: endISO };

  const { data: upcomingArtistData, loading: upcomingArtistLoading } = useGetAppointmentsByArtistQuery({
    variables: { userId: user?.id ?? '', filter: upcomingFilter, page: { limit: upcomingLimit, offset: 0 } },
    skip: !isArtist || shopWide || !user?.id,
    fetchPolicy: 'cache-and-network',
  });
  const { data: upcomingShopData, loading: upcomingShopLoading } = useGetAppointmentsByShopQuery({
    variables: { shopId: shopId ?? '', filter: upcomingFilter, page: { limit: upcomingLimit, offset: 0 } },
    skip: !isArtist || !shopWide || !shopId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: completedArtistData, loading: completedArtistLoading } = useGetAppointmentsByArtistQuery({
    variables: { userId: user?.id ?? '', filter: completedFilter, page: { limit: completedLimit, offset: 0 } },
    skip: !isArtist || shopWide || !user?.id,
    fetchPolicy: 'cache-and-network',
  });
  const { data: completedShopData, loading: completedShopLoading } = useGetAppointmentsByShopQuery({
    variables: { shopId: shopId ?? '', filter: completedFilter, page: { limit: completedLimit, offset: 0 } },
    skip: !isArtist || !shopWide || !shopId,
    fetchPolicy: 'cache-and-network',
  });

  const upcoming = shopWide ? (upcomingShopData?.getAppointmentsByShop.items ?? []) : (upcomingArtistData?.getAppointmentsByArtist.items ?? []);
  const upcomingPageInfo = shopWide ? upcomingShopData?.getAppointmentsByShop.pageInfo : upcomingArtistData?.getAppointmentsByArtist.pageInfo;
  const upcomingLoading = shopWide ? upcomingShopLoading : upcomingArtistLoading;
  const completed = shopWide ? (completedShopData?.getAppointmentsByShop.items ?? []) : (completedArtistData?.getAppointmentsByArtist.items ?? []);
  const completedPageInfo = shopWide ? completedShopData?.getAppointmentsByShop.pageInfo : completedArtistData?.getAppointmentsByArtist.pageInfo;
  const completedLoading = shopWide ? completedShopLoading : completedArtistLoading;

  const upcomingTitle = shopWide ? 'Shop Upcoming Appointments' : 'Your Upcoming Appointments';
  const completedTitle = shopWide ? 'Shop Completed Sessions' : 'Your Completed Sessions';

  if (!user) {
    return null;
  }

  // Matches ShopAnalyticsPanel.jsx's own early return - a Staff account with no shop connected
  // has nothing to aggregate, and no range picker to offer over an empty set.
  if (isStaff && !shopId) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.content}>
            <ThemedText type="subtitle">Dashboard</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              You aren&apos;t connected to a shop yet, so there are no shop-wide figures to show.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Dashboard</ThemedText>

          <PillRow
            options={presets.map((p) => ({ id: p.key, label: p.label }))}
            selectedId={rangeKey}
            onSelect={(key) => setRangeKey(key as RangeKey)}
            testID="dashboard-range"
          />

          {analyticsLoading && !analytics ? (
            <ActivityIndicator color={theme.text} testID="dashboard-analytics-loading" />
          ) : analytics ? (
            isStaff ? (
              <>
                {canSeeMoney ? (
                  <>
                    <ThemedText type="smallBold">Money</ThemedText>
                    <View style={styles.statsGrid}>
                      <StatCard label="Revenue" value={money(analytics.revenueCents)} subLabel="completed appointments only" />
                      <StatCard label="Tips" value={money(analytics.tipsCents)} subLabel="the artists keep all of this" />
                      <StatCard
                        label="Average tip"
                        value={money(analytics.averageTipCents)}
                        subLabel={`across ${analytics.tippedCount ?? 0} tipped appointment${(analytics.tippedCount ?? 0) === 1 ? '' : 's'}`}
                      />
                      <StatCard label="Shop cut collected" value={money(analytics.shopCutEarnedCents)} />
                      <StatCard label="Shop cut outstanding" value={money(analytics.shopCutOutstandingCents)} subLabel="owed but not yet paid" />
                      <StatCard
                        label="Awaiting your confirmation"
                        value={money(analytics.shopCutAwaitingConfirmationCents)}
                        subLabel={(analytics.shopCutAwaitingConfirmationCents ?? 0) > 0 ? 'needs review' : undefined}
                      />
                    </View>
                    <ThemedText type="smallBold">Deposits</ThemedText>
                    <View style={styles.statsGrid}>
                      <StatCard label="Deposits collected" value={money(analytics.depositsCollectedCents)} subLabel="already included in revenue" />
                      <StatCard label="Deposits applied" value={money(analytics.depositsAppliedCents)} subLabel="credited against sessions" />
                      <StatCard label="Deposits outstanding" value={money(analytics.depositsOutstandingCents)} subLabel="held against work not yet done" />
                    </View>
                  </>
                ) : null}
                <ThemedText type="smallBold">Activity</ThemedText>
                <View style={styles.statsGrid}>
                  <StatCard label="Sessions completed" value={analytics.completedSessionCount} />
                  <StatCard label="Consults booked" value={analytics.consultCount} />
                  <StatCard label="Appointments" value={analytics.appointmentCount} />
                  <StatCard label="Upcoming" value={analytics.upcomingCount} subLabel="as of today, any range" />
                  <StatCard label="Active projects" value={analytics.activeProjectCount} subLabel="as of today, any range" />
                  <StatCard label="Artists" value={analytics.artistCount} />
                </View>
                <ThemedText type="smallBold">Clients</ThemedText>
                <View style={styles.statsGrid}>
                  <StatCard label="New clients" value={analytics.newClientCount} />
                  <StatCard label="Total clients" value={analytics.totalClientCount} />
                  <StatCard label="New projects" value={analytics.newProjectCount} />
                </View>
              </>
            ) : (
              <View style={styles.statsGrid}>
                {shopWide ? (
                  <>
                    <StatCard label="Total Revenue" value={money(analytics.revenueCents)} subLabel="completed sessions, all artists" />
                    <StatCard label="Shop Total" value={money(analytics.shopCutEarnedCents)} subLabel="shop cut actually collected" />
                    <StatCard label="Shop cut owed" value={money(analytics.shopCutOutstandingCents)} />
                    <StatCard label="Shop cut awaiting confirmation" value={money(analytics.shopCutAwaitingConfirmationCents)} />
                    <StatCard label="Deposits taken" value={money(analytics.depositsCollectedCents)} subLabel="already included in revenue" />
                    <StatCard label="Deposits unspent" value={money(analytics.depositsOutstandingCents)} subLabel="held against work not yet done" />
                    <StatCard label="Expenses" value={money(analytics.expensesCents)} subLabel="rent, supplies, everything logged as an expense" />
                    <StatCard label="Other income" value={money(analytics.otherIncomeCents)} subLabel="non-tattoo income - retail, booth rent, etc." />
                    <StatCard label="Grand total" value={money(analytics.netCents)} subLabel="tattoo revenue + other income - expenses" />
                  </>
                ) : (
                  <>
                    <StatCard label="Revenue" value={money(analytics.revenueCents)} subLabel="completed appointments only" />
                    <StatCard label="Tips" value={money(analytics.tipsCents)} />
                    <StatCard
                      label="Average tip"
                      value={money(analytics.averageTipCents)}
                      subLabel={`across ${analytics.tippedCount ?? 0} tipped appointment${(analytics.tippedCount ?? 0) === 1 ? '' : 's'}`}
                    />
                    <StatCard label="Deposits taken" value={money(analytics.depositsCollectedCents)} subLabel="already included in revenue" />
                    <StatCard label="Deposits unspent" value={money(analytics.depositsOutstandingCents)} subLabel="held against work not yet done" />
                    <StatCard label="Shop cut owed" value={money(analytics.shopCutOutstandingCents)} />
                    <StatCard label="Expenses" value={money(analytics.expensesCents)} />
                    <StatCard label="Other income" value={money(analytics.otherIncomeCents)} subLabel="non-tattoo income" />
                    <StatCard label="Grand total" value={money(analytics.netCents)} subLabel="revenue + other income - expenses" />
                    <StatCard label="Sessions completed" value={analytics.completedSessionCount} />
                    <StatCard label="Active projects" value={analytics.activeProjectCount} subLabel="as of today, any range" />
                  </>
                )}
              </View>
            )
          ) : null}

          {shopWide && artistRows.length > 0 ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Artist Totals</ThemedText>
              {artistRows.map((row) => (
                <ArtistTotalsRow key={row.userId} row={row} />
              ))}
            </View>
          ) : null}

          {isStaff && analytics ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">By artist</ThemedText>
              {artistRows.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No artist activity in this range.
                </ThemedText>
              ) : (
                artistRows.map((row) => <ByArtistRow key={row.userId} row={row} canSeeMoney={canSeeMoney} router={router} />)
              )}
            </View>
          ) : null}

          {isArtist ? (
            <>
              <View style={styles.card}>
                <ThemedText type="smallBold">{upcomingTitle}</ThemedText>
                {upcomingLoading && upcoming.length === 0 ? (
                  <ActivityIndicator color={theme.text} testID="dashboard-upcoming-loading" />
                ) : upcoming.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No upcoming appointments in {range.label}.
                  </ThemedText>
                ) : (
                  <>
                    {upcoming.map((appt) => (
                      <AppointmentRow key={appt.id} appt={appt} showArtist={shopWide} router={router} />
                    ))}
                    {upcomingPageInfo?.hasMore ? (
                      <Button
                        label="Load more"
                        variant="secondary"
                        onPress={() => setUpcomingLimit((limit) => limit + APPOINTMENT_LIST_LIMIT)}
                        testID="dashboard-upcoming-load-more"
                      />
                    ) : null}
                  </>
                )}
              </View>

              <View style={styles.card}>
                <ThemedText type="smallBold">{completedTitle}</ThemedText>
                {completedLoading && completed.length === 0 ? (
                  <ActivityIndicator color={theme.text} testID="dashboard-completed-loading" />
                ) : completed.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No completed sessions in {range.label}.
                  </ThemedText>
                ) : (
                  <>
                    {completed.map((appt) => (
                      <AppointmentRow key={appt.id} appt={appt} showEarnings showArtist={shopWide} router={router} />
                    ))}
                    {completedPageInfo?.hasMore ? (
                      <Button
                        label="Load more"
                        variant="secondary"
                        onPress={() => setCompletedLimit((limit) => limit + APPOINTMENT_LIST_LIMIT)}
                        testID="dashboard-completed-load-more"
                      />
                    ) : null}
                  </>
                )}
              </View>
            </>
          ) : null}
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  listRow: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
  },
});
