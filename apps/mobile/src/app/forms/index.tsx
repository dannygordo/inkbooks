import {
  useArchiveFormMutation,
  useDeleteFormMutation,
  useDuplicateFormMutation,
  useGetFormsListQuery,
  usePublishFormMutation,
  useSetFormGuestAccessMutation,
  type GetFormsListQuery,
} from '@inkbooks/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { businessScopeFor, createScopeFor } from '@/utils/businessScope';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { formStatusLabel } from '@/utils/formConstants';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', 'draft', 'published', 'archived'];

type FormItem = GetFormsListQuery['getForms']['items'][number];

/**
 * Forms management list - consent forms, waivers, custom intake questionnaires. Separate feature
 * from Booking Requests, which keeps its own dedicated intake pipeline (see DECISIONS.md X19).
 * Gated `canManageForms` - narrower than Income/Expenses' `canManageBusinessLedger`, excluding a
 * plain shop-connected artist who isn't a shop admin (see that helper's own comment). See
 * DECISIONS.md X28/X30.
 *
 * **"New Form" and tapping a form's title both open `form/[id].tsx`** (X30) - the field editor
 * this list originally shipped without. A form's title links to `/form/:id` to edit it, EXCEPT
 * the booking_request system form, which keeps plain text here (its own restricted editor isn't
 * ported - see form/[id].tsx's own comment on why it redirects back here if reached directly).
 *
 * **Duplicate is still ported here rather than routed through the editor** - it's a plain
 * `createForm` call with the source form's own fields client-side-copied (dropping each field's
 * `key` so the copy gets fresh ones), no editor needed. **Publish/Archive/guest-link toggle/
 * Delete stay here too** - form/[id].tsx deliberately doesn't duplicate them (see its own header
 * comment), so this list remains the one place all of a form's non-field actions live.
 *
 * **The public guest link has no "Copy" button** - no clipboard library is installed (matching
 * the Shops slice's own `expo-web-browser` gap: avoid a new dependency for one action). Turning
 * the link on shows it in a read-only text field the user can select and copy natively, with a
 * plain-text path only (`form/<token>`) rather than a full URL - mobile has no reliable source
 * for the web app's own public origin the way a browser's `window.location.origin` is on web.
 */
