import {
  useArchiveAutoResponseMutation,
  useCreateAutoResponseMutation,
  useGetAutoResponsesQuery,
  useGetShopDetailQuery,
  useUpdateAutoResponseMutation,
  type GetAutoResponsesQuery,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PillRow } from '@/components/PillRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { getUserShopId } from '@/utils/user';

type AutoResponse = NonNullable<GetAutoResponsesQuery['getAutoResponses']>[number];

const TRIGGER_OPTIONS = [
  { id: 'SESSION_COMPLETED', label: 'After a session' },
  { id: 'PAYMENT_RECEIVED', label: 'Receipt (payment)' },
  { id: 'MESSAGE_RECEIVED', label: 'Client messages you' },
  { id: 'MANUAL', label: 'Manual only' },
];

const TRIGGER_LABELS: Record<string, string> = {
  SESSION_COMPLETED: 'After a session',
  PAYMENT_RECEIVED: 'Receipt (payment received)',
  MESSAGE_RECEIVED: 'When a client messages you',
  MANUAL: 'Manual only',
};

type Draft = {
  autoResponseId: string | null;
  name: string;
  trigger: string;
  enabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  smsTemplate: string;
};

const EMPTY_DRAFT: Draft = {
  autoResponseId: null,
  name: '',
  trigger: 'SESSION_COMPLETED',
  enabled: false,
  emailEnabled: true,
  smsEnabled: false,
  emailSubjectTemplate: '',
  emailBodyTemplate: '',
  smsTemplate: '',
};

function draftFromResponse(response: AutoResponse): Draft {
  return {
    autoResponseId: response.id,
    name: response.name,
    trigger: response.trigger,
    enabled: response.enabled,
    emailEnabled: response.emailEnabled,
    smsEnabled: response.smsEnabled,
    emailSubjectTemplate: response.emailSubjectTemplate ?? '',
    emailBodyTemplate: response.emailBodyTemplate ?? '',
    smsTemplate: response.smsTemplate ?? '',
  };
}

/**
 * One scope (either { artistUserId } or { shopId }), rendered as its own card - mirroring web's
 * own AutoResponseSection, which the panel below (like web's) renders up to two of at once, never
 * a toggle between them: a shop-connected artist sees BOTH their own set and their shop's,
 * continuously (see server/models/AutoResponse.js's own comment on why - the artist's own enabled
 * response for a trigger wins, the shop's fires only when the artist has none enabled for it).
 *
 * NO CROSS-PLATFORM MODAL PRIMITIVE IN THIS APP (checked - nothing in apps/mobile/src/app uses
 * RN's Modal), so web's create/edit Dialog becomes an inline editor card instead, opened by "New"
 * or a row's "Edit" and closed by Save/Cancel - the same "actions stay on the list, no popover"
 * shape recurring-expenses.tsx's own new-entry card and FormBuilder's inline editing (X30) both
 * already use on this app.
 */
