import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The one button primitive for the four screens this file's sibling components exist for
// (Personal edit, Consult detail, Project detail, Session Detail) - login.tsx's own inline
// Pressable/ActivityIndicator pattern lifted out and parameterized, rather than left as four more
// one-off copies. `variant` covers every button color this batch of screens needs: primary
// (filled, matches login's own button exactly), secondary (outlined, e.g. "Add Session"), danger
// (destructive text, e.g. delete actions - never filled, so it never reads as the primary action
// on a screen that also has a real primary button).
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  // 2026-09-10: was theme.text/theme.background (plain black-on-white in light mode, the
  // reverse in dark) - every screen using this one shared primitive now picks up the real
  // brand color instead. secondary's border/text move from a neutral gray outline to the same
  // brand color, matching web's own outlined-button convention; danger moves off a hardcoded
  // '#D33' onto the theme's real error color (same value in light mode, theme-aware in dark).
  const backgroundColor =
    variant === 'primary' ? theme.primary : variant === 'danger' ? 'transparent' : 'transparent';
  const borderColor = variant === 'secondary' ? theme.primary : 'transparent';
  const textColor =
    variant === 'primary' ? theme.primaryContrast : variant === 'danger' ? theme.error : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        { backgroundColor, borderColor, borderWidth: variant === 'secondary' ? 1 : 0, opacity: isDisabled ? 0.6 : 1 },
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="default" style={{ color: textColor }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
