import { useLoginMutation } from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

// Field-for-field the same request apps/web's Login.jsx sends (login.graphql mirrors
// LOGIN_USER's selection minus firebaseToken - see that file's own header comment). Controlled
// inputs (useState) rather than web's uncontrolled useRef pair - RN's TextInput is a
// value/onChangeText component either way, so there was no equivalent "read the DOM node
// directly" option to port, and controlled state is the idiomatic RN default.
export default function LoginScreen() {
  const theme = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loginMutation, { loading, error }] = useLoginMutation({
    // Server rejects bad credentials as a GraphQL error rather than a partial/null result, so
    // there's no separate "wrong password" branch to handle here beyond what `error` already
    // covers below - same as Login.jsx's own onError-only handling.
    onCompleted(data) {
      login(data.login);
    },
  });

  const handleSubmit = () => {
    // useMutation's `error` above already surfaces a failed attempt to the UI - this call's own
    // returned promise still rejects independently of that (Apollo doesn't swallow it for the
    // caller), so it needs its own catch or React Native logs an unhandled promise rejection for
    // every wrong password.
    loginMutation({ variables: { email, password } }).catch(() => {});
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          InkBooks
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          testID="email-input"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          secureTextEntry
          testID="password-input"
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        {error ? (
          <ThemedText type="small" style={styles.error} testID="login-error">
            {/* Same fallback message Login.jsx's alert shows for any failed attempt, not the raw
                GraphQL error text - error.message here is server-authored and not written for a
                signed-out user to read verbatim. */}
            {AUTH_ERROR_MESSAGES.INCORRECT_CREDENTIALS}
          </ThemedText>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email || !password}
          testID="login-submit"
          style={[styles.button, { backgroundColor: theme.text, opacity: loading ? 0.6 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <ThemedText type="default" style={{ color: theme.background }}>
              Log in
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
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
