import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { conversationDisplayName, otherMembers, type ConversationListItem } from '@/utils/conversations';
import { prettyMessageTime } from '@/utils/messageTime';

// Port of apps/web's IBConversation.jsx. No name search box on the list above it - a real web
// feature, still left for a follow-up (DECISIONS.md X16). "Mark as unread" WAS built (X35,
// closing that gap): a plain trailing text button rather than web's overflow-menu-then-menu-item
// (`IconButton` + MUI `Menu`) - there is no icon library anywhere in this app (see settings/
// index.tsx's own plain-text convention), and one already-unread-hiding condition is simpler as a
// direct Pressable than as a single-item menu. Mobile has no equivalent of web's second hiding
// condition ("not the open conversation") - opening a thread here navigates to its own screen
// rather than staying on this list the way web's two-pane layout does, so there is no "currently
// open, don't offer this" case to guard against.
export function ConversationRow({
  conversation,
  myId,
  onPress,
  onMarkUnread,
}: {
  conversation: ConversationListItem;
  myId: string | null | undefined;
  onPress: () => void;
  onMarkUnread?: () => void;
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
      <View style={styles.trailing}>
        <ThemedText type="small" themeColor="textSecondary">
          {prettyMessageTime(conversation.updatedAt)}
        </ThemedText>
        {/* Hidden once already unread - marking an already-unread thread unread again is a
            no-op with nothing to show for it, matching web's own identical condition. */}
        {onMarkUnread && unread === 0 ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onMarkUnread();
            }}
            hitSlop={8}
            testID={`conversation-mark-unread-${conversation.id}`}
          >
            <ThemedText type="small" themeColor="textSecondary" style={styles.markUnread}>
              Mark unread
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
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
  trailing: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  markUnread: {
    textDecorationLine: 'underline',
  },
});
