import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Extracted from form/[id].tsx (X30), where it was first built as a local, unexported component -
 * DurationPicker.tsx's own precedent ("no cross-platform <select> primitive in this app, use a
 * pill row instead") applied to a short enum of string options. settings/rates.tsx (X37) is the
 * second real caller, which is what earned this its own file rather than a second inline copy.
 * Horizontally scrollable so a longer option list never wraps awkwardly on a narrow phone.
 */
export function PillRow({
  options,
  selectedId,
  onSelect,
  testID,
}: {
  options: Array<{ id: string; label: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} testID={testID}>
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={[
              styles.pill,
              { borderColor: theme.backgroundSelected },
              selected && { backgroundColor: theme.text, borderColor: theme.text },
            ]}
            testID={testID ? `${testID}-${option.id}` : undefined}
          >
            <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexGrow: 0,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginRight: Spacing.two,
  },
});
