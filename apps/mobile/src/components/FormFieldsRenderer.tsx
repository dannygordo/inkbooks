import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { restApiUrl } from '@/utils/restApi';

const MAX_UPLOAD_FILES = 5;

// Direct port of apps/web's FormFieldsRenderer.jsx, adapted to this app's own field primitives -
// no cross-platform <select>/radio/checkbox primitive exists here (same reason PillRow.tsx exists
// at all), so single_choice/multi_choice each get a small local row list with their own
// circle/square indicator rather than reusing PillRow's horizontal-scroll layout: PillRow was
// built for short, developer-authored enums (trigger types, status filters), where this screen's
// options are arbitrary, user-authored strings from FormBuilder (X30) - unbounded length and
// count, which reads far better as a vertical list than a horizontally-scrolling pill row.
//
// `answers` values match FormAnswerInput's own shape (fieldKey/textValue/selectedOptions/
// dateValue/fileUrls/signedName) - see server/graphql/typeDefs.js - so the caller
// (FormFillOutModal.tsx) can map fields straight into submitFormResponse's input with no
// reshaping, the same contract web's own component documents.
//
// `errors` is a fieldKey-keyed map of message strings, from the server's own
// UserInputError.extensions.errors (resolvers/forms.js's assertAnswersMatchFields) - this
// component never invents its own required-field validation beyond the asterisk, matching web's
// own "the server is the sole authority on what's required" comment.
export type FormFieldsRendererField = {
  key: string;
  type: string;
  label: string;
  helpText?: string | null;
  required?: boolean | null;
  options?: string[] | null;
};

export type FormFieldAnswer = {
  fieldKey: string;
  textValue?: string | null;
  selectedOptions?: string[] | null;
  dateValue?: string | null;
  fileUrls?: string[] | null;
  signedName?: string | null;
};

type AnswersMap = Record<string, FormFieldAnswer>;

async function uploadFiles(assets: ImagePicker.ImagePickerAsset[]): Promise<string[]> {
  const formData = new FormData();
  assets.forEach((asset, index) => {
    const extension = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    // Same {uri, name, type} shape messages/[id].tsx's own handleAttachImages uses in place of a
    // real Blob - see that file's own comment on why this needs its own cast.
    formData.append('files', {
      uri: asset.uri,
      name: asset.fileName || `upload-${index}.${extension}`,
      type: asset.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    } as unknown as Blob);
  });
  // /form-uploads is public/unauthenticated by design (routes/formUploads.js's own comment - a
  // guest filling out a public form has no account either), unlike /message-uploads, so this
  // fetch carries no Authorization header.
  const response = await fetch(restApiUrl('form-uploads'), { method: 'POST', body: formData });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Upload failed.');
  }
  return body.urls || [];
}

