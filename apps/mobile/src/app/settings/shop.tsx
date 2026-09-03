import {
  useGetFormsListQuery,
  useGetShopDetailQuery,
  useUpdateMyShopFormSlugMutation,
  useUpdateShopCutPercentMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { getUserShopId } from '@/utils/user';

/**
 * Shop-wide money configuration - direct port of apps/web's ShopPanel.jsx. Closes the gap named
 * directly in shop/[id].tsx's own ShopCutCard comment (X24): shopCutPercent has been read-only on
 * mobile since that screen was built, with nowhere to actually change it from. See DECISIONS.md
 * X36.
 *
 * NOT a second copy of shop/[id].tsx. Only the two money-adjacent fields ShopPanel.jsx itself
 * edits live here - shop cut percent and the shop's own form-link handle - name/address/logo/etc.
 * stay on the shop screen, exactly like web keeps them on /shop/:shopId rather than duplicating
 * them here. Tax rate/processing offset are ALSO not here, same as web: those are
 * SquarePricingCard's job (settings/index.tsx, X34), which already resolves to the shop for a
 * connected artist - a second editor for the same two fields would be two places writing one
 * pair, the exact bug X34's own SquarePricingCard was built to avoid repeating.
 *
 * Reached only from settings/index.tsx's own "Shop" link (isShopAdminOrBetter + has a shop) -
 * this screen doesn't re-check that gate itself, matching every other settings/*.tsx screen in
 * this port (income-types.tsx, expense-types.tsx, recurring-expenses.tsx all trust their own
 * entry point's gate the same way).
 *
 * SHOP-WIDE FORM LINKS shown read-only via a `selectTextOnFocus` TextInput, not a Copy button -
 * same "no reliable source for the web app's own public origin, so show the relative path and let
 * the OS's own text selection copy it" call form/[id].tsx and forms/index.tsx already made (X28/
 * X30) for the exact same reason (`window.location.origin` has no RN equivalent). Filters
 * GetFormsList's own shopUseOnly field down to the shop-wide subset, mirroring web's
 * `getForms({shopId}, "published").filter(f => f.shopUseOnly)` exactly.
 */
export default function ShopSettingsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const shopId = getUserShopId(user);

  const [editedCut, setEditedCut] = useState<string | undefined>(undefined);
  const [cutSaveState, setCutSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editedSlug, setEditedSlug] = useState<string | undefined>(undefined);
  const [slugSaveState, setSlugSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { data, loading, error } = useGetShopDetailQuery({
    variables: { shopId: shopId ?? '' },
    skip: !shopId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: formsData } = useGetFormsListQuery({
    variables: { shopId, status: 'published', page: { limit: 100, offset: 0 } },
    skip: !shopId,
    fetchPolicy: 'cache-and-network',
  });

  const [updateCutPercent, { loading: savingCut }] = useUpdateShopCutPercentMutation();
  const [updateFormSlug, { loading: savingSlug }] = useUpdateMyShopFormSlugMutation();

  if (!shopId) {
    return null;
  }

  if (loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="shop-settings-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const shop = data?.getShop;
  if (error || !shop) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="shop-settings-error">
            Couldn't load this shop.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const cutValue = editedCut ?? String(shop.shopCutPercent ?? 0);
  const slugValue = editedSlug ?? (shop.formSlug || '');
  const shopWideLinks = (formsData?.getForms.items ?? []).filter((form) => form.shopUseOnly);

  // Saved on blur, matching web's own autosave convention for this exact field (and this app's
  // own IdentityCard on shop/[id].tsx for the same reason - a separate Save button for one field
  // would be the odd one out here).
  const handleCutBlur = () => {
    const parsed = parseInt(cutValue, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      setCutSaveState('error');
      return;
    }
    if (parsed === (shop.shopCutPercent ?? 0)) {
      setCutSaveState('idle');
      return;
    }
    setCutSaveState('saving');
    // ShopInput requires every field non-null or it's nulled out - same shape as shop/[id].tsx's
    // own IdentityCard, echoing back everything this screen doesn't edit.
    updateCutPercent({
      variables: {
        shop: {
          id: shop.id,
          name: shop.name,
          email: shop.email,
          phone: shop.phone,
          address: shop.address,
          city: shop.city,
          state: shop.state,
          zip: shop.zip,
          instagram: shop.instagram,
          facebook: shop.facebook,
          website: shop.website,
          shopMinimum: shop.shopMinimum,
          hourlyRate: shop.hourlyRate,
          shopCutPercent: parsed,
          logo: shop.logo,
          billingType: shop.billingType,
          status: shop.status,
        },
      },
    })
      .then(() => setCutSaveState('saved'))
      .catch(() => setCutSaveState('error'));
  };

  const handleSlugBlur = () => {
    const normalized = slugValue.trim().toLowerCase();
    if (normalized === (shop.formSlug || '') || !normalized) {
      setSlugSaveState('idle');
      return;
    }
    setSlugSaveState('saving');
    updateFormSlug({ variables: { shopId, slug: normalized } })
      .then(() => setSlugSaveState('saved'))
      .catch(() => setSlugSaveState('error'));
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <ThemedText type="smallBold">Shop</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Settings for {shop.name}, applied to every artist working there.
            </ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Shop cut (%)
            </ThemedText>
            <TextInput
              value={cutValue}
              onChangeText={setEditedCut}
              onBlur={handleCutBlur}
              editable={!savingCut}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="shop-settings-cut-percent"
            />
            <ThemedText type="small" themeColor="textSecondary">
              Taken from the tattoo work only - never from tips, tax or processing fees.
            </ThemedText>
            {cutSaveState !== 'idle' ? (
              <ThemedText
                type="small"
                style={cutSaveState === 'error' ? styles.error : styles.saveState}
                testID="shop-settings-cut-save-state"
              >
                {cutSaveState === 'saving' && 'Saving...'}
                {cutSaveState === 'saved' && 'Saved'}
                {cutSaveState === 'error' && 'Enter a whole number between 0 and 100'}
              </ThemedText>
            ) : null}

            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              Shop link
            </ThemedText>
            <TextInput
              value={slugValue}
              onChangeText={setEditedSlug}
              onBlur={handleSlugBlur}
              editable={!savingSlug}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="shop-settings-form-slug"
            />
            <ThemedText type="small" themeColor="textSecondary">
              Lowercase letters, numbers and hyphens - used for forms shared shop-wide, not tied
              to one artist.
            </ThemedText>
            {slugSaveState !== 'idle' ? (
              <ThemedText
                type="small"
                style={slugSaveState === 'error' ? styles.error : styles.saveState}
                testID="shop-settings-slug-save-state"
              >
                {slugSaveState === 'saving' && 'Saving...'}
                {slugSaveState === 'saved' && 'Saved'}
                {slugSaveState === 'error' && "That link couldn't be saved - it may already be taken."}
              </ThemedText>
            ) : null}

            {shop.formSlug && shopWideLinks.length > 0 ? (
              <View style={styles.linksList}>
                {shopWideLinks.map((form) => (
                  <View key={form.id} style={styles.linkRow}>
                    <ThemedText type="small" numberOfLines={1}>
                      {form.title}
                    </ThemedText>
                    <TextInput
                      value={`${form.slug}/${shop.formSlug}`}
                      editable={false}
                      selectTextOnFocus
                      style={[styles.linkField, { color: theme.text, borderColor: theme.backgroundSelected }]}
                      testID={`shop-settings-link-${form.id}`}
                    />
                  </View>
                ))}
              </View>
            ) : null}
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
  label: {
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  saveState: {
    color: '#2E7D32',
  },
  error: {
    color: '#D33',
  },
  linksList: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  linkRow: {
    gap: Spacing.one,
  },
  linkField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
});
