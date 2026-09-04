import { useCreateArtistAccountMutation } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { suggestSlugOrBlank } from '@/utils/bookingSlug';
import { fieldError, fieldErrors } from '@/utils/graphqlFieldError';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Add Artist" - closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting for the artist half.
 * Direct port of apps/web's `CreateArtistWizard` (AccountWizards.jsx) + `CreateArtistAccount`
 * (AccountService.js), reached from a new "Add Artist" button on `artists/index.tsx` gated to
 * `isShopAdminOrBetter` - matching web's `canManageAccounts = role <= ROLES.SHOP_ADMIN`.
 *
 * ONE SCREEN, NOT A THREE-STEP WIZARD - same reasoning as `client/new.tsx`'s own header comment.
 * Web's three steps (identity / booking link / contact+rate) survive as three labeled sections.
 *
 * NO shopId SENT - the server derives it from the creating admin
 * (`resolveShopIdForNewAccount` in mutations/accounts.js), same as `settings/shop.tsx`'s connect
 * flow (X46) never sending one either. A cached shop id here would carry the exact stale-or-empty
 * risk AccountWizards.jsx's own comment names.
 *
 * BOOKING SLUG: prefilled from the name via `suggestSlugOrBlank` whenever the artist hasn't typed
 * their own value, exactly like `CreateArtistWizard`'s `BookingSlugField` render prop - shown on
 * screen before submit, never assigned silently. NO LIVE AVAILABILITY CHECK - same call X42's
 * `settings/your-link.tsx` already made for this identical field; a collision is discovered on
 * submit via `fieldErrors(err).bookingSlug`, matching `assertSlugAvailable`'s own error shape.
 *
 * INVITE LINK SHOWN, NOT "AN EMAIL WAS SENT" - utils/email.js no-ops without a configured
 * provider, so the link is the only thing verifiable. Shown in a read-only, `selectTextOnFocus`
 * field for OS-native copy, same as `settings/forms` guest links and `your-link.tsx`'s own form
 * links - no clipboard library is installed on mobile (same avoid-a-new-dependency call as the
 * Shops slice's Square flow).
 */
export default function NewArtistScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [createArtistAccount, { loading }] = useCreateArtistAccountMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [bookingSlug, setBookingSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; email: string; inviteLink: string } | null>(null);

  const suggestedSlug = suggestSlugOrBlank(firstName, lastName);
  const slugValue = bookingSlug || suggestedSlug;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Required';
    if (!lastName.trim()) next.lastName = 'Required';
    if (!email.trim()) {
      next.email = 'Required';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = 'Enter a valid email';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    setSubmitError(null);
    if (!validate()) {
      return;
    }
    createArtistAccount({
      variables: {
        input: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          title: title.trim() || undefined,
          // '' would collide with every other slug-less artist on the unique index (see
          // models/Artist.js) - undefined is "no slug", matching CreateArtistWizard's own
          // `|| undefined` fallback exactly.
          bookingSlug: slugValue.trim() || undefined,
          phone: phone.trim() || undefined,
          instagram: instagram.trim() || undefined,
          facebook: facebook.trim() || undefined,
          hourlyRate: hourlyRate.trim() ? parseInt(hourlyRate.trim(), 10) : null,
        },
      },
      // Same reasoning as client/new.tsx's own refetchQueries comment.
      refetchQueries: ['GetArtistsList'],
    })
      .then(({ data }) => {
        const created = data?.createArtistAccount;
        if (!created) {
          return;
        }
        setResult({
          name: `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim(),
          inviteLink: created.inviteLink,
        });
      })
      .catch((err) => {
        const errs = fieldErrors(err);
        if (errs?.email || errs?.bookingSlug) {
          setErrors((prev) => ({ ...prev, ...errs }));
        } else {
          setSubmitError(fieldError(err, 'email'));
        }
      });
  };

  if (result) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.done}>
            <ThemedText type="subtitle" testID="new-artist-done-title">
              {result.name} has been added
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              An invite to set their password has been emailed to {result.email}. If it doesn't
              arrive, send them this link directly - it works once, and expires in a week.
            </ThemedText>
            <TextInput
              value={result.inviteLink}
              editable={false}
              selectTextOnFocus
              style={[styles.linkField, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="new-artist-invite-link"
            />
            <Button label="Done" onPress={() => router.back()} testID="new-artist-done" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <ThemedText type="smallBold">Who is the artist?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              They&apos;ll get an email inviting them to set their own password.
            </ThemedText>
            <FormField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
              testID="new-artist-first-name"
            />
            <FormField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              error={errors.lastName}
              testID="new-artist-last-name"
            />
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="new-artist-email"
            />
            <FormField
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Resident Artist"
              testID="new-artist-title"
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Booking link</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              The link this artist hands out for booking requests. Optional - they can choose one
              later from Settings.
            </ThemedText>
            <FormField
              label="Booking link"
              value={slugValue}
              onChangeText={setBookingSlug}
              error={errors.bookingSlug}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your-name"
              testID="new-artist-booking-slug"
            />
            <ThemedText type="small" themeColor="textSecondary">
              book/{slugValue.trim().toLowerCase() || 'your-name'}
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Contact and rate</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              All optional - the artist can fill these in themselves.
            </ThemedText>
            <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="new-artist-phone" />
            <FormField
              label="Instagram"
              value={instagram}
              onChangeText={setInstagram}
              autoCapitalize="none"
              testID="new-artist-instagram"
            />
            <FormField
              label="Facebook"
              value={facebook}
              onChangeText={setFacebook}
              autoCapitalize="none"
              testID="new-artist-facebook"
            />
            <FormField
              label="Hourly rate $"
              value={hourlyRate}
              onChangeText={setHourlyRate}
              keyboardType="number-pad"
              placeholder="Leave blank to use the shop's rate"
              testID="new-artist-hourly-rate"
            />
          </View>

          {submitError ? (
            <ThemedText type="small" style={styles.error} testID="new-artist-error">
              {submitError}
            </ThemedText>
          ) : null}

          <Button label="Add artist" onPress={handleSubmit} loading={loading} testID="new-artist-submit" />
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
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  done: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  linkField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 14,
  },
  error: {
    color: '#D33',
  },
});