export function FormFieldsRenderer({
  fields,
  answers,
  onAnswerChange,
  errors = {},
  disabled = false,
}: {
  fields: FormFieldsRendererField[];
  answers: AnswersMap;
  onAnswerChange: (fieldKey: string, answer: FormFieldAnswer) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | null>>({});

  const setAnswer = (fieldKey: string, patch: Partial<FormFieldAnswer>) => {
    // fieldKey last, not first - TS2783 flags `{ fieldKey, ...answers[fieldKey] }` as a possible
    // duplicate (answers[fieldKey]'s own FormFieldAnswer type also carries a fieldKey field), even
    // though in practice they're always the same value. Spreading first and setting fieldKey last
    // says what's actually meant (the merged answer belongs to THIS field) without relying on
    // property order silently doing the right thing.
    onAnswerChange(fieldKey, { ...answers[fieldKey], ...patch, fieldKey });
  };

  const handlePickFiles = async (field: FormFieldsRendererField) => {
    const current = answers[field.key]?.fileUrls || [];
    if (uploadingKey || current.length >= MAX_UPLOAD_FILES) {
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadErrors((prev) => ({ ...prev, [field.key]: 'Allow photo access in Settings to attach files.' }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_UPLOAD_FILES - current.length,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    setUploadErrors((prev) => ({ ...prev, [field.key]: null }));
    setUploadingKey(field.key);
    try {
      const urls = await uploadFiles(result.assets);
      setAnswer(field.key, { fileUrls: [...current, ...urls] });
    } catch (err) {
      setUploadErrors((prev) => ({ ...prev, [field.key]: (err as Error).message || 'Upload failed.' }));
    } finally {
      setUploadingKey(null);
    }
  };

  const removeFile = (field: FormFieldsRendererField, url: string) => {
    setAnswer(field.key, { fileUrls: (answers[field.key]?.fileUrls || []).filter((u) => u !== url) });
  };

  return (
    <View style={styles.container}>
      {fields.map((field) => {
        const answer = answers[field.key] || { fieldKey: field.key };
        const error = errors[field.key];

        // FormField/DateField each render their own label line already (see those components'
        // own layout) - reusing it with the required marker folded in, rather than adding a
        // second label above them, avoids the blank second line an empty label="" would leave.
        // single_choice/multi_choice/file_upload have no such built-in label slot, so those three
        // get the standalone question row below. signature is its own case, inline further down -
        // its FormField's label is a fixed instruction ("Type your full legal name to sign"), not
        // the question itself, so it needs BOTH the question row and that field label, matching
        // web's own two-labels-on-purpose comment on this exact field type.
        const questionLabel = field.required ? `${field.label} *` : field.label;
        const needsOwnQuestionRow = ['single_choice', 'multi_choice', 'file_upload'].includes(field.type);

        return (
          <View style={styles.block} key={field.key}>
            {needsOwnQuestionRow ? (
              <View style={styles.questionRow}>
                <ThemedText type="smallBold">{field.label}</ThemedText>
                {field.required ? <ThemedText style={{ color: theme.error }}> *</ThemedText> : null}
              </View>
            ) : null}
            {field.helpText ? (
              <ThemedText type="small" themeColor="textSecondary">
                {field.helpText}
              </ThemedText>
            ) : null}

            {field.type === 'short_text' ? (
              <FormField
                label={questionLabel}
                value={answer.textValue || ''}
                onChangeText={(text) => setAnswer(field.key, { textValue: text })}
                editable={!disabled}
                testID={`form-field-${field.key}`}
              />
            ) : null}

            {field.type === 'paragraph' ? (
              <FormField
                label={questionLabel}
                value={answer.textValue || ''}
                onChangeText={(text) => setAnswer(field.key, { textValue: text })}
                editable={!disabled}
                multiline
                testID={`form-field-${field.key}`}
              />
            ) : null}

            {field.type === 'date' ? (
              <DateField
                label={questionLabel}
                value={answer.dateValue ? new Date(answer.dateValue) : new Date()}
                onChange={(date) => setAnswer(field.key, { dateValue: date.toISOString().slice(0, 10) })}
                testID={`form-field-${field.key}`}
              />
            ) : null}

            {field.type === 'single_choice'
              ? (field.options || []).map((option) => {
                  const selected = (answer.selectedOptions || [])[0] === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => !disabled && setAnswer(field.key, { selectedOptions: [option] })}
                      style={styles.choiceRow}
                      testID={`form-field-${field.key}-${option}`}
                    >
                      <View style={[styles.radioOuter, { borderColor: theme.backgroundSelected }]}>
                        {selected ? <View style={[styles.radioInner, { backgroundColor: theme.primary }]} /> : null}
                      </View>
                      <ThemedText type="default">{option}</ThemedText>
                    </Pressable>
                  );
                })
              : null}

            {field.type === 'multi_choice'
              ? (field.options || []).map((option) => {
                  const selectedOptions = answer.selectedOptions || [];
                  const checked = selectedOptions.includes(option);
                  return (
                    <Pressable
                      key={option}
                      onPress={() =>
                        !disabled &&
                        setAnswer(field.key, {
                          selectedOptions: checked
                            ? selectedOptions.filter((o) => o !== option)
                            : [...selectedOptions, option],
                        })
                      }
                      style={styles.choiceRow}
                      testID={`form-field-${field.key}-${option}`}
                    >
                      <View
                        style={[
                          styles.checkboxOuter,
                          { borderColor: theme.backgroundSelected },
                          checked && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                      >
                        {checked ? (
                          <ThemedText type="small" themeColor="primaryContrast">
                            ✓
                          </ThemedText>
                        ) : null}
                      </View>
                      <ThemedText type="default">{option}</ThemedText>
                    </Pressable>
                  );
                })
              : null}

            {field.type === 'file_upload' ? (
              <View style={styles.fileBlock}>
                <Pressable
                  onPress={() => handlePickFiles(field)}
                  disabled={disabled || uploadingKey === field.key}
                  style={[styles.fileButton, { borderColor: theme.backgroundSelected }]}
                  testID={`form-field-${field.key}-pick`}
                >
                  <ThemedText type="small">
                    {uploadingKey === field.key ? 'Uploading…' : 'Add photo'}
                  </ThemedText>
                </Pressable>
                {uploadErrors[field.key] ? (
                  <ThemedText type="small" style={{ color: theme.error }}>
                    {uploadErrors[field.key]}
                  </ThemedText>
                ) : null}
                {(answer.fileUrls || []).map((url) => (
                  <View key={url} style={styles.fileRow}>
                    <ThemedText type="small" style={styles.fileName} numberOfLines={1}>
                      {url.split('/').pop()}
                    </ThemedText>
                    {!disabled ? (
                      <Pressable onPress={() => removeFile(field, url)}>
                        <ThemedText type="small" themeColor="primary">
                          Remove
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {field.type === 'signature' ? (
              <>
                <View style={styles.questionRow}>
                  <ThemedText type="smallBold">{field.label}</ThemedText>
                  {field.required ? <ThemedText style={{ color: theme.error }}> *</ThemedText> : null}
                </View>
                <FormField
                  label="Type your full legal name to sign"
                  value={answer.signedName || ''}
                  onChangeText={(text) => setAnswer(field.key, { signedName: text })}
                  editable={!disabled}
                  testID={`form-field-${field.key}`}
                />
              </>
            ) : null}

            {error ? (
              <ThemedText type="small" style={{ color: theme.error }}>
                {error}
              </ThemedText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  block: {
    gap: Spacing.one,
  },
  questionRow: {
    flexDirection: 'row',
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkboxOuter: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileBlock: {
    gap: Spacing.one,
  },
  fileButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignSelf: 'flex-start',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  fileName: {
    flexShrink: 1,
  },
});
