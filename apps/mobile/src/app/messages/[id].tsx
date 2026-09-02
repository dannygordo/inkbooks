import {
  useCreateMessageMutation,
  useGetMessagesByConversationIdQuery,
  useMarkConversationReadMutation,
} from '@inkbooks/api';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/MessageBubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';

type ThreadMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  message?: string | null;
  imageUrls: string[];
  createdAt?: string | null;
  user?: { firstName?: string | null; lastName?: string | null; avatar?: string | null } | null;
};

/**
 * The thread half of Messages - see messages/index.tsx's own header comment for the full scope
 * cut against apps/web's Messenger.jsx/IBChatBox.jsx (no image attachments composed here yet, no
 * live socket delivery, no per-message read receipts). Full reasoning: DECISIONS.md X16.
 *
 * Polled every 4s while this screen is open, same "no socket.io-client on mobile" call as the
 * inbox screen's own 30s poll - short enough that a reply feels close to live without adding a
 * persistent connection this app has nowhere else. createMessage's own refetchQueries pulls the
 * just-sent message back immediately rather than waiting out that window.
 *
 * The thread's name/avatar are route params from the inbox row that opened it (same
 * params-not-a-query choice client/[id].tsx made for the same reason: the caller already had
 * this for free) - this screen's own query only ever needed the messages themselves.
 */
export default function MessageThreadScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const name = params.name || 'Conversation';
  const { user } = useAuth();
  const theme = useTheme();
  const listRef = useRef<FlashListRef<ThreadMessage>>(null);
  const [text, setText] = useState('');

  const { data, loading, error } = useGetMessagesByConversationIdQuery({
    variables: { conversationId: conversationId ?? '' },
    skip: !conversationId,
    fetchPolicy: 'network-only',
    pollInterval: 4000,
  });

  const [markConversationRead] = useMarkConversationReadMutation({
    refetchQueries: ['GetUnreadMessageCount', 'GetConversationsByMemberId'],
  });
  const [createMessage, { loading: sending }] = useCreateMessageMutation({
    refetchQueries: ['GetMessagesByConversationId', 'GetConversationsByMemberId'],
    awaitRefetchQueries: true,
  });

  // Whatever thread is open is read, by definition of being open - same rule as Messenger.jsx's
  // own effect. Idempotent server-side (see messenger.graphql's own comment), so firing it once
  // per conversationId is enough; no need to key it on an unread count this screen doesn't fetch.
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    markConversationRead({ variables: { conversationId } }).catch(() => {
      // Deliberately swallowed - a wrong badge, not lost data. Same reasoning as Messenger.jsx's
      // own swallowed catch on this mutation.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const messages = (data?.getMessagesByConversationId ?? []) as ThreadMessage[];

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || !user?.id || sending) {
      return;
    }
    setText('');
    createMessage({
      variables: {
        conversationId,
        senderId: user.id,
        message: trimmed,
      },
    }).catch(() => {
      // The message just didn't send - put the text back so it isn't silently lost.
      setText(trimmed);
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
          {loading && messages.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.text} testID="thread-loading" />
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.centered}>
              <ThemedText type="default" themeColor="textSecondary" testID="thread-empty">
                {error ? 'Could not load this conversation.' : `No messages with ${name} yet.`}
              </ThemedText>
            </View>
          ) : (
            <FlashList
              ref={listRef}
              data={messages}
              keyExtractor={(message) => message.id}
              contentContainerStyle={styles.listContent}
              testID="thread-messages"
              renderItem={({ item }) => (
                <MessageBubble
                  own={item.senderId === user?.id}
                  message={item}
                  senderName={[item.user?.firstName, item.user?.lastName].filter(Boolean).join(' ') || name}
                  senderAvatar={item.user?.avatar}
                />
              )}
            />
          )}

          <View style={[styles.composeRow, { borderTopColor: theme.backgroundSelected }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
              multiline
              testID="thread-compose-input"
            />
            <Pressable
              onPress={handleSend}
              disabled={!text.trim() || sending}
              style={[styles.sendButton, { opacity: !text.trim() || sending ? 0.5 : 1 }]}
              testID="thread-send-button"
            >
              <ThemedText type="linkPrimary">Send</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    padding: Spacing.three,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    maxHeight: 120,
    fontSize: 16,
  },
  sendButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.three,
  },
});
