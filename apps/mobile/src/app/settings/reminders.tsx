import { useGetReminderSettingsQuery, useUpdateReminderSettingsMutation } from '@inkbooks/api';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const UNIT_MINUTES: Record<string, number> = { minutes: 1, hours: 60, days: 1440 };
const UNIT_OPTIONS = [
  { id: 'minutes', label: 'minutes' },
  { id: 'hours', label: 'hours' },
  { id: 'days', label: 'days' },
];

function minutesToUnit(totalMinutes: number): { value: number; unit: string } {
  if (totalMinutes % UNIT_MINUTES.days === 0) {
    return { value: totalMinutes / UNIT_MINUTES.days, unit: 'days' };
  }
  if (totalMinutes % UNIT_MINUTES.hours === 0) {
    return { value: totalMinutes / UNIT_MINUTES.hours, unit: 'hours' };
  }
  return { value: totalMinutes, unit: 'minutes' };
}

function unitToMinutes(value: string, unit: string): number {
  return Math.max(1, Math.round(Number(value) || 0)) * (UNIT_MINUTES[unit] ?? 1);
}

let localRuleKey = 0;
function nextLocalKey(): string {
  localRuleKey += 1;
  return `local-${localRuleKey}`;
}

type RuleRow = { key: string; value: string; unit: string; enabled: boolean };

/**
 * Appointment reminders - text and email nudges sent to CLIENTS ahead of an appointment. Direct
 * port of apps/web's RemindersPanel.jsx. First of the four Messages-category screens (X31's
 * biggest remaining named chunk, taken as its own sequence of sub-slices rather than one big
 * screen) - see DECISIONS.md X38.
 *
 * ONE SHARED INKBOOKS TEXTING NUMBER, not one per artist - see server/models/ReminderSettings.js.
 * There's nothing to "connect" here; turning Text reminders on just starts using the number
 * InkBooks already has, which is why the shared-infrastructure helper text below stays.
 *
 * Offsets are edited in a human unit (minutes/hours/days) but stored/sent as minutes -
 * minutesToUnit/unitToMinutes, ported directly from web. A rule's server-side identity is its
 * offsetMinutes value, not any client id, so nothing here needs to preserve a rule's identity
 * across an edit (same as web's own comment on this).
 *
 * Fully controlled, hydrated once from the query result (the `hydrated` flag) rather than
 * uncontrolled/edit-tracked like rates.tsx's hourlyRate/flatRate - every field here (Switch,
 * PillRow, TextInput) is meant to reflect and change live local state after that first load,
 * matching web's own useEffect-gated hydration exactly.
 */
