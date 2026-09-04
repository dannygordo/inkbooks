import { useGetEventLogsQuery, type GetEventLogsQuery } from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCents } from '@/utils/money';

const DEFAULT_PAGE_SIZE = 25;
// Matches web's own PAGE_SIZE_OPTIONS (EventLogPanel.jsx), which itself matches
// EntityListPager/Pager's page-size choices used everywhere else on web.
const PAGE_SIZE_OPTIONS = [
  { id: '10', label: '10' },
  { id: '25', label: '25' },
  { id: '50', label: '50' },
];

const ENTITY_TYPES = [
  { id: '', label: 'Everything' },
  { id: 'Appointment', label: 'Appointments' },
  { id: 'Client', label: 'Clients' },
  { id: 'ShopCutRate', label: 'Shop Cut Rates' },
];

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Changed',
  delete: 'Deleted',
};

type EventLogEntry = GetEventLogsQuery['getEventLogs']['items'][number];

// Matches web's own moment(...).format("MMM D, YYYY [at] h:mm A") - hand-rolled with
// toLocaleDateString/toLocaleTimeString, the same no-moment-dependency convention
// utils/messageTime.ts already established, rather than a new library for one label.
function formatEntryTime(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const date = at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

// Fields whose value is a whole number of cents - formatted as money rather than a bare integer.
// A field-name convention rather than a lookup table, matching server/utils/money.js's own
// comment on how every money field in this codebase is named.
function formatChangeValue(field: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (/Cents$/.test(field)) {
    const cents = Number(value);
    return Number.isFinite(cents) ? formatCents(cents) : value;
  }
  return value;
}

/**
 * Settings > Security. The audit trail - who changed what, and when. Read-only; nothing here
 * writes anything. Direct port of apps/web's EventLogPanel.jsx. See DECISIONS.md X44.
 *
 * Reached only from settings/index.tsx's own "Security" link, gated `hasAuditAuthority` (X44's
 * new export in utils/businessScope.ts) - matching web's own `settingsCategories.jsx` gate on
 * this category exactly. This screen doesn't re-check the gate itself, same convention as every
 * other settings/*.tsx screen.
 *
 * NOTES AND REDACTIONS ARE LOGGED AS HAVING HAPPENED WITHOUT REPEATING THEIR CONTENT - ported
 * directly from web's own help text; this screen has no special handling for that beyond
 * displaying whatever `summary`/`changes` the server actually returns; the redaction itself is
 * the server's job (server/utils/event-log.js).
 */
export default function SecurityScreen() {
  const theme = useTheme();
  const [entityType, setEntityType] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);

  const { data, loading } = useGetEventLogsQuery({
    variables: {
      filter: entityType ? { entityType } : undefined,
      page: { limit: pageSize, offset },
    },
    fetchPolicy: 'cache-and-network',
  });

  const page = data?.getEventLogs;
  const items = page?.items ?? [];

  const handleEntityTypeChange = (value: string) => {
    setEntityType(value);
    setOffset(0);
  };
  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setOffset(0);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            Money, appointments, and client-record changes, with who made them and when. Notes
            and redactions are logged as having happened without repeating their content here.
          </ThemedText>

          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Show
            </ThemedText>
            <PillRow options={ENTITY_TYPES} selectedId={entityType} onSelect={handleEntityTypeChange} testID="security-entity-type" />
          </View>
          <View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Per page
            </ThemedText>
            <PillRow
              options={PAGE_SIZE_OPTIONS}
              selectedId={String(pageSize)}
              onSelect={handlePageSizeChange}
              testID="security-page-size"
            />
          </View>

          {loading && items.length === 0 ? (
            <ActivityIndicator color={theme.text} testID="security-loading" />
          ) : items.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" testID="security-empty">
              Nothing here yet.
            </ThemedText>
          ) : (
            items.map((entry: EventLogEntry) => (
              <View key={entry.id} style={[styles.entryRow, { borderColor: theme.backgroundSelected }]} testID={`security-entry-${entry.id}`}>
                <View style={styles.entryHeader}>
                  <ThemedText type="smallBold">{ACTION_LABELS[entry.action] ?? entry.action}</ThemedText>
                  <ThemedText type="small">{entry.summary}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {entry.actorName} · {formatEntryTime(entry.createdAt)}
                </ThemedText>
                {entry.changes.length > 0 ? (
                  <View style={styles.changesList}>
                    {entry.changes.map((change) => (
                      <ThemedText key={change.field} type="small" themeColor="textSecondary">
                        {change.field}: {formatChangeValue(change.field, change.from)} {'→'}{' '}
                        {formatChangeValue(change.field, change.to)}
                      </ThemedText>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}

          {page?.pageInfo && (page.pageInfo.offset > 0 || page.pageInfo.hasMore) ? (
            <View style={styles.actions}>
              <Button
                label="Newer"
                variant="secondary"
                disabled={offset === 0}
                onPress={() => setOffset(Math.max(0, offset - pageSize))}
                testID="security-newer"
              />
              <Button
                label="Older"
                variant="secondary"
                disabled={!page.pageInfo.hasMore}
                onPress={() => setOffset(offset + pageSize)}
                testID="security-older"
              />
            </View>
          ) : null}
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
  label: {
    marginBottom: Spacing.one,
  },
  entryRow: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  changesList: {
    gap: Spacing.half,
    marginTop: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
