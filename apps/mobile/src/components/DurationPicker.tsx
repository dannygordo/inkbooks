import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { combineDuration, minuteOptionsFor } from '@/utils/duration';

// Direct UI port of apps/web/src/components/appointments/DurationPicker.jsx's two-field layout
// (free-numeric hours + quarter-hour-step minutes) - NOT a single preset dropdown, matching that
// file's own reasoning (a tattoo session's hours has no natural preset list, only the minutes
// remainder does). The quarter-hour steps render as a pill row rather than a native <select> -
// there is no cross-platform select primitive in this app yet, and four options is short enough
// that a picker/wheel would be more chrome than the choice deserves.
//
// Pure combine/step logic lives in utils/duration.ts (already tested) - this component only owns
// the two input elements and forwards their combined total up via onChange.
type DurationPickerProps = {
  minutes: number;
  onChange: (minutes: number) => void;
  testID?: string;
};

export function DurationPicker({ minutes, onChange, testID }: DurationPickerProps) {
  const theme = useTheme();
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const minuteOptions = minuteOptionsFor(remainder);

  const handleHoursChange = (text: string) => {
    const parsed = text === '' ? 0 : parseInt(text, 10);
    onChange(combineDuration(Number.isFinite(parsed) ? parsed : 0, remainder));
  };

  const handleMinutesSelect = (nextRemainder: number) => {
    onChange(combineDuration(hours, nextRemainder));
  };

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.hoursField}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          Hours
        </ThemedText>
        <TextInput
          value={hours ? String(hours) : ''}
          onChangeText={handleHoursChange}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          testID={testID ? `${testID}-hours` : undefined}
          style={[styles.hoursInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />
      </View>

      <View style={styles.minutesField}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          Minutes
        </ThemedText>
        <View style={styles.pillRow}>
          {minuteOptions.map((option) => {
            const selected = option === remainder;
            return (
              <Pressable
                key={option}
                onPress={() => handleMinutesSelect(option)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={testID ? `${testID}-minutes-${option}` : undefined}
                style={[
                  styles.pill,
                  {
                    backgroundColor: selected ? theme.text : theme.backgroundElement,
                    borderColor: theme.backgroundSelected,
                  },
                ]}
              >
                <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                  {option}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  hoursField: {
    gap: Spacing.one,
  },
  minutesField: {
    flex: 1,
    gap: Spacing.one,
  },
  label: {
    paddingLeft: Spacing.half,
  },
  hoursInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    width: 64,
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 44,
    alignItems: 'center',
  },
});
