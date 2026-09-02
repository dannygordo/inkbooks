import { Image, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { prettyMessageTime } from '@/utils/messageTime';

// Port of apps/web's IBMessage.jsx - own/other bubble styling, avatar only on the other person's
// side (own messages need no avatar of yourself), image attachments rendered inline. Unlike web's
// "open full size in a new tab" (this component has no lightbox), attachments here are just
// larger inline thumbnails - a tap-to-enlarge viewer is real follow-up work, not built for this
// first pass since mobile can't compose an image message yet either (see DECISIONS.md X16) - any
// image shown here only ever arrived from a web-side sender.
export function MessageBubble({
  own,
  message,
  senderName,
  senderAvatar,
}: {
  own: boolean;
  message: {
    id: string;
    message?: string | null;
    imageUrls: string[];
    createdAt?: string | null;
  };
  senderName: string;
  senderAvatar?: string | null;
}) {
  const theme = useTheme();
  const imageUrls = message.imageUrls || [];
  const [firstName, ...rest] = senderName.split(' ');

  return (
    <View style={[styles.row, own ? styles.rowOwn : styles.rowOther]} testID={`message-${message.id}`}>
      {!own ? <Avatar imageUri={senderAvatar} firstName={firstName} lastName={rest.join(' ')} size={32} /> : null}
      <View style={own ? styles.columnOwn : styles.columnOther}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: own ? theme.text : theme.backgroundElement },
            own ? styles.bubbleOwn : styles.bubbleOther,
          ]}
        >
          {/* Text is optional - an image-only message (see createMessage) has none. */}
          {message.message ? (
            <ThemedText type="default" style={{ color: own ? theme.background : theme.text }}>
              {message.message}
            </ThemedText>
          ) : null}
          {imageUrls.length > 0 ? (
            <View style={styles.images}>
              {imageUrls.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.imageThumb} />
              ))}
            </View>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
          {prettyMessageTime(message.createdAt)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  columnOwn: {
    maxWidth: '75%',
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  columnOther: {
    maxWidth: '75%',
    alignItems: 'flex-start',
    gap: Spacing.half,
  },
  bubble: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  bubbleOwn: {
    borderBottomRightRadius: Spacing.half,
  },
  bubbleOther: {
    borderBottomLeftRadius: Spacing.half,
  },
  images: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  imageThumb: {
    width: 140,
    height: 140,
    borderRadius: Spacing.one,
  },
  time: {
    paddingHorizontal: Spacing.one,
  },
});
