import type { AppointmentListItemFragment } from '@inkbooks/api';
import {
  useArchiveArtistMutation,
  useGetAppointmentsByArtistQuery,
  useGetArtistAnalyticsQuery,
  useGetArtistDetailQuery,
  useUnarchiveArtistMutation,
  useUpdateArtistIdentityMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArchiveControl } from '@/components/ArchiveControl';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { PillRow } from '@/components/PillRow';
import { ShopCutRatePanel } from '@/components/ShopCutRatePanel';
import { StatCard } from '@/components/StatCard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ARTIST_STATUS, ROLES } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  getAppointmentClientName,
  getAppointmentStatusLabel,
  getAppointmentTitle,
} from '@/utils/appointments';
import { buildPresetRanges, type RangeKey } from '@/utils/businessRanges';
import { formatCents } from '@/utils/money';
import { tagColorRowStyle } from '@/utils/tagColor';

/**
 * The shop's management view into one specific artist - identity fields (autosave on blur, same
 * pattern as project/[id].tsx's ProjectDetailsCard), Archive/Restore, Shop cut, and Performance.
 * Reached only from artists/index.tsx (itself gated `isStaffOrBetter`) or an artist's own... there
 * is no "view your own artist page" link on mobile yet, matching the fact that index.tsx's own
 * dashboard is where an artist sees themselves, same split web's own Home.jsx/Artist.jsx keeps.
 *
 * 2026-09-12: ArtistPerformancePanel and ShopCutRatePanel, the two dashboard panels web mounts
 * below the identity card, are now ported - closing the gap X22 deliberately deferred ("a
 * separate, large, real feature, not a natural extension of a directory port"). ShopCutRatePanel
 * is its own file (components/ShopCutRatePanel.tsx, matching web's own file-per-component split);
 * ArtistPerformancePanel's ISSELF=FALSE branch only is inlined here directly, matching
 * dashboard.tsx's own precedent of keeping its (isSelf=true) copy of this same panel inline in
 * the screen rather than factored into a shared component - this screen is the only mobile caller
 * of the isSelf=false shape, so there's nothing a shared component would be sharing with.
 *
 * SCOPED DOWN from web's ArtistPerformancePanel.jsx exactly as far as isSelf=false already scopes
 * it down THERE - not a further cut of this slice's own making. web's `shopWide` is
 * `isSelf && shopId && role <= SHOP_ADMIN`, which is unreachable when the caller hardcodes
 * `isSelf={false}` (Artist.jsx's own call) - so the "Artist Totals" shop-wide table and the
 * `isSelf && <ShopCutPayoutList>` payouts section never render on web's OWN Artist.jsx either.
 * Porting only the non-shopWide stat-card set and the two appointment lists is therefore a
 * faithful port of what this screen actually shows on web, not a scope cut.
 */
// How many rows the Upcoming/Completed lists show before the first "Load more" - matches
// dashboard.tsx's own APPOINTMENT_LIST_LIMIT (itself matching web's ArtistPerformancePanel.jsx).
const APPOINTMENT_LIST_LIMIT = 5;

// Same local-time read as dashboard.tsx's own formatDateTime/client/[id].tsx's formatDateTime -
// appointmentDate is a real instant, not web's `moment.utc(...)` read of this same field. See
// client/[id].tsx's own header comment for why this app deliberately deviates from web here.
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

// null means "not available to you" (StatCard.tsx's own reasoning) - formatCents(null) would
// silently print "$0.00" and erase that distinction. Not actually reachable on THIS screen today
// (getArtistAnalytics's money fields are only ever null on the shop-wide query for a Staff caller
// - see server/graphql/resolvers/analytics.js - and this screen never calls that one), kept for
// the same reason dashboard.tsx keeps it: matching StatCard's contract exactly rather than
// re-deriving "is this the one query that can return null" here.
function money(cents: number | null | undefined): string | null {
  return cents === null || cents === undefined ? null : formatCents(cents);
}

