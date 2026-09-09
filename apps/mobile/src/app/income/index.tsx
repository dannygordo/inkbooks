import {
  useDeleteIncomeMutation,
  useGetIncomeTypesListQuery,
  useGetIncomesListQuery,
  useRecordIncomeMutation,
  useUpdateIncomeMutation,
  type GetIncomesListQuery,
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

type IncomeItem = GetIncomesListQuery['getIncomes']['items'][number];
type IncomeTypeOption = { id: string; name: string };

/**
 * Non-tattoo income - the income-side mirror of the upcoming Expenses slice. Tattoo income isn't
 * logged here at all; it's derived automatically from completed appointments and shows on the
 * (unbuilt-on-mobile) dashboard - this screen is only for everything else a shop or artist takes
 * in. No header-link role gate mismatch to worry about here beyond `canManageBusinessLedger`
 * itself (index.tsx's own header link) - there's no separate in-screen guard, matching every
 * other role-gated mobile screen's precedent (Shops, Artists, Staff, Shop Cut Confirmations all
 * rely on the header link alone, plus the server's own real enforcement). See DECISIONS.md X26.
 *
 * Category management (create/edit/deactivate an IncomeType) is Settings-only on web
 * (IncomeTypesPanel.jsx) - this screen only reads types for its category picker, same as web's
 * own Income.jsx.
 *
 * Date-range picker is trimmed to the five presets `businessRanges.ts` builds - no custom range
 * (two free-form date pickers to define an arbitrary window), a named scope cut rather than an
 * oversight (see that file's own header comment).
 *
 * Category/amount/date pickers use a pill row and DateField rather than a native `<select>`-style
 * dropdown - matching DurationPicker.tsx's own precedent that there is no cross-platform select
 * primitive in this app, and a short, closed list of categories doesn't need one.
 */
export default function IncomeScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const presets = buildPresetRanges();
  const range = presets.find((p) => p.key === rangeKey) ?? presets[0];

  if (!user) {
    return null;
  }
  const scope = businessScopeFor(user);

  const { data: typesData } = useGetIncomeTypesListQuery({ variables: scope, fetchPolicy: 'cache-and-network' });
  const incomeTypes: IncomeTypeOption[] = typesData?.getIncomeTypes ?? [];

  const { data, loading, error, fetchMore, refetch } = useGetIncomesListQuery({
    variables: { ...scope, start: range.start.toISOString(), end: range.end.toISOString(), page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });
  const incomes = data?.getIncomes.items ?? [];
  const pageInfo = data?.getIncomes.pageInfo;
  const totalCents = incomes.reduce((sum, item) => sum + item.amountCents, 0);

  const [recordIncome, { loading: recording }] = useRecordIncomeMutation();
  const [updateIncome] = useUpdateIncomeMutation();
  const [deleteIncome] = useDeleteIncomeMutation();

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
    fetchMore({ variables: { ...scope, start: range.start.toISOString(), end: range.end.toISOString(), page: { limit: PAGE_SIZE, offset: incomes.length } } }).catch(() => {});
  };

  const handleAdd = () => {
    setFormError(null);
    const amountCents = dollarsToCents(newAmount);
    if (!newTypeId || amountCents <= 0) {
      return;
    }
    recordIncome({
      variables: {
        input: {
          ...createScopeFor(user),
          incomeTypeId: newTypeId,
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

  const startEdit = (item: IncomeItem) => {
    setEditingId(item.id);
    setEditTypeId(item.incomeTypeId);
    setEditAmount(String(centsToDollars(item.amountCents)));
    setEditDescription(item.description ?? '');
    setEditDate(new Date(item.date));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (item: IncomeItem) => {
    const amountCents = dollarsToCents(editAmount);
    if (amountCents <= 0) {
      return;
    }
    updateIncome({
      variables: {
        input: {
          incomeId: item.id,
          incomeTypeId: editTypeId,
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

  const handleDelete = (item: IncomeItem) => {
    Alert.alert('Delete this income entry?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteIncome({ variables: { incomeId: item.id } })
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
            Income that isn&apos;t tattoo work - tattoo revenue is tracked automatically from
            completed appointments. Categories are managed under Settings on the web app.
          </ThemedText>

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          <View style={styles.card}>
            <ThemedText type="smallBold">Log Income</ThemedText>
            <PillRow
              options={incomeTypes.map((t) => ({ id: t.id, label: t.name }))}
              selectedId={newTypeId}
              onSelect={setNewTypeId}
              testID="income-new-category"
            />
            <TextInput
              value={newAmount}
              onChangeText={setNewAmount}
              placeholder="Amount $"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="income-new-amount"
            />
            <DateField label="Date" value={newDate} onChange={setNewDate} testID="income-new-date" />
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="income-new-description"
            />
            <Button
              label={recording ? 'Logging…' : 'Log Income'}
              onPress={handleAdd}
              loading={recording}
              disabled={!newTypeId || dollarsToCents(newAmount) <= 0}
              testID="income-log-button"
            />
          </View>

          <PillRow
            options={presets.map((p) => ({ id: p.key, label: p.label }))}
            selectedId={rangeKey}
            onSelect={(key) => changeRange(key as RangeKey)}
            testID="income-range"
          />

          {loading && incomes.length === 0 ? (
            <ActivityIndicator color={theme.text} testID="income-loading" />
          ) : (
            <>
              {incomes.length > 0 ? (
                <ThemedText type="smallBold" testID="income-total">
                  Total shown: {formatCents(totalCents)}
                </ThemedText>
              ) : null}

              {incomes.length === 0 ? (
                <ThemedText type="default" themeColor="textSecondary" testID="income-empty">
                  {error ? 'Could not load income.' : 'No other income logged in this range.'}
                </ThemedText>
              ) : (
                incomes.map((item) => (
                  <View key={item.id} style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`income-row-${item.id}`}>
                    {editingId === item.id ? (
                      <View style={styles.editForm}>
                        <PillRow
                          options={incomeTypes.map((t) => ({ id: t.id, label: t.name }))}
                          selectedId={editTypeId}
                          onSelect={setEditTypeId}
                          testID={`income-edit-category-${item.id}`}
                        />
                        <TextInput
                          value={editAmount}
                          onChangeText={setEditAmount}
                          keyboardType="decimal-pad"
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                          testID={`income-edit-amount-${item.id}`}
                        />
                        <DateField label="Date" value={editDate} onChange={setEditDate} testID={`income-edit-date-${item.id}`} />
                        <TextInput
                          value={editDescription}
                          onChangeText={setEditDescription}
                          placeholder="Description"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                          testID={`income-edit-description-${item.id}`}
                        />
                        <View style={styles.rowActions}>
                          <Button label="Save" onPress={() => saveEdit(item)} testID={`income-save-${item.id}`} />
                          <Button label="Cancel" variant="secondary" onPress={cancelEdit} testID={`income-cancel-${item.id}`} />
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={styles.rowBody}>
                          <ThemedText type="default">{formatCents(item.amountCents)}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {item.incomeType?.name || 'Uncategorized'}
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
                          <Button label="Edit" variant="secondary" onPress={() => startEdit(item)} testID={`income-edit-${item.id}`} />
                          <Button label="Delete" variant="danger" onPress={() => handleDelete(item)} testID={`income-delete-${item.id}`} />
                        </View>
                      </>
                    )}
                  </View>
                ))
              )}

              {pageInfo?.hasMore ? (
                <Button label="Load more" variant="secondary" onPress={loadMore} testID="income-load-more" />
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
