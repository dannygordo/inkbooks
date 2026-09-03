import {
  useGetShopDetailQuery,
  useGetSystemMessageTemplatesQuery,
  useResetSystemMessageTemplateMutation,
  useUpdateSystemMessageTemplateMutation,
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
import { isShopAdminOrBetter } from '@/utils/permissions';
import { getUserShopId } from '@/utils/user';

// key -> { label, mergeFields, hasExtraNote, shopOnly, artistOnly }. Direct port of web's
// KEY_META. BOOKING_CONFIRMATION is the one narrower key (subject + an appendable note only,
// never the structural body) - see utils/client-booking-emails.js's own comment on why.
const KEY_META: Record<
  string,
  { label: string; mergeFields: string[]; hasExtraNote?: boolean; shopOnly?: boolean; artistOnly?: boolean }
> = {
  BOOKING_REQUEST_RECEIVED: {
    label: 'Booking request received (to client)',
    mergeFields: ['firstName', 'artistName', 'link'],
  },
  NEW_MESSAGE_TO_GUEST: {
    label: 'New message notification (to client)',
    mergeFields: ['firstName', 'artistName', 'link'],
  },
  NEW_MESSAGE_TO_ARTIST: {
    label: 'New message notification (to you)',
    mergeFields: ['artistFirstName', 'clientName', 'link'],
  },
  NEW_BOOKING_REQUEST_TO_ARTIST: {
    label: 'New booking request notification (to you)',
    mergeFields: ['artistFirstName', 'clientName'],
  },
  SHOP_CUT_MARKED_PAID: {
    label: 'Shop cut marked paid (to shop)',
    mergeFields: ['shopName', 'artistName', 'formattedAmount'],
    shopOnly: true,
  },
  SHOP_CUT_CONFIRMED: {
    label: 'Shop cut confirmed (to you)',
    mergeFields: ['artistFirstName', 'shopName'],
    artistOnly: true,
  },
  BOOKING_CONFIRMATION: {
    label: 'Booking confirmation (to client)',
    mergeFields: ['clientFirstName', 'artistName'],
    hasExtraNote: true,
  },
};

function keysForSection(isShopSection: boolean): string[] {
  return Object.keys(KEY_META).filter((key) => {
    const meta = KEY_META[key];
    return isShopSection ? !meta.artistOnly : !meta.shopOnly;
  });
}

type Draft = {
  key: string;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  extraNoteTemplate: string;
};

const EMPTY_DRAFT: Draft = { key: '', emailSubjectTemplate: '', emailBodyTemplate: '', extraNoteTemplate: '' };

/**
 * One scope (either { artistUserId } or { shopId }), its own card - mirroring web's
 * SystemMessageTemplateSection. A FIXED LIST OF 7 KEYS (KEY_META), not a create/list-of-arbitrary-
 * rows screen like auto-responses.tsx (X39) - every key always exists conceptually (it has a
 * built-in default), so this renders one row per key regardless of whether an override row exists
 * yet. Same inline-editor-card shape as auto-responses.tsx/reminders.tsx (no cross-platform modal
 * primitive in this app - X39), but edit-only, never create, since there's nothing to create.
 */
function SystemMessageTemplateSection({
  scope,
  title,
  description,
  isShopSection,
  testIDPrefix,
}: {
  scope: { artistUserId: string } | { shopId: string };
  title: string;
  description: string;
  isShopSection: boolean;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  const { data, loading, error, refetch } = useGetSystemMessageTemplatesQuery({
    variables: scope,
    fetchPolicy: 'cache-and-network',
  });
  const [updateTemplate, { loading: saving }] = useUpdateSystemMessageTemplateMutation();
  const [resetTemplate] = useResetSystemMessageTemplateMutation();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);

  const overridesByKey = new Map((data?.getSystemMessageTemplates ?? []).map((row) => [row.key, row]));
  const keys = keysForSection(isShopSection);

  const openEdit = (key: string) => {
    const existing = overridesByKey.get(key);
    setDraft({
      key,
      emailSubjectTemplate: existing?.emailSubjectTemplate ?? '',
      emailBodyTemplate: existing?.emailBodyTemplate ?? '',
      extraNoteTemplate: existing?.extraNoteTemplate ?? '',
    });
    setFormError(null);
    setEditingKey(key);
  };
  const closeEditor = () => setEditingKey(null);

  const handleSave = () => {
    setFormError(null);
    updateTemplate({
      variables: {
        input: {
          ...('shopId' in scope ? { shopId: scope.shopId } : {}),
          key: draft.key,
          emailSubjectTemplate: draft.emailSubjectTemplate.trim() || null,
          emailBodyTemplate: draft.emailBodyTemplate.trim() || null,
          extraNoteTemplate: draft.extraNoteTemplate.trim() || null,
        },
      },
    })
      .then(() => {
        setEditingKey(null);
        return refetch();
      })
      .catch((err) => setFormError((err as Error).message));
  };

  const handleReset = (key: string) => {
    resetTemplate({ variables: { ...('shopId' in scope ? { shopId: scope.shopId } : {}), key } })
      .then(() => refetch())
      .catch((err) => setFormError((err as Error).message));
  };

  if (loading && !data) {
    return <ActivityIndicator color={theme.text} testID={`${testIDPrefix}-loading`} />;
  }

  const meta = editingKey ? KEY_META[editingKey] : null;

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
      ) : (
        keys.map((key) => {
          const isCustomized = overridesByKey.has(key);
          return (
            <View
              key={key}
              style={[styles.templateRow, { borderColor: theme.backgroundSelected }]}
              testID={`${testIDPrefix}-row-${key}`}
            >
              <View style={styles.templateRowMain}>
                <ThemedText type="default">{KEY_META[key].label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {isCustomized ? 'Customized' : 'Default'}
                </ThemedText>
              </View>
              <View style={styles.templateRowActions}>
                <Button
                  label="Edit"
                  variant="secondary"
                  onPress={() => openEdit(key)}
                  testID={`${testIDPrefix}-row-${key}-edit`}
                />
                {isCustomized ? (
                  <Button
                    label="Reset"
                    variant="secondary"
                    onPress={() => handleReset(key)}
                    testID={`${testIDPrefix}-row-${key}-reset`}
                  />
                ) : null}
              </View>
            </View>
          );
        })
      )}

      {editingKey && meta ? (
        <View style={[styles.editor, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold">{meta.label}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Leave a box blank to use the built-in default wording. Merge fields:{' '}
            {meta.mergeFields.map((field) => `{{${field}}}`).join(', ')}.
          </ThemedText>

          <TextInput
            value={draft.emailSubjectTemplate}
            onChangeText={(v) => setDraft((prev) => ({ ...prev, emailSubjectTemplate: v }))}
            placeholder="Email subject"
            placeholderTextColor={theme.textSecondary}
            editable={!saving}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            testID={`${testIDPrefix}-editor-subject`}
          />

          {meta.hasExtraNote ? (
            <>
              <TextInput
                value={draft.extraNoteTemplate}
                onChangeText={(v) => setDraft((prev) => ({ ...prev, extraNoteTemplate: v }))}
                placeholder="Extra note (appended to the confirmation)"
                placeholderTextColor={theme.textSecondary}
                multiline
                editable={!saving}
                style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
                testID={`${testIDPrefix}-editor-extra-note`}
              />
              <ThemedText type="small" themeColor="textSecondary">
                The schedule, deposit, and request details always stay code-generated - this is
                only an optional line appended at the end.
              </ThemedText>
            </>
          ) : (
            <TextInput
              value={draft.emailBodyTemplate}
              onChangeText={(v) => setDraft((prev) => ({ ...prev, emailBodyTemplate: v }))}
              placeholder="Email body"
              placeholderTextColor={theme.textSecondary}
              multiline
              editable={!saving}
              style={[styles.input, styles.multiline, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID={`${testIDPrefix}-editor-body`}
            />
          )}

          {formError ? (
            <ThemedText type="small" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Button label="Save" onPress={handleSave} loading={saving} testID={`${testIDPrefix}-editor-save`} />
            <Button label="Cancel" variant="secondary" onPress={closeEditor} testID={`${testIDPrefix}-editor-cancel`} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Settings > Messages > System Messages. Fourth and last of the Messages-category screens
 * (X31/X38/X39/X40) - the wording of every hardcoded outbound email/SMS app-wide, EXCEPT
 * account-invite and password-reset, which stay hardcoded (identity/security emails, not a shop
 * or artist's own outreach). Direct port of apps/web's SystemMessageTemplatesPanel.jsx. See
 * DECISIONS.md X41.
 *
 * TWO INDEPENDENT SECTIONS, same shape as auto-responses.tsx/response-time.tsx - a shop-connected
 * shop-admin sees BOTH their own overrides AND their shop's, at the same time.
 *
 * Reached only from settings/index.tsx's own "Messages" card - doesn't re-check the top-level
 * isArtist gate itself, same convention as every other settings/*.tsx screen.
 */
export default function SystemMessageTemplatesScreen() {
  const { user } = useAuth();
  const shopId = getUserShopId(user);
  const canManageShopTemplates = Boolean(user) && isShopAdminOrBetter(user) && Boolean(shopId);
  const isArtist = user?.userInfo?.__typename === 'Artist';

  const { data: shopData } = useGetShopDetailQuery({
    variables: { shopId: shopId ?? '' },
    skip: !canManageShopTemplates,
  });

  if (!user) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {isArtist ? (
            <SystemMessageTemplateSection
              scope={{ artistUserId: user.id }}
              title="Your System Messages"
              description="The wording of every automatic email your clients and shop receive about your bookings, messages, and payments."
              isShopSection={false}
              testIDPrefix="system-messages-own"
            />
          ) : null}
          {canManageShopTemplates && shopId ? (
            <SystemMessageTemplateSection
              scope={{ shopId }}
              title={`${shopData?.getShop?.name ?? 'Shop'} System Messages`}
              description="Shop-wide defaults for the same messages, used whenever an artist hasn't set their own."
              isShopSection
              testIDPrefix="system-messages-shop"
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
  templateRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateRowMain: {
    gap: Spacing.half,
  },
  templateRowActions: {
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
