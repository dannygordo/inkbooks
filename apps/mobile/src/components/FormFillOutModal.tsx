import { useGetFormToFillOutQuery, useSubmitFormResponseMutation } from '@inkbooks/api';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormFieldAnswer, FormFieldsRenderer } from '@/components/FormFieldsRenderer';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Mobile port of apps/web's FormFillOut.jsx, for the authenticated "staff/artist filling this out
 * on a client's behalf" path only (clientId always supplied here) - see
 * packages/api/src/operations/forms.graphql's own comment on the self-service branch staying out
 * of scope, since mobile has no client login at all (X15/X16).
 *
 * Web mounts this inside its global modal (components/ibModal/IBModal.jsx), opened from
 * ClientDashboard.jsx's own setModal call. This app has no equivalent global modal host, so this
 * component owns its own RN `Modal` instead (same primitive/backdrop-card shape
 * SessionDetailForm.tsx's Square-charge dialog already established), sized taller than that
 * bottom-sheet-style dialog since a form can run to many fields - the card takes most of the
 * screen height with its own internal ScrollView, header, and fixed footer, rather than sizing to
 * content and risking fields pushed off-screen.
 */
export function FormFillOutModal({
  visible,
  formId,
  clientId,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  formId: string | null;
  clientId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const theme = useTheme();
  const { data, loading } = useGetFormToFillOutQuery({
    variables: { formId: formId ?? '' },
    skip: !visible || !formId,
    fetchPolicy: 'cache-and-network',
  });
  const [submitFormResponse, { loading: submitting }] = useSubmitFormResponseMutation();

  const [answers, setAnswers] = useState<Record<string, FormFieldAnswer>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Reset per-open, matching web's own fresh-mount-per-open behavior (web's setModal tears the
  // whole FormFillOut element down on close, so it always mounts clean; this component instead
  // stays mounted and just toggles `visible`, so it has to clear its own draft state explicitly).
  useEffect(() => {
    if (visible) {
      setAnswers({});
      setFieldErrors({});
      setGeneralError(null);
    }
  }, [visible, formId]);

  const form = data?.getForm;

  const handleAnswerChange = (fieldKey: string, answer: FormFieldAnswer) => {
    setAnswers((prev) => ({ ...prev, [fieldKey]: answer }));
  };

  const handleSubmit = () => {
    if (!form) {
      return;
    }
    setFieldErrors({});
    setGeneralError(null);
    // One entry per form field, not Object.values(answers) - same "an untouched required field
    // silently drops out of the submitted array" bug web's own comment on this exact line warns
    // about (see FormFillOut.jsx/PublicFormFillOut.jsx).
    const input = {
      formId: form.id,
      clientId,
      answers: form.fields.map((field) => {
        const answer = answers[field.key];
        return {
          fieldKey: field.key,
          textValue: answer?.textValue || null,
          selectedOptions: answer?.selectedOptions || [],
          dateValue: answer?.dateValue || null,
          fileUrls: answer?.fileUrls || [],
          signedName: answer?.signedName || null,
        };
      }),
    };
    submitFormResponse({ variables: { input } })
      .then(() => {
        onSubmitted();
      })
      .catch((err) => {
        const extensions = err?.graphQLErrors?.[0]?.extensions as { errors?: Record<string, string> } | undefined;
        if (extensions?.errors) {
          setFieldErrors(extensions.errors);
        } else {
          setGeneralError(err?.graphQLErrors?.[0]?.message || err?.message || 'Could not submit this form.');
        }
      });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
              {form?.title ?? 'Form'}
            </ThemedText>
          </View>

          {loading && !form ? (
            <ActivityIndicator style={styles.loading} />
          ) : !form ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              This form could not be found.
            </ThemedText>
          ) : form.status !== 'published' ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              This form is not currently accepting responses.
            </ThemedText>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {form.description ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {form.description}
                </ThemedText>
              ) : null}
              <FormFieldsRenderer
                fields={form.fields}
                answers={answers}
                onAnswerChange={handleAnswerChange}
                errors={fieldErrors}
                disabled={submitting}
              />
            </ScrollView>
          )}

          {generalError ? (
            <ThemedText type="small" style={{ color: theme.error }}>
              {generalError}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} disabled={submitting} testID="form-fill-out-cancel" />
            {form && form.status === 'published' ? (
              <Button
                label="Submit"
                onPress={handleSubmit}
                loading={submitting}
                testID="form-fill-out-submit"
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '90%',
    padding: Spacing.three,
    gap: Spacing.three,
    borderTopLeftRadius: Spacing.two,
    borderTopRightRadius: Spacing.two,
  },
  header: {
    flexDirection: 'row',
  },
  headerTitle: {
    flexShrink: 1,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  loading: {
    paddingVertical: Spacing.four,
  },
  emptyText: {
    paddingVertical: Spacing.four,
  },
  actions: {
    gap: Spacing.two,
  },
});
