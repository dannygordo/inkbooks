import { useCreateClientAccountMutation } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { fieldError, fieldErrors } from '@/utils/graphqlFieldError';

// Same required-field-plus-format check as web's EntityWizard.jsx's own validateStep - ported
// exactly rather than trusting the server's error message alone, so a blank required field or an
// obviously malformed email is caught before a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Add Client" - closes gap #2 of HANDOFF.md's 2026-09-04 parity accounting for the client half.
 * Direct port of apps/web's `CreateClientWizard` (AccountWizards.jsx) + `CreateClientAccount`
 * (AccountService.js), reached from a new "Add Client" button on `clients/index.tsx` gated to
 * `isStaffOrBetter` - matching web's own `canAddClients = role <= ROLES.SHOP_STAFF` in
 * IBPageActionBar.jsx ("adding a walk-in client is front-desk work").
 *
 * ONE SCREEN, NOT A PORTED TWO-STEP WIZARD. Web's EntityWizard splits "identity" (name/email/
 * phone) from "anything else" (city/state/zip/instagram) purely for framing - a shop admin who
 * only has a name and email shouldn't see the optional half looking as mandatory as the required
 * half. That's still true here, so the same grouping survives as two labeled sections on one
 * scrollable screen, but there's no mobile equivalent of EntityWizard's generic step-array shell
 * to reuse (this would be the first, for three screens that don't independently justify building
 * one), and validating everything at once is a strict superset of EntityWizard's own
 * `validateStep` (which only checks the CURRENT step) - never less correct, just less paced.
 *
 * FULL-SCREEN ROUTE, NOT A MODAL, same "no cross-platform modal primitive" reasoning as every
 * other web-modal port on this app - this is the "opens a real record-creation flow" case that
 * gets its own expo-router route rather than an inline card, same shape as `settings/*` detail
 * screens.
 *
 * DUPLICATE-EMAIL HANDLING MATCHES WEB EXACTLY: `createClientAccount` reuses
 * `findOrCreateGuestClient` server-side and returns `isNewAccount: false` rather than erroring
 * when the email already has a client account - the success screen below branches on that flag
 * the same way `CreateClientWizard`'s own `onSubmit` does, saying "was already on file" instead of
 * implying a new record was made.
 */
export default function NewClientScreen() {
  const router = useRouter();
  const [createClientAccount, { loading }] = useCreateClientAccountMutation();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [instagram, setInstagram] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; isNewAccount: boolean } | null>(null);

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
    createClientAccount({
      variables: {
        input: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          zip: zip.trim() || undefined,
          instagram: instagram.trim() || undefined,
        },
      },
      // So clients/index.tsx shows the new record the moment the user taps back, without needing
      // a focus-refetch hook - @react-navigation/native's useFocusEffect isn't a resolvable
      // dependency here (expo-router uses its own bundled copy internally, not one this app can
      // import), so refetching the one query that needs to change is simpler than adding one.
      refetchQueries: ['GetClients'],
    })
      .then(({ data }) => {
        const created = data?.createClientAccount;
        if (!created) {
          return;
        }
        setResult({
          name: `${created.client.firstName} ${created.client.lastName}`,
          isNewAccount: created.isNewAccount,
        });
      })
      .catch((err) => {
        // Only field this mutation ever errors on today is email (see
        // mutations/accounts.js's assertEmailAvailable) - shown under that field, like every
        // other required field, rather than as a separate banner.
        const emailMessage = fieldErrors(err)?.email;
        if (emailMessage) {
          setErrors((prev) => ({ ...prev, email: emailMessage }));
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
            <ThemedText type="subtitle" testID="new-client-done-title">
              {result.name} {result.isNewAccount ? 'has been added' : 'was already on file'}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {result.isNewAccount
                ? 'They can book and view their projects once they set a password - they can do that themselves from the login screen whenever they need to.'
                : 'This email already had an account, so their existing record has been updated rather than duplicated.'}
            </ThemedText>
            <Button label="Done" onPress={() => router.back()} testID="new-client-done" />
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
            <ThemedText type="smallBold">Who is the client?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Name and email are enough to create the record.
            </ThemedText>
            <FormField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              error={errors.firstName}
              testID="new-client-first-name"
            />
            <FormField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              error={errors.lastName}
              testID="new-client-last-name"
            />
            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="new-client-email"
            />
            <FormField
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              testID="new-client-phone"
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Anything else?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              All optional - you can fill these in later from their record.
            </ThemedText>
            <FormField label="City" value={city} onChangeText={setCity} testID="new-client-city" />
            <FormField label="State" value={state} onChangeText={setState} testID="new-client-state" />
            <FormField label="Zip" value={zip} onChangeText={setZip} testID="new-client-zip" />
            <FormField
              label="Instagram"
              value={instagram}
              onChangeText={setInstagram}
              autoCapitalize="none"
              testID="new-client-instagram"
            />
          </View>

          {submitError ? (
            <ThemedText type="small" style={styles.error} testID="new-client-error">
              {submitError}
            </ThemedText>
          ) : null}

          <Button label="Add client" onPress={handleSubmit} loading={loading} testID="new-client-submit" />
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
  error: {
    color: '#D33',
  },
});
