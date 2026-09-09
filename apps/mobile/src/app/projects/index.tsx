import { useGetProjectsListQuery, type GetProjectsListQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/utils/money';
import { projectStatusLabel } from '@/utils/projectStatus';

type ProjectListItem = GetProjectsListQuery['getProjects']['items'][number];

// The server's own max page size (utils/pagination.js's MAX_LIMIT) - same "fetch the bound most
// shops fit inside in one request" call clients/index.tsx's own PAGE_SIZE already makes.
const PAGE_SIZE = 200;

/**
 * The Projects list - reachable from the header next to Clients/Requests/Messages, giving
 * project/[id].tsx (built in Phase 5 step 8's original PR) a browsable entry point of its own
 * rather than only ever being reached through an appointment tap-through or a booking-request
 * conversion. Rows: artist avatar, title, truncated description, artist · client, status, and
 * deposit collected - same fields as apps/web's Projects.jsx (IBCard-turned-EntityList row),
 * minus web's own broken status label (see utils/projectStatus.ts's own header comment) which
 * this screen renders correctly instead of porting as-is.
 *
 * No search box and no filter row, matching web's own Projects.jsx exactly - there is no
 * server-side search argument on `getProjects` (same gap `utils/clients.ts` already named for
 * `getClients`), and unlike Clients/Booking Requests, web itself doesn't even filter client-side
 * here. No "Add Project" button either, matching web's own `IBPageActionBar` - a project is
 * always spawned by the booking workflow (convertBookingRequest), never created directly, on
 * either platform. Full reasoning: DECISIONS.md X20.
 */
export default function ProjectsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { data, loading, error, fetchMore } = useGetProjectsListQuery({
    variables: { page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });

  const projects = data?.getProjects.items ?? [];
  const pageInfo = data?.getProjects.pageInfo;

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({
      variables: { page: { limit: PAGE_SIZE, offset: projects.length } },
    }).catch(() => {
      // Same "nothing on screen is lost, try again" reasoning as clients/index.tsx's own
      // loadMore.
    });
  };

  const openProject = (project: ProjectListItem) => {
    router.push({ pathname: '/project/[id]', params: { id: project.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {loading && projects.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="projects-loading" />
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="projects-empty">
              {error ? 'Could not load your projects.' : 'No projects yet.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={projects}
            keyExtractor={(project) => project.id}
            testID="projects-list"
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            renderItem={({ item }) => {
              const artistName = item.artist ? `${item.artist.firstName} ${item.artist.lastName}` : '';
              const clientName = item.client ? `${item.client.firstName} ${item.client.lastName}` : '';
              const people = [artistName, clientName].filter(Boolean).join(' · ');
              return (
                <Pressable
                  onPress={() => openProject(item)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                  testID={`project-row-${item.id}`}
                >
                  <Avatar
                    imageUri={item.artist?.avatar}
                    firstName={item.artist?.firstName}
                    lastName={item.artist?.lastName}
                    size={44}
                  />
                  <View style={styles.rowBody}>
                    <ThemedText type="default" numberOfLines={1}>
                      {item.title}
                    </ThemedText>
                    {item.description ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {item.description}
                      </ThemedText>
                    ) : null}
                    {people ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {people}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.rowMeta}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {projectStatusLabel(item.status)}
                    </ThemedText>
                    {item.depositCollectedCents ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatCents(item.depositCollectedCents)}
                      </ThemedText>
                    ) : null}
                  </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
});
