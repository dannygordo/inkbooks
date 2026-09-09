import { useGetFormResponsesListQuery, useGetFormTitleQuery, type GetFormResponsesListQuery } from '@inkbooks/api';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatFormAnswer } from '@/utils/formAnswers';

const PAGE_SIZE = 25;

const SOURCE_LABEL: Record<string, string> = {
  staff_entered: 'Entered by staff',
  client_authenticated: 'Client (signed in)',
  guest_public: 'Guest (public link)',
};

type ResponseItem = GetFormResponsesListQuery['getFormResponses']['items'][number];

/**
 * A form's submitted responses - view-only, expandable rows. Ports the response-list half of
 * web's `pages/forms/FormResponses.jsx` only; the per-field analytics panel (`getFormAnalytics` -
 * aggregate answered-counts and option-percentage bars) is a real, separate secondary feature
 * layered on top of this list, not this screen's core job of "read what someone submitted" -
 * named as a deliberate cut, not an oversight. See DECISIONS.md X28.
 *
 * Every answer is read against its own response's `fieldsSnapshot`, never a live `Form` - matches
 * `models/FormResponse.js`'s own header comment exactly: a field's wording/options may have
 * changed since submission, and a signed waiver has to keep meaning what it meant the day it was
 * signed. `formatFormAnswer` (`utils/formAnswers.ts`) carries the UTC-vs-local date nuance web's
 * own `formatAnswer` calls out - a pure calendar date reads in UTC, a signature's timestamp reads
 * in local time.
 */
export default function FormResponsesScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const formId = Array.isArray(params.id) ? params.id[0] : params.id;
  const theme = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: titleData } = useGetFormTitleQuery({ variables: { formId: formId ?? '' }, skip: !formId });
  const { data, loading, error, fetchMore } = useGetFormResponsesListQuery({
    variables: { formId: formId ?? '', page: { limit: PAGE_SIZE, offset: 0 } },
    skip: !formId,
    fetchPolicy: 'cache-and-network',
  });

  const responses = data?.getFormResponses.items ?? [];
  const pageInfo = data?.getFormResponses.pageInfo;

  const loadMore = () => {
    if (!pageInfo?.hasMore) {
      return;
    }
    fetchMore({ variables: { formId: formId ?? '', page: { limit: PAGE_SIZE, offset: responses.length } } }).catch(() => {});
  };

  if (!formId) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ThemedText type="subtitle" style={styles.header}>
          {titleData?.getForm.title ? `Responses - ${titleData.getForm.title}` : 'Responses'}
        </ThemedText>

        {loading && responses.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="form-responses-loading" />
          </View>
        ) : responses.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="form-responses-empty">
              {error ? 'Could not load responses.' : 'No responses yet.'}
            </ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {responses.map((response) => {
              const expanded = expandedId === response.id;
              return (
                <ResponseRow
                  key={response.id}
                  response={response}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : response.id)}
                />
              );
            })}

            {pageInfo?.hasMore ? (
              <Button label="Load more" variant="secondary" onPress={loadMore} testID="form-responses-load-more" />
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function ResponseRow({
  response,
  expanded,
  onToggle,
}: {
  response: ResponseItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const answerByKey = Object.fromEntries(response.answers.map((a) => [a.fieldKey, a]));

  return (
    <View style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`form-response-${response.id}`}>
      <View style={styles.rowHeader}>
        <View style={styles.rowBody}>
          <ThemedText type="default">
            {response.client ? `${response.client.firstName} ${response.client.lastName}` : 'Unknown client'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {SOURCE_LABEL[response.source] || response.source} · {new Date(response.createdAt).toLocaleString()}
          </ThemedText>
        </View>
        <Button label={expanded ? 'Hide answers' : 'View answers'} variant="secondary" onPress={onToggle} testID={`form-response-toggle-${response.id}`} />
      </View>

      {expanded ? (
        <View style={styles.answerList}>
          {response.fieldsSnapshot.map((field) => {
            const answer = answerByKey[field.key];
            const fileUrls = answer?.fileUrls ?? [];
            return (
              <View key={field.key} style={styles.answerRow}>
                <ThemedText type="smallBold">{field.label}</ThemedText>
                <ThemedText type="default">{formatFormAnswer(field, answer)}</ThemedText>
                {field.type === 'file_upload' && fileUrls.length > 0
                  ? fileUrls.map((url) => (
                      <Pressable key={url} onPress={() => Linking.openURL(url)}>
                        <ThemedText type="link" numberOfLines={1}>
                          {url.split('/').pop()}
                        </ThemedText>
                      </Pressable>
                    ))
                  : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
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
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowBody: {
    gap: Spacing.half,
    flex: 1,
  },
  answerList: {
    gap: Spacing.two,
  },
  answerRow: {
    gap: Spacing.half,
  },
});
