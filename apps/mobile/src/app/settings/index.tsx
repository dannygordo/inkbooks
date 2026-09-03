import {
  useChangePasswordMutation,
  useDisconnectMySquareMutation,
  useGetMySquareAuthorizationUrlLazyQuery,
  useGetMySquareConnectionQuery,
  useGetMySquarePricingSettingsQuery,
  useGetUserTagColorsQuery,
  useUpdateSquarePricingSettingsMutation,
  useUpdateUserMutation,
} from '@inkbooks/api';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { deleteFile } from '@/firebase/deleteFile';
import { uploadFileWithProgress } from '@/firebase/uploadFile';
import { canManageBusinessLedger, isShopAdminOrBetter } from '@/utils/permissions';
import { avatarFolder, previousAvatarUrl } from '@/utils/avatar';
import { formatCents, basisPointsToPercent, dollarsToCents, percentToBasisPoints } from '@/utils/money';
import { formatImagePathForFirebaseStorage } from '@/utils/imagePath';
import { showAvailableColorTags } from '@/utils/tagColors';
import { getUserShopId } from '@/utils/user';

/**
 * apps/web's AccountPanel.jsx (Settings > Photo/Password/Calendar color), now in full - photo
 * (the original slice), password change (IBUpdatePassword), and the calendar-color picker
 * (getTagColorsByShop) all live here. See DECISIONS.md X18 for the password/calendar-color half's
 * own scope notes (the real-vs-placeholder accessToken distinction between ChangePassword and
 * UpdateUser in particular).
 *
 * NO CROP SCREEN, UNLIKE WEB'S CropEasy (react-easy-crop, a canvas-based web-only library).
 * expo-image-picker's own `allowsEditing`/`aspect: [1, 1]` gives a native square-crop UI on both
 * iOS and Android for free - the RN-idiomatic equivalent, and one that needs no extra dependency
 * or native module, matching DECISIONS.md X13's own "avoid a native rebuild where a built-in
 * option already covers it" reasoning for this port.
 *
 * UPLOAD FLOW DELIBERATELY REORDERED FROM WEB'S: web uploads the new image, deletes the old one,
 * THEN calls updateUser - so an updateUser failure after a successful upload+delete leaves the
 * user with neither the old avatar file nor a saved reference to the new one. Here, the old
 * avatar is deleted only AFTER updateUser succeeds, so the worst case if anything fails midway is
 * an orphaned new file in Storage (harmless - nothing points at it), never a user left with no
 * avatar at all.
 *
 * A "Business" section below links out to three more Settings screens (X31) - Income/Expense
 * category management and Recurring Expenses - gated the same `canManageBusinessLedger` as the
 * Income/Expenses pages themselves.
 *
 * "Square" and "Tax & processing" (X34) are the artist's OWN Square connection and the tax
 * rate/card-processing offset every charge is computed from - direct ports of web's SquarePanel.jsx
 * and SquarePricingPanel.jsx, kept as two cards on this same screen rather than their own routes
 * since both are short and this screen already mixes several unrelated settings the same way.
 * Square Connect reuses the exact `platform: "mobile"` deep-link mechanism X33 built for the shop
 * screen (`getMySquareAuthorizationUrl(platform: "mobile")`), so a tap on "Connect with Square"
 * here returns to this same screen via `inkbooks://settings?square=<status>` - the `square` param
 * this screen reads below closes the one follow-up X33 named as still open.
 *
 * A "Shop" link (X36) below routes shop-admins to `settings/shop.tsx` - the shop-cut-percent
 * editor named directly in shop/[id].tsx's own ShopCutCard comment (X24), plus the shop's own
 * form-link handle and its shop-wide form links list. Kept as its own screen, not a third card
 * here, since it needs its own shop query and a forms query neither existing card needs.
 *
 * A "Rates" link (X37) routes any artist to `settings/rates.tsx` - what they charge, and, if
 * shop-connected, whose rate actually applies to their sessions. `BoothRentPanel`'s "your booth
 * rent" card is a real, separate feature with no existing mobile infrastructure - not folded in.
 *
 * A "Messages" card (X38/X39) links to two of the four web panels so far - `settings/
 * reminders.tsx` and `settings/auto-responses.tsx` - out of the largest remaining chunk X31
 * named, taken one screen at a time, same as the Business/Rates links above. ResponseTime and
 * SystemMessageTemplates remain open.
 *
 * Everything else on web's Settings (Appearance, Notifications, Security, Forms' per-artist
 * "Your link" section) remains unported - see DECISIONS.md X31/X34/X36/X37/X38/X39 for the full
 * list and reasoning.
 */
