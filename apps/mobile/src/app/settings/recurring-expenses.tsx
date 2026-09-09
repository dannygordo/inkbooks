import {
  useCreateRecurringExpenseMutation,
  useDeleteRecurringExpenseMutation,
  useGetExpenseTypesForSettingsQuery,
  useGetRecurringExpensesListQuery,
  useUpdateRecurringExpenseMutation,
  type GetRecurringExpensesListQuery,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { businessScopeFor, createScopeFor } from '@/utils/businessScope';
import { dollarsToCents, formatCents } from '@/utils/money';
import { formatUtcCalendarDate } from '@/utils/utcDate';

const FREQUENCIES: Array<{ id: 'weekly' | 'monthly' | 'yearly'; label: string }> = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

type RecurringItem = GetRecurringExpensesListQuery['getRecurringExpenses'][number];

/**
 * Recurring expenses - apps/web's Settings > Expenses (RecurringExpensesPanel.jsx). Named as its
 * own real, separate, feature-sized cut in expenses.graphql's header comment (X27) - this is that
 * follow-up. See DECISIONS.md X31.
 *
 * A TEMPLATE, not a ledger row - see server/models/RecurringExpense.js. The real Expense rows this
 * generates show up on expenses/index.tsx, written by a scheduled job as each occurrence comes
 * due; creating/editing one here never logs an expense directly, matching web's own success
 * message exactly ("The first entry appears on the Expenses page once it's due").
 *
 * Deleting only stops FUTURE generation - every occurrence it already wrote is a real,
 * independent Expense row, untouched. Pausing (the existing `active` toggle) does the same thing
 * without discarding the template - "not paying this right now" versus "this was a mistake."
 *
 * `nextRunDate`/`endDate` are pure calendar dates, same as `startDate`/`endDate` on
 * income/expenses' own entry forms - read via `formatUtcCalendarDate` (`utils/utcDate.ts`,
 * pulled out of `utils/formAnswers.ts` for this exact reuse), never a naive local-timezone read,
 * matching web's own `moment.utc(...)` calls and their "utc-ok" comments exactly.
 */
export default function RecurringExpensesSettingsScreen() {
  const { user } = useAuth();
  const theme = useTheme();

  const [expenseTypeId, setExpenseTypeId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (!user) {
    return null;
  }
  const scope = businessScopeFor(user);

  const { data: typesData } = useGetExpenseTypesForSettingsQuery({ variables: { ...scope } });
  const expenseTypes = (typesData?.getExpenseTypes ?? []).filter((t) => t.active);

  const { data, loading, error, refetch } = useGetRecurringExpensesListQuery({
    variables: { ...scope, includeInactive: true },
    fetchPolicy: 'cache-and-network',
  });
  const recurring = data?.getRecurringExpenses ?? [];

  const [createRecurring, { loading: creating }] = useCreateRecurringExpenseMutation();
  const [updateRecurring] = useUpdateRecurringExpenseMutation();
  const [deleteRecurring] = useDeleteRecurringExpenseMutation();

  const handleAdd = () => {
    const amountCents = dollarsToCents(amount);
    if (!expenseTypeId || amountCents <= 0) {
      return;
    }
    setFormError(null);
    createRecurring({
      variables: {
        input: {
          ...createScopeFor(user),
          expenseTypeId,
          amountCents,
          description: description.trim(),
          frequency,
          startDate: startDate.toISOString(),
          endDate: endDate ? endDate.toISOString() : null,
        },
      },
    })
      .then(() => {
        setAmount('');
        setDescription('');
        setEndDate(null);
        return refetch();
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleToggleActive = (item: RecurringItem) => {
    setFormError(null);
    updateRecurring({ variables: { input: { recurringExpenseId: item.id, active: !item.active } } })
      .then(() => refetch())
      .catch((err) => setFormError((err as Error).message));
  };

  const handleDelete = (item: RecurringItem) => {
    Alert.alert('Delete this recurring expense?', 'Entries it already generated are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setFormError(null);
          deleteRecurring({ variables: { recurringExpenseId: item.id } })
            .then(() => refetch())
            .catch((err) => setFormError((err as Error).message));
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            Rent, a subscription, anything on a schedule. A real expense entry is generated
            automatically each time one comes due - if a single occurrence&apos;s amount changes
            (a utility bill, say), edit that entry on the Expenses page rather than here; this only
            changes the template going forward.
          </ThemedText>

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          {loading && recurring.length === 0 ? (
            <ActivityIndicator color={theme.text} testID="recurring-expenses-loading" />
          ) : recurring.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary" testID="recurring-expenses-empty">
              {error ? 'Could not load recurring expenses.' : 'No recurring expenses set up yet.'}
            </ThemedText>
          ) : (
            recurring.map((item) => (
              <View key={item.id} style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`recurring-expense-row-${item.id}`}>
                <View style={styles.rowBody}>
                  <ThemedText type="default">
                    {item.expenseType?.name ?? 'Unknown category'} — {formatCents(item.amountCents)} /{' '}
                    {FREQUENCIES.find((f) => f.id === item.frequency)?.label ?? item.frequency}
                    {!item.active ? ' · Paused' : ''}
                  </ThemedText>
                  {item.description ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.description}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="small" themeColor="textSecondary">
                    Next: {formatUtcCalendarDate(item.nextRunDate)}
                    {item.endDate ? ` · Ends ${formatUtcCalendarDate(item.endDate)}` : ''}
                  </ThemedText>
                </View>
                <View style={styles.rowActions}>
                  <Button
                    label={item.active ? 'Pause' : 'Resume'}
                    variant="secondary"
                    onPress={() => handleToggleActive(item)}
                    testID={`recurring-expense-toggle-${item.id}`}
                  />
                  <Button
                    label="Delete"
                    variant="danger"
                    onPress={() => handleDelete(item)}
                    testID={`recurring-expense-delete-${item.id}`}
                  />
                </View>
              </View>
            ))
          )}

          <View style={styles.card}>
            <ThemedText type="smallBold">New recurring expense</ThemedText>
            <PillRow
              options={expenseTypes.map((t) => ({ id: t.id, label: t.name }))}
              selectedId={expenseTypeId}
              onSelect={setExpenseTypeId}
              testID="recurring-expense-new-category"
            />
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount $"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="recurring-expense-new-amount"
            />
            <PillRow
              options={FREQUENCIES}
              selectedId={frequency}
              onSelect={(id) => setFrequency(id as 'weekly' | 'monthly' | 'yearly')}
              testID="recurring-expense-new-frequency"
            />
            <DateField label="First occurrence" value={startDate} onChange={setStartDate} testID="recurring-expense-new-start" />
            <View style={styles.endDateRow}>
              <DateField label="Ends (optional)" value={endDate ?? startDate} onChange={setEndDate} testID="recurring-expense-new-end" />
              {endDate ? (
                <Button label="Clear end date" variant="secondary" onPress={() => setEndDate(null)} testID="recurring-expense-clear-end" />
              ) : null}
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="recurring-expense-new-description"
            />
            <Button
              label={creating ? 'Adding…' : 'Add Recurring Expense'}
              onPress={handleAdd}
              loading={creating}
              disabled={!expenseTypeId || dollarsToCents(amount) <= 0}
              testID="recurring-expense-add"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PillRow({
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
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
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
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    gap: Spacing.half,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  endDateRow: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  error: {
    color: '#D33',
  },
});
