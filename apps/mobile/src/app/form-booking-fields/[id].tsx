import {
  useGetFormForEditQuery,
  useUpdateBookingRequestFieldsMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { moveField } from '@/utils/formBuilder';

/**
 * The booking_request system form's own restricted editor - forms/index.tsx's "Edit Fields"
 * action on that one row, and form/[id].tsx's own redirect target if it's ever reached with a
 * booking_request form's id (see both files' header comments). Direct port of apps/web's
 * BookingRequestFieldsEditor.jsx.
 *
 * Deliberately NOT form/[id].tsx's generic FormBuilder: the real BookingRequest pipeline
 * (server's mutations/bookingRequests.js, the BookingRequest model, the public /book/:artistHandle
 * page) stays completely untouched - it always accepts exactly these seven optional slots
 * (placement, size, budget, availability, howHeard, isCoverUp, referenceImages) and no others.
 * This screen can only REORDER them, RELABEL them, and toggle REQUIRED/HIDDEN - never add one,
 * remove one, or change its type, because the pipeline underneath has no way to honor any of
 * that. `updateBookingRequestFields` (server's resolvers/forms.js) enforces the same exact-key-set
 * restriction independently - this screen not offering Add/Remove controls is a UX nicety, not
 * the actual guarantee.
 *
 * FIELD REORDER: web drags fields via @dnd-kit. Same gap named in form/[id].tsx's own header
 * comment (no cross-platform drag primitive anywhere in this app) - a pair of Up/Down buttons per
 * row substitutes, reusing utils/formBuilder.ts's `moveField` (generalized in X54 to work over
 * this screen's own narrower field shape too, not just LocalFormField).
 *
 * Reuses GetFormForEdit (packages/api's forms.graphql) rather than a dedicated query - the same
 * getForm resolver web's BookingRequestFieldsEditor calls through FormService.getForm, and the
 * generic FormBuilder screen already selects everything this one needs except `hidden`, which was
 * added to that query for this screen's sake.
 */

type BookingField = {
  key: string;
  label: string;
  required: boolean;
  hidden: boolean;
};

export default function BookingRequestFieldsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const formId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const theme = useTheme();

  const [fields, setFields] = useState<BookingField[]>([]);
  const [loadedFormId, setLoadedFormId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, loading } = useGetFormForEditQuery({
    variables: { formId: formId ?? '' },
    skip: !formId,
    fetchPolicy: 'cache-and-network',
  });
  const loadedForm = data?.getForm;

  useEffect(() => {
    if (loadedForm && loadedForm.id !== loadedFormId) {
      setFields(
        loadedForm.fields.map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          hidden: f.hidden,
        }))
      );
      setLoadedFormId(loadedForm.id);
    }
  }, [loadedForm, loadedFormId]);

  const [updateBookingRequestFields, { loading: saving }] = useUpdateBookingRequestFieldsMutation();

  if (!formId) {
    return null;
  }

  if (loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="booking-fields-loading" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!loading && !loadedForm) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="booking-fields-not-found">
              This form could not be found.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loadedForm && loadedForm.systemKey !== 'booking_request') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="booking-fields-wrong-form">
              This isn&apos;t the booking request form.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const updateFieldAt = (key: string, patch: Partial<BookingField>) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const moveFieldAt = (index: number, direction: 'up' | 'down') => {
    setFields((prev) => moveField(prev, index, direction));
  };

  const handleSave = () => {
    setSaveError(null);
    updateBookingRequestFields({
      variables: {
        formId,
        fields: fields.map((f) => ({
          key: f.key,
          label: f.label.trim() || f.key,
          required: f.required,
          hidden: f.hidden,
        })),
      },
    })
      .then(() => router.back())
      .catch((err) => setSaveError((err as Error).message));
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">Booking Request Fields</ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.notice}>
            Reorder, relabel, mark required, or hide the optional questions on your booking
            request page. Name, email, phone, and the description field always show and
            can&apos;t be changed here - the booking request pipeline itself is untouched by this
            screen.
          </ThemedText>

          {saveError ? (
            <ThemedText type="small" style={styles.error}>
              {saveError}
            </ThemedText>
          ) : null}

          <View style={styles.fieldsList}>
            {fields.map((field, index) => (
              <View
                key={field.key}
                style={[styles.fieldRow, { borderColor: theme.backgroundSelected }]}
                testID={`booking-field-${field.key}`}
              >
                <View style={styles.fieldTopLine}>
                  <View style={styles.moveButtons}>
                    <Button
                      label="↑"
                      variant="secondary"
                      onPress={() => moveFieldAt(index, 'up')}
                      disabled={index === 0}
                      testID={`booking-field-up-${field.key}`}
                    />
                    <Button
                      label="↓"
                      variant="secondary"
                      onPress={() => moveFieldAt(index, 'down')}
                      disabled={index === fields.length - 1}
                      testID={`booking-field-down-${field.key}`}
                    />
                  </View>
                </View>

                <ThemedText type="small">Question</ThemedText>
                <TextInput
                  value={field.label}
                  onChangeText={(value) => updateFieldAt(field.key, { label: value })}
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  testID={`booking-field-label-${field.key}`}
                />

                <View style={styles.toggleRow}>
                  <ThemedText type="small">Required</ThemedText>
                  <Switch
                    value={field.required}
                    onValueChange={(value) => updateFieldAt(field.key, { required: value })}
                    testID={`booking-field-required-${field.key}`}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <ThemedText type="small">Shown on the booking page</ThemedText>
                  <Switch
                    value={!field.hidden}
                    onValueChange={(value) => updateFieldAt(field.key, { hidden: !value })}
                    testID={`booking-field-shown-${field.key}`}
                  />
                </View>
              </View>
            ))}
          </View>

          <Button
            label={saving ? 'Saving…' : 'Save Changes'}
            onPress={handleSave}
            loading={saving}
            fullWidth
            testID="booking-fields-save"
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
  notice: {
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
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
  error: {
    color: '#D33',
  },
});
