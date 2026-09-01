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

type DateTimeFieldProps = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  testID?: string;
};

/**
 * Wraps @react-native-community/datetimepicker@9.1.0 (Expo SDK 57's own bundled pin - see
 * duration.ts's sibling comment and DECISIONS X9) behind one date+time field, since every screen
 * this batch adds needs "pick a date and a time" as a single unit (appointmentDate), never date
 * alone.
 *
 * The two platforms have no shared API for that, per the library's own type surface
 * (node_modules/@react-native-community/datetimepicker/src/index.d.ts): iOS's mode="datetime" is
 * a real single control, rendered inline (behind the trigger, closed by the Done button below,
 * since a rendered iOS picker has no built-in dismissal of its own). Android has no "datetime"
 * mode at all - AndroidNativeProps only allows mode "date" | "time" - so DateTimePickerAndroid.open
 * is driven imperatively as a chained date-dialog-then-time-dialog, matching how every Android
 * date+time picker in the wild behaves rather than fighting the platform for a widget it doesn't
 * expose.
 */
export function DateTimeField({ label, value, onChange, testID }: DateTimeFieldProps) {
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
        // Chain straight into the time dialog, seeded with the date just picked - the two native
        // dialogs read as one interaction even though Android models them as two separate modes.
        DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          onChange: (timeEvent: DateTimePickerEvent, selectedTime?: Date) => {
            if (timeEvent.type !== 'set' || !selectedTime) {
              return;
            }
            onChange(selectedTime);
          },
        });
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
          {' · '}
          {value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </ThemedText>
      </Pressable>

      {Platform.OS === 'ios' && expanded ? (
        <View style={styles.iosPicker}>
          <DateTimePicker value={value} mode="datetime" display="spinner" onChange={handleIOSChange} />
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
