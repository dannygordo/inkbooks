import { makeReference } from '@apollo/client';
import type { Reference } from '@apollo/client';
import {
  useGetClientDashboardQuery,
  useGetClientFlagTypesQuery,
  useGetFormsListQuery,
  useGetSharedImagesForClientQuery,
  useRaiseClientFlagMutation,
  useResolveClientFlagMutation,
  useUpdateClientNotesMutation,
} from '@inkbooks/api';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { FormFillOutModal } from '@/components/FormFillOutModal';
import { PillRow } from '@/components/PillRow';
import { SendAutoResponseButton } from '@/components/SendAutoResponseButton';
import { SharedImagesGallery } from '@/components/SharedImagesGallery';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { businessScopeFor } from '@/utils/businessScope';
import { formatCents } from '@/utils/money';

// The server's own max page size for these two lists isn't relevant here - a client's own
// project/appointment history is nowhere near the shop-wide directories' scale - so this is
// just a reasonable initial window, same reasoning as every other DASHBOARD_LIST_PAGE_SIZE-shaped
// constant on this app.
const DASHBOARD_PAGE_SIZE = 10;

const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

// appointmentDate is a real instant, read in the viewer's own local time - NOT web's
// `moment.utc(appointment.appointmentDate)` call in ClientDashboard.jsx. That reads like the same
// west-of-UTC rollback risk `utils/utcDate.ts`'s own header comment warns against, except in the
// opposite direction: a UTC read of a genuine instant shows the wrong wall-clock time to any
// viewer not on UTC, and mobile's own `formatAppointmentTime` (utils/appointments.ts) already
// reads this exact field in local time everywhere else on this app. Followed here rather than
// reproduced, since the goal is a correct dashboard for the mobile viewer, not a byte-for-byte
// copy of a web read that disagrees with how this same field is shown one screen over.
const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/**
 * Second mobile slice of apps/web's `ClientDashboard.jsx` (X49, following X15's shared-images
 * pass) - Stats, Projects, Appointments, Notes, and the client's own Flags, all named explicitly
 * as future work in this screen's original header comment. Still the artist/staff-viewing-a-
 * client case only (`isSelf=false` on web) - a client viewing their OWN dashboard needs a client
 * login mode mobile doesn't have at all, out of scope by construction, not a cut (X15/X16).
 *
 * SendAutoResponseButton and the staff-facing "Forms" section (2026-09-12, HANDOFF.md's "full
 * accounting" item) were both named as deliberately-not-ported in this comment's earlier revision
 * - now added, in the same relative order web's own ClientDashboard.jsx renders them (Auto-
 * Response between Stats and Projects, Forms between Appointments/Shared-Images and Notes). Both
 * stay staff/artist-only, matching web's own `!isSelf` gate - there is no self-service branch to
 * add here, since mobile has no client login at all (X15/X16), same reasoning as everything else
 * on this screen. Forms opens `FormFillOutModal.tsx` - this app's own RN `Modal`-based stand-in
 * for web's global-modal-hosted `FormFillOut.jsx`, since there's no equivalent modal host here.
 *
 * PAGINATION: "Load more" grows the page LIMIT and refetches from offset 0, rather than porting
 * `EntityListPager`'s dual offset+page-size UI or building a `fetchMore` that merges two array
 * pages together. Simpler, and correct for a list this size - a client's project/appointment
 * history is nowhere near the shop-wide directories' scale, so re-fetching everything already
 * seen plus one more page costs nothing worth avoiding. Notes and Flags aren't paginated at all,
 * matching the server: Notes are embedded sub-documents Client returns in full (no separate
 * collection to page - see `clientDashboard.graphql`'s own comment), and `getClient.flags` takes
 * no page argument on the server at all.
 *
 * NOTES/FLAGS CACHE UPDATES ARE DIRECT PORTS of `ClientDashboard.jsx`'s own `handleAddNote`/
 * `handleRaiseFlag`/`handleResolveFlag` - same `cache.modify`+`cache.identify`+`makeReference`
 * mechanics web's own comment describes fixing a real bug for (`cache.toReference` was removed
 * from Apollo's public API; every earlier flag-raise silently failed until this exact pattern
 * replaced it). Notes needs no manual cache surgery - `updateClientNotes` returns the whole
 * updated array plus the Client's id, and Apollo's normalized cache write updates the cached
 * `Client.notes` field automatically.
 */
