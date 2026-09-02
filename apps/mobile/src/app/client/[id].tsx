import { useGetSharedImagesForClientQuery } from '@inkbooks/api';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SharedImagesGallery } from '@/components/SharedImagesGallery';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * First mobile slice of apps/web's ClientDashboard.jsx - the artist-viewing-a-client case only
 * (ClientDashboard's isSelf=true mode, a CLIENT viewing their own record, needs a client login
 * mode mobile doesn't have at all - out of scope by construction, not a cut). Scoped to exactly
 * what's needed to host the shared-images panel meaningfully: a name header and the images grid.
 * Stats, Projects, Appointments, Notes, Flags, Forms, and the contact-info edit form
 * (`pages/clients/Client.jsx`) are all separate, independently portable slices - none of them are
 * needed to show shared images, so none are here yet. Full reasoning: DECISIONS.md X15.
 *
 * Reached from project/[id].tsx's "View Client" link, which already has clientId/firstName/
 * lastName off GetProjectDetail's existing selection - passed as route params rather than
 * re-fetched, since a name this screen already has for free needs no second query. The images
 * grid is the one thing that DOES need its own query (getSharedImagesForClient) - see
 * sharedImages.graphql's own header comment on why this can't reuse GetProjectDetail's data.
 */
export default function ClientDetailScreen() {
  const params = useLocalSearchParams<{ id: string; firstName?: string; lastName?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const theme = useTheme();

  const { data, loading, error } = useGetSharedImagesForClientQuery({
    variables: { clientId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });

  const name = [params.firstName, params.lastName].filter(Boolean).join(' ') || 'Client';
  const images = data?.getSharedImagesForClient ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{name}</ThemedText>

          <View style={styles.card}>
            <ThemedText type="smallBold">Shared Images</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Every image shared with you in messages with {name}.
            </ThemedText>
            {loading && images.length === 0 ? (
              <ActivityIndicator color={theme.text} testID="shared-images-loading" />
            ) : error ? (
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
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
});
