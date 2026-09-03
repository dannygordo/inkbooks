import type { ApolloError } from '@apollo/client';
import {
  useGetMyBookingSlugQuery,
  useGetMyFormLinksQuery,
  useUpdateMyBookingSlugMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * Settings > Forms > Your link. Direct port of apps/web's FormsPanel.jsx's "Your link" half - the
 * artist's own handle (Artist.bookingSlug), which is the <ownerHandle> half of EVERY form's
 * public URL (/<formSlug>/<ownerHandle>), booking_request included, not just a booking-specific
 * link. See DECISIONS.md X42.
 *
 * "MANAGE FORMS" NOT REBUILT HERE - web's FormsPanel bundles both halves in one category, but
 * mobile's own home screen already has a direct "Forms" button to forms/index.tsx (X28/X30), so
 * adding a second on-ramp inside Settings would just be a redundant path to the same screen.
 *
 * NO LIVE AVAILABILITY CHECK, UNLIKE WEB'S BookingSlugField - that debounced
 * checkBookingSlugAvailable call is its own header comment's own word for it: "a COURTESY... The
 * server re-validates on write and the unique index... is the actual guarantee." Cutting the
 * courtesy doesn't cut the guarantee - saving a taken handle here still fails, with the same
 * "That booking link is already taken." message the server returns (see
 * server/graphql/mutations/artists.js's updateMyBookingSlug), just discovered on Save rather than
 * while typing. Building a debounced, race-guarded live check (this app's first) for one field
 * felt like real, separate scope rather than folding it in silently.
 *
 * GraphQL FIELD ERRORS ACTUALLY MATTER HERE, unlike most of this port's save handlers -
 * updateMyBookingSlug throws UserInputError('Errors', { errors: { bookingSlug: '...' } }) on a
 * collision, so the top-level err.message is the literal, useless word "Errors"; the real message
 * lives in err.graphQLErrors[0].extensions.errors.bookingSlug, same place web's own handleSave
 * reads it from. Read that first, falling back to err.message only when it's absent.
 *
 * NO ORIGIN TO BUILD A FULL URL FROM, same "no window.location.origin equivalent" reasoning as
 * forms/index.tsx and settings/shop.tsx (X28/X30/X36) - the booking-link preview and the per-form
 * links list both show relative paths only.
 */
export default function YourLinkScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const artistUserInfoId = user?.userInfo?.__typename === 'Artist' ? user.userInfo.id : undefined;

  const [editedSlug, setEditedSlug] = useState<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [slugError, setSlugError] = useState<string | null>(null);

  const { data, loading, error } = useGetMyBookingSlugQuery({
    variables: { artistId: artistUserInfoId ?? '' },
    skip: !artistUserInfoId,
  });
  const { data: linksData } = useGetMyFormLinksQuery({ skip: !artistUserInfoId });
  const [updateSlug, { loading: saving }] = useUpdateMyBookingSlugMutation();

  if (!artistUserInfoId) {
    return null;
  }

  if (loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="your-link-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const artist = data?.getArtist;
  if (error || !artist) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="your-link-error">
            Couldn't load your link.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const currentSlug = artist.bookingSlug ?? '';
  const slugValue = editedSlug ?? currentSlug;
  const slugChanged = slugValue.trim().toLowerCase() !== currentSlug.toLowerCase();
  const links = linksData?.getMyFormLinks ?? [];

  const handleSave = () => {
    setSaveState('saving');
    setSlugError(null);
    updateSlug({ variables: { slug: slugValue.trim().toLowerCase() } })
      .then(() => {
        setEditedSlug(undefined);
        setSaveState('saved');
      })
      .catch((err) => {
        const apolloError = err as ApolloError;
        const fieldErrors = apolloError.graphQLErrors?.[0]?.extensions?.errors as
          | Record<string, string>
          | undefined;
        setSlugError(fieldErrors?.bookingSlug ?? apolloError.message);
        setSaveState('error');
      });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <ThemedText type="smallBold">Your link</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              The one handle every one of your form links is built from - booking requests,
              consent forms, and anything else you publish. Share the specific link for whichever
              form you mean below; this field only sets the shared part.
            </ThemedText>

            <TextInput
              value={slugValue}
              onChangeText={(v) => {
                setEditedSlug(v);
                setSaveState('idle');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              placeholder="your-name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="your-link-slug"
            />
            <ThemedText type="small" themeColor="textSecondary">
              book/{slugValue.trim().toLowerCase() || 'your-name'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Lowercase letters, numbers and hyphens.
            </ThemedText>

            {saveState === 'error' && slugError ? (
              <ThemedText type="small" style={styles.error} testID="your-link-error-message">
                {slugError}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              <Button
                label="Save link"
                onPress={handleSave}
                loading={saving}
                disabled={!slugChanged}
                testID="your-link-save"
              />
              {saveState === 'saved' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Saved
                </ThemedText>
              ) : null}
            </View>

            {currentSlug ? (
              <View style={styles.linksList}>
                {links.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    No published forms have a link yet - publish a form and give it a link (Forms
                    &gt; a form &gt; Link) to see it here.
                  </ThemedText>
                ) : (
                  links.map((link) => (
                    <View key={link.slug} style={styles.linkRow}>
                      <ThemedText type="small" numberOfLines={1}>
                        {link.title}
                      </ThemedText>
                      <TextInput
                        value={`${link.slug}/${currentSlug}`}
                        editable={false}
                        selectTextOnFocus
                        style={[styles.linkField, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        testID={`your-link-form-${link.slug}`}
                      />
                    </View>
                  ))
                )}
              </View>
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
    paddingHorizontal: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  linksList: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  linkRow: {
    gap: Spacing.one,
  },
  linkField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  error: {
    color: '#D33',
  },
});
