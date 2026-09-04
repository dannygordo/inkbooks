import { useRegisterAccountMutation } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { fieldErrors } from '@/utils/graphqlFieldError';

const ACCOUNT_TYPES = [
  { id: 'shop', label: 'I run a shop' },
  { id: 'artist', label: "I'm an independent artist" },
];

/**
 * Gap #11 of HANDOFF.md's 2026-09-04 parity accounting - cold self-service signup, reached from
 * login.tsx's own new "Create a new account" link, exactly like web's Login.jsx links to
 * `/register`. Not gated behind `!user` for any special reason beyond matching login/reset-password
 * (see _layout.tsx) - a signed-in user has no business here either.
 *
 * SCOPED TO ACCOUNT CREATION ONLY - web's Register.jsx is a 5-6 step wizard (account type, account
 * fields, then skippable notification/rate/shop-cut steps that save via Settings' own already-
 * authenticated mutations). This screen ports only the first two steps: choose shop-vs-artist,
 * fill in the account, submit. The remaining steps aren't missing functionality, they're already
 * built and reachable from Settings once the account exists (`settings/notifications.tsx` X51,
 * `settings/rates.tsx` X37, `shop/[id].tsx`'s own shop-cut editing) - showing them again in a
 * second wizard here would be the exact "two screens independently calling the same mutations for
 * no reason" call X30's own header comment already made for Forms' Publish/Archive/link actions.
 * registerAccount itself still creates a fully working, immediately-usable account either way
 * (real password, no email verification step server-side - see server's own `registerAccount`
 * resolver comment) - this scope cut only affects how many optional preferences get set on day
 * one, never whether the account works.
 *
 * NO LIVE BOOKING-SLUG AVAILABILITY CHECK, same restraint as `settings/your-link.tsx` (X42): the
 * unique index is the actual guarantee, a debounced live check is a courtesy web pays for and
 * mobile doesn't - a taken slug just comes back as a save-time field error here instead, same
 * message either way.
 *
 * registerAccount's field-level errors (email already registered, shopName required, a taken
 * bookingSlug) come back as `UserInputError('Errors', { errors: { <field>: '...' } })`, same shape
 * `fieldError`/`fieldErrors` (utils/graphqlFieldError.ts) already reads for `artist/new.tsx`/
 * `staff/new.tsx`/`your-link.tsx` - reused here rather than a fourth inline copy.
 *
 * ON SUCCESS: `login(data.registerAccount)` then straight to Home - registration IS login here,
 * same as web (`context.login(user)`, no separate token/redirect dance). register.graphql's
 * selection set mirrors login.graphql's Login mutation field-for-field so this is a legal call
 * (useAuth's `login` is typed to `LoginMutation['login']`).
 */
export default function RegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { login } = useAuth();

  const [accountType, setAccountType] = useState<'shop' | 'artist'>('shop');
  const [shopName, setShopName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bookingSlug, setBookingSlug] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [registerAccount, { loading }] = useRegisterAccountMutation();

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    passwordsMatch &&
    (accountType !== 'shop' || shopName.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }
    setSubmitError(null);
    registerAccount({
      variables: {
        input: {
          accountType,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          confirmPassword,
          ...(accountType === 'shop' ? { shopName: shopName.trim() } : {}),
          ...(bookingSlug.trim() ? { bookingSlug: bookingSlug.trim() } : {}),
        },
      },
    })
      .then((result) => {
        if (result.data?.registerAccount) {
          return login(result.data.registerAccount).then(() => router.replace('/'));
        }
        return undefined;
      })
      .catch((err) => {
        // registerAccount can name any of these three fields (email uniqueness, a required
        // shopName, a taken bookingSlug) - check each in turn rather than assuming which one,
        // same UserInputError('Errors', {errors}) shape fieldErrors() already reads for
        // artist/new.tsx/staff/new.tsx/your-link.tsx. err.message itself is the literal, useless
        // word "Errors" in this shape, so a genuinely different failure (network error) is the
        // only case that falls through to it.
        const errors = fieldErrors(err);
        setSubmitError(
          errors?.email ?? errors?.shopName ?? errors?.bookingSlug ?? (err as Error).message
        );
      });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Create Account
          </ThemedText>

          <PillRow
            options={ACCOUNT_TYPES}
            selectedId={accountType}
            onSelect={(value) => setAccountType(value as 'shop' | 'artist')}
            testID="register-account-type"
          />

          {accountType === 'shop' ? (
            <TextInput
              value={shopName}
              onChangeText={setShopName}
              placeholder="Shop name"
              placeholderTextColor={theme.textSecondary}
              testID="register-shop-name"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          ) : null}

          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={theme.textSecondary}
            testID="register-first-name"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={theme.textSecondary}
            testID="register-last-name"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="register-email"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (at least 8 characters)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            secureTextEntry
            testID="register-password"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            secureTextEntry
            testID="register-confirm-password"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          {!passwordsMatch && confirmPassword.length > 0 ? (
            <ThemedText type="small" style={styles.error} testID="register-password-mismatch">
              Passwords don&apos;t match.
            </ThemedText>
          ) : null}

          <TextInput
            value={bookingSlug}
            onChangeText={setBookingSlug}
            placeholder="Booking link (optional, e.g. jane-smith)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            testID="register-booking-slug"
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            You can leave this blank and choose a link later from Settings.
          </ThemedText>

          {submitError ? (
            <ThemedText type="small" style={styles.error} testID="register-error">
              {submitError}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={loading || !canSubmit}
            testID="register-submit"
            style={[styles.button, { backgroundColor: theme.text, opacity: loading || !canSubmit ? 0.6 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="default" style={{ color: theme.background }}>
                Create Account
              </ThemedText>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} testID="register-back-to-login">
            <ThemedText type="link" style={styles.backLink}>
              Back to log in
            </ThemedText>
          </Pressable>
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#D33',
  },
  backLink: {
    textAlign: 'center',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
