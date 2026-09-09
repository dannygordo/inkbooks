import { useRequestPasswordResetMutation } from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The logged-out "forgot password" request - reached from login.tsx's new "Forgot password?"
 * link, matching web's own `ResetPassword.jsx`. Direct port of that screen's logged-out request
 * form ONLY, not its logged-in branch (that's `IBUpdatePassword` - already covered on mobile by
 * settings/index.tsx's own password-change form, since a signed-in user landing here would want a
 * different operation with a different guarantee, per that file's own comment).
 *
 * **The token-redemption screen (web's `SetPassword.jsx`, where the emailed link actually lands)
 * is deliberately NOT built here.** That link is a web URL - there is no mobile deep link
 * registered for it (same gap already named for Square OAuth in the Shops slice, DECISIONS.md
 * X24) - so tapping it from the Mail app opens the phone's browser regardless of whether a native
 * screen exists. This screen's only job is sending that email; finishing the reset always happens
 * in the browser. See DECISIONS.md X29.
 *
 * THE CONFIRMATION IS DELIBERATELY UNCONDITIONAL, matching web's own comment exactly: it says the
 * same thing whether or not the address belongs to an account, because the server does too - a
 * form that answers "no account found" is a tool for checking who a shop's clients are.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [requestPasswordReset, { loading }] = useRequestPasswordResetMutation();

  const handleSubmit = () => {
    requestPasswordReset({ variables: { email } })
      .catch(() => {
        // Swallowed on purpose, matching web exactly - surfacing a failure here would leak the
        // same thing the unconditional response exists to hide.
      })
      .finally(() => setSubmitted(true));
  };

  if (submitted) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Check your email
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" testID="reset-password-confirmation">
            If an account exists for that address, we&apos;ve sent a link to reset the password.
            It expires in an hour and can only be used once.
          </ThemedText>
          <Pressable onPress={() => router.back()} testID="reset-password-back">
            <ThemedText type="link">Back to login</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Reset your password
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          Enter the email address on your account and we&apos;ll send you a link to set a new
          password.
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          testID="reset-password-email"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email.trim()}
          testID="reset-password-submit"
          style={[styles.button, { backgroundColor: theme.text, opacity: loading || !email.trim() ? 0.6 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <ThemedText type="default" style={{ color: theme.background }}>
              Send reset link
            </ThemedText>
          )}
        </Pressable>

        <Pressable onPress={() => router.back()} testID="reset-password-cancel">
          <ThemedText type="link">Back to login</ThemedText>
        </Pressable>
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
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
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
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
