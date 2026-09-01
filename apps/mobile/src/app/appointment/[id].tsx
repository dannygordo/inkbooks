import {
  useDeleteAppointmentMutation,
  useGetAppointmentQuery,
  useUpdateAppointmentMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { DurationPicker } from '@/components/DurationPicker';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { CONSULT_DEFAULT_MINUTES, SESSION_DEFAULT_MINUTES } from '@/utils/duration';

// Same refetch set apps/web's AppointmentService.CALENDAR_REFETCH_QUERIES uses - whichever of the
// two list queries is actually mounted (shop-connected vs independent artist, see index.tsx's own
// comment) picks up the edit/delete on its own; Apollo skips refetching a query that isn't active.
const CALENDAR_REFETCH_QUERIES = ['GetAppointmentsByShop', 'GetAppointmentsByArtist'];

/**
 * The `isPersonal` branch of index.tsx's row tap (mirrors apps/web's AppointmentsList.jsx
 * openAppointment() three-way split - see UpdateEventDialog.jsx, which this screen ports only the
 * isPersonal-relevant subset of: that dialog also handles session/consult editing for other call
 * sites (the drag-to-move calendar view), none of which index.tsx's row tap reaches for a
 * personal entry, so the type/project read-only fields and the Convert-to-Session button never
 * apply here and are left out rather than ported unreachable.
 */
export default function PersonalAppointmentScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();

  const { data, loading } = useGetAppointmentQuery({
    variables: { appointmentId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const appointment = data?.getAppointment;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(new Date());
  const [durationMinutes, setDurationMinutes] = useState(CONSULT_DEFAULT_MINUTES);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seeds the form once, the moment the fetch resolves - the RN equivalent of web's
  // useRef(event.title)/useState(moment(event.appointmentDate)) seeding at mount: RN's controlled
  // TextInput needs useState rather than an uncontrolled ref, so the seed has to happen in an
  // effect instead of at the useState() call itself, guarded so a refetch never stomps in-progress
  // edits.
  useEffect(() => {
    if (appointment && !seeded) {
      setTitle(appointment.title ?? '');
      setDescription(appointment.description ?? '');
      setAppointmentDate(new Date(appointment.appointmentDate));
      setDurationMinutes(
        appointment.durationMinutes ||
          (appointment.appointmentType === 'session' ? SESSION_DEFAULT_MINUTES : CONSULT_DEFAULT_MINUTES),
      );
      setSeeded(true);
    }
  }, [appointment, seeded]);

  const [updateAppointment, { loading: saving }] = useUpdateAppointmentMutation({
    refetchQueries: CALENDAR_REFETCH_QUERIES,
  });
  const [deleteAppointment, { loading: deleting }] = useDeleteAppointmentMutation({
    refetchQueries: CALENDAR_REFETCH_QUERIES,
  });

  const handleSave = () => {
    if (!appointment) {
      return;
    }
    setError('');
    updateAppointment({
      variables: {
        appointmentInput: {
          id: appointment.id,
          projectId: appointment.projectId,
          userId: user?.id,
          // Personal entries never carry a shopId, regardless of the CURRENT user's own shop
          // connection - see apps/web's UpdateEventDialog.jsx header comment: without this
          // short-circuit the server's isPersonal-immutability check (mutations/appointments.js)
          // rejects the save outright rather than silently corrupting it.
          shopId: undefined,
          title,
          description,
          // Echoed back unchanged - this screen doesn't own these fields, same "don't touch what
          // this view doesn't actually edit" reasoning as web's dialog.
          shopCutStatus: appointment.shopCutStatus,
          appointmentStatus: appointment.appointmentStatus,
          appointmentType: appointment.appointmentType,
          createdAt: appointment.createdAt,
          updatedAt: new Date().toISOString(),
          appointmentDate: appointmentDate.toISOString(),
          durationMinutes,
        },
      },
    })
      .then(() => {
        router.back();
      })
      .catch((err: Error) => {
        // Screen stays open on failure so the error is visible - same fix web's own dialog
        // applies (UpdateEventDialog.jsx's handleSubmit .catch comment on the silent-close bug
        // this replaces).
        setError(err.message);
      });
  };

  const handleDelete = () => {
    if (!appointment) {
      return;
    }
    setError('');
    deleteAppointment({ variables: { appointmentId: appointment.id } })
      .then(() => {
        router.back();
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  };

  if (loading && !appointment) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="appointment-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!appointment) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary">Appointment not found.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Owner-only, matching web's `event.userId === user.id` gate exactly - stricter than the
  // row-level canManageAppointment tap-gate that got someone into this screen at all.
  const canDelete = appointment.userId === user?.id;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Personal appointment</ThemedText>

          <View style={styles.readOnlyRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Calendar
            </ThemedText>
            <ThemedText type="small">Personal</ThemedText>
          </View>

          <DateTimeField
            label="Date & time"
            value={appointmentDate}
            onChange={setAppointmentDate}
            testID="appointment-date"
          />
          <DurationPicker minutes={durationMinutes} onChange={setDurationMinutes} testID="appointment-duration" />

          <FormField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Add title"
            testID="appointment-title"
          />
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            testID="appointment-description"
          />

          {error ? (
            <ThemedText type="small" style={styles.error} testID="appointment-error">
              {error}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button label="Save" onPress={handleSave} loading={saving} fullWidth testID="appointment-save" />
            {canDelete ? (
              <Button
                label="Delete"
                variant="danger"
                onPress={handleDelete}
                loading={deleting}
                fullWidth
                testID="appointment-delete"
              />
            ) : null}
          </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
