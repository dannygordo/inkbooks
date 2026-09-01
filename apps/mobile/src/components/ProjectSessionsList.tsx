import type { GetProjectDetailQuery } from '@inkbooks/api';
import { useCreateAppointmentMutation, useGetAppointmentsByProjectQuery } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { DurationPicker } from '@/components/DurationPicker';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SESSION_DEFAULT_MINUTES } from '@/utils/duration';
import { formatCents } from '@/utils/money';

type Project = NonNullable<GetProjectDetailQuery['getProject']>;

/**
 * Direct port of apps/web's ProjectSessionsList.jsx - every session-type appointment tied to this
 * project, oldest first, with "Add Session" to schedule another directly against it. Tapping a
 * row navigates to the Session Detail screen (task #36's route) instead of web's global-modal
 * open - same data, different navigation shell.
 */
export function ProjectSessionsList({ project }: { project: Project }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, loading, refetch } = useGetAppointmentsByProjectQuery({
    variables: { projectId: project.id },
    fetchPolicy: 'cache-and-network',
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date());
  const [durationMinutes, setDurationMinutes] = useState(SESSION_DEFAULT_MINUTES);
  const [addError, setAddError] = useState<string | null>(null);
  const [createAppointment, { loading: adding }] = useCreateAppointmentMutation();

  const handleAddSession = async () => {
    setAddError(null);
    try {
      const now = new Date().toISOString();
      // shopId/userId come from the PROJECT'S artist, not the viewer - a shop admin adding a
      // session to another artist's project needs THAT artist's own shop, same as web's own
      // comment on this exact line.
      await createAppointment({
        variables: {
          appointmentInput: {
            projectId: project.id,
            userId: project.artistId,
            shopId: project.artist?.shop?.id,
            title: project.title,
            appointmentType: 'session',
            shopCutStatus: project.artist?.shop?.id ? 'unpaid' : 'none',
            appointmentStatus: 'scheduled',
            createdAt: now,
            updatedAt: now,
            appointmentDate: newSessionDate.toISOString(),
            durationMinutes,
          },
        },
      });
      setShowAddForm(false);
      refetch();
    } catch (err) {
      setAddError((err as Error).message);
    }
  };

  const sessions = (data?.getAppointmentsByProject ?? [])
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());

  return (
    <View style={styles.container}>
      {loading && sessions.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Loading sessions…
        </ThemedText>
      ) : sessions.length === 0 && !showAddForm ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sessions yet.
        </ThemedText>
      ) : null}

      {sessions.map((session) => (
        <Pressable
          key={session.id}
          onPress={() =>
            router.push({ pathname: '/session/[id]', params: { id: session.id, projectId: project.id } })
          }
          style={[styles.row, { borderColor: theme.backgroundSelected }]}
          testID={`session-row-${session.id}`}
        >
          <ThemedText type="default">
            {new Date(session.appointmentDate).toLocaleString(undefined, {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {session.appointmentStatus === 'completed' ? 'Completed' : 'Open'}
            {session.totalCents ? ` · ${formatCents(session.totalCents)}` : ''}
            {session.tipCents ? ` (incl. ${formatCents(session.tipCents)} tip)` : ''}
          </ThemedText>
        </Pressable>
      ))}

      {showAddForm ? (
        <View style={styles.addForm}>
          <DateTimeField label="Session date & time" value={newSessionDate} onChange={setNewSessionDate} testID="add-session-date" />
          <DurationPicker minutes={durationMinutes} onChange={setDurationMinutes} testID="add-session-duration" />
          {addError ? (
            <ThemedText type="small" style={styles.error} testID="add-session-error">
              {addError}
            </ThemedText>
          ) : null}
          <View style={styles.addFormButtons}>
            <Button label={adding ? 'Saving…' : 'Save'} onPress={handleAddSession} loading={adding} testID="add-session-save" />
            <Button label="Cancel" variant="secondary" onPress={() => setShowAddForm(false)} disabled={adding} testID="add-session-cancel" />
          </View>
        </View>
      ) : (
        <Button
          label="Add Session"
          variant="secondary"
          onPress={() => {
            setNewSessionDate(new Date());
            setShowAddForm(true);
          }}
          testID="add-session-open"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.half,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addForm: {
    gap: Spacing.three,
  },
  addFormButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
