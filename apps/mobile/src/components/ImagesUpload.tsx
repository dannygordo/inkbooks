import { useUpdateProjectDetailMutation } from '@inkbooks/api';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth';
import { Spacing } from '@/constants/theme';
import { uploadFileWithProgress } from '@/firebase/uploadFile';
import { useTheme } from '@/hooks/use-theme';
import { formatImagePathForFirebaseStorage } from '@/utils/imagePath';
import { generateObjectId } from '@/utils/objectId';
import {
  buildProjectImagesPayload,
  projectImageFolder,
  toImageInput,
  type ProjectForImages,
  type ProjectImageField,
} from '@/utils/projectImages';

type UploadItem = {
  key: string;
  uri: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
};

/**
 * Direct port of apps/web's IBImagesUpload.jsx + IBImagesUploadForm.jsx + IBProgressListProject.jsx
 * + IBProgressItemProject.jsx, collapsed into one component - RN has no equivalent of a multi-file
 * `<input type=file>`, so expo-image-picker's launchImageLibraryAsync stands in for both the file
 * picker AND (with allowsMultipleSelection) the multi-select web gets from that input for free.
 *
 * Each picked image uploads to Firebase Storage with its own progress bar, exactly like web's
 * per-file IBProgressItemProject; once every image in the batch finishes, ONE updateProject call
 * saves the merged array - same "don't fire N mutations for N files" batching web's own
 * hasSubmittedBatch ref exists to guarantee, done here with a ref for the same reason (calling an
 * async mutation is a real side effect, so it can't happen directly in a state setter).
 */
export function ImagesUpload({
  project,
  field,
  title,
  images,
}: {
  project: ProjectForImages;
  field: ProjectImageField;
  title: string;
  images: ProjectForImages['referenceImages'];
}) {
  const theme = useTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [updateProject] = useUpdateProjectDetailMutation();
  const completedRef = useRef<Map<string, { url: string; createdAt: string }>>(new Map());
  const savedRef = useRef(false);

  const handlePick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library access needed', 'Allow photo access in Settings to upload images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0 || !user) {
      return;
    }

    completedRef.current = new Map();
    savedRef.current = false;
    const picked: UploadItem[] = result.assets.map((asset, index) => ({
      key: `${Date.now()}-${index}`,
      uri: asset.uri,
      progress: 0,
      status: 'uploading',
    }));
    setItems(picked);

    const folder = formatImagePathForFirebaseStorage(projectImageFolder(project, title));

    await Promise.all(
      result.assets.map(async (asset, index) => {
        const key = picked[index].key;
        const ext = (asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') || 'jpg';
        const imageName = `${user.id}.${Date.now()}.${index}.${ext}`;
        try {
          const url = await uploadFileWithProgress(asset.uri, folder, imageName, (progress) => {
            setItems((prev) => prev.map((i) => (i.key === key ? { ...i, progress } : i)));
          });
          const createdAt = new Date().toISOString();
          completedRef.current.set(key, { url, createdAt });
          setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: 'done', progress: 100 } : i)));
        } catch (err) {
          setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: 'error' } : i)));
          Alert.alert('Upload failed', (err as Error).message || 'Could not upload this image.');
        }
      }),
    );

    if (savedRef.current || completedRef.current.size === 0) {
      return;
    }
    savedRef.current = true;

    const authorName = `${user.userInfo?.firstName ?? user.firstName ?? ''} ${
      user.userInfo?.lastName ?? user.lastName ?? ''
    }`.trim();
    const avatar = user.userInfo?.avatar ?? user.avatar ?? undefined;

    const existing = (images ?? []).filter((img): img is NonNullable<typeof img> => Boolean(img)).map(toImageInput);
    const uploaded = Array.from(completedRef.current.values()).map(({ url, createdAt }) => ({
      id: generateObjectId(),
      url,
      uploadedByDisplayName: authorName,
      userId: user.id,
      avatar,
      createdAt,
      updatedAt: createdAt,
    }));

    await updateProject({
      variables: { project: buildProjectImagesPayload(project, field, [...existing, ...uploaded]) },
    });
    setItems([]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {title}
        </ThemedText>
        <Button label="Add photos" variant="secondary" onPress={handlePick} testID={`images-upload-${field}`} />
      </View>
      {items.length > 0 ? (
        <View style={styles.progressRow}>
          {items.map((item) => (
            <View key={item.key} style={styles.progressItem}>
              <Image source={{ uri: item.uri }} style={styles.progressThumb} />
              <View style={[styles.progressOverlay, { backgroundColor: theme.backgroundSelected }]}>
                {item.status === 'uploading' ? (
                  <ThemedText type="small">{Math.round(item.progress)}%</ThemedText>
                ) : item.status === 'error' ? (
                  <ThemedText type="small" style={styles.errorText}>
                    Failed
                  </ThemedText>
                ) : (
                  <ThemedText type="small">✓</ThemedText>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  progressItem: {
    width: 72,
    height: 72,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  progressThumb: {
    width: '100%',
    height: '100%',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 2,
    opacity: 0.85,
  },
  errorText: {
    color: '#D33',
  },
});
