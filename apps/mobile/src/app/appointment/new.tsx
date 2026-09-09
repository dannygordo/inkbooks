import {
  useConvertBookingRequestMutation,
  useCreateAppointmentMutation,
  useCreateBookingRequestMutation,
  useFindClientByEmailLazyQuery,
  useGetProjectsByArtistQuery,
} from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { DurationPicker } from '@/components/DurationPicker';
import { FormField } from '@/components/FormField';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { CONSULT_DEFAULT_MINUTES, SESSION_DEFAULT_MINUTES } from '@/utils/duration';
import { getUserShopId } from '@/utils/user';

// Same refetch set apps/web's AppointmentService.CALENDAR_REFETCH_QUERIES uses, and the same
// plain-name-list copy BookSessionDatesForm.tsx and appointment/[id].tsx already each carry - see
// either of their own header comments for why this is a name list rather than an imported
// document array.
const CALENDAR_REFETCH_QUERIES = ['GetAppointmentsByShop', 'GetAppointmentsByArtist'];

type Step =
  | 'type'
  | 'personal-form'
  | 'client-email'
  | 'intake-details'
  | 'datetime'
  | 'session-project'
  | 'session-existing-datetime';

type AppointmentType = 'consult' | 'session' | null;

/**
 * "New Appointment" - closes gap #1 of HANDOFF.md's 2026-09-04 parity accounting ("No way to
 * create a brand-new appointment or consult from mobile"), the appointment/consult half of
 * Danny's picked priority whose client/artist/staff half X47 already closed. Direct, faithful
 * port of apps/web's `AppointmentWizard.jsx` as ONE component with the same internal step machine
 * - `step`/`type`/`calendarChoice` state and the same seven step names - rather than split across
 * several expo-router routes, because the steps here are a real sequential decision tree with
 * back/forward navigation and branching (unlike `client/new.tsx`'s two EntityWizard sections,
 * which were never an enforced sequence). Reached from a new "New" link on `app/index.tsx`'s
 * header, open to any artist - matches web's `CreateEventButton.jsx` having no role gate at all.
 *
 * THREE PIPELINES, MATCHING WEB'S OWN THREE EXACTLY (see AppointmentWizard.jsx's own header
 * comment for the full reasoning behind each):
 *  - Personal: flat title/description/date form, calls `createAppointment` directly with
 *    `isPersonal: true` and no shopId/projectId. Skips the whole client-intake pipeline on
 *    purpose - a private calendar entry isn't a booking and forcing it through machinery that
 *    creates real Clients/Projects/confirmation-emails would create records that don't belong to
 *    any real work.
 *  - Consult, and a brand-new-project Session: share one pipeline end to end (client-email step
 *    -> intake-details step -> date/time -> `createBookingRequest` -> `convertBookingRequest`).
 *    The only differences are the `outcome` and that Session also collects a Project title -
 *    `convertBookingRequest` auto-creates the Project from that same intake data for
 *    `session_booked` (server/graphql/mutations/bookingRequests.js).
 *  - Session on an EXISTING project: no client step needed (the project already has one) - pick a
 *    project, then date/time, then a direct `createAppointment`.
 *
 * EMAIL-LOOKUP CLIENT STEP, NOT A CLIENT PICKER - same reasoning as web's own comment on why the
 * old radio-button existing/new-client picker was replaced: type an email, and a server lookup
 * (`findClientByEmail` - NOT a scan of an already-fetched, possibly-paged client list, since a
 * miss here is not cosmetic; see `clients.graphql`'s own comment on this query) either surfaces a
 * known client's name/phone read-only, or reveals name/phone fields to collect a new one. Either
 * way the same fields end up in `createBookingRequest`'s input - the server's own
 * `findOrCreateGuestClient` does the actual find-or-create by email, so this step is a client-side
 * convenience (autofill on match), not new server logic.
 *
 * NO GLOBAL SUCCESS/ERROR ALERT, UNLIKE WEB - web raises a global `setAlert` on top of its own
 * inline error line specifically because a small red line inside a modal that might be mid-scroll
 * is easy to miss (see AppointmentWizard.jsx's own header comment on the real bug report that
 * caused this). Mobile has no global alert/toast/snackbar system anywhere in this app - every
 * other create/save flow on mobile (client/new.tsx's error banner, `appointment/[id].tsx`'s own
 * `handleSave`) already relies on the same on-screen inline error plus an immediate `router.back()`
 * on success, so this follows that existing convention rather than inventing a new one.
 *
 * PROJECT PICKER: `PillRow`, not a ported `IBProjectsByArtistSelect` (MUI `Select` with avatar +
 * title + description rows) - same "no cross-platform `<select>` primitive, use the pill row"
 * precedent every other web `<select>` port on this app has followed since `DurationPicker.tsx`.
 * Each pill's label is `"<client first> <client last> - <project title>"` - the client name is
 * what actually distinguishes projects in a list where titles alone can repeat ("Sleeve piece"),
 * matching the two fields `IBProjectsByArtistSelect` shows most prominently (avatar aside, which
 * has no pill-row equivalent).
 */
