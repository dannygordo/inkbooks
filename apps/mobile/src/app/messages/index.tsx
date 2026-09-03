import { useGetConversationsByMemberIdQuery, useMarkConversationUnreadMutation } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/ConversationRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { otherMembers, type ConversationListItem } from '@/utils/conversations';

/**
 * Third and last of X13's still-unported items (avatar upload and the client-dashboard
 * shared-images panel are X14/X15) - the inbox half of Messages. Direct scope-down of apps/web's
 * Messenger.jsx: one 1:1-thread list (getConversationsByMemberId, self-only server-side), no
 * search box, and no shop-wide/group conversations (getConversationsByShopId) - both real web
 * features, still deliberately left for later. Full reasoning: DECISIONS.md X16.
 *
 * Per-row "Mark as unread" (X35, closing that gap) is wired here and rendered by
 * ConversationRow.tsx itself - see that component's own header comment for why it's a plain
 * trailing text button rather than web's overflow-menu shape.
 *
 * Polled (network-only fetch + a 30s pollInterval) rather than updated over a socket - mobile has
 * no socket.io-client dependency anywhere, and X12/X13's own "avoid a native rebuild where RN
 * already has a built-in answer, and avoid new runtime complexity where it isn't earning its
 * keep" reasoning applies here too. Web's own sidebar badge already falls back to a 60s poll for
 * every page that isn't the messenger itself - this reuses that same fallback path as mobile's
 * only path, not a new one.
 */
export default function MessagesInboxScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const { data, loading, error } = useGetConversationsByMemberIdQuery({
    variables: { memberId: user?.id ?? '' },
    skip: !user?.id,
    fetchPolicy: 'network-only',
    pollInterval: 30000,
  });

  const [markConversationUnread] = useMarkConversationUnreadMutation({
    refetchQueries: ['GetUnreadMessageCount', 'GetConversationsByMemberId'],
  });
  const handleMarkUnread = (conversation: ConversationListItem) => {
    markConversationUnread({ variables: { conversationId: conversation.id } }).catch(() => {
      // Same reasoning as the thread screen's own swallowed catch on markConversationRead: a
      // failed toggle is a wrong badge, not lost data.
    });
  };

  const conversations = data?.getConversationsByMemberId?.filter(
    (conversation): conversation is ConversationListItem => Boolean(conversation),
  ) ?? [];

  const openConversation = (conversation: ConversationListItem) => {
    const [other] = otherMembers(conversation, user?.id);
    router.push({
      pathname: '/messages/[id]',
      params: {
        id: conversation.id,
        name: [other?.firstName, other?.lastName].filter(Boolean).join(' ') || 'Conversation',
        avatar: other?.avatar ?? '',
      },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {loading && conversations.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="messages-loading" />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="messages-empty">
              {error ? 'Could not load your messages.' : 'No conversations yet.'}
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={conversations}
            keyExtractor={(conversation) => conversation.id}
            testID="conversations-list"
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                myId={user?.id}
                onPress={() => openConversation(item)}
                onMarkUnread={() => handleMarkUnread(item)}
              />
            )}
          />
        )}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});
