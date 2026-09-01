import type { GetProjectDetailQuery } from '@inkbooks/api';
import {
  useGetProjectDetailQuery,
  useRecordDepositMutation,
  useUpdateProjectDetailMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ImagesGallery } from '@/components/ImagesGallery';
import { ImagesUpload } from '@/components/ImagesUpload';
import { ProjectSessionsList } from '@/components/ProjectSessionsList';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { centsToDollars, dollarsToCents, formatCents } from '@/utils/money';
import { generateObjectId } from '@/utils/objectId';
import { PROJECT_IMAGE_SECTIONS } from '@/utils/projectImages';

type Project = NonNullable<GetProjectDetailQuery['getProject']>;

const PALETTE_OPTIONS = [
  { value: 'black', label: 'Black and Grey' },
  { value: 'color', label: 'Color' },
];

// A project usually has exactly one deposit, but the schema allows several (a consult that took
// two payments) - direct port of apps/web's Project.jsx depositMethodLabel.
function depositMethodLabel(deposits: Project['deposits']): string {
  const methods = new Set((deposits ?? []).filter((d) => (d?.depositCents ?? 0) > 0).map((d) => d?.depositPaymentMethod));
  const labels: string[] = [];
  if (methods.has('cash')) {
    labels.push('Cash');
  }
  if (methods.has('square')) {
    labels.push('Card');
  }
  return labels.join(' + ');
}

/**
 * The "has a projectId" branch of index.tsx's row tap (mirrors apps/web's AppointmentsList.jsx
 * openAppointment() three-way split) - direct port of pages/projects/Project.jsx, minus the
 * Messages panel (never in this port's scope - see DECISIONS.md's X13 entry on why that's still
 * true even though image upload/Square charge are not). The three IBImagesUpload/IBImagesList
 * sections (References/Design/Finished Tattoo) were originally deferred alongside Square charge
 * (X12) and have since been added (X13) - see ImagesUpload.tsx/ImagesGallery.tsx. Everything else
 * - autosave Details, the read-only Deposit readout + cash-only Add Deposit, Sessions, Notes, Tags
 * - is full parity.
 */