export default function SettingsScreen() {
  const { user, updateCurrentUser } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ square?: string }>();
  const squareStatus = Array.isArray(params.square) ? params.square[0] : params.square;
  const [updateUser] = useUpdateUserMutation();
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changePassword, { loading: changingPassword }] = useChangePasswordMutation();

  const shopId = getUserShopId(user);
  // See getTagColorsByShop's own comment on web (via GetUserTagColors's own header comment) -
  // skip: !shopId is what stops this firing with an undefined variable against a schema field
  // typed `shopId: ID!` for a shop-less independent artist.
  const { data: tagColorsData, loading: tagColorsLoading } = useGetUserTagColorsQuery({
    variables: { shopId: shopId ?? '' },
    skip: !shopId,
  });

  if (!user) {
    return null;
  }

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      setPasswordError('Password must not be empty');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords must match');
      return;
    }
    setPasswordError(null);
    try {
      const { data } = await changePassword({ variables: { currentPassword, newPassword } });
      // Unlike UpdateUser's placeholder (see updateUser.graphql's own comment), THIS accessToken
      // is real and must be persisted, or the app would keep using a token the server has already
      // moved past.
      if (data?.changePassword.accessToken) {
        await updateCurrentUser({ ...user, accessToken: data.changePassword.accessToken });
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch (err) {
      setPasswordError((err as Error).message);
    }
  };

  const handleTagColor = async (tagValue: string) => {
    try {
      const { data } = await updateUser({
        variables: { user: { id: user.id, email: user.email, role: user.role, tagColor: tagValue } },
        // Keeps the taken-colors list accurate immediately - the color this user just gave up
        // becomes available to their shop-mates again, and the one they just took should
        // disappear from the "available" set on a second device signed into the same shop.
        // Simpler than web's own hand-maintained `stillTaken` list for the same end result.
        refetchQueries: ['GetUserTagColors'],
      });
      if (data?.updateUser.tagColor) {
        await updateCurrentUser({ ...user, tagColor: data.updateUser.tagColor });
      }
    } catch {
      Alert.alert('Could not update calendar color', 'Please try again.');
    }
  };

  // user.userType, not user.userInfo - same field web's own AccountPanel.jsx reads (see that
  // file's own comment on the userInfo.userType bug this avoids repeating). A client account
  // doesn't exist on mobile at all yet (see DECISIONS.md X15's own note on ClientDashboard's
  // isSelf mode being out of scope by construction), so this is realistically always true today -
  // ported anyway so it's still correct the day a client login exists.
  const showsOnACalendar = user.userType !== 'client';
  const availableTagColors = tagColorsLoading
    ? []
    : showAvailableColorTags(tagColorsData?.getUserTagColors ?? [], user.tagColor);

  const handlePick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library access needed', 'Allow photo access in Settings to change your photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    setError(null);
    setPickedUri(result.assets[0].uri);
  };

  const handleCancel = () => {
    setPickedUri(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!pickedUri) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = (pickedUri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const imageName = `${user.id}.${Date.now()}.${ext}`;
      const folder = formatImagePathForFirebaseStorage(avatarFolder(user.id, getUserShopId(user)));
      const url = await uploadFileWithProgress(pickedUri, folder, imageName, () => {});

      const oldAvatarUrl = previousAvatarUrl(user);
      const { data } = await updateUser({
        variables: { user: { id: user.id, email: user.email, role: user.role, avatar: url } },
      });

      // Merge only the field this screen changed into the existing session, per updateUser.graphql's
      // own header comment - the mutation's returned accessToken is a placeholder, not real.
      await updateCurrentUser({ ...user, avatar: data?.updateUser.avatar ?? url });
      setPickedUri(null);

      if (oldAvatarUrl) {
        // Best-effort, same as ImagesGallery.tsx's own delete calls - an orphaned old avatar file
        // in Storage is a far smaller problem than failing a photo change that already saved.
        deleteFile(oldAvatarUrl).catch(() => {});
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <ThemedText type="smallBold">Photo</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Shown next to your name across the app and on your booking page.
            </ThemedText>
            <Pressable
              onPress={handlePick}
              disabled={uploading}
              style={styles.avatarRow}
              testID="settings-avatar-picker"
            >
              <Avatar
                imageUri={pickedUri ?? user.avatar}
                firstName={user.firstName}
                lastName={user.lastName}
                testID="settings-avatar"
              />
              <ThemedText type="link" themeColor="textSecondary">
                {pickedUri ? 'Choose a different photo' : 'Change photo'}
              </ThemedText>
            </Pressable>
            {error ? (
              <ThemedText type="small" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}
            {pickedUri ? (
              <View style={styles.actions}>
                <Button
                  label="Save Photo"
                  onPress={handleSave}
                  loading={uploading}
                  testID="settings-save-photo"
                />
                <Button
                  label="Cancel"
                  variant="danger"
                  onPress={handleCancel}
                  disabled={uploading}
                  testID="settings-cancel-photo"
                />
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <ThemedText type="smallBold">Password</ThemedText>
            <FormField
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              testID="settings-current-password"
            />
            <FormField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              testID="settings-new-password"
            />
            <FormField
              label="Confirm New Password"
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              secureTextEntry
              testID="settings-confirm-new-password"
            />
            {passwordError ? (
              <ThemedText type="small" style={styles.error}>
                {passwordError}
              </ThemedText>
            ) : null}
            <View style={styles.actions}>
              <Button
                label="Update Password"
                onPress={handleChangePassword}
                loading={changingPassword}
                testID="settings-update-password"
              />
            </View>
          </View>

          {isShopAdminOrBetter(user) && shopId ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Shop</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                The shop cut percentage and the shop's own form-link handle.
              </ThemedText>
              <View style={styles.linkList}>
                <Button
                  label="Shop Settings"
                  variant="secondary"
                  onPress={() => router.push('/settings/shop')}
                  testID="settings-shop-link"
                />
              </View>
            </View>
          ) : null}

          {user.userType === 'artist' ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Rates</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                What you charge, and, if you're shop-connected, whose rate applies to your
                sessions.
              </ThemedText>
              <View style={styles.linkList}>
                <Button
                  label="Rates"
                  variant="secondary"
                  onPress={() => router.push('/settings/rates')}
                  testID="settings-rates-link"
                />
              </View>
            </View>
          ) : null}

          {user.userType === 'artist' ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Messages</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Automatic reminders sent to clients ahead of an appointment, and message
                templates fired on things like a completed session.
              </ThemedText>
              <View style={styles.linkList}>
                <Button
                  label="Reminders"
                  variant="secondary"
                  onPress={() => router.push('/settings/reminders')}
                  testID="settings-reminders-link"
                />
                <Button
                  label="Auto-Responses"
                  variant="secondary"
                  onPress={() => router.push('/settings/auto-responses')}
                  testID="settings-auto-responses-link"
                />
              </View>
            </View>
          ) : null}

          {canManageBusinessLedger(user) ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Business</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Manage the categories your income and expenses are logged against, and any
                recurring expense templates.
              </ThemedText>
              <View style={styles.linkList}>
                <Button
                  label="Income Categories"
                  variant="secondary"
                  onPress={() => router.push('/settings/income-types')}
                  testID="settings-income-types-link"
                />
                <Button
                  label="Expense Categories"
                  variant="secondary"
                  onPress={() => router.push('/settings/expense-types')}
                  testID="settings-expense-types-link"
                />
                <Button
                  label="Recurring Expenses"
                  variant="secondary"
                  onPress={() => router.push('/settings/recurring-expenses')}
                  testID="settings-recurring-expenses-link"
                />
              </View>
            </View>
          ) : null}

          <SquareConnectionCard squareStatus={squareStatus} />

          <SquarePricingCard />

          {showsOnACalendar ? (
            <View style={styles.card}>
              <ThemedText type="smallBold">Calendar color</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                How your appointments are labelled on the calendar. Colors already taken by
                someone else at your shop are not offered.
              </ThemedText>
              {tagColorsLoading ? (
                <ActivityIndicator color={theme.text} testID="settings-tag-colors-loading" />
              ) : (
                <View style={styles.swatchGrid}>
                  {availableTagColors.map((tag) => {
                    const selected = tag.value === user.tagColor;
                    return (
                      <Pressable
                        key={tag.value}
                        onPress={() => handleTagColor(tag.value)}
                        accessibilityLabel={tag.label}
                        accessibilityState={{ selected }}
                        style={[styles.swatch, { backgroundColor: tag.value }]}
                        testID={`settings-tag-color-${tag.value}`}
                      >
                        {selected ? (
                          <ThemedText type="default" style={styles.swatchCheck}>
                            {'✓'}
                          </ThemedText>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * The artist's own Square connection - direct port of web's SquarePanel.jsx. Distinct from
 * shop/[id].tsx's SquareCard, which connects the SHOP's own account (see that file's own header
 * comment and DECISIONS.md M9) - every artist has one of these regardless of shop membership.
 *
 * Reuses the exact platform: "mobile" deep-link mechanism X33 built for the shop screen: the
 * authorization URL already asks for platform: "mobile" (squareSettings.graphql), so a tap on
 * "Connect with Square" returns here via inkbooks://settings?square=<status> - `squareStatus`
 * (read by the parent screen from useLocalSearchParams) drives the banner and refetch below the
 * same way shop/[id].tsx's own SquareCard does.
 *
 * UNLIKE shop/[id].tsx's own handleDisconnect, this confirms before disconnecting (Alert.alert,
 * matching web's window.confirm and this app's own recurring-expenses.tsx delete-confirm
 * convention) - the shop screen's bare, unconfirmed disconnect is a real, narrow inconsistency
 * worth fixing there too, not repeated here on purpose.
 */
function SquareConnectionCard({ squareStatus }: { squareStatus?: string }) {
  const { data, loading, refetch } = useGetMySquareConnectionQuery();
  const [fetchAuthorizationUrl, { loading: connecting }] = useGetMySquareAuthorizationUrlLazyQuery({
    fetchPolicy: 'network-only',
  });
  const [disconnectSquare, { loading: disconnecting }] = useDisconnectMySquareMutation();
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders alongside Apollo's own cache, matching shop/[id].tsx's identical effect -
  // covers expo-router reusing an already-mounted Settings screen rather than remounting it when
  // the OS opens the inkbooks://settings?square=... deep link.
  useEffect(() => {
    if (squareStatus) {
      refetch();
    }
  }, [squareStatus, refetch]);

  const handleConnect = () => {
    setError(null);
    fetchAuthorizationUrl()
      .then((result) => {
        const url = result.data?.getMySquareAuthorizationUrl;
        if (!url) {
          setError("Couldn't start Square connection.");
          return;
        }
        return Linking.openURL(url);
      })
      .catch((err) => setError((err as Error).message));
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect Square?', 'You can reconnect at any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          setError(null);
          disconnectSquare()
            .then(() => refetch())
            .catch((err) => setError((err as Error).message));
        },
      },
    ]);
  };

  if (loading || !data) {
    return null;
  }

  const { connected, connectedAt } = data.getMySquareConnection;

  const returnBanner =
    squareStatus === 'connected'
      ? { text: 'Square connected.', testID: 'square-return-connected' as const }
      : squareStatus === 'denied'
        ? {
            text: 'Square connection cancelled - nothing changed.',
            testID: 'square-return-denied' as const,
          }
        : squareStatus
          ? {
              text: 'Something went wrong connecting Square. Please try again.',
              testID: 'square-return-error' as const,
            }
          : null;

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Square</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Connect Square to take card payments and deposits. Clients pay you directly - if you work
        at a shop, their cut is settled separately, afterwards.
      </ThemedText>
      {returnBanner ? (
        <ThemedText type="small" testID={returnBanner.testID}>
          {returnBanner.text}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}
      {connected ? (
        <>
          <ThemedText type="default" testID="square-connected">
            Connected
          </ThemedText>
          {connectedAt ? (
            <ThemedText type="small" themeColor="textSecondary">
              Connected on {new Date(connectedAt).toLocaleDateString()}.
            </ThemedText>
          ) : null}
          <View style={styles.actions}>
            <Button
              label="Disconnect Square"
              variant="danger"
              onPress={handleDisconnect}
              loading={disconnecting}
              testID="square-disconnect"
            />
          </View>
        </>
      ) : (
        <>
          <ThemedText type="default" themeColor="textSecondary" testID="square-not-connected">
            Not connected
          </ThemedText>
          <View style={styles.actions}>
            <Button
              label="Connect with Square"
              variant="secondary"
              onPress={handleConnect}
              loading={connecting}
              testID="square-connect"
            />
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Sales tax and the card processing offset - direct port of web's SquarePricingPanel.jsx. Units
 * are converted here and only here (utils/money.ts's basisPointsToPercent/percentToBasisPoints/
 * dollarsToCents) - the server stores/receives basis points and cents, never a float percent.
 * Read-only (canEdit: false) for a shop artist who isn't an admin, same as web.
 */
function SquarePricingCard() {
  const { data, loading, refetch } = useGetMySquarePricingSettingsQuery();
  const [updatePricing, { loading: saving }] = useUpdateSquarePricingSettingsMutation();
  const [editedPercent, setEditedPercent] = useState<string | undefined>(undefined);
  const [editedOffset, setEditedOffset] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (loading || !data) {
    return null;
  }

  const settings = data.getMySquarePricingSettings;
  const { source, ownerName, taxRateBasisPoints, squareFeeOffsetCents, canEdit } = settings;

  const percentValue = editedPercent ?? basisPointsToPercent(taxRateBasisPoints);
  const offsetValue = editedOffset ?? String((squareFeeOffsetCents || 0) / 100);

  const handleSave = () => {
    setError(null);
    setSaved(false);
    updatePricing({
      variables: {
        taxRateBasisPoints: percentToBasisPoints(percentValue),
        squareFeeOffsetCents: dollarsToCents(offsetValue),
      },
    })
      .then(() => {
        refetch();
        setEditedPercent(undefined);
        setEditedOffset(undefined);
        setSaved(true);
      })
      .catch((err) => setError((err as Error).message));
  };

  return (
    <View style={styles.card}>
      <ThemedText type="smallBold">Tax &amp; processing</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {source === 'shop'
          ? `Set by ${ownerName || 'your shop'} and applied to every session and deposit charged here. Sales tax is charged where the work happens, so it is the same for everyone at the shop.`
          : 'Applied to every session and deposit you charge. Sales tax is charged where the work happens - use the rate for your location.'}
      </ThemedText>
      {taxRateBasisPoints === 0 ? (
        <ThemedText type="small" style={styles.warning}>
          No sales tax is being collected on any charge.
        </ThemedText>
      ) : null}
      <FormField
        label="Sales tax (%)"
        value={percentValue}
        onChangeText={setEditedPercent}
        editable={canEdit}
        keyboardType="decimal-pad"
        testID="settings-square-tax-rate"
      />
      <ThemedText type="small" themeColor="textSecondary">
        For example 9.4 for 9.4%.
      </ThemedText>
      <FormField
        label="Card processing offset ($ per hour)"
        value={offsetValue}
        onChangeText={setEditedOffset}
        editable={canEdit}
        keyboardType="decimal-pad"
        testID="settings-square-fee-offset"
      />
      <ThemedText type="small" themeColor="textSecondary">
        Offered as a choice at checkout, never added automatically. Leave at 0 to not pass card
        fees on.
      </ThemedText>
      {squareFeeOffsetCents > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          A three-hour session would be offered {formatCents(squareFeeOffsetCents * 3)} of offset.
        </ThemedText>
      ) : null}
      {canEdit ? (
        <View style={styles.actions}>
          <Button
            label="Save"
            onPress={handleSave}
            loading={saving}
            testID="settings-square-pricing-save"
          />
          {saved ? (
            <ThemedText type="small" themeColor="textSecondary">
              Saved
            </ThemedText>
          ) : null}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Only a shop admin can change these.
        </ThemedText>
      )}
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  linkList: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  error: {
    color: '#D33',
  },
  warning: {
    color: '#B36B00',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCheck: {
    color: '#fff',
  },
});
