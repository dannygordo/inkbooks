import { useGetClientsQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { matchesClientSearch, type ClientListItem } from '@/utils/clients';
import { formatPhone } from '@/utils/phone';

// The server's own max page size (utils/pagination.js's MAX_LIMIT) - the same "a bounded window
// comfortably covers the common case" call index.tsx's own PAGE constant makes for a week of
// appointments, applied here to a shop's client count instead. "Load more" below covers the shops
// that actually exceed it.
const PAGE_SIZE = 200;

/**
 * The client roster - reachable from the header next to Messages/Settings/Log out. Scoped well
 * below apps/web's Clients.jsx on purpose: no create-client action (`IBPageActionBar`), no
 * archive/"Show archived" toggle, and no server-side name search - `getClients` itself takes no
 * search argument (see server/graphql/typeDefs.js), so this only filters whatever's already been
 * paged in, not the shop's whole roster at once. Full reasoning: DECISIONS.md X17.
 *
 * Tapping a row reaches the SAME `client/[id].tsx` screen X15 built (shared-images panel) - the
 * second real entry point that screen's own header comment said was worth revisiting for. Name is
 * passed as a route param again, this time straight from this screen's own already-fetched row,
 * for the same "don't re-fetch a name the caller already has" reasoning as project/[id].tsx's own
 * "View Client" link.
 */
export default function ClientsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data, loading, error, fetchMore } = useGetClientsQuery({
    variables: { page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });

  const clients = data?.getClients.items ?? [];
  const pageInfo = data?.getClients.pageInfo;

  const visibleClients = useMemo(
    () => clients.filter((client) => matchesClientSearch(client, search)),
    [clients, search],
  );

  const openClient = (client: ClientListItem) => {
    router.push({
      pathname: '/client/[id]',
      params: { id: client.id, firstName: client.firstName, lastName: client.lastName },
    });
  };

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({
      variables: { page: { limit: PAGE_SIZE, offset: clients.length } },
    }).catch(() => {
      // A failed page fetch just means "Load more" can be tried again - nothing already on
      // screen is lost, so there's nothing to roll back.
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search clients"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            testID="clients-search-input"
          />
        </View>

        {loading && clients.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="clients-loading" />
          </View>
        ) : visibleClients.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="clients-empty">
              {error
                ? 'Could not load your clients.'
                : search.trim()
                  ? 'No clients match that search.'
                  : 'No clients yet.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={visibleClients}
            keyExtractor={(client) => client.id}
            testID="clients-list"
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openClient(item)}
                style={[styles.row, { borderColor: theme.backgroundSelected }]}
                testID={`client-row-${item.id}`}
              >
                <Avatar imageUri={item.avatar} firstName={item.firstName} lastName={item.lastName} size={44} />
                <View style={styles.rowBody}>
                  <ThemedText type="default" numberOfLines={1}>
                    {item.firstName} {item.lastName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {formatPhone(item.phone) || item.email}
                  </ThemedText>
                </View>
              </Pressable>
            )}
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
  },
});
