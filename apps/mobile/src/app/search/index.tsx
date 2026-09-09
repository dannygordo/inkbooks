import { useGlobalSearchLazyQuery, type GlobalSearchQuery } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPhone } from '@/utils/phone';
import { projectStatusLabel } from '@/utils/projectStatus';

type SearchResults = GlobalSearchQuery['search'];
type ClientResult = SearchResults['clients'][number];
type ProjectResult = SearchResults['projects'][number];
type MessageResult = SearchResults['messages'][number];
type ImageResult = SearchResults['images'][number];

// Matches web's own Search.jsx exactly - see that page's own comments for why each constant is
// what it is (RESULTS_LIMIT: the dedicated results page asks for more than the app bar's compact
// dropdown default; DEBOUNCE_MS/MIN_QUERY_LENGTH: don't fire a query per keystroke or before
// there's enough to search).
const RESULTS_LIMIT = 25;
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/**
 * Global search - Clients, Projects, Messages, and shared-images-by-tag, grouped by type. No new
 * header-link role gate: `search` applies no authorization beyond the exact same scope filters
 * getClients/getProjects already use (see globalSearch.graphql's own comment), so this link shows
 * to any logged-in artist, same as Clients/Projects. See DECISIONS.md X25.
 *
 * No `?q=` URL param, unlike web - expo-router has no address bar for a shareable/bookmarkable
 * search URL to matter for, so the debounced TextInput is the only input of record.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [inputValue, setInputValue] = useState('');
  const [runSearch, { data, loading, called }] = useGlobalSearchLazyQuery({ fetchPolicy: 'network-only' });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = inputValue.trim();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (trimmed.length < MIN_QUERY_LENGTH) {
      return undefined;
    }

    debounceRef.current = setTimeout(() => {
      runSearch({ variables: { query: trimmed, limit: RESULTS_LIMIT } }).catch(() => {});
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const trimmedQuery = inputValue.trim();
  const results = data?.search;

  const openClient = (client: ClientResult) => {
    router.push({ pathname: '/client/[id]', params: { id: client.id, firstName: client.firstName, lastName: client.lastName } });
  };
  const openProject = (project: ProjectResult) => {
    router.push({ pathname: '/project/[id]', params: { id: project.id } });
  };
  const openMessage = (message: MessageResult) => {
    router.push({ pathname: '/messages/[id]', params: { id: message.conversationId } });
  };
  // SharedImage isn't its own screen on mobile either - a match lands on the client's own detail
  // screen, same as web's dashboard-panel click-through (see globalSearch.graphql's comment).
  const openImage = (image: ImageResult) => {
    router.push({ pathname: '/client/[id]', params: { id: image.clientId } });
  };

  // A capped result set that came back exactly at the cap could be hiding more matches - shown as
  // a hint to narrow the search, matching web's own showsMoreHint exactly.
  const showsMoreHint = (count: number) => count === RESULTS_LIMIT;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.searchRow}>
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Search clients, projects, messages, image tags…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            autoFocus
            testID="search-input"
          />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {trimmedQuery.length < MIN_QUERY_LENGTH ? (
            <ThemedText type="default" themeColor="textSecondary" testID="search-hint">
              Type at least two characters to search.
            </ThemedText>
          ) : null}

          {trimmedQuery.length >= MIN_QUERY_LENGTH && loading && !called ? (
            <ThemedText type="default" themeColor="textSecondary" testID="search-loading">
              Searching…
            </ThemedText>
          ) : null}

          {trimmedQuery.length >= MIN_QUERY_LENGTH && results ? (
            <>
              <ResultSection
                title="Clients"
                testID="search-section-clients"
                emptyMessage="No matching clients."
                showsMoreHint={showsMoreHint(results.clients.length)}
              >
                {results.clients.map((client) => (
                  <Pressable
                    key={client.id}
                    onPress={() => openClient(client)}
                    style={[styles.row, { borderColor: theme.backgroundSelected }]}
                    testID={`search-client-${client.id}`}
                  >
                    <Avatar imageUri={client.avatar} firstName={client.firstName} lastName={client.lastName} size={40} />
                    <View style={styles.rowBody}>
                      <ThemedText type="default" numberOfLines={1}>
                        {client.firstName} {client.lastName}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {[client.email, formatPhone(client.phone)].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ResultSection>

              <ResultSection
                title="Projects"
                testID="search-section-projects"
                emptyMessage="No matching projects."
                showsMoreHint={showsMoreHint(results.projects.length)}
              >
                {results.projects.map((project) => (
                  <Pressable
                    key={project.id}
                    onPress={() => openProject(project)}
                    style={[styles.row, { borderColor: theme.backgroundSelected }]}
                    testID={`search-project-${project.id}`}
                  >
                    <Avatar imageUri={project.artist?.avatar} firstName={project.artist?.firstName} lastName={project.artist?.lastName} size={40} />
                    <View style={styles.rowBody}>
                      <ThemedText type="default" numberOfLines={1}>
                        {project.title}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {project.client ? `${project.client.firstName} ${project.client.lastName} · ` : ''}
                        {projectStatusLabel(project.status)}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ResultSection>

              <ResultSection
                title="Messages"
                testID="search-section-messages"
                emptyMessage="No matching messages."
                showsMoreHint={showsMoreHint(results.messages.length)}
              >
                {results.messages.map((message) => (
                  <Pressable
                    key={message.id}
                    onPress={() => openMessage(message)}
                    style={[styles.row, { borderColor: theme.backgroundSelected }]}
                    testID={`search-message-${message.id}`}
                  >
                    <Avatar imageUri={message.user?.avatar} firstName={message.user?.firstName} lastName={message.user?.lastName} size={40} />
                    <View style={styles.rowBody}>
                      <ThemedText type="default" numberOfLines={1}>
                        {message.user ? `${message.user.firstName} ${message.user.lastName}` : 'Message'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {message.message}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ResultSection>

              <ResultSection
                title="Shared Images"
                testID="search-section-images"
                emptyMessage="No matching image tags."
                showsMoreHint={showsMoreHint(results.images.length)}
              >
                {results.images.map((image) => (
                  <Pressable
                    key={image.id}
                    onPress={() => openImage(image)}
                    style={[styles.row, { borderColor: theme.backgroundSelected }]}
                    testID={`search-image-${image.id}`}
                  >
                    <Avatar imageUri={image.url} size={40} />
                    <View style={styles.rowBody}>
                      <ThemedText type="default" numberOfLines={1}>
                        {image.tags.length ? image.tags.join(', ') : 'Shared image'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {image.assignedProjectId ? 'Filed on a project' : 'Not yet filed'}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
              </ResultSection>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ResultSection({
  title,
  testID,
  emptyMessage,
  showsMoreHint,
  children,
}: {
  title: string;
  testID: string;
  emptyMessage: string;
  showsMoreHint: boolean;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <View style={styles.section} testID={testID}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hasChildren ? (
        children
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {emptyMessage}
        </ThemedText>
      )}
      {showsMoreHint ? (
        <ThemedText type="small" themeColor="textSecondary">
          Showing the top {RESULTS_LIMIT} matches - refine your search to narrow further.
        </ThemedText>
      ) : null}
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
  searchRow: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
