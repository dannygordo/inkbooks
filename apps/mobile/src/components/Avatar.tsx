import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { avatarInitials } from '@/utils/avatar';

/**
 * New, not a port - web's IBAvatar (apps/web/src/components/inputs/IBAvatar.jsx) falls back to
 * MUI Avatar's default generic-person icon when there's no imgUrl, since it never passes `label`
 * as `children`. A filled circle showing the person's own initials (this component's fallback) is
 * the more legible choice and costs nothing extra to build, so this diverges deliberately rather
 * than porting the less useful behavior. The `isOnline` presence-dot variant isn't included -
 * nothing in this app has read receipts/presence yet (Messages is still unbuilt - see
 * PRODUCTION_ROADMAP.md Phase 5 step 8's remaining list), so there's nothing to wire it to.
 */
export function Avatar({
  imageUri,
  firstName,
  lastName,
  size = 88,
  testID,
}: {
  imageUri?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
  testID?: string;
}) {
  const theme = useTheme();
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[styles.image, dimension]}
        testID={testID}
        accessibilityLabel={`${firstName ?? ''} ${lastName ?? ''}`.trim()}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dimension, { backgroundColor: theme.backgroundSelected }]}
      testID={testID}
    >
      <ThemedText type="subtitle" style={{ fontSize: size / 2.5, lineHeight: size / 1.8 }}>
        {avatarInitials(firstName, lastName)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
