import {
  useDeleteExpenseMutation,
  useGetExpenseTypesListQuery,
  useGetExpensesListQuery,
  useRecordExpenseMutation,
  useUpdateExpenseMutation,
  type GetExpensesListQuery,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { buildPresetRanges, type RangeKey } from '@/utils/businessRanges';
import { businessScopeFor, createScopeFor } from '@/utils/businessScope';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { centsToDollars, dollarsToCents, formatCents } from '@/utils/money';

const PAGE_SIZE = 25;

type ExpenseItem = GetExpensesListQuery['getExpenses']['items'][number];
type ExpenseTypeOption = { id: string; name: string };

/**
 * The real expense ledger - structurally identical to income/index.tsx (see that screen's own
 * header comment for the shared ownership/scoping/range/picker conventions this reuses
 * unchanged: `canManageBusinessLedger`, `businessScopeFor`/`createScopeFor`, `businessRanges.ts`'s
 * five presets, `DateField`, and the pill-row category picker). See DECISIONS.md X27.
 *
 * **Recurring Expenses (create/edit/deactivate a TEMPLATE that generates real rows on a
 * schedule) is NOT ported** - a full separate CRUD subsystem, Settings-only on web
 * (RecurringExpensesPanel), out of scope for this slice. Only the read-only "Recurring" chip on a
 * generated row survives (`recurringExpenseId` set), matching web's own `Expenses.jsx` exactly -
 * editing or deleting a generated row only ever affects that one occurrence, never its template,
 * so no special-casing beyond the chip is needed either on web or here.
 */
export default function ExpensesScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const presets = buildPresetRanges();
  const range = presets.find((p) => p.key === rangeKey) ?? presets[0];

  if (!user) {
    return null;
  }
  const scope = businessScopeFor(user);

  const { data: typesData } = useGetExpenseTypesListQuery({ variables: scope, fetchPolicy: 'cache-and-network' });
  const expenseTypes: ExpenseTypeOption[] = typesData?.getExpenseTypes ?? [];

  const { data, loading, error, fetchMore, refetch } = useGetExpensesListQuery({
    variables: { ...scope, start: range.start.toISOString(), end: range.end.toISOString(), page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });
  const expenses = data?.getExpenses.items ?? [];
  const pageInfo = data?.getExpenses.pageInfo;
  const totalCents = expenses.reduce((sum, item) => sum + item.amountCents, 0);

  const [recordExpense, { loading: recording }] = useRecordExpenseMutation();
  const [updateExpense] = useUpdateExpenseMutation();
  const [deleteExpense] = useDeleteExpenseMutation();

  const [newTypeId, setNewTypeId] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDate, setNewDate] = useState(() => new Date());
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTypeId, setEditTypeId] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState(() => new Date());

  const changeRange = (key: RangeKey) => {
    setRangeKey(key);
    const next = presets.find((p) => p.key === key) ?? presets[0];
    refetch({ ...scope, start: next.start.toISOString(), end: next.end.toISOString(), page: { limit: PAGE_SIZE, offset: 0 } }).catch(() => {});
  };

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({ variables: { ...scope, start: range.start.toISOString(), end: range.end.toISOString(), page: { limit: PAGE_SIZE, offset: expenses.length } } }).catch(() => {});
  };

  const handleAdd = () => {
    setFormError(null);
    const amountCents = dollarsToCents(newAmount);
    if (!newTypeId || amountCents <= 0) {
      return;
    }
    recordExpense({
      variables: {
        input: {
          ...createScopeFor(user),
          expenseTypeId: newTypeId,
          amountCents,
          description: newDescription.trim(),
          date: newDate.toISOString(),
        },
      },
    })
      .then(() => {
        setNewAmount('');
        setNewDescription('');
        setNewDate(new Date());
        return refetch();
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const startEdit = (item: ExpenseItem) => {
    setEditingId(item.id);
    setEditTypeId(item.expenseTypeId);
    setEditAmount(String(centsToDollars(item.amountCents)));
    setEditDescription(item.description ?? '');
    setEditDate(new Date(item.date));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (item: ExpenseItem) => {
    const amountCents = dollarsToCents(editAmount);
    if (amountCents <= 0) {
      return;
    }
    updateExpense({
      variables: {
        input: {
          expenseId: item.id,
          expenseTypeId: editTypeId,
          amountCents,
          description: editDescription.trim(),
          date: editDate.toISOString(),
        },
      },
    })
      .then(() => {
        setEditingId(null);
        return refetch();
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleDelete = (item: ExpenseItem) => {
    Alert.alert('Delete this expense entry?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteExpense({ variables: { expenseId: item.id } })
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
            Categories and recurring expenses are managed under Settings on the web app - this
            screen logs one-off entries and shows everything a recurring template has already
            generated.
          </ThemedText>

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          <View style={styles.card}>
            <ThemedText type="smallBold">Log Expense</ThemedText>
            <PillRow
              options={expenseTypes.map((t) => ({ id: t.id, label: t.name }))}
              selectedId={newTypeId}
              onSelect={setNewTypeId}
              testID="expenses-new-category"
            />
            <TextInput
              value={newAmount}
              onChangeText={setNewAmount}
              placeholder="Amount $"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="expenses-new-amount"
            />
            <DateField label="Date" value={newDate} onChange={setNewDate} testID="expenses-new-date" />
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="expenses-new-description"
            />
            <Button
              label={recording ? 'Logging…' : 'Log Expense'}
              onPress={handleAdd}
              loading={recording}
              disabled={!newTypeId || dollarsToCents(newAmount) <= 0}
              testID="expenses-log-button"
            />
          </View>

          <PillRow
            options={presets.map((p) => ({ id: p.key, label: p.label }))}
            selectedId={rangeKey}
            onSelect={(key) => changeRange(key as RangeKey)}
            testID="expenses-range"
          />

          {loading && expenses.length === 0 ? (
            <ActivityIndicator color={theme.text} testID="expenses-loading" />
          ) : (
            <>
              {expenses.length > 0 ? (
                <ThemedText type="smallBold" testID="expenses-total">
                  Total shown: {formatCents(totalCents)}
                </ThemedText>
              ) : null}

              {expenses.length === 0 ? (
                <ThemedText type="default" themeColor="textSecondary" testID="expenses-empty">
                  {error ? 'Could not load expenses.' : 'No expenses logged in this range.'}
                </ThemedText>
              ) : (
                expenses.map((item) => (
                  <View key={item.id} style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`expenses-row-${item.id}`}>
                    {editingId === item.id ? (
                      <View style={styles.editForm}>
                        <PillRow
                          options={expenseTypes.map((t) => ({ id: t.id, label: t.name }))}
                          selectedId={editTypeId}
                          onSelect={setEditTypeId}
                          testID={`expenses-edit-category-${item.id}`}
                        />
                        <TextInput
                          value={editAmount}
                          onChangeText={setEditAmount}
                          keyboardType="decimal-pad"
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                          testID={`expenses-edit-amount-${item.id}`}
                        />
                        <DateField label="Date" value={editDate} onChange={setEditDate} testID={`expenses-edit-date-${item.id}`} />
                        <TextInput
                          value={editDescription}
                          onChangeText={setEditDescription}
                          placeholder="Description"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                          testID={`expenses-edit-description-${item.id}`}
                        />
                        <View style={styles.rowActions}>
                          <Button label="Save" onPress={() => saveEdit(item)} testID={`expenses-save-${item.id}`} />
                          <Button label="Cancel" variant="secondary" onPress={cancelEdit} testID={`expenses-cancel-${item.id}`} />
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={styles.rowBody}>
                          <View style={styles.amountRow}>
                            <ThemedText type="default">{formatCents(item.amountCents)}</ThemedText>
                            {item.recurringExpenseId ? (
                              <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]} testID={`expenses-recurring-${item.id}`}>
                                <ThemedText type="small" themeColor="textSecondary">
                                  Recurring
                                </ThemedText>
                              </View>
                            ) : null}
                          </View>
                          <ThemedText type="small" themeColor="textSecondary">
                            {item.expenseType?.name || 'Uncategorized'}
                          </ThemedText>
                          {item.description ? (
                            <ThemedText type="small" themeColor="textSecondary">
                              {item.description}
                            </ThemedText>
                          ) : null}
                          <ThemedText type="small" themeColor="textSecondary">
                            {new Date(item.date).toLocaleDateString()}
                            {item.createdBy ? ` · logged by ${item.createdBy.firstName} ${item.createdBy.lastName}` : ''}
                          </ThemedText>
                        </View>
                        <View style={styles.rowActions}>
                          <Button label="Edit" variant="secondary" onPress={() => startEdit(item)} testID={`expenses-edit-${item.id}`} />
                          <Button label="Delete" variant="danger" onPress={() => handleDelete(item)} testID={`expenses-delete-${item.id}`} />
                        </View>
                      </>
                    )}
                  </View>
                ))
              )}

              {pageInfo?.hasMore ? (
                <Button label="Load more" variant="secondary" onPress={loadMore} testID="expenses-load-more" />
              ) : null}
            </>
          )}
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
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    gap: Spacing.half,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  editForm: {
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
