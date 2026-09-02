import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { assignedLabel, type SharedImageItem } from '@/utils/sharedImages';
import { timeAgo } from '@/utils/timeAgo';

/**
 * View-only v1 of apps/web's SharedImagesPanel.jsx (rendered through its own IBImagesList.jsx) -
 * structurally a sibling of ImagesGallery.tsx (same grid-of-thumbnails-into-a-full-screen-Modal
 * shape), but a genuinely different component rather than a shared one: SharedImage isn't the
 * same GraphQL type as IBImage (see packages/api/src/operations/sharedImages.graphql's own header
 * comment), and this list has no delete here - see DECISIONS.md X15 for why "remove from list"
 * (a real, but materially different, mutation - removeSharedImageFromList never touches Storage
 * or the original message) is deliberately left for a follow-up rather than bundled into this
 * first, read-only slice. Tag editing and "assign to project" are web features this component
 * doesn't attempt either, same reasoning.
 */
export function SharedImagesGallery({ images }: { images: SharedImageItem[] }) {
  const theme = useTheme();
  const [selected, setSelected] = useState<SharedImageItem | null>(null);

  if (images.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No images have been shared in messages with this client yet.
      </ThemedText>
    );
  }

  return (
    <View style={styles.grid}>
      {images.map((image) => (
        <Pressable
          key={image.id}
          onPress={() => setSelected(image)}
          style={styles.thumbWrap}
          testID={`shared-image-thumb-${image.id}`}
        >
          <Image source={{ uri: image.url }} style={styles.thumb} />
          {assignedLabel(image) ? (
            <View style={[styles.assignedBadge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small">📎</ThemedText>
            </View>
          ) : null}
        </Pressable>
      ))}

      <Modal
        visible={Boolean(selected)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          {selected ? (
            <>
              <Image source={{ uri: selected.url }} style={styles.modalImage} resizeMode="contain" />
              <View style={styles.modalMeta}>
                <ThemedText type="small" style={styles.modalMetaText}>
                  {selected.userInfo
                    ? `Shared by ${selected.userInfo.firstName ?? ''} ${selected.userInfo.lastName ?? ''}`.trim()
                    : 'Unknown sender'}
                  {' · '}
                  {timeAgo(selected.createdAt)}
                </ThemedText>
                {assignedLabel(selected) ? (
                  <ThemedText type="small" style={styles.modalMetaText}>
                    {assignedLabel(selected)}
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.modalActions}>
                <Button
                  label="Close"
                  variant="secondary"
                  onPress={() => setSelected(null)}
                  testID="shared-image-modal-close"
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
  assignedBadge: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.one,
    opacity: 0.9,
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
    gap: Spacing.half,
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