function AutoResponseSection({
  scope,
  title,
  description,
  testIDPrefix,
}: {
  scope: { artistUserId: string } | { shopId: string };
  title: string;
  description: string;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  const { data, loading, error, refetch } = useGetAutoResponsesQuery({
    variables: { ...scope, includeInactive: false },
    fetchPolicy: 'cache-and-network',
  });
  const [createAutoResponse, { loading: creating }] = useCreateAutoResponseMutation();
  const [updateAutoResponse, { loading: updating }] = useUpdateAutoResponseMutation();
  const [archiveAutoResponse] = useArchiveAutoResponseMutation();

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);

  const responses = data?.getAutoResponses ?? [];
  const saving = creating || updating;

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setFormError(null);
    setEditorOpen(true);
  };
  const openEdit = (response: AutoResponse) => {
    setDraft(draftFromResponse(response));
    setFormError(null);
    setEditorOpen(true);
  };
  const closeEditor = () => setEditorOpen(false);

  const handleSave = () => {
    if (!draft.name.trim()) {
      return;
    }
    setFormError(null);
    // Empty box means "use the built-in default" - sent as null, not an empty string, same
    // convention as reminders.tsx's own template fields.
    const templates = {
      emailSubjectTemplate: draft.emailSubjectTemplate.trim() || null,
      emailBodyTemplate: draft.emailBodyTemplate.trim() || null,
      smsTemplate: draft.smsTemplate.trim() || null,
    };
    const action = draft.autoResponseId
      ? updateAutoResponse({
          variables: {
            input: {
              autoResponseId: draft.autoResponseId,
              name: draft.name,
              enabled: draft.enabled,
              emailEnabled: draft.emailEnabled,
              smsEnabled: draft.smsEnabled,
              ...templates,
            },
          },
        })
      : createAutoResponse({
          variables: {
            input: {
              // CreateAutoResponseInput only ever accepts shopId - never artistUserId. The
              // artist scope is resolved server-side from the caller's own identity, so
              // scope.shopId is the only part of `scope` that's ever valid to send here.
              ...('shopId' in scope ? { shopId: scope.shopId } : {}),
              name: draft.name,
              trigger: draft.trigger,
              enabled: draft.enabled,
              emailEnabled: draft.emailEnabled,
              smsEnabled: draft.smsEnabled,
              ...templates,
            },
          },
        });

    action
      .then(() => {
        setEditorOpen(false);
        return refetch();
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleToggleEnabled = (response: AutoResponse, enabled: boolean) => {
    updateAutoResponse({ variables: { input: { autoResponseId: response.id, enabled } } })
      .then(() => refetch())
      .catch((err) => setFormError((err as Error).message));
  };

  const handleDeactivate = (response: AutoResponse) => {
    Alert.alert(`Deactivate "${response.name}"?`, 'It stops firing and disappears from this list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: () => {
          archiveAutoResponse({ variables: { autoResponseId: response.id } })
            .then(() => refetch())
            .catch((err) => setFormError((err as Error).message));
        },
      },
    ]);
  };

  if (loading && !data) {
    return <ActivityIndicator color={theme.text} testID={`${testIDPrefix}-loading`} />;
  }

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>

      {error ? (
        <ThemedText type="small" style={styles.error}>
          Couldn't load these.
        </ThemedText>
      ) : responses.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          None yet - add one below.
        </ThemedText>
      ) : (
        responses.map((response) => (
          <View
            key={response.id}
            style={[styles.responseRow, { borderColor: theme.backgroundSelected }]}
            testID={`${testIDPrefix}-row-${response.id}`}
          >
            <View style={styles.responseRowTop}>
              <Switch
                value={response.enabled}
                onValueChange={(value) => handleToggleEnabled(response, value)}
                disabled={response.trigger === 'MANUAL'}
                testID={`${testIDPrefix}-row-${response.id}-enabled`}
              />
              <View style={styles.responseRowMain}>
                <ThemedText type="default">{response.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {TRIGGER_LABELS[response.trigger] ?? response.trigger}
                  {response.emailEnabled ? ' · Email' : ''}
                  {response.smsEnabled ? ' · Text' : ''}
                </ThemedText>
              </View>
            </View>
            <View style={styles.responseRowActions}>
              <Button
                label="Edit"
                variant="secondary"
                onPress={() => openEdit(response)}
                testID={`${testIDPrefix}-row-${response.id}-edit`}
              />
              <Button
                label="Deactivate"
                variant="danger"
                onPress={() => handleDeactivate(response)}
                testID={`${testIDPrefix}-row-${response.id}-deactivate`}
              />
            </View>
          </View>
        ))
      )}

      {editorOpen ? (
        <View style={[styles.editor, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold">{draft.autoResponseId ? 'Edit Auto-Response' : 'New Auto-Response'}</ThemedText>

          <TextInput
            value={draft.name}
            onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
            placeholder="Name"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            testID={`${testIDPrefix}-editor-name`}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
            When this sends
          </ThemedText>
          {draft.autoResponseId ? (
            <ThemedText type="small" themeColor="textSecondary">
              {TRIGGER_LABELS[draft.trigger] ?? draft.trigger} - can&apos;t be changed after creation.
            </ThemedText>
          ) : (
            <PillRow
              options={TRIGGER_OPTIONS}
              selectedId={draft.trigger}
              onSelect={(trigger) => setDraft((prev) => ({ ...prev, trigger }))}
              testID={`${testIDPrefix}-editor-trigger`}
            />
          )}
          {draft.trigger === 'MANUAL' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Manual-only responses never fire on their own.
            </ThemedText>
          ) : null}

          {draft.trigger !== 'MANUAL' ? (
            <View style={styles.switchRow}>
              <ThemedText type="default">Send automatically</ThemedText>
              <Switch
                value={draft.enabled}
                onValueChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
                testID={`${testIDPrefix}-editor-enabled`}
              />
            </View>
          ) : null}
          <View style={styles.switchRow}>
            <ThemedText type="default">Send by email</ThemedText>
            <Switch
              value={draft.emailEnabled}
              onValueChange={(emailEnabled) => setDraft((prev) => ({ ...prev, emailEnabled }))}
              testID={`${testIDPrefix}-editor-email-enabled`}
            />
          </View>
          <View style={styles.switchRow}>
            <ThemedText type="default">Send by text</ThemedText>
            <Switch
              value={draft.smsEnabled}
              onValueChange={(smsEnabled) => setDraft((prev) => ({ ...prev, smsEnabled }))}
              testID={`${testIDPrefix}-editor-sms-enabled`}
            />
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            Leave a box blank to use the built-in default wording. Merge fields:{' '}
            {'{{clientFirstName}}'}, {'{{artistName}}'}, {'{{appointmentDate}}'},{' '}
            {'{{appointmentTime}}'}.
          </ThemedText>
          <TextInput
            value={draft.emailSubjectTemplate}
            onChangeText={(v) => setDraft((prev) => ({ ...prev, emailSubjectTemplate: v }))}
            placeholder="Email subject"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            testID={`${testIDPrefix}-editor-email-subject`}
          />
          <TextInput
            value={draft.emailBodyTemplate}
            onChangeText={(v) => setDraft((prev) => ({ ...prev, emailBodyTemplate: v }))}
            placeholder="Email body"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
            testID={`${testIDPrefix}-editor-email-body`}
          />
          <TextInput
            value={draft.smsTemplate}
            onChangeText={(v) => setDraft((prev) => ({ ...prev, smsTemplate: v }))}
            placeholder="Text message"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
            testID={`${testIDPrefix}-editor-sms-template`}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Keep the text message short - a longer message costs more and may split across
            multiple texts.
          </ThemedText>

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={draft.autoResponseId ? 'Save' : 'Create'}
              onPress={handleSave}
              loading={saving}
              disabled={!draft.name.trim()}
              testID={`${testIDPrefix}-editor-save`}
            />
            <Button label="Cancel" variant="secondary" onPress={closeEditor} testID={`${testIDPrefix}-editor-cancel`} />
          </View>
        </View>
      ) : (
        <Button
          label="+ New Auto-Response"
          variant="secondary"
          onPress={openCreate}
          testID={`${testIDPrefix}-new`}
        />
      )}
    </View>
  );
}

