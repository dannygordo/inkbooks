import { useCreateStaffAccountMutation } from '@inkbooks/api';
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
import { fieldError, fieldErrors } from '@/utils/graphqlFieldError';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Add Staff" - closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting for the staff half.
 * Direct port of apps/web's `CreateStaffWizard` (AccountWizards.jsx) + `CreateStaffAccount`
 * (AccountService.js), reached from a new "Add Staff" button on `staff/index.tsx` gated to
 * `isShopAdminOrBetter` - matching web's `canManageAccounts`. Same shape as `artist/new.tsx`
 * minus the booking-link section (Staff has no `bookingSlug` field at all) and minus rate (Staff
 * has no `hourlyRate`) - see that screen's own header comment for the shared reasoning (one
 * screen not a stepped wizard, no shopId sent, invite link shown not "an email was sent").
 */
export default function NewStaffScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [createStaffAccount, { loading }] = useCreateStaffAccountMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; email: string; inviteLink: string } | null>(null);

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
    createStaffAccount({
      variables: {
        input: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          title: title.trim() || undefined,
          phone: phone.trim() || undefined,
          instagram: instagram.trim() || undefined,
          facebook: facebook.trim() || undefined,
        },
      },
      // Same reasoning as client/new.tsx's own refetchQueries comment.
      refetchQueries: ['GetStaffList'],
    })
      .then(({ data }) => {
        const created = data?.createStaffAccount;
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
        if (errs?.email) {
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
            <ThemedText type="subtitle" testID="new-staff-done-title">
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
              testID="new-staff-invite-link"
            />
            <Button label="Done" onPress={() => router.back()} testID="new-staff-done" />
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
            <ThemedText type="smallBold">Who is joining the shop?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              They&apos;ll get an email inviting them to set their own password.
            </ThemedText>
            <FormField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
              testID="new-staff-first-name"
            />
            <FormField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              error={errors.lastName}
              testID="new-staff-last-name"
            />
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="new-staff-email"
            />
            <FormField
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Shop Manager"
              testID="new-staff-title"
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Contact details</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              All optional.
            </ThemedText>
            <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="new-staff-phone" />
            <FormField
              label="Instagram"
              value={instagram}
              onChangeText={setInstagram}
              autoCapitalize="none"
              testID="new-staff-instagram"
            />
            <FormField
              label="Facebook"
              value={facebook}
              onChangeText={setFacebook}
              autoCapitalize="none"
              testID="new-staff-facebook"
            />
          </View>

          {submitError ? (
            <ThemedText type="small" style={styles.error} testID="new-staff-error">
              {submitError}
            </ThemedText>
          ) : null}

          <Button label="Add staff member" onPress={handleSubmit} loading={loading} testID="new-staff-submit" />
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
