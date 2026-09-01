import {
  useGetAppointmentsByProjectQuery,
  useGetArtistShopConnectionsQuery,
  useGetProjectDetailQuery,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionDetailForm } from '@/components/SessionDetailForm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The route ProjectSessionsList.tsx's row tap pushes to. Web opens SessionDetail in a global
 * modal, handed `appointment`/`project`/`connections` straight as props from ProjectSessionsList
 * (which already had all three in hand); this is a real stack screen instead, so it re-fetches
 * the same three things by id/projectId - the project (for artist/shop billing info -
 * GetProjectDetail already carries it, see that operation's own comment), the artist's shop
 * connections (for rateSource), and the project's session list, from which this screen picks out
 * the one appointment it's for. That list query is deliberately reused rather than a narrower
 * single-appointment fetch - see appointmentsByProject.graphql's own comment: "this same query
 * result seeds the modal it opens," true here as much as it was on web.
 */
export default function SessionDetailScreen() {
  const params = useLocalSearchParams<{ id: string; projectId: string }>();
  const id = firstParam(params.id);
  const projectId = firstParam(params.projectId);
  const router = useRouter();
  const theme = useTheme();

  const { data: projectData, loading: projectLoading, error: projectError } = useGetProjectDetailQuery({
    variables: { projectId: projectId ?? '' },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  });
  const project = projectData?.getProject;

  const { data: connectionsData } = useGetArtistShopConnectionsQuery({
    variables: { artistId: project?.artistId ?? '' },
    skip: !project?.artistId,
  });
  const connections = (connectionsData?.getArtistShopConnections ?? []).filter((c): c is NonNullable<typeof c> =>
    Boolean(c),
  );

  const {
    data: sessionsData,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useGetAppointmentsByProjectQuery({
    variables: { projectId: projectId ?? '' },
    skip: !projectId,
    fetchPolicy: 'cache-and-network',
  });
  const appointment = sessionsData?.getAppointmentsByProject?.find((a) => a?.id === id);

  const loading = (projectLoading && !project) || (sessionsLoading && !appointment);
  const error = projectError || sessionsError;

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="session-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !project || !appointment) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary">
            {error ? `Couldn't load this session: ${error.message}` : 'Session not found.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <SessionDetailForm
          appointment={appointment}
          project={project}
          connections={connections}
          refetchSessions={refetchSessions}
          onClosed={() => router.back()}
          onDeleted={() => router.back()}
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
});