export default function NewAppointmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const shopId = getUserShopId(user);

  const [calendarChoice, setCalendarChoice] = useState<'shop' | 'personal'>('shop');
  const [type, setType] = useState<AppointmentType>(null);
  const [step, setStep] = useState<Step>('type');
  // LOCAL wall-clock Date, not a UTC one - the picker works in the viewer's own zone and
  // `toISOString()` converts at submit time, same "the appointment is an INSTANT" reasoning as
  // web's own `moment(selectedDay)` (not `.utc()`).
  const [startDateTime, setStartDateTime] = useState(() => new Date());
  const [durationMinutes, setDurationMinutes] = useState(CONSULT_DEFAULT_MINUTES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [personalTitle, setPersonalTitle] = useState('');
  const [personalDescription, setPersonalDescription] = useState('');

  const [clientEmail, setClientEmail] = useState('');
  const [clientFirstName, setClientFirstName] = useState('');
  const [clientLastName, setClientLastName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const [intakeDescription, setIntakeDescription] = useState('');
  const [intakePlacement, setIntakePlacement] = useState('');
  const [intakeSize, setIntakeSize] = useState('');
  const [intakeBudget, setIntakeBudget] = useState('');
  const [isCoverUp, setIsCoverUp] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');

  const [projectMode, setProjectMode] = useState<'existing' | 'new'>('existing');
  const [existingProjectId, setExistingProjectId] = useState('');

  const { data: projectsData, loading: projectsLoading } = useGetProjectsByArtistQuery({
    variables: { artistId: user?.id ?? '' },
    skip: !user?.id,
  });

  const [createAppointment] = useCreateAppointmentMutation();
  const [createBookingRequest] = useCreateBookingRequestMutation();
  const [convertBookingRequest] = useConvertBookingRequestMutation();

  const normalizedEmail = clientEmail.trim().toLowerCase();
  const [findClientByEmail, { data: matchData }] = useFindClientByEmailLazyQuery();

  useEffect(() => {
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return undefined;
    }
    const timer = setTimeout(() => {
      findClientByEmail({ variables: { email: normalizedEmail } });
    }, 350);
    return () => clearTimeout(timer);
  }, [normalizedEmail, findClientByEmail]);

  // Guarded against a stale response - the query is debounced and asynchronous, so a result for a
  // previously-typed address can land after the field has moved on.
  const matchedClient = useMemo(() => {
    const found = matchData?.findClientByEmail;
    if (!found) {
      return null;
    }
    return (found.email || '').trim().toLowerCase() === normalizedEmail ? found : null;
  }, [matchData, normalizedEmail]);

  const projectOptions = useMemo(
    () =>
      (projectsData?.getProjectsByArtist ?? [])
        .filter((project): project is NonNullable<typeof project> => Boolean(project))
        .map((project) => ({
          id: project.id,
          label: `${project.client?.user?.firstName ?? ''} ${project.client?.user?.lastName ?? ''} - ${project.title}`,
        })),
    [projectsData],
  );

  const handleTypeSelect = (selectedType: 'consult' | 'session') => {
    setType(selectedType);
    setError(null);
    setDurationMinutes(selectedType === 'session' ? SESSION_DEFAULT_MINUTES : CONSULT_DEFAULT_MINUTES);
    setStep(selectedType === 'consult' ? 'client-email' : 'session-project');
  };

  const handleContinuePersonal = () => {
    setError(null);
    setStep('personal-form');
  };

  const handleSubmitPersonal = async () => {
    if (!personalTitle.trim()) {
      setError('Give it a title first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await createAppointment({
        variables: {
          appointmentInput: {
            userId: user?.id,
            // Deliberately NO shopId and NO projectId - the server rejects a personal appointment
            // carrying either (see mutations/appointments.js).
            isPersonal: true,
            title: personalTitle.trim(),
            description: personalDescription.trim(),
            shopCutStatus: 'none',
            appointmentStatus: 'scheduled',
            appointmentType: 'other',
            createdAt: now,
            updatedAt: now,
            appointmentDate: startDateTime.toISOString(),
            durationMinutes,
          },
        },
        refetchQueries: CALENDAR_REFETCH_QUERIES,
      });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Shared by Consult and a brand-new-project Session - see this file's own header comment.
  const handleSubmitIntake = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const createRes = await createBookingRequest({
        variables: {
          bookingRequestInput: {
            artistId: user?.id ?? '',
            firstName: clientFirstName.trim(),
            lastName: clientLastName.trim(),
            email: clientEmail.trim(),
            phone: clientPhone.trim() || undefined,
            description: intakeDescription.trim(),
            placement: intakePlacement.trim() || undefined,
            size: intakeSize.trim() || undefined,
            budget: intakeBudget.trim() || undefined,
            isCoverUp,
            // Tagged so the Booking Requests inbox (getBookingRequests) excludes it - this is the
            // artist scheduling their own consult/session directly, never a real inbound
            // submission waiting on a reply. See bookingRequests.graphql's own comment.
            source: 'artist_created',
          },
        },
      });
      const bookingRequestId = createRes.data?.createBookingRequest.id;
      if (!bookingRequestId) {
        throw new Error('Could not create the booking request.');
      }
      await convertBookingRequest({
        variables: {
          bookingRequestId,
          outcome: type === 'session' ? 'session_booked' : 'consult_booked',
          projectTitle: type === 'session' ? projectTitle.trim() : undefined,
          appointmentInput: {
            appointmentDate: startDateTime.toISOString(),
            durationMinutes,
            shopCutStatus: 'unpaid',
            appointmentStatus: 'scheduled',
          },
        },
        refetchQueries: CALENDAR_REFETCH_QUERIES,
      });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Session, existing-project path only - unchanged direct createAppointment (the project already
  // has a client, so no client/intake step is needed at all).
  const handleSubmitExistingProjectSession = async () => {
    if (!existingProjectId) {
      setError('Pick a project first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      // Borrowed from the already-picked Project, same fix for the same underlying bug web's own
      // comment names: this Appointment has no BookingRequest to derive a title from, and an
      // untitled Appointment renders as the literal text "null" on web's own Day.jsx.
      const selectedProject = (projectsData?.getProjectsByArtist ?? []).find(
        (p) => p?.id === existingProjectId,
      );
      await createAppointment({
        variables: {
          appointmentInput: {
            projectId: existingProjectId,
            userId: user?.id,
            shopId,
            title: selectedProject?.title,
            shopCutStatus: 'unpaid',
            appointmentStatus: 'scheduled',
            appointmentType: 'session',
            createdAt: now,
            updatedAt: now,
            appointmentDate: startDateTime.toISOString(),
            durationMinutes,
          },
        },
        refetchQueries: CALENDAR_REFETCH_QUERIES,
      });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClientEmailNext = () => {
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Enter a valid client email first.');
      return;
    }
    if (!matchedClient && (!clientFirstName.trim() || !clientLastName.trim())) {
      setError('First and last name are required for a new client.');
      return;
    }
    if (matchedClient) {
      setClientFirstName(matchedClient.firstName);
      setClientLastName(matchedClient.lastName);
      setClientPhone(matchedClient.phone || '');
    }
    setError(null);
    setStep('intake-details');
  };

  const handleIntakeNext = () => {
    if (!intakeDescription.trim()) {
      setError('Describe the idea first.');
      return;
    }
    if (type === 'session' && !projectTitle.trim()) {
      setError('A project title is required for a session.');
      return;
    }
    setError(null);
    setStep('datetime');
  };

  const handleSessionProjectNext = () => {
    if (projectMode === 'existing') {
      if (!existingProjectId) {
        setError('Pick a project first.');
        return;
      }
      setError(null);
      setStep('session-existing-datetime');
    } else {
      setError(null);
      setStep('client-email');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'type' ? (
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary">
                Calendar
              </ThemedText>
              <PillRow
                options={[
                  { id: 'shop', label: 'Shop' },
                  { id: 'personal', label: 'Personal' },
                ]}
                selectedId={calendarChoice}
                onSelect={(id) => setCalendarChoice(id as 'shop' | 'personal')}
                testID="new-appointment-calendar"
              />
              {calendarChoice === 'personal' ? (
                <Button
                  label="Continue"
                  onPress={handleContinuePersonal}
                  testID="new-appointment-personal-continue"
                />
              ) : (
                <>
                  <ThemedText type="default">What are you scheduling?</ThemedText>
                  <View style={styles.typeButtons}>
                    <Button
                      label="Consult"
                      onPress={() => handleTypeSelect('consult')}
                      testID="new-appointment-type-consult"
                    />
                    <Button
                      label="Session"
                      onPress={() => handleTypeSelect('session')}
                      testID="new-appointment-type-session"
                    />
                  </View>
                </>
              )}
            </View>
          ) : null}

          {step === 'personal-form' ? (
            <View style={styles.section}>
              <DateTimeField
                label="Date & time"
                value={startDateTime}
                onChange={setStartDateTime}
                testID="new-appointment-datetime"
              />
              <DurationPicker
                minutes={durationMinutes}
                onChange={setDurationMinutes}
                testID="new-appointment-duration"
              />
              <FormField
                label="Title"
                value={personalTitle}
                onChangeText={setPersonalTitle}
                placeholder="e.g. Dentist appointment"
                testID="new-appointment-personal-title"
              />
              <FormField
                label="Description"
                value={personalDescription}
                onChangeText={setPersonalDescription}
                multiline
                testID="new-appointment-personal-description"
              />
              {error ? (
                <ThemedText type="small" style={styles.error} testID="new-appointment-error">
                  {error}
                </ThemedText>
              ) : null}
              <View style={styles.actions}>
                <Button label="Back" variant="secondary" onPress={() => setStep('type')} testID="new-appointment-back" />
                <Button
                  label="Save"
                  onPress={handleSubmitPersonal}
                  loading={submitting}
                  testID="new-appointment-save"
                />
              </View>
            </View>
          ) : null}

          {step === 'client-email' ? (
            <View style={styles.section}>
              <FormField
                label="Client email"
                value={clientEmail}
                onChangeText={setClientEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="jon.snow@example.com"
                testID="new-appointment-client-email"
              />
              {matchedClient ? (
                <View style={styles.matchCard}>
                  <ThemedText type="default" testID="new-appointment-client-match">
                    Found: {matchedClient.firstName} {matchedClient.lastName}
                    {matchedClient.phone ? ` - ${matchedClient.phone}` : ''}
                  </ThemedText>
                  <Button
                    label="Not them? Clear"
                    variant="secondary"
                    onPress={() => setClientEmail('')}
                    testID="new-appointment-client-clear"
                  />
                </View>
              ) : normalizedEmail ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    No existing client found for this email - enter their details to create one.
                  </ThemedText>
                  <FormField
                    label="First name"
                    value={clientFirstName}
                    onChangeText={setClientFirstName}
                    testID="new-appointment-client-first-name"
                  />
                  <FormField
                    label="Last name"
                    value={clientLastName}
                    onChangeText={setClientLastName}
                    testID="new-appointment-client-last-name"
                  />
                  <FormField
                    label="Phone (optional)"
                    value={clientPhone}
                    onChangeText={setClientPhone}
                    keyboardType="phone-pad"
                    testID="new-appointment-client-phone"
                  />
                </>
              ) : null}
              {error ? (
                <ThemedText type="small" style={styles.error} testID="new-appointment-error">
                  {error}
                </ThemedText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => setStep(type === 'session' ? 'session-project' : 'type')}
                  testID="new-appointment-back"
                />
                <Button label="Next" onPress={handleClientEmailNext} testID="new-appointment-next" />
              </View>
            </View>
          ) : null}

          {step === 'intake-details' ? (
            <View style={styles.section}>
              {type === 'session' ? (
                <FormField
                  label="Project title"
                  value={projectTitle}
                  onChangeText={setProjectTitle}
                  testID="new-appointment-project-title"
                />
              ) : null}
              <FormField
                label="What's the idea? (required)"
                value={intakeDescription}
                onChangeText={setIntakeDescription}
                multiline
                testID="new-appointment-intake-description"
              />
              <FormField
                label="Placement"
                value={intakePlacement}
                onChangeText={setIntakePlacement}
                testID="new-appointment-intake-placement"
              />
              <FormField
                label="Size"
                value={intakeSize}
                onChangeText={setIntakeSize}
                testID="new-appointment-intake-size"
              />
              <FormField
                label="Budget"
                value={intakeBudget}
                onChangeText={setIntakeBudget}
                testID="new-appointment-intake-budget"
              />
              <View style={styles.switchRow}>
                <ThemedText type="default">Cover-up / touch-up</ThemedText>
                <Switch value={isCoverUp} onValueChange={setIsCoverUp} testID="new-appointment-cover-up" />
              </View>
              {error ? (
                <ThemedText type="small" style={styles.error} testID="new-appointment-error">
                  {error}
                </ThemedText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => setStep('client-email')}
                  testID="new-appointment-back"
                />
                <Button label="Next" onPress={handleIntakeNext} testID="new-appointment-next" />
              </View>
            </View>
          ) : null}

          {step === 'datetime' ? (
            <View style={styles.section}>
              <DateTimeField
                label="Date & time"
                value={startDateTime}
                onChange={setStartDateTime}
                testID="new-appointment-datetime"
              />
              <DurationPicker
                minutes={durationMinutes}
                onChange={setDurationMinutes}
                testID="new-appointment-duration"
              />
              {error ? (
                <ThemedText type="small" style={styles.error} testID="new-appointment-error">
                  {error}
                </ThemedText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => setStep('intake-details')}
                  testID="new-appointment-back"
                />
                <Button
                  label="Save"
                  onPress={handleSubmitIntake}
                  loading={submitting}
                  testID="new-appointment-save"
                />
              </View>
            </View>
          ) : null}

          {step === 'session-project' ? (
            <View style={styles.section}>
              <PillRow
                options={[
                  { id: 'existing', label: 'Existing project' },
                  { id: 'new', label: 'New project' },
                ]}
                selectedId={projectMode}
                onSelect={(id) => setProjectMode(id as 'existing' | 'new')}
                testID="new-appointment-project-mode"
              />
              {projectMode === 'existing' ? (
                projectsLoading ? (
                  <ActivityIndicator testID="new-appointment-projects-loading" />
                ) : projectOptions.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" testID="new-appointment-projects-empty">
                    No active projects yet.
                  </ThemedText>
                ) : (
                  <PillRow
                    options={projectOptions}
                    selectedId={existingProjectId}
                    onSelect={setExistingProjectId}
                    testID="new-appointment-project-picker"
                  />
                )
              ) : null}
              {error ? (
                <ThemedText type="small" style={styles.error} testID="new-appointment-error">
                  {error}
                </ThemedText>
              ) : null}
              <View style={styles.actions}>
                <Button label="Back" variant="secondary" onPress={() => setStep('type')} testID="new-appointment-back" />
                <Button label="Next" onPress={handleSessionProjectNext} testID="new-appointment-next" />
              </View>
            </View>
          ) : null}

          {step === 'session-existing-datetime' ? (
            <View style={styles.section}>
              <DateTimeField
                label="Date & time"
                value={startDateTime}
                onChange={setStartDateTime}
                testID="new-appointment-datetime"
              />
              <DurationPicker
                minutes={durationMinutes}
                onChange={setDurationMinutes}
                testID="new-appointment-duration"
              />
              {error ? (
                <ThemedText type="small" style={styles.error} testID="new-appointment-error">
                  {error}
                </ThemedText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => setStep('session-project')}
                  testID="new-appointment-back"
                />
                <Button
                  label="Save"
                  onPress={handleSubmitExistingProjectSession}
                  loading={submitting}
                  testID="new-appointment-save"
                />
              </View>
            </View>
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
  },
  section: {
    gap: Spacing.three,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  matchCard: {
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  error: {
    color: '#D33',
  },
});
