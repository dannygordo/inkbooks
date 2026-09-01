import { useUpdateProjectDetailMutation } from '@inkbooks/api';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { deleteFile } from '@/firebase/deleteFile';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/utils/timeAgo';
import {
  buildProjectImagesPayload,
  toImageInput,
  type ProjectForImages,
  type ProjectImage,
  type ProjectImageField,
} from '@/utils/projectImages';

/**
 * Direct port of apps/web's IBImagesList.jsx + IBImagesListOptions.jsx, adapted to RN affordances:
 * a tap opens a full-screen Modal (web's yet-another-react-lightbox equivalent) with Close and
 * Delete, rather than a separate hover options-menu plus a swipeable multi-image lightbox. Only
 * one image is ever shown full-screen at a time here - no swipe-between-images carousel - a
 * deliberate v1 simplification (DECISIONS.md X13), not a silently dropped feature: viewing one
 * image at a time and deleting it are the two things this list actually needs to do.
 */
export function ImagesGallery({
  project,
  field,
  images,
}: {
  project: ProjectForImages;
  field: ProjectImageField;
  images: ProjectForImages['referenceImages'];
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<ProjectImage | null>(null);
  const [updateProject, { loading: deleting }] = useUpdateProjectDetailMutation();

  const items = (images ?? []).filter((img): img is ProjectImage => Boolean(img));

  const confirmDelete = (image: ProjectImage) => {
    Alert.alert('Delete image?', 'This removes it from the project.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(image) },
    ]);
  };

  const handleDelete = async (image: ProjectImage) => {
    // Best-effort against Storage, same as web's IBImagesListOptions.jsx - an orphaned Storage
    // file nobody links to is a far smaller problem than an image the artist explicitly removed
    // still showing up in the project, so a failed delete here doesn't block dropping it from the
    // array.
    try {
      await deleteFile(image.url);
    } catch {
      // Swallowed deliberately - see comment above.
    }
    const remaining = items.filter((img) => img.id !== image.id).map(toImageInput);
    await updateProject({
      variables: { project: buildProjectImagesPayload(project, field, remaining) },
    });
    setSelected(null);
  };

  if (items.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No images yet.
      </ThemedText>
    );
  }

  return (
    <View style={styles.grid}>
      {items.map((image) => (
        <Pressable
          key={image.id}
          onPress={() => setSelected(image)}
          style={styles.thumbWrap}
          testID={`gallery-thumb-${image.id}`}
        >
          <Image source={{ uri: image.url }} style={styles.thumb} />
          <View style={[styles.timeBadge, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{timeAgo(image.createdAt)}</ThemedText>
          </View>
        </Pressable>
      ))}

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          {selected ? (
            <>
              <Image source={{ uri: selected.url }} style={styles.modalImage} resizeMode="contain" />
              <View style={styles.modalMeta}>
                <ThemedText type="small" style={styles.modalMetaText}>
                  {selected.uploadedByDisplayName
                    ? `Uploaded by ${selected.uploadedByDisplayName}`
                    : 'Unknown uploader'}
                  {' · '}
                  {timeAgo(selected.createdAt)}
                </ThemedText>
              </View>
              <View style={styles.modalActions}>
                <Button label="Close" variant="secondary" onPress={() => setSelected(null)} testID="gallery-modal-close" />
                <Button
                  label={deleting ? 'Deleting…' : 'Delete'}
                  variant="danger"
                  loading={deleting}
                  onPress={() => confirmDelete(selected)}
                  testID="gallery-modal-delete"
                />
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  thumbWrap: {
    width: 96,
    height: 96,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  timeBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    paddingHorizontal: Spacing.one,
    opacity: 0.85,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: Spacing.three,
  },
  modalImage: {
    flex: 1,
  },
  modalMeta: {
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  modalMetaText: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
});