export default function ClientDetailScreen() {
  const params = useLocalSearchParams<{ id: string; firstName?: string; lastName?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const theme = useTheme();
  const { user } = useAuth();

  const [projectsLimit, setProjectsLimit] = useState(DASHBOARD_PAGE_SIZE);
  const [appointmentsLimit, setAppointmentsLimit] = useState(DASHBOARD_PAGE_SIZE);
  const [fillOutFormId, setFillOutFormId] = useState<string | null>(null);

  // Published forms in THIS viewer's own shop/artist scope - matching web's own
  // `FormService.getForms(scope, "published", {limit: 25, offset: 0})` call exactly (see that
  // file's own comment: only published forms are offered here, submitFormResponse itself refuses
  // anything else server-side).
  const formsScope = user ? businessScopeFor(user) : null;
  const { data: formsData } = useGetFormsListQuery({
    variables: { ...formsScope, status: 'published', page: { limit: 25, offset: 0 } },
    skip: !formsScope,
    fetchPolicy: 'cache-and-network',
  });
  const fillableForms = formsData?.getForms?.items ?? [];

  const { data, loading, error } = useGetClientDashboardQuery({
    variables: {
      clientId: id ?? '',
      projectsPage: { limit: projectsLimit, offset: 0 },
      appointmentsPage: { limit: appointmentsLimit, offset: 0 },
    },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });

  const { data: sharedImagesData, loading: sharedImagesLoading, error: sharedImagesError } =
    useGetSharedImagesForClientQuery({
      variables: { clientId: id ?? '' },
      skip: !id,
      fetchPolicy: 'cache-and-network',
    });

  const { data: flagTypesData } = useGetClientFlagTypesQuery();
  const manualFlagTypes = useMemo(
    () => (flagTypesData?.getClientFlagTypes ?? []).filter((type): type is NonNullable<typeof type> => Boolean(type) && !type!.systemGenerated),
    [flagTypesData],
  );

  const [updateClientNotes, { loading: savingNote }] = useUpdateClientNotesMutation();
  const [raiseClientFlag, { loading: savingFlag }] = useRaiseClientFlagMutation();
  const [resolveClientFlag] = useResolveClientFlagMutation();

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagTypeKey, setFlagTypeKey] = useState('');
  const [flagNote, setFlagNote] = useState('');
  const [flagError, setFlagError] = useState<string | null>(null);
  const [resolvingFlagId, setResolvingFlagId] = useState<string | null>(null);

  const name = [params.firstName, params.lastName].filter(Boolean).join(' ') || 'Client';
  const client = data?.getClient;
  const stats = client?.stats;
  const projects = client?.projects.items ?? [];
  const projectsPageInfo = client?.projects.pageInfo;
  const appointments = client?.appointments.items ?? [];
  const appointmentsPageInfo = client?.appointments.pageInfo;
  const notes = useMemo(
    () =>
      [...(client?.notes ?? [])]
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()),
    [client?.notes],
  );
  const flags = client?.flags?.filter((flag): flag is NonNullable<typeof flag> => Boolean(flag)) ?? [];
  const images = sharedImagesData?.getSharedImagesForClient ?? [];

  const handleAddNote = () => {
    if (!newNote.trim() || !id) {
      return;
    }
    const now = new Date().toISOString();
    const existing = (client?.notes ?? [])
      .filter((note): note is NonNullable<typeof note> => Boolean(note))
      .map(({ __typename, ...rest }) => rest);
    setNoteError(null);
    updateClientNotes({
      variables: {
        clientId: id,
        notes: [
          ...existing,
          {
            id: `${Date.now()}`,
            author: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
            note: newNote.trim(),
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    })
      .then(() => {
        setNewNote('');
        setShowNoteForm(false);
      })
      .catch((err) => setNoteError((err as Error).message));
  };

  const handleRaiseFlag = () => {
    if (!flagTypeKey || !id) {
      return;
    }
    setFlagError(null);
    raiseClientFlag({
      variables: { input: { clientId: id, typeKey: flagTypeKey, note: flagNote.trim() || undefined } },
      // Prepends the new flag into the SAME cached Client.flags array this screen reads, rather
      // than a refetch - see this file's own header comment on why this mirrors web's own
      // (bug-fixed) cache.modify approach exactly.
      update: (cache, { data: mutationData }) => {
        const newFlag = mutationData?.raiseClientFlag;
        if (!newFlag) {
          return;
        }
        const newFlagId = cache.identify(newFlag);
        if (!newFlagId) {
          return;
        }
        const newFlagRef = makeReference(newFlagId);
        cache.modify({
          id: cache.identify({ __typename: 'Client', id }),
          fields: {
            flags: (existing: readonly Reference[] = []) => [newFlagRef, ...existing],
          },
        });
      },
    })
      .then(() => {
        setFlagTypeKey('');
        setFlagNote('');
        setShowFlagForm(false);
      })
      .catch((err) => setFlagError((err as Error).message));
  };

  const handleResolveFlag = (flagId: string) => {
    setResolvingFlagId(flagId);
    setFlagError(null);
    resolveClientFlag({
      variables: { flagId },
      // getClient.flags only ever returns LIVE flags (server-side) - once resolved this row no
      // longer belongs in the list, so it's evicted here rather than patched, matching
      // ClientDashboard.jsx's own handleResolveFlag exactly.
      update: (cache) => {
        cache.modify({
          id: cache.identify({ __typename: 'Client', id }),
          fields: {
            flags: (existing: readonly Reference[] = [], { readField }) =>
              existing.filter((ref) => readField('id', ref) !== flagId),
          },
        });
      },
    })
      .catch((err) => setFlagError((err as Error).message))
      .finally(() => setResolvingFlagId(null));
  };

  if (loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="client-detail-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !client) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="client-detail-error">
            {error ? "Couldn't load this client." : 'This client does not exist.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{name}</ThemedText>

          {stats ? (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Lifetime value
                </ThemedText>
                <ThemedText type="subtitle">{formatCents(stats.totalSpentCents)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  across {stats.completedSessionCount} completed session
                  {stats.completedSessionCount === 1 ? '' : 's'}
                </ThemedText>
              </View>
              <View style={styles.statCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Total tips
                </ThemedText>
                <ThemedText type="subtitle">{formatCents(stats.totalTipsCents)}</ThemedText>
              </View>
              <View style={styles.statCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Average tip
                </ThemedText>
                <ThemedText type="subtitle">{formatCents(stats.averageTipCents)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  across {stats.tippedSessionCount} tipped session
                  {stats.tippedSessionCount === 1 ? '' : 's'}
                </ThemedText>
              </View>
              <View style={styles.statCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Projects
                </ThemedText>
                <ThemedText type="subtitle">{stats.projectCount}</ThemedText>
              </View>
              <View style={styles.statCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Upcoming
                </ThemedText>
                <ThemedText type="subtitle">{stats.upcomingAppointmentCount}</ThemedText>
              </View>
            </View>
          ) : null}

          {/* Staff/artist view only, matching web's `!isSelf` gate - a client sending themselves
              an Auto-Response isn't a real action, and SendAutoResponseButton renders nothing
              anyway once nobody can be sending on this viewer's own behalf. There is no isSelf
              branch on mobile at all (X15/X16), so this is unconditional here. */}
          <SendAutoResponseButton clientId={id ?? ''} />

          <View style={styles.card}>
            <ThemedText type="smallBold">Projects</ThemedText>
            {projects.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No projects yet.
              </ThemedText>
            ) : (
              <>
                {projects
                  .filter((project): project is NonNullable<typeof project> => Boolean(project))
                  .map((project) => (
                    <View key={project.id} style={styles.listRow} testID={`client-project-${project.id}`}>
                      <ThemedText type="default" numberOfLines={1}>
                        {project.title || 'Untitled project'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {project.status || 'unknown'}
                        {project.createdAt ? ` - started ${formatDate(project.createdAt)}` : ''}
                      </ThemedText>
                    </View>
                  ))}
                {projectsPageInfo?.hasMore ? (
                  <Button
                    label="Load more"
                    variant="secondary"
                    onPress={() => setProjectsLimit((limit) => limit + DASHBOARD_PAGE_SIZE)}
                    testID="client-projects-load-more"
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">Appointments</ThemedText>
            {appointments.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No appointments yet.
              </ThemedText>
            ) : (
              <>
                {appointments
                  .filter((appointment): appointment is NonNullable<typeof appointment> => Boolean(appointment))
                  .map((appointment) => (
                    <View key={appointment.id} style={styles.listRow} testID={`client-appointment-${appointment.id}`}>
                      <ThemedText type="default" numberOfLines={1}>
                        {appointment.title || appointment.project?.title || 'Untitled'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatDateTime(appointment.appointmentDate)} - {appointment.appointmentStatus}
                        {appointment.totalCents ? ` - ${formatCents(appointment.totalCents)}` : ''}
                        {appointment.tipCents ? ` (incl. ${formatCents(appointment.tipCents)} tip)` : ''}
                      </ThemedText>
                    </View>
                  ))}
                {appointmentsPageInfo?.hasMore ? (
                  <Button
                    label="Load more"
                    variant="secondary"
                    onPress={() => setAppointmentsLimit((limit) => limit + DASHBOARD_PAGE_SIZE)}
                    testID="client-appointments-load-more"
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">Shared Images</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Every image shared with you in messages with {name}.
            </ThemedText>
            {sharedImagesLoading && images.length === 0 ? (
              <ActivityIndicator color={theme.text} testID="shared-images-loading" />
            ) : sharedImagesError ? (
              <ThemedText type="small" themeColor="textSecondary">
                {/* A plain SHOP_STAFF role is refused by the server here even when the rest of a
                    client's dashboard would be visible to them - see
                    sharedImages.graphql's own header comment on canManageClientSharedImages -
                    so an error here is a real, expected outcome for some roles, not just a
                    network hiccup. */}
                Couldn&apos;t load shared images.
              </ThemedText>
            ) : (
              <SharedImagesGallery images={images} />
            )}
          </View>

          {/* Staff/artist view only, matching web's `!isSelf` gate on this exact section - the
              authenticated "staff filling this out on a client's behalf" path (see
              FormFillOutModal.tsx). Only published forms in this viewer's own shop/artist scope
              are offered, same as web. */}
          {fillableForms.length > 0 ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Forms</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Send a waiver, consent form, or intake questionnaire - fill it out here on their
                behalf, or read it to them and enter what they say.
              </ThemedText>
              {fillableForms.map((form) => (
                <View key={form.id} style={styles.formRow} testID={`client-form-${form.id}`}>
                  <ThemedText type="default" numberOfLines={1} style={styles.formRowTitle}>
                    {form.title}
                  </ThemedText>
                  <Button
                    label="Fill Out"
                    variant="secondary"
                    onPress={() => setFillOutFormId(form.id)}
                    testID={`client-form-fill-out-${form.id}`}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText type="smallBold">Notes</ThemedText>
              <Button
                label={showNoteForm ? 'Cancel' : 'Add note'}
                variant="secondary"
                onPress={() => setShowNoteForm((open) => !open)}
                testID="client-note-toggle"
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Only visible to you and your shop - never to the client.
            </ThemedText>

            {showNoteForm ? (
              <View style={styles.formBlock}>
                <FormField label="New note" value={newNote} onChangeText={setNewNote} multiline testID="client-note-input" />
                {noteError ? (
                  <ThemedText type="small" style={styles.error} testID="client-note-error">
                    {noteError}
                  </ThemedText>
                ) : null}
                <Button
                  label="Save note"
                  onPress={handleAddNote}
                  loading={savingNote}
                  disabled={!newNote.trim()}
                  testID="client-note-save"
                />
              </View>
            ) : null}

            {notes.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No notes yet.
              </ThemedText>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={styles.listRow} testID={`client-note-${note.id}`}>
                  <ThemedText type="default">{note.note}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {note.author}
                    {note.createdAt ? ` - ${formatDate(note.createdAt)}` : ''}
                  </ThemedText>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText type="smallBold">Flags</ThemedText>
              <Button
                label={showFlagForm ? 'Cancel' : 'Add flag'}
                variant="secondary"
                onPress={() => setShowFlagForm((open) => !open)}
                testID="client-flag-toggle"
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              A candid record about this client&apos;s conduct - never shown to them.
            </ThemedText>

            {showFlagForm ? (
              <View style={styles.formBlock}>
                <PillRow
                  options={manualFlagTypes.map((type) => ({ id: type.key, label: type.label }))}
                  selectedId={flagTypeKey}
                  onSelect={setFlagTypeKey}
                  testID="client-flag-type"
                />
                <FormField
                  label="Note (optional)"
                  value={flagNote}
                  onChangeText={setFlagNote}
                  multiline
                  testID="client-flag-note"
                />
                {flagError ? (
                  <ThemedText type="small" style={styles.error} testID="client-flag-error">
                    {flagError}
                  </ThemedText>
                ) : null}
                <Button
                  label="Save flag"
                  onPress={handleRaiseFlag}
                  loading={savingFlag}
                  disabled={!flagTypeKey}
                  testID="client-flag-save"
                />
              </View>
            ) : null}

            {flags.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No flags on this client.
              </ThemedText>
            ) : (
              flags.map((flag) => (
                <View key={flag.id} style={styles.listRow} testID={`client-flag-${flag.id}`}>
                  <View style={styles.cardHeader}>
                    <ThemedText type="default">
                      {flag.type?.label || flag.typeKey}
                      {flag.systemGenerated ? ' (automatic)' : ''}
                    </ThemedText>
                    <Button
                      label={resolvingFlagId === flag.id ? 'Resolving…' : 'Resolve'}
                      variant="secondary"
                      onPress={() => handleResolveFlag(flag.id)}
                      disabled={resolvingFlagId === flag.id}
                      testID={`client-flag-resolve-${flag.id}`}
                    />
                  </View>
                  {flag.note ? <ThemedText type="small">{flag.note}</ThemedText> : null}
                  <ThemedText type="small" themeColor="textSecondary">
                    {flag.createdBy ? `${flag.createdBy.firstName} ${flag.createdBy.lastName}` : 'System'}
                    {flag.createdAt ? ` - ${formatDate(flag.createdAt)}` : ''}
                  </ThemedText>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <FormFillOutModal
          visible={Boolean(fillOutFormId)}
          formId={fillOutFormId}
          clientId={id ?? ''}
          onClose={() => setFillOutFormId(null)}
          onSubmitted={() => {
            setFillOutFormId(null);
            Alert.alert('Response submitted.');
          }}
        />
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  statCard: {
    flexBasis: '45%',
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
  formBlock: {
    gap: Spacing.two,
  },
  listRow: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  formRowTitle: {
    flexShrink: 1,
  },
  error: {
    color: '#D33',
  },
});
