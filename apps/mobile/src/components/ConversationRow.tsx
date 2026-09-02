import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { conversationDisplayName, otherMembers, type ConversationListItem } from '@/utils/conversations';
import { prettyMessageTime } from '@/utils/messageTime';

// Port of apps/web's IBConversation.jsx, scoped down: no per-row overflow menu ("Mark as
// unread") and no name search box on the list above it - both real web features, left for a
// follow-up rather than built here, same as every other slice this session (see DECISIONS.md
// X16). The unread badge is the one piece of IBConversation's own UI kept, since it's the whole
// point of a list-of-threads screen.
export function ConversationRow({
  conversation,
  myId,
  onPress,
}: {
  conversation: ConversationListItem;
  myId: string | null | undefined;
  onPress: () => void;
}) {
  const others = otherMembers(conversation, myId);
  const name = conversationDisplayName(conversation, myId);
  const avatarUri = others[0]?.avatar;
  const unread = conversation.unreadCount || 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, unread > 0 && styles.rowUnread]}
      testID={`conversation-row-${conversation.id}`}
    >
      <View style={styles.avatarWrap}>
        <Avatar
          imageUri={avatarUri}
          firstName={others[0]?.firstName}
          lastName={others[0]?.lastName}
          size={44}
        />
        {unread > 0 ? (
          <View style={styles.badge} testID={`conversation-unread-${conversation.id}`}>
            <ThemedText type="small" style={styles.badgeText}>
              {unread > 9 ? '9+' : unread}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <ThemedText type={unread > 0 ? 'smallBold' : 'default'} numberOfLines={1}>
          {name}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {prettyMessageTime(conversation.updatedAt)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowUnread: {
    opacity: 1,
  },
  avatarWrap: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#D33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
  body: {
    flex: 1,
  },
});
