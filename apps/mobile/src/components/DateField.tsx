import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DateFieldProps = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  testID?: string;
};

/**
 * DateTimeField.tsx's own date-only sibling - a single `mode="date"` step, no chained time
 * dialog. Income and Expenses entries carry a pure calendar date (matching web's own
 * `<input type="date">`, per Income.jsx/Expenses.jsx's own "utc-ok: pure calendar date" comments),
 * not a timestamped instant the way an appointment's start time is - reusing DateTimeField
 * directly would force a meaningless "pick a time too" step onto a field that has no time
 * component to pick. See DECISIONS.md X26.
 */
export function DateField({ label, value, onChange, testID }: DateFieldProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (event.type !== 'set' || !selectedDate) {
          return;
        }
        onChange(selectedDate);
      },
    });
  };

  const handlePress = () => {
    if (Platform.OS === 'android') {
      openAndroid();
      return;
    }
    setExpanded((current) => !current);
  };

  const handleIOSChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      onChange(selectedDate);
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        testID={testID ? `${testID}-trigger` : undefined}
        style={[styles.trigger, { borderColor: theme.backgroundSelected }]}
      >
        <ThemedText type="default">
          {value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </ThemedText>
      </Pressable>

      {Platform.OS === 'ios' && expanded ? (
        <View style={styles.iosPicker}>
          <DateTimePicker value={value} mode="date" display="spinner" onChange={handleIOSChange} />
          <Button
            label="Done"
            variant="secondary"
            onPress={() => setExpanded(false)}
            testID={testID ? `${testID}-done` : undefined}
          />
        </View>
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
  trigger: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  iosPicker: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
});
