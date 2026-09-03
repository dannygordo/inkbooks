import {
  useCreateFormFromBuilderMutation,
  useGetFormForEditQuery,
  useUpdateFormMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { businessScopeFor, createScopeFor } from '@/utils/businessScope';
import {
  canSaveForm,
  fieldNeedsMoreOptions,
  fieldsForInput,
  localFieldFromServer,
  moveField,
  newLocalField,
  type LocalFormField,
} from '@/utils/formBuilder';
import { FORM_FIELD_TYPE_OPTIONS, formStatusLabel, isChoiceFieldType } from '@/utils/formConstants';

/**
 * Create/edit a form's title, description, link slug, shop-use-only flag, and fields - the piece
 * of Forms that forms/index.tsx's own header comment named as deliberately not ported in X28. A
 * direct port of apps/web's FormBuilder.jsx, with two scope cuts named here rather than silently:
 *
 * FIELD REORDER: web drags fields via @dnd-kit (FormFieldEditorRow.jsx). No cross-platform drag
 * primitive exists in this app - matches DurationPicker.tsx's own "no cross-platform select
 * primitive, use a pill row instead" precedent for the same underlying gap. The substitute here is
 * a pair of Up/Down buttons per field row, backed by utils/formBuilder.ts's pure `moveField`.
 * The type picker below uses that same pill-row idea, via the shared `PillRow` component
 * (extracted from this file into components/PillRow.tsx in X37, once a second screen needed it).
 *
 * PUBLISH/ARCHIVE/GUEST-LINK/RESPONSES ACTIONS: web's FormBuilder shows all four once a form is
 * real (task #145). Mobile's forms/index.tsx list screen already carries every one of them per
 * row (X28) - duplicating them here would mean two places doing the same mutations for no reason.
 * This screen shows the form's status as a read-only chip-like line instead and leaves those
 * actions on the list.
 *
 * TWO MODES, one screen, keyed off the :id route param - matches web's :formId === "new" exactly:
 *   /form/new   - no server form exists yet; purely local state until Save calls createForm.
 *   /form/:id   - loads the existing Form via GetFormForEdit and edits it in place; Save calls
 *                 updateForm.
 *
 * The booking_request system form is redirected away from here (back to the Forms list) exactly
 * like web redirects to its own restricted booking-fields editor - that editor isn't ported on
 * mobile at all (see forms/index.tsx's own comment), so there's nowhere to send someone who lands
 * here for it besides back.
 *
 * The "always asks First Name/Last Name/Email/Phone first" notice is carried over verbatim from
 * web - it's not a field on the form, just a description of something the server always does
 * first on every public link (see typeDefs.js's own comment on this, quoted in FormBuilder.jsx).
 */
export default function FormBuilderScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const formId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isNew = formId === 'new';
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [shopUseOnly, setShopUseOnly] = useState(false);
  const [fields, setFields] = useState<LocalFormField[]>([]);
  const [loadedFormId, setLoadedFormId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, loading } = useGetFormForEditQuery({
    variables: { formId: formId ?? '' },
    skip: isNew || !formId,
    fetchPolicy: 'cache-and-network',
  });
  const loadedForm = data?.getForm;

  useEffect(() => {
    if (loadedForm && loadedForm.id !== loadedFormId) {
      setTitle(loadedForm.title);
      setDescription(loadedForm.description ?? '');
      setSlug(loadedForm.slug ?? '');
      setShopUseOnly(Boolean(loadedForm.shopUseOnly));
      setFields(loadedForm.fields.map(localFieldFromServer));
      setLoadedFormId(loadedForm.id);
    }
  }, [loadedForm, loadedFormId]);

  // See this screen's own header comment - the booking_request system form has its own restricted
  // editor on web, not ported here, so there's nowhere to send someone but back to the list.
  useEffect(() => {
    if (loadedForm?.systemKey === 'booking_request') {
      router.replace('/forms');
    }
  }, [loadedForm, router]);

  const [createForm, { loading: creating }] = useCreateFormFromBuilderMutation();
  const [updateForm, { loading: updating }] = useUpdateFormMutation();

  if (!user) {
    return null;
  }
  const scope = businessScopeFor(user);

  if (!isNew && loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="form-builder-loading" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }
  if (!isNew && !loading && !loadedForm) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="form-builder-not-found">
              This form could not be found.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const updateFieldAt = (localId: string, patch: Partial<LocalFormField>) => {
    setFields((prev) => prev.map((f) => (f._localId === localId ? { ...f, ...patch } : f)));
  };

  const removeFieldAt = (localId: string) => {
    setFields((prev) => prev.filter((f) => f._localId !== localId));
  };

  const moveFieldAt = (index: number, direction: 'up' | 'down') => {
    setFields((prev) => moveField(prev, index, direction));
  };

  const addOption = (localId: string) => {
    const target = fields.find((f) => f._localId === localId);
    updateFieldAt(localId, { options: [...(target?.options ?? []), ''] });
  };

  const updateOption = (localId: string, idx: number, value: string) => {
    const target = fields.find((f) => f._localId === localId);
    const options = [...(target?.options ?? [])];
    options[idx] = value;
    updateFieldAt(localId, { options });
  };

  const removeOption = (localId: string, idx: number) => {
    const target = fields.find((f) => f._localId === localId);
    updateFieldAt(localId, { options: (target?.options ?? []).filter((_, i) => i !== idx) });
  };

  const canSave = canSaveForm(title, fields);
  const saving = creating || updating;

  const handleSave = () => {
    if (!canSave) {
      return;
    }
    setSaveError(null);
    if (isNew) {
      createForm({
        variables: {
          input: {
            ...createScopeFor(user),
            title: title.trim(),
            description: description.trim(),
            slug: slug.trim() || null,
            shopUseOnly,
            fields: fieldsForInput(fields),
          },
        },
      })
        .then((result) => {
          const newId = result.data?.createForm.id;
          if (newId) {
            router.replace({ pathname: '/form/[id]', params: { id: newId } });
          } else {
            router.back();
          }
        })
        .catch((err) => setSaveError((err as Error).message));
    } else {
      updateForm({
        variables: {
          input: {
            formId: formId ?? '',
            title: title.trim(),
            description: description.trim(),
            slug: slug.trim() || null,
            shopUseOnly,
            fields: fieldsForInput(fields),
          },
        },
      })
        .then(() => router.back())
        .catch((err) => setSaveError((err as Error).message));
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{isNew ? 'New Form' : 'Edit Form'}</ThemedText>

          {!isNew && loadedForm ? (
            <ThemedText type="small" themeColor="textSecondary" testID="form-builder-status">
              {formStatusLabel(loadedForm.status)}
              {loadedForm.systemKey ? ' · Default form' : ''}
            </ThemedText>
          ) : null}

          {saveError ? (
            <ThemedText type="small" style={styles.error}>
              {saveError}
            </ThemedText>
          ) : null}

          <View style={styles.card}>
            <ThemedText type="small">Title</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="form-builder-title"
            />

            <ThemedText type="small">Description (optional)</ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="form-builder-description"
            />

            <ThemedText type="small">Link (optional)</ThemedText>
            <TextInput
              value={slug}
              onChangeText={setSlug}
              placeholder="e.g. consent, intake"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="form-builder-slug"
            />
            <ThemedText type="small" themeColor="textSecondary">
              Sets the first part of this form&apos;s public link. Leave blank until you&apos;re
              ready to publish a public link for it.
            </ThemedText>

            {'shopId' in scope ? (
              <View style={styles.toggleRow}>
                <ThemedText type="small" style={styles.toggleLabel}>
                  Shop use only - one shared link for the whole shop, instead of a link per artist
                </ThemedText>
                <Switch value={shopUseOnly} onValueChange={setShopUseOnly} testID="form-builder-shop-use-only" />
              </View>
            ) : null}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
            Every public link for this form always asks first, before your questions below: First
            name, Last name, Email, and Phone. This isn&apos;t one of your fields and can&apos;t be
            edited or removed here - it&apos;s how a guest&apos;s response gets matched to the
            right client record.
          </ThemedText>

          <View style={styles.fieldsList}>
            {fields.map((field, index) => (
              <View
                key={field._localId}
                style={[styles.fieldRow, { borderColor: theme.backgroundSelected }]}
                testID={`form-builder-field-${field._localId}`}
              >
                <View style={styles.fieldTopLine}>
                  <View style={styles.moveButtons}>
                    <Button
                      label="↑"
                      variant="secondary"
                      onPress={() => moveFieldAt(index, 'up')}
                      disabled={index === 0}
                      testID={`form-builder-field-up-${field._localId}`}
                    />
                    <Button
                      label="↓"
                      variant="secondary"
                      onPress={() => moveFieldAt(index, 'down')}
                      disabled={index === fields.length - 1}
                      testID={`form-builder-field-down-${field._localId}`}
                    />
                  </View>
                  <Button
                    label="Remove"
                    variant="danger"
                    onPress={() => removeFieldAt(field._localId)}
                    testID={`form-builder-field-remove-${field._localId}`}
                  />
                </View>

                <TextInput
                  value={field.label}
                  onChangeText={(value) => updateFieldAt(field._localId, { label: value })}
                  placeholder="Question"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  testID={`form-builder-field-label-${field._localId}`}
                />

                <PillRow
                  options={FORM_FIELD_TYPE_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
                  selectedId={field.type}
                  onSelect={(value) => updateFieldAt(field._localId, { type: value })}
                  testID={`form-builder-field-type-${field._localId}`}
                />

                <TextInput
                  value={field.helpText}
                  onChangeText={(value) => updateFieldAt(field._localId, { helpText: value })}
                  placeholder="Help text (optional)"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  testID={`form-builder-field-help-${field._localId}`}
                />

                <View style={styles.toggleRow}>
                  <ThemedText type="small">Required</ThemedText>
                  <Switch
                    value={field.required}
                    onValueChange={(value) => updateFieldAt(field._localId, { required: value })}
                    testID={`form-builder-field-required-${field._localId}`}
                  />
                </View>

                {isChoiceFieldType(field.type) ? (
                  <View style={styles.optionsList}>
                    {field.options.map((option, idx) => (
                      <View key={idx} style={styles.optionRow}>
                        <TextInput
                          value={option}
                          onChangeText={(value) => updateOption(field._localId, idx, value)}
                          placeholder={`Option ${idx + 1}`}
                          placeholderTextColor={theme.textSecondary}
                          style={[
                            styles.input,
                            styles.optionInput,
                            { color: theme.text, borderColor: theme.backgroundSelected },
                          ]}
                          testID={`form-builder-option-${field._localId}-${idx}`}
                        />
                        <Button
                          label="Remove"
                          variant="danger"
                          onPress={() => removeOption(field._localId, idx)}
                          testID={`form-builder-option-remove-${field._localId}-${idx}`}
                        />
                      </View>
                    ))}
                    <Button
                      label="Add option"
                      variant="secondary"
                      onPress={() => addOption(field._localId)}
                      testID={`form-builder-add-option-${field._localId}`}
                    />
                    {fieldNeedsMoreOptions(field) ? (
                      <ThemedText type="small" style={styles.error}>
                        A choice field needs at least two options.
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          <Button
            label="Add Field"
            variant="secondary"
            onPress={() => setFields((prev) => [...prev, newLocalField()])}
            testID="form-builder-add-field"
          />

          <Button
            label={saving ? 'Saving…' : isNew ? 'Create Form' : 'Save Changes'}
            onPress={handleSave}
            loading={saving}
            disabled={!canSave}
            fullWidth
            testID="form-builder-save"
          />
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
  notice: {
    fontStyle: 'italic',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  toggleLabel: {
    flex: 1,
  },
  fieldsList: {
    gap: Spacing.three,
  },
  fieldRow: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  fieldTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moveButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  optionsList: {
    gap: Spacing.two,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  optionInput: {
    flex: 1,
  },
  error: {
    color: '#D33',
  },
});