/**
 * Settings > Messages > Auto-Responses. Second of the four Messages-category screens (X31/X38) -
 * message templates fired automatically on a lifecycle event (or, on web, sent by hand via a
 * picker this port deliberately omits - see SessionDetailForm.tsx's own already-documented cut of
 * SendAutoResponseButton). Direct port of apps/web's AutoResponsesPanel.jsx. See DECISIONS.md X39.
 *
 * TWO INDEPENDENT SECTIONS, not a toggle - matches web exactly. An artist always sees "Your
 * Auto-Responses"; a shop-connected shop-admin-or-better ALSO sees the shop's set, at the same
 * time (canManageShopAutoResponses below - isShopAdminOrBetter AND has a shop, same gate web uses
 * via `user.role <= ROLES.SHOP_ADMIN`).
 *
 * Reached only from settings/index.tsx's own "Messages" card - this screen doesn't re-check the
 * top-level isArtist gate itself, same convention as every other settings/*.tsx screen.
 */
export default function AutoResponsesScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const shopId = getUserShopId(user);
  const canManageShopAutoResponses = Boolean(user) && isShopAdminOrBetter(user) && Boolean(shopId);
  const isArtist = user?.userInfo?.__typename === 'Artist';

  const { data: shopData } = useGetShopDetailQuery({
    variables: { shopId: shopId ?? '' },
    skip: !canManageShopAutoResponses,
  });

  if (!user) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {isArtist ? (
            <AutoResponseSection
              scope={{ artistUserId: user.id }}
              title="Your Auto-Responses"
              description="Sent automatically after something happens. If you enable one here for a trigger your shop also has, yours is the one that sends."
              testIDPrefix="auto-responses-own"
            />
          ) : null}
          {canManageShopAutoResponses && shopId ? (
            <AutoResponseSection
              scope={{ shopId }}
              title={`${shopData?.getShop?.name ?? 'Shop'} Auto-Responses`}
              description="Shop-wide defaults, available to every artist here. An artist's own Auto-Response for the same trigger sends instead of the shop's, if they have one enabled."
              testIDPrefix="auto-responses-shop"
            />
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
  card: {
    gap: Spacing.two,
  },
  label: {
    marginTop: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  responseRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  responseRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  responseRowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  responseRowActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  editor: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
});
