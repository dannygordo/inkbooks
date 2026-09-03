import {
  useCreateIncomeTypeMutation,
  useGetIncomeTypesForSettingsQuery,
  useUpdateIncomeTypeMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { businessScopeFor, createScopeFor } from '@/utils/businessScope';

/**
 * Income category management - apps/web's Settings > Income (IncomeTypesPanel.jsx). Named as
 * out-of-scope for income/index.tsx's own port (X26: "Category management... is Settings-only on
 * web... out of scope for this page's port") - this is that follow-up. See DECISIONS.md X31.
 *
 * Deactivate/Reactivate, never delete - matches web exactly (server/models/IncomeType.js: a type
 * already referenced by an existing Income row can't simply disappear). A deactivated type still
 * shows here (GetIncomeTypesForSettings passes includeInactive: true), unlike income/index.tsx's
 * own picker, which only ever wants the active list.
 */
export default function IncomeTypesSettingsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!user) {
    return null;
  }
  const scope = businessScopeFor(user);

  const { data, loading, error, refetch } = useGetIncomeTypesForSettingsQuery({
    variables: { ...scope, includeInactive: true },
    fetchPolicy: 'cache-and-network',
  });
  const types = data?.getIncomeTypes ?? [];

  const [createType, { loading: creating }] = useCreateIncomeTypeMutation();
  const [updateType] = useUpdateIncomeTypeMutation();

  const handleAdd = () => {
    if (!newName.trim()) {
      return;
    }
    setFormError(null);
    createType({
      variables: {
        input: { ...createScopeFor(user), name: newName.trim(), description: newDescription.trim() },
      },
    })
      .then(() => {
        setNewName('');
        setNewDescription('');
        return refetch();
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleToggleActive = (type: { id: string; active: boolean }) => {
    setFormError(null);
    updateType({ variables: { input: { incomeTypeId: type.id, active: !type.active } } })
      .then(() => refetch())
      .catch((err) => setFormError((err as Error).message));
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            What non-tattoo income gets logged against - retail sales, piercing, booth rent
            collected, anything that isn&apos;t a tattoo session&apos;s own charge.
          </ThemedText>

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          {loading && types.length === 0 ? (
            <ActivityIndicator color={theme.text} testID="income-types-loading" />
          ) : types.length === 0 ? (
            <ThemedText type="default" themeColor="textSecondary" testID="income-types-empty">
              {error ? 'Could not load income categories.' : 'No income categories yet.'}
            </ThemedText>
          ) : (
            types.map((type) => (
              <View key={type.id} style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`income-type-row-${type.id}`}>
                <View style={styles.rowBody}>
                  <ThemedText type="default">
                    {type.name}
                    {!type.active ? ' · Inactive' : ''}
                  </ThemedText>
                  {type.description ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {type.description}
                    </ThemedText>
                  ) : null}
                </View>
                <Button
                  label={type.active ? 'Deactivate' : 'Reactivate'}
                  variant="secondary"
                  onPress={() => handleToggleActive(type)}
                  testID={`income-type-toggle-${type.id}`}
                />
              </View>
            ))
          )}

          <View style={styles.card}>
            <ThemedText type="smallBold">New category</ThemedText>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Retail/Merch"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="income-type-new-name"
            />
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="income-type-new-description"
            />
            <Button
              label={creating ? 'Adding…' : 'Add Category'}
              onPress={handleAdd}
              loading={creating}
              disabled={!newName.trim()}
              testID="income-type-add"
            />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.half,
  },
  error: {
    color: '#D33',
  },
});
