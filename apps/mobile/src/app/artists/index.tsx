import { useGetArtistsListQuery, type GetArtistsListQuery } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ARTIST_STATUS } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatPhone } from '@/utils/phone';
import { isShopAdminOrBetter } from '@/utils/permissions';

type ArtistListItem = GetArtistsListQuery['getArtists']['items'][number];

// The server's own max page size (utils/pagination.js's MAX_LIMIT) - same reasoning as
// clients/index.tsx and projects/index.tsx's own PAGE_SIZE constants.
const PAGE_SIZE = 200;

/**
 * The shop's own team roster - reached from a header link gated to `isStaffOrBetter` (Staff and
 * above; a plain artist has no reason to browse shop-mates - see DECISIONS.md X22 and
 * getArtist/getArtists' own server-side comment on why a peer-artist view was removed entirely
 * once it was noticed that Artist.jsx mounted a shop-mate's revenue panel).
 *
 * "Show archived" toggle is real, not a scope cut - matches web's `Artists.jsx` exactly, since
 * `getArtists(includeArchived)` is a plain boolean the resolver already accepts. **"Add Artist"
 * now exists** (see the parity-accounting entry after X46) - gated `isShopAdminOrBetter`, opening
 * `artist/new.tsx`.
 */
export default function ArtistsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  // "Add Artist" is a shop-admin action on web too - canManageAccounts = role <= ROLES.SHOP_ADMIN
  // (IBPageActionBar.jsx). Closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting.
  const canManageAccounts = isShopAdminOrBetter(user);

  const { data, loading, error, fetchMore, refetch } = useGetArtistsListQuery({
    variables: { includeArchived: showArchived, page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });

  const artists = data?.getArtists.items ?? [];
  const pageInfo = data?.getArtists.pageInfo;

  const toggleArchived = (value: boolean) => {
    setShowArchived(value);
    refetch({ includeArchived: value, page: { limit: PAGE_SIZE, offset: 0 } }).catch(() => {});
  };

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({
      variables: { includeArchived: showArchived, page: { limit: PAGE_SIZE, offset: artists.length } },
    }).catch(() => {
      // Same "nothing on screen is lost, try again" reasoning as clients/index.tsx's own
      // loadMore.
    });
  };

  const openArtist = (artist: ArtistListItem) => {
    router.push({ pathname: '/artist/[id]', params: { id: artist.id } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {canManageAccounts ? (
          <View style={styles.addRow}>
            <Button
              label="Add Artist"
              variant="secondary"
              onPress={() => router.push('/artist/new')}
              testID="artists-add"
            />
          </View>
        ) : null}
        <View style={styles.toggleRow}>
          <ThemedText type="default">Show archived</ThemedText>
          <Switch value={showArchived} onValueChange={toggleArchived} testID="artists-show-archived" />
        </View>

        {loading && artists.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="artists-loading" />
          </View>
        ) : artists.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="artists-empty">
              {error ? 'Could not load your artists.' : 'No artists at this shop yet.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={artists}
            keyExtractor={(artist) => artist.id}
            testID="artists-list"
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            renderItem={({ item }) => {
              const archived = item.status === ARTIST_STATUS.ARCHIVED;
              return (
                <Pressable
                  onPress={() => openArtist(item)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }, archived && styles.rowArchived]}
                  testID={`artist-row-${item.id}`}
                >
                  <Avatar
                    imageUri={item.user?.avatar || item.avatar}
                    firstName={item.firstName}
                    lastName={item.lastName}
                    size={44}
                  />
                  <View style={styles.rowBody}>
                    <ThemedText type="default" numberOfLines={1}>
                      {item.firstName} {item.lastName}
                      {archived ? ' (Archived)' : ''}
                    </ThemedText>
                    {item.title ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {item.title}
                      </ThemedText>
                    ) : null}
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {[item.email, formatPhone(item.phone)].filter(Boolean).join(' · ')}
                    </ThemedText>
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
  addRow: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    alignItems: 'flex-start',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
  rowArchived: {
    opacity: 0.5,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
});