export default function FormsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibleLinkFormId, setVisibleLinkFormId] = useState<string | null>(null);

  if (!user) {
    return null;
  }
  const scope = businessScopeFor(user);

  const { data, loading, error, fetchMore, refetch } = useGetFormsListQuery({
    variables: { ...scope, status: statusFilter || undefined, page: { limit: PAGE_SIZE, offset: 0 } },
    fetchPolicy: 'cache-and-network',
  });
  const forms = data?.getForms.items ?? [];
  const pageInfo = data?.getForms.pageInfo;

  const [publishForm] = usePublishFormMutation();
  const [archiveForm] = useArchiveFormMutation();
  const [setFormGuestAccess] = useSetFormGuestAccessMutation();
  const [deleteForm] = useDeleteFormMutation();
  const [duplicateForm] = useDuplicateFormMutation();

  const changeFilter = (status: string) => {
    setStatusFilter(status);
    refetch({ ...scope, status: status || undefined, page: { limit: PAGE_SIZE, offset: 0 } }).catch(() => {});
  };

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({ variables: { ...scope, status: statusFilter || undefined, page: { limit: PAGE_SIZE, offset: forms.length } } }).catch(() => {});
  };

  const runAction = (promise: Promise<unknown>) => {
    setActionError(null);
    promise.then(() => refetch()).catch((err) => setActionError((err as Error).message));
  };

  const handleToggleGuestAccess = (form: FormItem) => {
    setVisibleLinkFormId(null);
    runAction(
      setFormGuestAccess({ variables: { formId: form.id, allow: !form.allowGuestSubmissions } }).then((result) => {
        if (result.data?.setFormGuestAccess.allowGuestSubmissions) {
          setVisibleLinkFormId(form.id);
        }
      }),
    );
  };

  const handleDuplicate = (form: FormItem) => {
    runAction(
      duplicateForm({
        variables: {
          input: {
            ...createScopeFor(user),
            title: `${form.title} (Copy)`,
            fields: form.fields.map(({ type, label, helpText, required, options }) => ({
              type,
              label,
              helpText: helpText || '',
              required: Boolean(required),
              options: options || [],
            })),
          },
        },
      }),
    );
  };

  const handleDelete = (form: FormItem) => {
    Alert.alert(`Delete "${form.title}"?`, "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => runAction(deleteForm({ variables: { formId: form.id } })) },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
          Consent forms, waivers, and custom intake questionnaires.
        </ThemedText>

        <View style={styles.newFormRow}>
          <Button
            label="New Form"
            variant="secondary"
            onPress={() => router.push({ pathname: '/form/[id]', params: { id: 'new' } })}
            testID="forms-new"
          />
        </View>

        {actionError ? (
          <ThemedText type="small" style={styles.error}>
            {actionError}
          </ThemedText>
        ) : null}

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((status) => {
            const selected = status === statusFilter;
            return (
              <Pressable
                key={status || 'all'}
                onPress={() => changeFilter(status)}
                style={[
                  styles.pill,
                  { borderColor: theme.backgroundSelected },
                  selected && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
                testID={`forms-filter-${status || 'all'}`}
              >
                <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
                  {status ? formStatusLabel(status) : 'All'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {loading && forms.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="forms-loading" />
          </View>
        ) : forms.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="forms-empty">
              {error ? 'Could not load forms.' : 'No forms yet.'}
            </ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {forms.map((form) => {
              const isBookingRequest = form.systemKey === 'booking_request';
              const showLink = visibleLinkFormId === form.id && form.allowGuestSubmissions;
              return (
                <View key={form.id} style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`form-row-${form.id}`}>
                  <View style={styles.rowBody}>
                    {isBookingRequest ? (
                      <ThemedText type="default" numberOfLines={2}>
                        {form.title}
                      </ThemedText>
                    ) : (
                      <Pressable
                        onPress={() => router.push({ pathname: '/form/[id]', params: { id: form.id } })}
                        testID={`form-edit-${form.id}`}
                      >
                        <ThemedText type="default" numberOfLines={2} style={styles.titleLink}>
                          {form.title}
                        </ThemedText>
                      </Pressable>
                    )}
                    <ThemedText type="small" themeColor="textSecondary">
                      {formStatusLabel(form.status)}
                      {form.systemKey ? ' · Default' : ''}
                      {' · '}
                      {form.fields.length} field{form.fields.length === 1 ? '' : 's'}
                      {!isBookingRequest && form.allowGuestSubmissions ? ' · Public link on' : ''}
                      {' · created '}
                      {new Date(form.createdAt).toLocaleDateString()}
                    </ThemedText>
                    {showLink ? (
                      <TextInput
                        value={`form/${form.publicToken ?? ''}`}
                        editable={false}
                        selectTextOnFocus
                        style={[styles.linkField, { color: theme.text, borderColor: theme.backgroundSelected }]}
                        testID={`form-link-${form.id}`}
                      />
                    ) : null}
                  </View>
                  <View style={styles.rowActions}>
                    {form.status !== 'published' ? (
                      <Button label="Publish" variant="secondary" onPress={() => runAction(publishForm({ variables: { formId: form.id } }))} testID={`form-publish-${form.id}`} />
                    ) : null}
                    {form.status === 'published' ? (
                      <Button label="Archive" variant="secondary" onPress={() => runAction(archiveForm({ variables: { formId: form.id } }))} testID={`form-archive-${form.id}`} />
                    ) : null}
                    {!isBookingRequest ? (
                      <>
                        <Button
                          label="Responses"
                          variant="secondary"
                          onPress={() => router.push({ pathname: '/form-responses/[id]', params: { id: form.id } })}
                          testID={`form-responses-${form.id}`}
                        />
                        <Button
                          label={form.allowGuestSubmissions ? 'Turn off link' : 'Turn on link'}
                          variant="secondary"
                          onPress={() => handleToggleGuestAccess(form)}
                          testID={`form-guest-access-${form.id}`}
                        />
                        <Button label="Duplicate" variant="secondary" onPress={() => handleDuplicate(form)} testID={`form-duplicate-${form.id}`} />
                      </>
                    ) : null}
                    {!form.systemKey ? (
                      <Button label="Delete" variant="danger" onPress={() => handleDelete(form)} testID={`form-delete-${form.id}`} />
                    ) : null}
                  </View>
                </View>
              );
            })}

            {pageInfo?.hasMore ? (
              <Button label="Load more" variant="secondary" onPress={loadMore} testID="forms-load-more" />
            ) : null}
          </ScrollView>
        )}
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
  intro: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  newFormRow: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    alignItems: 'flex-start',
  },
  titleLink: {
    textDecorationLine: 'underline',
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
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
  row: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    gap: Spacing.half,
  },
  linkField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
    paddingHorizontal: Spacing.three,
  },
});