export default function RemindersScreen() {
  const theme = useTheme();
  const { data, loading } = useGetReminderSettingsQuery();
  const [updateSettings, { loading: saving }] = useUpdateReminderSettingsMutation();

  const [hydrated, setHydrated] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState('');
  const [emailBodyTemplate, setEmailBodyTemplate] = useState('');
  const [smsTemplate, setSmsTemplate] = useState('');
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const settings = data?.getReminderSettings;

  useEffect(() => {
    if (settings && !hydrated) {
      setEmailEnabled(settings.emailEnabled);
      setSmsEnabled(settings.smsEnabled);
      setRules(
        settings.rules.map((rule) => {
          const { value, unit } = minutesToUnit(rule.offsetMinutes);
          return { key: rule.id, value: String(value), unit, enabled: rule.enabled };
        }),
      );
      setEmailSubjectTemplate(settings.emailSubjectTemplate ?? '');
      setEmailBodyTemplate(settings.emailBodyTemplate ?? '');
      setSmsTemplate(settings.smsTemplate ?? '');
      setHydrated(true);
    }
  }, [settings, hydrated]);

  if (loading && !settings) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="reminders-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }
  if (!settings) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="reminders-error">
            Couldn't load reminder settings.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const updateRule = (key: string, changes: Partial<RuleRow>) => {
    setRules((prev) => prev.map((rule) => (rule.key === key ? { ...rule, ...changes } : rule)));
  };

  const removeRule = (key: string) => {
    setRules((prev) => prev.filter((rule) => rule.key !== key));
  };

  const addRule = () => {
    setRules((prev) => [...prev, { key: nextLocalKey(), value: '24', unit: 'hours', enabled: true }]);
  };

  const handleSave = () => {
    setFormError(null);
    setSaved(false);
    updateSettings({
      variables: {
        emailEnabled,
        smsEnabled,
        rules: rules.map((rule) => ({
          offsetMinutes: unitToMinutes(rule.value, rule.unit),
          enabled: rule.enabled,
        })),
        // Empty box means "use the built-in default" - sent as null, not an empty string, so the
        // server's own default (utils/reminders.js) is what actually goes out.
        emailSubjectTemplate: emailSubjectTemplate.trim() || null,
        emailBodyTemplate: emailBodyTemplate.trim() || null,
        smsTemplate: smsTemplate.trim() || null,
      },
    })
      .then(() => setSaved(true))
      .catch((err) => setFormError((err as Error).message));
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            Automatic reminders to clients ahead of an appointment - by email, by text, or both.
            Nothing sends until you turn a channel on below.
          </ThemedText>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <ThemedText type="default">Email reminders</ThemedText>
              <Switch
                value={emailEnabled}
                onValueChange={setEmailEnabled}
                disabled={saving}
                testID="reminders-email-enabled"
              />
            </View>
            <View style={styles.switchRow}>
              <ThemedText type="default">Text reminders</ThemedText>
              <Switch
                value={smsEnabled}
                onValueChange={setSmsEnabled}
                disabled={saving}
                testID="reminders-sms-enabled"
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Sent from InkBooks&apos; own number, with your name in the message - not a number
              registered to you individually. Shared infrastructure across every artist using this
              feature, so keep an eye on your reply rate.
            </ThemedText>
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">When</ThemedText>
            {rules.map((rule) => (
              <View key={rule.key} style={[styles.ruleRow, { borderColor: theme.backgroundSelected }]} testID={`reminder-rule-${rule.key}`}>
                <View style={styles.ruleTopRow}>
                  <Switch
                    value={rule.enabled}
                    onValueChange={(value) => updateRule(rule.key, { enabled: value })}
                    disabled={saving}
                    testID={`reminder-rule-${rule.key}-enabled`}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    How long before
                  </ThemedText>
                  <TextInput
                    value={rule.value}
                    onChangeText={(value) => updateRule(rule.key, { value })}
                    keyboardType="number-pad"
                    editable={!saving}
                    style={[styles.ruleValueInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
                    testID={`reminder-rule-${rule.key}-value`}
                  />
                  <Button
                    label="Remove"
                    variant="danger"
                    disabled={saving}
                    onPress={() => removeRule(rule.key)}
                    testID={`reminder-rule-${rule.key}-remove`}
                  />
                </View>
                <PillRow
                  options={UNIT_OPTIONS}
                  selectedId={rule.unit}
                  onSelect={(unit) => updateRule(rule.key, { unit })}
                  testID={`reminder-rule-${rule.key}-unit`}
                />
              </View>
            ))}
            <Button
              label="+ Add a reminder"
              variant="secondary"
              disabled={saving}
              onPress={addRule}
              testID="reminders-add-rule"
            />
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">Message</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Leave a box blank to use InkBooks&apos; default wording. Available merge fields:{' '}
              {'{{clientFirstName}}'}, {'{{artistName}}'}, {'{{appointmentDate}}'},{' '}
              {'{{appointmentTime}}'}, {'{{link}}'}.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Email subject
            </ThemedText>
            <TextInput
              value={emailSubjectTemplate}
              onChangeText={setEmailSubjectTemplate}
              placeholder="Reminder: your appointment with {{artistName}}"
              placeholderTextColor={theme.textSecondary}
              editable={!saving}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="reminders-email-subject"
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Email body
            </ThemedText>
            <TextInput
              value={emailBodyTemplate}
              onChangeText={setEmailBodyTemplate}
              placeholder="Hi {{clientFirstName}}, this is a reminder from {{artistName}}..."
              placeholderTextColor={theme.textSecondary}
              multiline
              editable={!saving}
              style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="reminders-email-body"
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Text message
            </ThemedText>
            <TextInput
              value={smsTemplate}
              onChangeText={setSmsTemplate}
              placeholder="Hi {{clientFirstName}}, this is a reminder from {{artistName}}..."
              placeholderTextColor={theme.textSecondary}
              multiline
              editable={!saving}
              style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="reminders-sms-template"
            />
            <ThemedText type="small" themeColor="textSecondary">
              Keep the text message short - a longer message costs more and may split across
              multiple texts.
            </ThemedText>
          </View>

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button
              label="Save Reminder Settings"
              onPress={handleSave}
              loading={saving}
              testID="reminders-save"
            />
            {saved ? (
              <ThemedText type="small" themeColor="textSecondary">
                Saved
              </ThemedText>
            ) : null}
          </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ruleRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ruleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  ruleValueInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
    width: 70,
  },
  label: {
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
