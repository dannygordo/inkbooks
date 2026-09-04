import { useGetConversationsByMemberIdQuery, useMarkConversationUnreadMutation } from '@inkbooks/api';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/ConversationRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { matchesConversationSearch, otherMembers, type ConversationListItem } from '@/utils/conversations';

/**
 * Third and last of X13's still-unported items (avatar upload and the client-dashboard
 * shared-images panel are X14/X15) - the inbox half of Messages. Direct scope-down of apps/web's
 * Messenger.jsx: one 1:1-thread list (getConversationsByMemberId, self-only server-side), and no
 * shop-wide/group conversations (getConversationsByShopId) - deliberately still not built. Full
 * reasoning: DECISIONS.md X16.
 *
 * SEARCH BOX ADDED (X53, closing the searchable half of HANDOFF.md's gap #9) - direct port of
 * Messenger.jsx's own name filter (matchesConversationSearch, utils/conversations.ts): filters
 * what's rendered over the conversations already loaded, not a server-side search, matching
 * web's own limitation (getConversationsByMemberId takes no search argument) and the same
 * "client-side filter over the current page" shape clients/index.tsx's own search box uses
 * (DECISIONS.md X17).
 *
 * GROUP/SHOP-WIDE CONVERSATIONS REMAIN UNBUILT, and X53 found why: `getConversationsByShopId`
 * has no UI anywhere on web either - MessengerService.js exports fetchShopConversations and it
 * has its own unit test, but no web component ever calls it, and there is no way on web to even
 * create a group conversation in the first place. Same class of finding as gift cards
 * (DECISIONS.md X51) - a mobile-behind-web gap that turned out to be a whole-app gap wearing that
 * shape. Left open in HANDOFF.md with this recorded, not built blind.
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

  const [search, setSearch] = useState('');
  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => matchesConversationSearch(conversation, user?.id, search)),
    [conversations, search, user?.id],
  );

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
        {conversations.length > 0 ? (
          <View style={styles.searchRow}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              testID="messages-search-input"
            />
          </View>
        ) : null}

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
        ) : visibleConversations.length === 0 ? (
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="messages-search-empty">
              No conversations with that name.
            </ThemedText>
          </View>
        ) : (
          <FlashList
            data={visibleConversations}
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
  searchRow: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