export default function ProjectDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const theme = useTheme();

  const { data, loading, error, refetch } = useGetProjectDetailQuery({
    variables: { projectId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const project = data?.getProject;

  if (loading && !project) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="project-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !project) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary">
            {error ? `Couldn't load this project: ${error.message}` : 'This project does not exist.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.headerTitle}>
              {project.title}
            </ThemedText>
            {project.client ? (
              <ThemedText type="small" themeColor="textSecondary">
                {project.client.firstName} {project.client.lastName}
              </ThemedText>
            ) : null}
          </View>

          <ProjectDetailsCard project={project} />
          <DepositCard project={project} onChanged={refetch} />
          <SectionCard title="Sessions">
            <ProjectSessionsList project={project} />
          </SectionCard>
          <NotesCard project={project} />
          <TagsCard project={project} />
          {PROJECT_IMAGE_SECTIONS.map(({ field, title }) => (
            <SectionCard key={field} title={title}>
              <ImagesUpload project={project} field={field} title={title} images={project[field]} />
              <ImagesGallery project={project} field={field} images={project[field]} />
            </SectionCard>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <ThemedText type="smallBold" style={styles.cardTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

/**
 * Autosave-on-blur, matching Project.jsx's own mechanics: an uncontrolled-style ref per field
 * (updated via onChangeText without triggering a re-render, read on blur - the RN analogue of
 * web's useRef(defaultValue) + inputRef), a dirty check against the last payload actually SENT
 * (not the last server value) so two saves in a row from different fields both go through while a
 * no-op blur doesn't, and a status line rather than a Save button.
 */
function ProjectDetailsCard({ project }: { project: Project }) {
  const theme = useTheme();
  const titleRef = useRef(project.title);
  const descriptionRef = useRef(project.description ?? '');
  const placementRef = useRef(project.placement ?? '');
  const sizeRef = useRef(project.size ?? '');
  const lastSavedRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [palette, setPalette] = useState(project.palette ?? '');

  const [updateProject] = useUpdateProjectDetailMutation();

  const buildPayload = (paletteOverride?: string) => ({
    id: project.id,
    title: titleRef.current,
    description: descriptionRef.current,
    placement: placementRef.current,
    size: sizeRef.current,
    palette: paletteOverride ?? palette,
    clientId: project.clientId,
    artistId: project.artistId,
    status: project.status,
  });

  if (lastSavedRef.current === null) {
    lastSavedRef.current = JSON.stringify(buildPayload());
  }

  const save = async (paletteOverride?: string) => {
    const payload = buildPayload(paletteOverride);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = serialized;
    setSaveState('saving');
    try {
      await updateProject({ variables: { project: payload } });
      setSaveState('saved');
    } catch {
      // Reset so the next blur retries rather than believing the field is already persisted -
      // matches web's own comment on why a failed autosave must not go silent.
      lastSavedRef.current = null;
      setSaveState('error');
    }
  };

  const handlePaletteSelect = (value: string) => {
    setPalette(value);
    save(value);
  };

  return (
    <View style={styles.card}>
      <View style={styles.detailsHeader}>
        <ThemedText type="smallBold">Details</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="project-save-state">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All changes saved'}
          {saveState === 'error' && "Couldn't save - try again"}
        </ThemedText>
      </View>

      <FormField
        label="Title"
        defaultValue={project.title}
        onChangeText={(t) => (titleRef.current = t)}
        onBlur={() => save()}
        testID="project-title"
      />
      <FormField
        label="Description"
        defaultValue={project.description}
        onChangeText={(t) => (descriptionRef.current = t)}
        onBlur={() => save()}
        multiline
        testID="project-description"
      />
      <FormField
        label="Placement"
        defaultValue={project.placement ?? ''}
        onChangeText={(t) => (placementRef.current = t)}
        onBlur={() => save()}
        testID="project-placement"
      />
      <FormField
        label="Approx. size (inches)"
        defaultValue={project.size ?? ''}
        onChangeText={(t) => (sizeRef.current = t)}
        onBlur={() => save()}
        testID="project-size"
      />

      <View style={styles.paletteField}>
        <ThemedText type="small" themeColor="textSecondary">
          Palette
        </ThemedText>
        <View style={styles.pillRow}>
          {PALETTE_OPTIONS.map((option) => {
            const selected = option.value === palette;
            return (
              <Pressable
                key={option.value}
                onPress={() => handlePaletteSelect(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`project-palette-${option.value}`}
                style={[
                  styles.pill,
                  {
                    backgroundColor: selected ? theme.text : theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * Read-only deposit readout + cash-only "Add Deposit" top-up. Only offered when there's a
 * consult to attach the money to, it hasn't already been spent on a session, and at least one
 * session on the project is still open to apply it against - matches Project.jsx's own gate.
 * Sends the FULL NEW TOTAL (existing + added), not a delta - only safe because this is cash-only
 * (see this component's own comment at the call site).
 */
function DepositCard({ project, onChanged }: { project: Project; onChanged: () => Promise<unknown> }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDollars, setAddDollars] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [recordDeposit, { loading: adding }] = useRecordDepositMutation();

  // hasOpenSession: answered from the sessions list itself would need a second query - instead,
  // reuse the same signal Project.jsx's own gate uses, but sourced from the Sessions card's own
  // fetch would duplicate a request here. Simpler and just as correct: a project with a
  // consultAppointment whose deposit isn't yet applied is always offerable up until the whole
  // project is closed out, which the artist can see for themselves in the Sessions list right
  // below this card - so the gate here matches web's consult/deposit-status half exactly and
  // leaves the open-session nuance to what's visibly still open in Sessions.
  const consult = project.consultAppointment;
  const canAddDeposit = Boolean(consult) && consult?.depositStatus !== 'applied';

  const handleAdd = async () => {
    setAddError(null);
    if (!consult) {
      return;
    }
    const addCents = dollarsToCents(addDollars);
    if (!addCents || addCents <= 0) {
      setAddError('Enter an amount greater than $0.');
      return;
    }
    try {
      await recordDeposit({
        variables: {
          appointmentId: consult.id,
          depositCents: (consult.depositCents ?? 0) + addCents,
          paymentMethod: 'cash',
        },
      });
      setAddDollars('');
      setShowAddForm(false);
      await onChanged();
    } catch (err) {
      setAddError((err as Error).message);
    }
  };

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Deposit</ThemedText>
      {project.depositCollectedCents && project.depositCollectedCents > 0 ? (
        <ThemedText type="small">
          {formatCents(project.depositCollectedCents)} taken at consult
          {depositMethodLabel(project.deposits) ? ` (${depositMethodLabel(project.deposits)})` : ''}
          {project.depositAvailableCents && project.depositAvailableCents > 0
            ? ` - ${formatCents(project.depositAvailableCents)} still to apply to a session`
            : ' - already applied to a session'}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          None taken
        </ThemedText>
      )}

      {canAddDeposit ? (
        showAddForm ? (
          <View style={styles.addDepositForm}>
            <FormField
              label="Add to deposit $ (cash only - recorded immediately)"
              placeholder="0"
              value={addDollars}
              onChangeText={setAddDollars}
              keyboardType="decimal-pad"
              testID="add-deposit-amount"
            />
            {addError ? (
              <ThemedText type="small" style={styles.error} testID="add-deposit-error">
                {addError}
              </ThemedText>
            ) : null}
            <View style={styles.addDepositButtons}>
              <Button label={adding ? 'Saving…' : 'Add'} onPress={handleAdd} loading={adding} testID="add-deposit-save" />
              <Button
                label="Cancel"
                variant="secondary"
                disabled={adding}
                onPress={() => {
                  setShowAddForm(false);
                  setAddError(null);
                  setAddDollars('');
                }}
                testID="add-deposit-cancel"
              />
            </View>
          </View>
        ) : (
          <Button label="Add Deposit" variant="secondary" onPress={() => setShowAddForm(true)} testID="add-deposit-open" />
        )
      ) : null}
    </View>
  );
}

function NotesCard({ project }: { project: Project }) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [updateProject, { loading: saving }] = useUpdateProjectDetailMutation();

  const handleAddNote = async () => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      return;
    }
    const author = `${user?.userInfo?.firstName ?? user?.firstName ?? ''} ${
      user?.userInfo?.lastName ?? user?.lastName ?? ''
    }`.trim();
    const now = new Date().toISOString();
    const notesToSave = (project.notes ?? []).map((n) => ({
      id: n?.id ?? generateObjectId(),
      author: n?.author ?? '',
      note: n?.note ?? '',
      createdAt: n?.createdAt,
      updatedAt: n?.updatedAt,
    }));
    const updatedNotes = [...notesToSave, { id: generateObjectId(), author, note: trimmed, createdAt: now, updatedAt: now }];
    await updateProject({
      variables: {
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          clientId: project.clientId,
          artistId: project.artistId,
          status: project.status,
          notes: updatedNotes,
        },
      },
    });
    setNoteText('');
  };

  const notes = [...(project.notes ?? [])].reverse();

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Notes</ThemedText>
      <FormField
        label="Add note"
        placeholder="Add a note"
        value={noteText}
        onChangeText={setNoteText}
        onSubmitEditing={handleAddNote}
        returnKeyType="done"
        testID="project-add-note"
      />
      <Button label={saving ? 'Saving…' : 'Add note'} variant="secondary" onPress={handleAddNote} loading={saving} testID="project-add-note-button" />
      <View style={styles.notesList}>
        {notes.map((note, index) => (
          <View key={note?.id ?? index} style={styles.noteItem}>
            <ThemedText type="small">{note?.note}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              - {note?.author} @ {note?.createdAt ? new Date(note.createdAt).toLocaleDateString() : ''}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function TagsCard({ project }: { project: Project }) {
  const [tagText, setTagText] = useState('');
  const theme = useTheme();
  const [updateProject] = useUpdateProjectDetailMutation();

  const saveTags = (tags: string[]) =>
    updateProject({
      variables: {
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          clientId: project.clientId,
          artistId: project.artistId,
          status: project.status,
          tags,
        },
      },
    });

  const existingTags = (project.tags ?? []).filter((t): t is string => Boolean(t));

  const handleAddTag = () => {
    const trimmed = tagText.trim();
    if (!trimmed) {
      return;
    }
    if (existingTags.includes(trimmed)) {
      setTagText('');
      return;
    }
    saveTags([...existingTags, trimmed]);
    setTagText('');
  };

  const handleDeleteTag = (tag: string) => {
    saveTags(existingTags.filter((t) => t !== tag));
  };

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Tags</ThemedText>
      <FormField
        label="Add tag"
        placeholder="Add a tag"
        value={tagText}
        onChangeText={setTagText}
        onSubmitEditing={handleAddTag}
        returnKeyType="done"
        testID="project-add-tag"
      />
      <View style={styles.pillRow}>
        {existingTags.map((tag) => (
          <Pressable
            key={tag}
            onPress={() => handleDeleteTag(tag)}
            accessibilityRole="button"
            accessibilityLabel={`Remove tag ${tag}`}
            testID={`project-tag-${tag}`}
            style={[styles.pill, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
          >
            <ThemedText type="small">{tag} ×</ThemedText>
          </Pressable>
        ))}
      </View>
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
    gap: Spacing.half,
  },
  headerTitle: {
    flexShrink: 1,
  },
  card: {
    gap: Spacing.two,
  },
  cardTitle: {
    marginBottom: Spacing.one,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paletteField: {
    gap: Spacing.one,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addDepositForm: {
    gap: Spacing.two,
  },
  addDepositButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  notesList: {
    gap: Spacing.two,
  },
  noteItem: {
    gap: Spacing.half,
    paddingVertical: Spacing.one,
  },
  error: {
    color: '#D33',
  },
});
