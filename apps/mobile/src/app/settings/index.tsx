import { useUpdateUserMutation } from '@inkbooks/api';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { deleteFile } from '@/firebase/deleteFile';
import { uploadFileWithProgress } from '@/firebase/uploadFile';
import { avatarFolder, previousAvatarUrl } from '@/utils/avatar';
import { formatImagePathForFirebaseStorage } from '@/utils/imagePath';
import { getUserShopId } from '@/utils/user';

/**
 * First slice of apps/web's AccountPanel.jsx (Settings > Photo/Password/Calendar color) - photo
 * only. Password change (IBUpdatePassword) and the calendar-color picker (getTagColorsByShop)
 * are each their own real feature and deliberately left for a follow-up screen section rather
 * than folded in here - see PRODUCTION_ROADMAP.md Phase 5 step 8's remaining-work list.
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
  const [updateUser] = useUpdateUserMutation();
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

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
});
