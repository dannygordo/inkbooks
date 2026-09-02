import {
  useChangePasswordMutation,
  useGetUserTagColorsQuery,
  useUpdateUserMutation,
} from '@inkbooks/api';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { avatarFolder, previousAvatarUrl } from '@/utils/avatar';
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
 */
export default function SettingsScreen() {
  const { user, updateCurrentUser } = useAuth();
  const theme = useTheme();
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
  error: {
    color: '#D33',
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
