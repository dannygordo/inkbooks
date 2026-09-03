import {
  useDisconnectShopSquareMutation,
  useGetShopDetailQuery,
  useGetSquareAuthorizationUrlLazyQuery,
  useUpdateShopIdentityMutation,
} from '@inkbooks/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ROLES } from '@/constants/auth';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * A shop-admin's management view into one shop - `canEdit = user.role <= ROLES.SHOP_ADMIN`, a
 * hard floor with no self-branch (updateShop's own withAuth(fn, SHOP_ADMIN), same shape as
 * Staff's updateStaff - see web's Shop.jsx canEdit comment). See DECISIONS.md X24.
 *
 * shopCutPercent is a read-only readout here, matching web's own Shop.jsx exactly - that page's
 * own comment explains this was consolidated from a formerly-duplicated editable copy (two
 * editors writing the same stored field was a real bug). A "Change in Settings" button now
 * actually goes somewhere (settings/shop.tsx, X36) - it used to be plain text admitting mobile had
 * no such screen yet.
 *
 * hourlyRate/shopMinimum/logo/billingType/status are echoed back unchanged in every save, exactly
 * like web's own buildShopPayload - none of the five are edited on this page (see
 * shops.graphql's own comment on ShopInput requiring every field or it's nulled out).
 *
 * Square Connect: opens Square's hosted OAuth consent page externally via Linking.openURL rather
 * than a WebView or expo-web-browser flow (which isn't even an installed dependency). The
 * authorization URL is requested with platform: "mobile" (packages/api's shops.graphql), which
 * rides inside the signed state token and tells the callback route (server/routes/squareOAuth.js)
 * to land the seller's browser on a small "return to the app" page that opens inkbooks://shop/:id
 * instead of redirecting to the web app. This screen reads the resulting ?square= param below and
 * shows a banner, plus refetches so squareConnected is current without a manual pull-to-refresh.
 * See DECISIONS.md X24 (the original gap) and X33 (the deep link that closes it). Disconnect has
 * no such caveat - it's a plain mutation with no redirect involved at all.
 */
export default function ShopDetailScreen() {
  const params = useLocalSearchParams<{ id: string; square?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const squareStatus = Array.isArray(params.square) ? params.square[0] : params.square;
  const { user } = useAuth();
  const theme = useTheme();

  const { data, loading, error, refetch } = useGetShopDetailQuery({
    variables: { shopId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const shop = data?.getShop;

  // Belt-and-suspenders alongside the cache-and-network fetch policy above: this effect covers
  // the case where expo-router reuses an already-mounted instance of this screen rather than
  // remounting it when the OS opens the inkbooks://shop/:id?square=... deep link, so the update
  // still happens without the user having to pull-to-refresh.
  useEffect(() => {
    if (squareStatus) {
      refetch();
    }
  }, [squareStatus, refetch]);

  if ((loading && !shop) || !id) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator color={theme.text} testID="shop-detail-loading" />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (error || !shop) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText themeColor="textSecondary" testID="shop-detail-error">
            {error ? `Couldn't load this shop: ${error.message}` : 'This shop does not exist.'}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const canEdit = Boolean(user?.role && user.role <= ROLES.SHOP_ADMIN);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">{shop.name}</ThemedText>
          </View>

          <IdentityCard shop={shop} canEdit={canEdit} />

          <ShopCutCard shop={shop} canEdit={canEdit} />

          <SquareCard
            shop={shop}
            canEdit={canEdit}
            onChanged={() => refetch()}
            returnStatus={squareStatus}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type Shop = NonNullable<ReturnType<typeof useGetShopDetailQuery>['data']>['getShop'];

function IdentityCard({ shop, canEdit }: { shop: NonNullable<Shop>; canEdit: boolean }) {
  const nameRef = useRef(shop.name);
  const emailRef = useRef(shop.email ?? '');
  const phoneRef = useRef(shop.phone ?? '');
  const addressRef = useRef(shop.address ?? '');
  const cityRef = useRef(shop.city ?? '');
  const stateRef = useRef(shop.state ?? '');
  const zipRef = useRef(shop.zip ?? '');
  const instagramRef = useRef(shop.instagram ?? '');
  const facebookRef = useRef(shop.facebook ?? '');
  const websiteRef = useRef(shop.website ?? '');
  const lastSavedRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [updateShop] = useUpdateShopIdentityMutation();

  // shopMinimum/hourlyRate/logo/billingType/status/shopCutPercent are required by ShopInput but
  // never edited on this page - echoed back unchanged, matching web's own buildShopPayload
  // exactly (see shops.graphql's own comment).
  const buildPayload = () => ({
    id: shop.id,
    name: nameRef.current,
    email: emailRef.current,
    phone: phoneRef.current,
    address: addressRef.current,
    city: cityRef.current,
    state: stateRef.current,
    zip: zipRef.current,
    instagram: instagramRef.current,
    facebook: facebookRef.current,
    website: websiteRef.current,
    shopMinimum: shop.shopMinimum,
    hourlyRate: shop.hourlyRate,
    shopCutPercent: shop.shopCutPercent,
    logo: shop.logo,
    billingType: shop.billingType,
    status: shop.status,
  });

  if (lastSavedRef.current === null) {
    lastSavedRef.current = JSON.stringify(buildPayload());
  }

  const save = async () => {
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return;
    }
    lastSavedRef.current = serialized;
    setSaveState('saving');
    try {
      await updateShop({ variables: { shop: payload } });
      setSaveState('saved');
    } catch {
      lastSavedRef.current = null;
      setSaveState('error');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">Details</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" testID="shop-save-state">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All changes saved'}
          {saveState === 'error' && "Couldn't save - try again"}
        </ThemedText>
      </View>
      {!canEdit ? (
        <ThemedText type="small" themeColor="textSecondary">
          Only a shop admin can edit these details.
        </ThemedText>
      ) : null}

      <FormField
        label="Name"
        defaultValue={shop.name}
        onChangeText={(t) => (nameRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="shop-name"
      />
      <FormField
        label="Email"
        defaultValue={shop.email ?? ''}
        onChangeText={(t) => (emailRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="email-address"
        autoCapitalize="none"
        testID="shop-email"
      />
      <FormField
        label="Phone"
        defaultValue={shop.phone ?? ''}
        onChangeText={(t) => (phoneRef.current = t)}
        onBlur={save}
        editable={canEdit}
        keyboardType="phone-pad"
        testID="shop-phone"
      />
      <FormField
        label="Website"
        defaultValue={shop.website ?? ''}
        onChangeText={(t) => (websiteRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="shop-website"
      />
      <FormField
        label="Address"
        defaultValue={shop.address ?? ''}
        onChangeText={(t) => (addressRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="shop-address"
      />
      <FormField
        label="City"
        defaultValue={shop.city ?? ''}
        onChangeText={(t) => (cityRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="shop-city"
      />
      <FormField
        label="State"
        defaultValue={shop.state ?? ''}
        onChangeText={(t) => (stateRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="shop-state"
      />
      <FormField
        label="Zip"
        defaultValue={shop.zip ?? ''}
        onChangeText={(t) => (zipRef.current = t)}
        onBlur={save}
        editable={canEdit}
        testID="shop-zip"
      />
      <FormField
        label="Instagram"
        defaultValue={shop.instagram ?? ''}
        onChangeText={(t) => (instagramRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="shop-instagram"
      />
      <FormField
        label="Facebook"
        defaultValue={shop.facebook ?? ''}
        onChangeText={(t) => (facebookRef.current = t)}
        onBlur={save}
        editable={canEdit}
        autoCapitalize="none"
        testID="shop-facebook"
      />
    </View>
  );
}

function ShopCutCard({ shop, canEdit }: { shop: NonNullable<Shop>; canEdit: boolean }) {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Shop Cut</ThemedText>
      <ThemedText type="default" testID="shop-cut-percent">
        {shop.shopCutPercent ?? 0}%
      </ThemedText>
      {canEdit ? (
        <Button
          label="Change in Settings"
          variant="secondary"
          onPress={() => router.push('/settings/shop')}
          testID="shop-cut-settings-link"
        />
      ) : null}
    </View>
  );
}

function SquareCard({
  shop,
  canEdit,
  onChanged,
  returnStatus,
}: {
  shop: NonNullable<Shop>;
  canEdit: boolean;
  onChanged: () => void;
  returnStatus?: string;
}) {
  const [connectError, setConnectError] = useState<string | null>(null);
  const [fetchAuthorizationUrl, { loading: connecting }] = useGetSquareAuthorizationUrlLazyQuery({
    fetchPolicy: 'network-only',
  });
  const [disconnectSquare, { loading: disconnecting }] = useDisconnectShopSquareMutation();

  const handleConnect = () => {
    setConnectError(null);
    fetchAuthorizationUrl({ variables: { shopId: shop.id } })
      .then((result) => {
        const url = result.data?.getSquareAuthorizationUrl;
        if (!url) {
          setConnectError("Couldn't start Square connection.");
          return;
        }
        return Linking.openURL(url);
      })
      .catch((err) => setConnectError((err as Error).message));
  };

  const handleDisconnect = () => {
    setConnectError(null);
    disconnectSquare({ variables: { shopId: shop.id } })
      .then(() => onChanged())
      .catch((err) => setConnectError((err as Error).message));
  };

  const returnBanner =
    returnStatus === 'connected'
      ? { text: 'Square connected.', testID: 'square-return-connected' as const }
      : returnStatus === 'denied'
        ? {
            text: 'Square connection cancelled - nothing changed.',
            testID: 'square-return-denied' as const,
          }
        : returnStatus
          ? {
              text: 'Something went wrong connecting Square. Please try again.',
              testID: 'square-return-error' as const,
            }
          : null;

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Square</ThemedText>
      {returnBanner ? (
        <ThemedText type="small" testID={returnBanner.testID}>
          {returnBanner.text}
        </ThemedText>
      ) : null}
      {connectError ? (
        <ThemedText type="small" style={styles.error}>
          {connectError}
        </ThemedText>
      ) : null}
      {shop.squareConnected ? (
        <>
          <ThemedText type="default" testID="square-connected">
            Connected
          </ThemedText>
          {canEdit ? (
            <Button
              label="Disconnect Square"
              variant="danger"
              onPress={handleDisconnect}
              loading={disconnecting}
              testID="square-disconnect"
            />
          ) : null}
        </>
      ) : (
        <>
          <ThemedText type="default" themeColor="textSecondary" testID="square-not-connected">
            Not connected - connect Square to send shop-cut invoices directly to artists.
          </ThemedText>
          {canEdit ? (
            <>
              <Button
                label="Connect with Square"
                variant="secondary"
                onPress={handleConnect}
                loading={connecting}
                testID="square-connect"
              />
              <ThemedText type="small" themeColor="textSecondary">
                You'll finish this in your browser, then it'll bring you back to this screen
                automatically once Square says you're connected.
              </ThemedText>
            </>
          ) : null}
        </>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  error: {
    color: '#D33',
  },
});
