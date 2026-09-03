import {
  useArchiveArtistMutation,
  useGetArtistDetailQuery,
  useUnarchiveArtistMutation,
  useUpdateArtistIdentityMutation,
} from '@inkbooks/api';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArchiveControl } from '@/components/ArchiveControl';
import { Avatar } from '@/components/Avatar';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ARTIST_STATUS, ROLES } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * The shop's management view into one specific artist - identity fields (autosave on blur, same
 * pattern as project/[id].tsx's ProjectDetailsCard) plus Archive/Restore. Reached only from
 * artists/index.tsx (itself gated `isStaffOrBetter`) or an artist's own... there is no "view your
 * own artist page" link on mobile yet, matching the fact that index.tsx's own dashboard is where
 * an artist sees themselves, same split web's own Home.jsx/Artist.jsx keeps.
 *
 * Deliberately NOT ported: ArtistPerformancePanel and ShopCutRatePanel, the two dashboard panels
 * web mounts below the identity card. Both are pieces of Phase 7's still-evolving analytics
 * dashboard (see PRODUCTION_ROADMAP.md's own Phase 7 section, and its long history of follow-up
 * fixes) - a separate, large, real feature, not a natural extension of a directory port. Full
 * reasoning: DECISIONS.md X22.
 */
export default function ArtistDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const theme = useTheme();

  const { data, loading, error, refetch } = useGetArtistDetailQuery({
    variables: { artistId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const artist = data?.getArtist;

  const [archiveArtist, { loading: archiving }] = useArchiveArtistMutation();
  const [unarchiveArtist, { loading: restoring }] = useUnarchiveArtistMutation();

  const handleArchive = () => {
    if (!artist) return;
    archiveArtist({ variables: { artistId: artist.id } })
      .then(() => refetch())
      .catch(() => {});
  };

  const handleRestore = () => {
    if (!artist) return;
    unarchiveArtist({ variables: { artistId: artist.id } })
      .then(() => refetch())
      .catch(() => {});
  };

  if ((loading && !artist) || !id) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="artist-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !artist) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="artist-error">
            {error ? `Couldn't load this artist: ${error.message}` : 'This artist does not exist.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // Real rule is assertCanManageArtist (self, or shop-admin-or-better SHARING A SHOP with them) -
  // same presentation-only simplification apps/web's own Artist.jsx documents for this exact
  // check: the shop-sharing half isn't cheap to know client-side, and updateArtist is the actual
  // gate (a blocked save fails loudly rather than silently).
  const isSelf = String(user?.id) === String(artist.userId);
  const canEditIdentity = isSelf || Boolean(user?.role && user.role <= ROLES.SHOP_ADMIN);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Avatar
              imageUri={artist.user?.avatar || artist.avatar}
              firstName={artist.firstName}
              lastName={artist.lastName}
              size={64}
            />
            <View style={styles.headerInfo}>
              <ThemedText type="subtitle">
                {artist.firstName} {artist.lastName}
              </ThemedText>
              {artist.title ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {artist.title}
                </ThemedText>
              ) : null}
            </View>
          </View>

          <ArchiveControl
            kind="artist"
            name={`${artist.firstName} ${artist.lastName}`}
            isArchived={artist.status === ARTIST_STATUS.ARCHIVED}
            archiving={archiving}
            restoring={restoring}
            onArchive={handleArchive}
            onRestore={handleRestore}
            testID="artist-archive-control"
          />

          <IdentityCard artist={artist} canEdit={canEditIdentity} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type Artist = NonNullable<ReturnType<typeof useGetArtistDetailQuery>['data']>['getArtist'];

function IdentityCard({ artist, canEdit }: { artist: NonNullable<Artist>; canEdit: boolean }) {
  const firstNameRef = useRef(artist.firstName);
  const lastNameRef = useRef(artist.lastName);
  const emailRef = useRef(artist.email);
  const phoneRef = useRef(artist.phone ?? '');
  const titleRef = useRef(artist.title ?? '');
  const addressRef = useRef(artist.address ?? '');
  const cityRef = useRef(artist.city ?? '');
  const stateRef = useRef(artist.state ?? '');
  const zipRef = useRef(artist.zip ?? '');
  const instagramRef = useRef(artist.instagram ?? '');
  const facebookRef = useRef(artist.facebook ?? '');
  const lastSavedRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [updateArtist] = useUpdateArtistIdentityMutation();

  // shopId is deliberately never included - see artists.graphql's own header comment.
  const buildPayload = () => ({
    id: artist.id,
    firstName: firstNameRef.current,
    lastName: lastNameRef.current,
    email: emailRef.current,
    phone: phoneRef.current,
    title: titleRef.current,
    address: addressRef.current,
    city: cityRef.current,
    state: stateRef.current,
    zip: zipRef.current,
    instagram: instagramRef.current,
    facebook: facebookRef.current,
  });

  if (lastSavedRef.current === null) {
    lastSavedRef.current = JSON.stringify(buildPayload());
  }

  const save = async () => {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = serialized;
    setSaveState('saving');
    try {
      await updateArtist({ variables: { artist: payload } });
      setSaveState('saved');
    } catch {
      lastSavedRef.current = null;
      setSaveState('error');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">Details</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="artist-save-state">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All changes saved'}
          {saveState === 'error' && "Couldn't save - try again"}
        </ThemedText>
      </View>
      {!canEdit ? (
        <ThemedText type="small" themeColor="textSecondary">
          Only {artist.firstName || 'this artist'} or a shop admin can edit these details.
        </ThemedText>
      ) : null}

      <FormField
        label="First Name"
        defaultValue={artist.firstName}
        onChangeText={(t) => (firstNameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-first-name"
      />
      <FormField
        label="Last Name"
        defaultValue={artist.lastName}
        onChangeText={(t) => (lastNameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-last-name"
      />
      <FormField
        label="Email"
        defaultValue={artist.email}
        onChangeText={(t) => (emailRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="artist-email"
      />
      <FormField
        label="Phone"
        defaultValue={artist.phone ?? ''}
        onChangeText={(t) => (phoneRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="phone-pad"
        testID="artist-phone"
      />
      <FormField
        label="Title"
        defaultValue={artist.title ?? ''}
        onChangeText={(t) => (titleRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-title"
      />
      <FormField
        label="Address"
        defaultValue={artist.address ?? ''}
        onChangeText={(t) => (addressRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-address"
      />
      <FormField
        label="City"
        defaultValue={artist.city ?? ''}
        onChangeText={(t) => (cityRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-city"
      />
      <FormField
        label="State"
        defaultValue={artist.state ?? ''}
        onChangeText={(t) => (stateRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-state"
      />
      <FormField
        label="Zip"
        defaultValue={artist.zip ?? ''}
        onChangeText={(t) => (zipRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="artist-zip"
      />
      <FormField
        label="Instagram"
        defaultValue={artist.instagram ?? ''}
        onChangeText={(t) => (instagramRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="artist-instagram"
      />
      <FormField
        label="Facebook"
        defaultValue={artist.facebook ?? ''}
        onChangeText={(t) => (facebookRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="artist-facebook"
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerInfo: {
    gap: Spacing.half,
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
