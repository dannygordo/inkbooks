import {
  useInspectPasswordTokenQuery,
  useSetPasswordWithTokenMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Where an invite link and a reset link both land, direct port of apps/web's `SetPassword.jsx` -
 * see reset-password.tsx's own header comment for why this screen didn't exist until now, and
 * passwordReset.graphql's header comment for what does and doesn't reach it yet (the emailed link
 * is still a web URL; this screen is reachable today by the app's own `inkbooks://set-password/
 * <token>` deep link on a device that already has the app installed).
 *
 * Public - reached from the logged-out Stack.Protected group in _layout.tsx, same as
 * reset-password.tsx and login.tsx - the whole point is serving someone with no session.
 *
 * Deliberately does NOT log anyone in on success, matching web exactly: it routes to login
 * instead. Setting a password isn't proof of intent to start a session, and auto-authenticating
 * whoever redeems a link would mean an intercepted email grants a live session rather than just a
 * password the real owner can immediately reset. See server/graphql/mutations/passwords.js.
 */
export default function SetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token: rawToken } = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const { data, loading } = useInspectPasswordTokenQuery({
    variables: { token: token ?? '' },
    skip: !token,
    // A token is single-use and time-limited - a cached "valid" from a minute ago is exactly the
    // wrong thing to trust, matching web's own PasswordService.useInspectToken.
    fetchPolicy: 'network-only',
  });
  const [setPasswordWithToken, { loading: submitting }] = useSetPasswordWithTokenMutation();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const status = data?.inspectPasswordToken;

  const handleSubmit = async () => {
    // Checked here as well as server-side, same as web - making someone wait for a round trip to
    // be told their two entries don't match is a poor trade.
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setError(null);
    try {
      await setPasswordWithToken({ variables: { token: token ?? '', newPassword: password } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!token || loading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, styles.centered]}>
          <ActivityIndicator color={theme.text} testID="set-password-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (done) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Password set
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            You can now log in with your new password.
          </ThemedText>
          <Pressable
            onPress={() => router.replace('/login')}
            testID="set-password-go-to-login"
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText type="default" style={{ color: theme.primaryContrast }}>
              Go to login
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!status?.valid) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            This link isn&apos;t valid
          </ThemedText>
          {/* One message covering expired, already-used and fabricated alike - matching web
              exactly. The server doesn't distinguish them either, deliberately, and the advice is
              the same in every case. */}
          <ThemedText type="default" themeColor="textSecondary" testID="set-password-invalid">
            It may have expired, or already been used. Ask your shop admin to send a new invite,
            or request a reset from the login screen.
          </ThemedText>
          <Pressable onPress={() => router.replace('/login')} testID="set-password-back-to-login">
            <ThemedText type="link">Back to login</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const isInvite = status.purpose === 'invite';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          {isInvite ? 'Welcome to InkBooks' : 'Choose a new password'}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {isInvite
            ? `Hi ${status.firstName || 'there'} - choose a password to finish setting up your account.`
            : `Hi ${status.firstName || 'there'} - pick a new password below.`}
        </ThemedText>

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          autoFocus
          testID="set-password-new"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          At least 8 characters
        </ThemedText>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          testID="set-password-confirm"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        {error ? (
          <ThemedText type="small" style={styles.errorText} testID="set-password-error">
            {error}
          </ThemedText>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          testID="set-password-submit"
          style={[styles.button, { backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.primaryContrast} />
          ) : (
            <ThemedText type="default" style={{ color: theme.primaryContrast }}>
              Set password
            </ThemedText>
          )}
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
  centered: {
    alignItems: 'center',
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
  errorText: {
    color: '#D33',
  },
});
