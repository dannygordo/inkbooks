import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The labeled-input primitive for the four screens this batch adds - login.tsx's bare inline
// TextInput (no label, it doesn't need one) with a label row added, since every field on
// Personal-edit/Consult/Project/Session-Detail needs one ("Title", "Notes", "Placement", ...).
// Controlled (value/onChangeText), matching login.tsx's own convention rather than web's
// uncontrolled-ref pattern - see that file's header comment for why RN has no equivalent
// "read the DOM node directly" option worth porting.
type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  testID?: string;
};

export function FormField({ label, error, style, multiline, testID, ...rest }: FormFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        testID={testID}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.backgroundSelected },
          multiline && styles.multiline,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  label: {
    paddingLeft: Spacing.half,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  error: {
    color: '#D33',
    paddingLeft: Spacing.half,
  },
});
