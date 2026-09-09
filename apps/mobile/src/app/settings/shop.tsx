import type { ApolloError } from '@apollo/client';
import {
  useConnectArtistToShopMutation,
  useDisconnectArtistFromShopMutation,
  useGetFormsListQuery,
  useGetShopDetailQuery,
  useGetShopForConnectionLazyQuery,
  useUpdateMyShopFormSlugMutation,
  useUpdateShopCutPercentMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { useTheme } from '@/hooks/use-theme';
import { getUserShopId } from '@/utils/user';

// Shape of the GraphQL error extension the server attaches to a refused connect that would end
// an existing connection - see mutations/artistShopConnections.js. Matched against directly
// (not assumed) the same way apps/web's ShopConnectionPanel.jsx reads it.
type TransferExtension = {
  requiresConfirmation?: boolean;
  newShop?: { name?: string | null } | null;
  currentShops?: Array<{ name?: string | null }> | null;
};

/**
 * Shop-wide money configuration, plus - as of X46 - an artist's own shop connect/disconnect/move
 * flow. Two direct ports folded into one screen because that's how web organizes them too: both
 * apps/web's ShopPanel.jsx and ShopConnectionPanel.jsx render inside the same "Shop" settings
 * category (pages/settings/settingsCategories.jsx), ShopPanel gated to a shop admin with a shop,
 * ShopConnectionPanel shown to any artist regardless. See DECISIONS.md X36 (ShopPanel) and X46
 * (ShopConnectionPanel).
 *
 * GATING CHANGED UNDER X46: this screen used to `return null` for anyone without a shopId
 * (settings/index.tsx's own nav link required isShopAdminOrBetter && shopId to even route here).
 * ShopConnectionPanel needs to be reachable by an INDEPENDENT artist with no shop at all (to
 * connect one) and by a plain shop-connected artist who isn't an admin (to disconnect or move) -
 * neither case has a shopId an admin-only gate would accept, or in the independent case a shopId
 * at all. settings/index.tsx's "Shop" link is widened to `user.userType === 'artist'` to match;
 * this screen's own gate becomes "is this an artist" rather than "is this a shop admin with a
 * shop" - see the isArtist check just below the hooks.
 *
 * NOT a second copy of shop/[id].tsx. Only the two money-adjacent fields ShopPanel.jsx itself
 * edits live in the admin section below - shop cut percent and the shop's own form-link handle -
 * name/address/logo/etc. stay on the shop screen, exactly like web keeps them on /shop/:shopId
 * rather than duplicating them here. Tax rate/processing offset are ALSO not here, same as web:
 * those are SquarePricingCard's job (settings/index.tsx, X34).
 *
 * SHOP-WIDE FORM LINKS shown read-only via a `selectTextOnFocus` TextInput, not a Copy button -
 * same "no reliable source for the web app's own public origin, so show the relative path and let
 * the OS's own text selection copy it" call form/[id].tsx and forms/index.tsx already made (X28/
 * X30) for the exact same reason (`window.location.origin` has no RN equivalent).
 *
 * CONFIRMATIONS USE RN's NATIVE Alert.alert, NOT WEB'S CUSTOM MODAL MARKUP - same call
 * components/ArchiveControl.tsx already made for the exact same reason (its own header comment:
 * "a native alert is the idiomatic RN equivalent of a modal confirm and needs no bespoke
 * styling"). Both the disconnect confirm (web: window.confirm) and the transfer confirm (web: a
 * custom backdrop dialog) collapse into one Alert.alert call each - Alert.alert's single
 * title+message+button-list shape holds the transfer dialog's full copy (both shop names, the
 * "will end that connection" warning, and the "past appointments... stay exactly as they are"
 * reassurance) without losing any of it, so there is no pendingTransfer render state on this
 * screen at all, unlike web's own pendingTransfer-driven JSX dialog.
 */
export default function ShopSettingsScreen() {
  const { user, updateCurrentUser } = useAuth();
  const theme = useTheme();
  const shopId = getUserShopId(user);
  const isArtist = user?.userType === 'artist';
  const showShopMoneyPanel = isShopAdminOrBetter(user) && Boolean(shopId);

  const [editedCut, setEditedCut] = useState<string | undefined>(undefined);
  const [cutSaveState, setCutSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editedSlug, setEditedSlug] = useState<string | undefined>(undefined);
  const [slugSaveState, setSlugSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { data, loading, error } = useGetShopDetailQuery({
    variables: { shopId: shopId ?? '' },
    skip: !showShopMoneyPanel,
    fetchPolicy: 'cache-and-network',
  });
  const { data: formsData } = useGetFormsListQuery({
    variables: { shopId, status: 'published', page: { limit: 100, offset: 0 } },
    skip: !showShopMoneyPanel,
    fetchPolicy: 'cache-and-network',
  });

  const [updateCutPercent, { loading: savingCut }] = useUpdateShopCutPercentMutation();
  const [updateFormSlug, { loading: savingSlug }] = useUpdateMyShopFormSlugMutation();

  // ShopConnectionPanel-equivalent state - available to any artist, independent of shopId.
  const [shopIdToConnect, setShopIdToConnect] = useState('');
  const [shopActionError, setShopActionError] = useState<string | null>(null);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [connectArtistToShop, { loading: connecting }] = useConnectArtistToShopMutation();
  const [disconnectArtistFromShop, { loading: disconnecting }] = useDisconnectArtistFromShopMutation();
  const [fetchShopForConnection] = useGetShopForConnectionLazyQuery();

  if (!isArtist) {
    return null;
  }

  if (showShopMoneyPanel && loading && !data) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="shop-settings-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const shop = data?.getShop;
  const connectedShopName = user?.userInfo?.__typename === 'Artist' ? user.userInfo.shop?.name : undefined;
  const connectedShopWebsite =
    user?.userInfo?.__typename === 'Artist' ? user.userInfo.shop?.website : undefined;

  const cutValue = shop ? editedCut ?? String(shop.shopCutPercent ?? 0) : '';
  const slugValue = shop ? editedSlug ?? (shop.formSlug || '') : '';
  const shopWideLinks = (formsData?.getForms.items ?? []).filter((form) => form.shopUseOnly);

  // Saved on blur, matching web's own autosave convention for this exact field (and this app's
  // own IdentityCard on shop/[id].tsx for the same reason - a separate Save button for one field
  // would be the odd one out here).
  const handleCutBlur = () => {
    if (!shop) {
      return;
    }
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
    if (!shop || !shopId) {
      return;
    }
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

  // Shared by the first attempt and the confirmed retry - the only difference between them is
  // confirmTransfer, so the success path isn't written twice. Matches
  // ShopConnectionPanel.jsx's own runConnect exactly, including the fallback to a bare
  // { id: targetShopId } when the follow-up shop lookup comes back empty.
  const runConnect = async (targetShopId: string, confirmTransfer: boolean) => {
    await connectArtistToShop({
      variables: { artistId: user!.id, shopId: targetShopId, confirmTransfer },
    });
    const { data: shopData } = await fetchShopForConnection({ variables: { shopId: targetShopId } });
    await updateCurrentUser({
      ...user!,
      userInfo:
        user!.userInfo?.__typename === 'Artist'
          ? {
              ...user!.userInfo,
              shop: shopData?.getShop
                ? { id: shopData.getShop.id, name: shopData.getShop.name, website: shopData.getShop.website }
                : { id: targetShopId, name: null, website: null },
            }
          : user!.userInfo,
    } as typeof user);
    setShopIdToConnect('');
    setShowMoveForm(false);
    setShopActionError(null);
  };

  const handleConnectToShop = async () => {
    setShopActionError(null);
    const trimmedShopId = shopIdToConnect.trim();
    if (!trimmedShopId) {
      setShopActionError('Enter the Shop ID your shop gave you.');
      return;
    }
    try {
      await runConnect(trimmedShopId, false);
    } catch (err) {
      // An artist works at one shop at a time, so connecting somewhere new ends the current
      // connection. The server refuses the first attempt and hands back which shop is being
      // left; this turns that into a confirmation naming both shops rather than a generic "are
      // you sure" - see mutations/artistShopConnections.js.
      const apolloError = err as ApolloError;
      const transfer = apolloError.graphQLErrors?.[0]?.extensions?.transfer as TransferExtension | undefined;
      if (transfer?.requiresConfirmation) {
        const leavingName =
          transfer.currentShops?.length === 1 ? transfer.currentShops[0]?.name : 'your current shop';
        const currentNames = transfer.currentShops?.map((c) => c?.name).join(', ') || 'another shop';
        Alert.alert(
          `Move to ${transfer.newShop?.name}?`,
          `You're currently connected to ${currentNames}. Connecting to ${transfer.newShop?.name} ` +
            `will end that connection. You'll no longer be associated with ${leavingName}, and ` +
            `their calendar, rates and shop-cut ledger will no longer apply to your work.\n\n` +
            `Your past appointments, projects and earnings stay exactly as they are.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              onPress: () => {
                runConnect(trimmedShopId, true).catch((err2) => {
                  setShopActionError((err2 as ApolloError).graphQLErrors?.[0]?.message ?? (err2 as Error).message);
                });
              },
            },
          ],
        );
        return;
      }
      setShopActionError(apolloError.graphQLErrors?.[0]?.message ?? apolloError.message);
    }
  };

  const handleDisconnectFromShop = () => {
    Alert.alert(`Disconnect from ${connectedShopName || 'this shop'}?`, 'You can reconnect later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          if (!shopId) {
            return;
          }
          try {
            await disconnectArtistFromShop({ variables: { artistId: user!.id, shopId } });
            await updateCurrentUser({
              ...user!,
              userInfo:
                user!.userInfo?.__typename === 'Artist' ? { ...user!.userInfo, shop: null } : user!.userInfo,
            } as typeof user);
          } catch (err) {
            const apolloError = err as ApolloError;
            setShopActionError(apolloError.graphQLErrors?.[0]?.message ?? apolloError.message);
          }
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {showShopMoneyPanel && shop ? (
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
          ) : null}

          {showShopMoneyPanel && error && !shop ? (
            <ThemedText themeColor="textSecondary" testID="shop-settings-error">
              Couldn't load this shop.
            </ThemedText>
          ) : null}

          <View style={styles.card} testID="shop-connection-card">
            <ThemedText type="smallBold">Shop Connection</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {shopId
                ? "You're connected to this shop - your calendar, rate settings, and shop-cut ledger are all scoped to it."
                : "You're not currently connected to a shop - you're set up as an independent artist."}
            </ThemedText>

            {shopId ? (
              <>
                <ThemedText type="default" style={styles.label}>
                  {connectedShopName || 'Connected shop'}
                </ThemedText>
                {connectedShopWebsite ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {connectedShopWebsite}
                  </ThemedText>
                ) : null}

                <View style={styles.actions}>
                  <Button
                    label="Disconnect from Shop"
                    variant="secondary"
                    onPress={handleDisconnectFromShop}
                    loading={disconnecting}
                    testID="shop-connection-disconnect"
                  />
                  {/* Moving shops without disconnecting first is the normal case - people change
                      shops, they don't think to file paperwork about leaving the old one. */}
                  {!showMoveForm ? (
                    <Button
                      label="Move to a Different Shop"
                      variant="secondary"
                      onPress={() => {
                        setShopActionError(null);
                        setShowMoveForm(true);
                      }}
                      testID="shop-connection-move"
                    />
                  ) : null}
                </View>

                {showMoveForm ? (
                  <View style={styles.moveForm}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Connecting to a different shop ends your connection to {connectedShopName || 'your current shop'}.
                    </ThemedText>
                    <TextInput
                      value={shopIdToConnect}
                      onChangeText={setShopIdToConnect}
                      placeholder="Ask your shop for their Shop ID"
                      placeholderTextColor={theme.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                      testID="shop-connection-id-input"
                    />
                    {shopActionError ? (
                      <ThemedText type="small" style={styles.error}>
                        {shopActionError}
                      </ThemedText>
                    ) : null}
                    <Button
                      label="Move to This Shop"
                      onPress={handleConnectToShop}
                      loading={connecting}
                      testID="shop-connection-move-submit"
                    />
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.moveForm}>
                <TextInput
                  value={shopIdToConnect}
                  onChangeText={setShopIdToConnect}
                  placeholder="Ask your shop for their Shop ID"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                  testID="shop-connection-id-input"
                />
                {shopActionError ? (
                  <ThemedText type="small" style={styles.error}>
                    {shopActionError}
                  </ThemedText>
                ) : null}
                <Button
                  label="Connect to Shop"
                  onPress={handleConnectToShop}
                  loading={connecting}
                  testID="shop-connection-connect-submit"
                />
              </View>
            )}
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  moveForm: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