// Direct port of dashboard.tsx's own appointmentLinkTo (itself a port of web's
// ArtistPerformancePanel.jsx): a session carries a projectId; a consult never gets one but
// carries a bookingRequestId, enough to open consult/[id].tsx. Anything else isn't clickable.
function appointmentLinkTo(
  appt: AppointmentListItemFragment,
): { pathname: '/project/[id]' | '/consult/[id]'; params: { id: string } } | null {
  if (appt.projectId) {
    return { pathname: '/project/[id]', params: { id: appt.projectId } };
  }
  if (appt.appointmentType === 'consult' && appt.bookingRequestId) {
    return { pathname: '/consult/[id]', params: { id: appt.id } };
  }
  return null;
}

// Direct port of dashboard.tsx's own AppointmentRow - showArtist is never true here (this screen
// is already scoped to one specific artist, unlike dashboard.tsx's own shopWide branch), so that
// prop isn't carried over.
function PerformanceAppointmentRow({
  appt,
  showEarnings = false,
  router,
}: {
  appt: AppointmentListItemFragment;
  showEarnings?: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const linkTo = appointmentLinkTo(appt);
  const clientName = getAppointmentClientName(appt);
  const detailParts = [formatDateTime(appt.appointmentDate), clientName, getAppointmentStatusLabel(appt)].filter(Boolean);
  const body = (
    <View style={[styles.listRow, tagColorRowStyle(appt.user?.tagColor)]} testID={`artist-appointment-${appt.id}`}>
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
    <Pressable onPress={() => router.push(linkTo)} testID={`artist-appointment-link-${appt.id}`}>
      {body}
    </Pressable>
  );
}

export default function ArtistDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const { data, loading, error, refetch } = useGetArtistDetailQuery({
    variables: { artistId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const artist = data?.getArtist;

  const [archiveArtist, { loading: archiving }] = useArchiveArtistMutation();
  const [unarchiveArtist, { loading: restoring }] = useUnarchiveArtistMutation();

  // The performance panel (web's ArtistPerformancePanel.jsx, isSelf=false branch only - this
  // screen never renders the shopWide "every artist" view dashboard.tsx's own copy of this same
  // panel does, matching web's own Artist.jsx exactly: viewing one OTHER specific artist never
  // goes shop-wide). Hooks called unconditionally (each skips itself) since artist.userId isn't
  // known until after the loading/error guards below - same pattern this file's own
  // useGetArtistDetailQuery/archive mutations, and dashboard.tsx's own analytics hooks, already
  // use for "the id this hook needs might not exist yet."
  const presets = buildPresetRanges();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const range = presets.find((p) => p.key === rangeKey) ?? presets[0];
  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();

  const [upcomingLimit, setUpcomingLimit] = useState(APPOINTMENT_LIST_LIMIT);
  const [completedLimit, setCompletedLimit] = useState(APPOINTMENT_LIST_LIMIT);
  useEffect(() => {
    setUpcomingLimit(APPOINTMENT_LIST_LIMIT);
    setCompletedLimit(APPOINTMENT_LIST_LIMIT);
  }, [rangeKey]);

  const { data: analyticsData, loading: analyticsLoading } = useGetArtistAnalyticsQuery({
    variables: { userId: artist?.userId ?? '', start: startISO, end: endISO },
    skip: !artist?.userId,
    fetchPolicy: 'cache-and-network',
  });
  const analytics = analyticsData?.getArtistAnalytics;

  const upcomingFilter = { upcomingOnly: true, from: startISO, to: endISO };
  const completedFilter = { appointmentStatus: 'completed', from: startISO, to: endISO };

  const { data: upcomingData, loading: upcomingLoading } = useGetAppointmentsByArtistQuery({
    variables: { userId: artist?.userId ?? '', filter: upcomingFilter, page: { limit: upcomingLimit, offset: 0 } },
    skip: !artist?.userId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: completedData, loading: completedLoading } = useGetAppointmentsByArtistQuery({
    variables: { userId: artist?.userId ?? '', filter: completedFilter, page: { limit: completedLimit, offset: 0 } },
    skip: !artist?.userId,
    fetchPolicy: 'cache-and-network',
  });
  const upcoming = upcomingData?.getAppointmentsByArtist.items ?? [];
  const upcomingPageInfo = upcomingData?.getAppointmentsByArtist.pageInfo;
  const completed = completedData?.getAppointmentsByArtist.items ?? [];
  const completedPageInfo = completedData?.getAppointmentsByArtist.pageInfo;

  const handleArchive = () => {
    if (!artist) return;
    archiveArtist({ variables: { artistId: artist.id } })
      .then(() => refetch())
      .catch(() => {});
  };

  const handleRestore = () => {
    if (!artist) return;
    unarchiveArtist({ variables: { artistId: artist.id } })
      .then(() => refetch())
      .catch(() => {});
  };

  if ((loading && !artist) || !id) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="artist-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !artist) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="artist-error">
            {error ? `Couldn't load this artist: ${error.message}` : 'This artist does not exist.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Real rule is assertCanManageArtist (self, or shop-admin-or-better SHARING A SHOP with them) -
  // same presentation-only simplification apps/web's own Artist.jsx documents for this exact
  // check: the shop-sharing half isn't cheap to know client-side, and updateArtist is the actual
  // gate (a blocked save fails loudly rather than silently).
  const isSelf = String(user?.id) === String(artist.userId);
  const canEditIdentity = isSelf || Boolean(user?.role && user.role <= ROLES.SHOP_ADMIN);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Avatar
              imageUri={artist.user?.avatar || artist.avatar}
              firstName={artist.firstName}
              lastName={artist.lastName}
              size={64}
            />
            <View style={styles.headerInfo}>
              <ThemedText type="subtitle">
                {artist.firstName} {artist.lastName}
              </ThemedText>
              {artist.title ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {artist.title}
                </ThemedText>
              ) : null}
            </View>
          </View>

          <ArchiveControl
            kind="artist"
            name={`${artist.firstName} ${artist.lastName}`}
            isArchived={artist.status === ARTIST_STATUS.ARCHIVED}
            archiving={archiving}
            restoring={restoring}
            onArchive={handleArchive}
            onRestore={handleRestore}
            testID="artist-archive-control"
          />

          <IdentityCard artist={artist} canEdit={canEditIdentity} />

          {/* Shop admin ONLY (never the artist themselves, matching web's own ShopCutRatePanel
              canEdit prop exactly) AND never for the viewer's own page - the same "cannot set the
              number you owe" exclusion web's Artist.jsx bakes into this exact expression. */}
          <ShopCutRatePanel
            artistUserId={artist.userId}
            shopId={artist.shopId}
            canEdit={Boolean(user?.role && user.role <= ROLES.SHOP_ADMIN) && String(user?.id) !== String(artist.userId)}
          />

          <View style={styles.card}>
            <ThemedText type="smallBold">Performance</ThemedText>
            <PillRow
              options={presets.map((p) => ({ id: p.key, label: p.label }))}
              selectedId={rangeKey}
              onSelect={(key) => setRangeKey(key as RangeKey)}
              testID="artist-performance-range"
            />

            {analyticsLoading && !analytics ? (
              <ActivityIndicator color={theme.text} testID="artist-performance-loading" />
            ) : analytics ? (
              <View style={styles.statsGrid}>
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
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">Upcoming Appointments</ThemedText>
            {upcomingLoading && upcoming.length === 0 ? (
              <ActivityIndicator color={theme.text} testID="artist-upcoming-loading" />
            ) : upcoming.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No upcoming appointments in {range.label}.
              </ThemedText>
            ) : (
              <>
                {upcoming.map((appt) => (
                  <PerformanceAppointmentRow key={appt.id} appt={appt} router={router} />
                ))}
                {upcomingPageInfo?.hasMore ? (
                  <Button
                    label="Load more"
                    variant="secondary"
                    onPress={() => setUpcomingLimit((limit) => limit + APPOINTMENT_LIST_LIMIT)}
                    testID="artist-upcoming-load-more"
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">Completed Sessions</ThemedText>
            {completedLoading && completed.length === 0 ? (
              <ActivityIndicator color={theme.text} testID="artist-completed-loading" />
            ) : completed.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No completed sessions in {range.label}.
              </ThemedText>
            ) : (
              <>
                {completed.map((appt) => (
                  <PerformanceAppointmentRow key={appt.id} appt={appt} showEarnings router={router} />
                ))}
                {completedPageInfo?.hasMore ? (
                  <Button
                    label="Load more"
                    variant="secondary"
                    onPress={() => setCompletedLimit((limit) => limit + APPOINTMENT_LIST_LIMIT)}
                    testID="artist-completed-load-more"
                  />
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type Artist = NonNullable<ReturnType<typeof useGetArtistDetailQuery>['data']>['getArtist'];

function IdentityCard({ artist, canEdit }: { artist: NonNullable<Artist>; canEdit: boolean }) {
  const firstNameRef = useRef(artist.firstName);
  const lastNameRef = useRef(artist.lastName);
  const emailRef = useRef(artist.email);
  const phoneRef = useRef(artist.phone ?? '');
  const titleRef = useRef(artist.title ?? '');
  const addressRef = useRef(artist.address ?? '');
  const cityRef = useRef(artist.city ?? '');
  const stateRef = useRef(artist.state ?? '');
  const zipRef = useRef(artist.zip ?? '');
  const instagramRef = useRef(artist.instagram ?? '');
  const facebookRef = useRef(artist.facebook ?? '');
  const lastSavedRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [updateArtist] = useUpdateArtistIdentityMutation();

  // shopId is deliberately never included - see artists.graphql's own header comment.
  const buildPayload = () => ({
    id: artist.id,
    firstName: firstNameRef.current,
    lastName: lastNameRef.current,
    email: emailRef.current,
    phone: phoneRef.current,
    title: titleRef.current,
    address: addressRef.current,
    city: cityRef.current,
    state: stateRef.current,
    zip: zipRef.current,
    instagram: instagramRef.current,
    facebook: facebookRef.current,
  });

  if (lastSavedRef.current === null) {
    lastSavedRef.current = JSON.stringify(buildPayload());
  }

  const save = async () => {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = serialized;
    setSaveState('saving');
    try {
      await updateArtist({ variables: { artist: payload } });
      setSaveState('saved');
    } catch {
      lastSavedRef.current = null;
      setSaveState('error');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">Details</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="artist-save-state">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All changes saved'}
          {saveState === 'error' && "Couldn't save - try again"}
        </ThemedText>
      </View>
      {!canEdit ? (
        <ThemedText type="small" themeColor="textSecondary">
          Only {artist.firstName || 'this artist'} or a shop admin can edit these details.
        </ThemedText>
      ) : null}

      <FormField
        label="First Name"
        defaultValue={artist.firstName}
        onChangeText={(t) => (firstNameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-first-name"
      />
      <FormField
        label="Last Name"
        defaultValue={artist.lastName}
        onChangeText={(t) => (lastNameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-last-name"
      />
      <FormField
        label="Email"
        defaultValue={artist.email}
        onChangeText={(t) => (emailRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="artist-email"
      />
      <FormField
        label="Phone"
        defaultValue={artist.phone ?? ''}
        onChangeText={(t) => (phoneRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="phone-pad"
        testID="artist-phone"
      />
      <FormField
        label="Title"
        defaultValue={artist.title ?? ''}
        onChangeText={(t) => (titleRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-title"
      />
      <FormField
        label="Address"
        defaultValue={artist.address ?? ''}
        onChangeText={(t) => (addressRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-address"
      />
      <FormField
        label="City"
        defaultValue={artist.city ?? ''}
        onChangeText={(t) => (cityRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-city"
      />
      <FormField
        label="State"
        defaultValue={artist.state ?? ''}
        onChangeText={(t) => (stateRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-state"
      />
      <FormField
        label="Zip"
        defaultValue={artist.zip ?? ''}
        onChangeText={(t) => (zipRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-zip"
      />
      <FormField
        label="Instagram"
        defaultValue={artist.instagram ?? ''}
        onChangeText={(t) => (instagramRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="artist-instagram"
      />
      <FormField
        label="Facebook"
        defaultValue={artist.facebook ?? ''}
        onChangeText={(t) => (facebookRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="artist-facebook"
      />
    </View>
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerInfo: {
    gap: Spacing.half,
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  listRow: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
  },
});
