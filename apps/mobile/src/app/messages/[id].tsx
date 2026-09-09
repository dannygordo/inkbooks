import {
  useCreateMessageMutation,
  useGetMessagesByConversationIdQuery,
  useMarkConversationReadMutation,
} from '@inkbooks/api';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { getAccessToken, restApiUrl } from '@/utils/restApi';

// Same allowlist/cap as routes/messageUploads.js and web's own IBChatBox.jsx - kept in sync
// manually since the two run in different processes (see that server file's own comment on this).
const MAX_IMAGES_PER_MESSAGE = 5;

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
 * cut against apps/web's Messenger.jsx/IBChatBox.jsx (no live socket delivery, no per-message read
 * receipts, no per-row "mark unread", no group/shop-wide conversations - X16). Full reasoning:
 * DECISIONS.md X16/X35.
 *
 * Polled every 4s while this screen is open, same "no socket.io-client on mobile" call as the
 * inbox screen's own 30s poll - short enough that a reply feels close to live without adding a
 * persistent connection this app has nowhere else. createMessage's own refetchQueries pulls the
 * just-sent message back immediately rather than waiting out that window.
 *
 * The thread's name/avatar are route params from the inbox row that opened it (same
 * params-not-a-query choice client/[id].tsx made for the same reason: the caller already had
 * this for free) - this screen's own query only ever needed the messages themselves.
 *
 * IMAGE-ATTACHMENT COMPOSE (X35, closing the gap X16 named) - direct port of web's
 * IBChatBox.jsx: picking images uploads them immediately via routes/messageUploads.js (not on
 * send), so the compose row shows real thumbnails - and a real per-file failure - before the
 * message is actually sent. `restApi.ts`'s `restApiUrl`/`getAccessToken` (already built for
 * Square) are the REST plumbing; this is their second real caller. Sending is allowed with
 * images and no text (an image-only message, matching createMessage's own optional `message`
 * arg) but never with neither - mirrors web's own `createMessageInputSchema` refinement.
 */
export default function MessageThreadScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const name = params.name || 'Conversation';
  const { user } = useAuth();
  const theme = useTheme();
  const listRef = useRef<FlashListRef<ThreadMessage>>(null);
  const [text, setText] = useState('');
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // Uploaded immediately on selection, not on send - see this screen's own header comment.
  const handleAttachImages = async () => {
    if (uploadingImages || pendingImageUrls.length >= MAX_IMAGES_PER_MESSAGE) {
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadError('Allow photo access in Settings to attach images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES_PER_MESSAGE - pendingImageUrls.length,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    setUploadError(null);
    setUploadingImages(true);
    try {
      const token = await getAccessToken();
      const formData = new FormData();
      result.assets.forEach((asset, index) => {
        const extension = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        // RN's FormData accepts this {uri, name, type} shape in place of a real Blob - fetch()
        // reads the file at `uri` itself when the request is sent. Not a real Blob, so this needs
        // its own cast rather than satisfying FormData's DOM-Blob-typed `append` overload.
        formData.append('files', {
          uri: asset.uri,
          name: asset.fileName || `image-${index}.${extension}`,
          type: asset.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        } as unknown as Blob);
      });
      const response = await fetch(restApiUrl('message-uploads'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const body = await response.json();
      if (!response.ok) {
        setUploadError(body?.error || 'Upload failed.');
        return;
      }
      setPendingImageUrls((prev) => [...prev, ...(body.urls || [])]);
    } catch {
      setUploadError('Upload failed. Check your connection and try again.');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleRemovePendingImage = (url: string) => {
    setPendingImageUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleSend = () => {
    const trimmed = text.trim();
    // Mirrors the server's own rule (utils/validation.js's createMessageInputSchema .refine) -
    // nothing to send if both are empty, but an image-only message (no text) is allowed.
    if ((!trimmed && pendingImageUrls.length === 0) || !conversationId || !user?.id || sending) {
      return;
    }
    const imagesToSend = pendingImageUrls;
    setText('');
    setPendingImageUrls([]);
    createMessage({
      variables: {
        conversationId,
        senderId: user.id,
        message: trimmed,
        imageUrls: imagesToSend.length > 0 ? imagesToSend : undefined,
      },
    }).catch(() => {
      // The message just didn't send - put the text and images back so nothing is silently lost.
      setText(trimmed);
      setPendingImageUrls(imagesToSend);
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

          {uploadError ? (
            <ThemedText type="small" style={styles.error}>
              {uploadError}
            </ThemedText>
          ) : null}

          {pendingImageUrls.length > 0 ? (
            <ScrollView horizontal style={styles.pendingImagesRow} testID="thread-pending-images">
              {pendingImageUrls.map((url) => (
                <View key={url} style={styles.pendingImageWrapper}>
                  <Image source={{ uri: url }} style={styles.pendingImageThumb} />
                  <Pressable
                    onPress={() => handleRemovePendingImage(url)}
                    style={styles.pendingImageRemove}
                    accessibilityLabel="Remove image"
                    testID={`thread-remove-pending-image-${url}`}
                  >
                    <ThemedText type="small" style={styles.pendingImageRemoveText}>
                      {'✕'}
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={[styles.composeRow, { borderTopColor: theme.backgroundSelected }]}>
            <Pressable
              onPress={handleAttachImages}
              disabled={uploadingImages || pendingImageUrls.length >= MAX_IMAGES_PER_MESSAGE}
              style={[
                styles.attachButton,
                {
                  opacity:
                    uploadingImages || pendingImageUrls.length >= MAX_IMAGES_PER_MESSAGE ? 0.5 : 1,
                },
              ]}
              accessibilityLabel="Attach image"
              testID="thread-attach-button"
            >
              {uploadingImages ? (
                <ActivityIndicator color={theme.text} testID="thread-upload-loading" />
              ) : (
                <ThemedText type="linkPrimary">Attach</ThemedText>
              )}
            </Pressable>
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
              disabled={(!text.trim() && pendingImageUrls.length === 0) || sending}
              style={[
                styles.sendButton,
                { opacity: (!text.trim() && pendingImageUrls.length === 0) || sending ? 0.5 : 1 },
              ]}
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
  attachButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.three,
  },
  error: {
    color: '#D33',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
  pendingImagesRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
  },
  pendingImageWrapper: {
    marginRight: Spacing.two,
  },
  pendingImageThumb: {
    width: 64,
    height: 64,
    borderRadius: Spacing.one,
  },
  pendingImageRemove: {
    position: 'absolute',
    top: -Spacing.one,
    right: -Spacing.one,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingImageRemoveText: {
    color: '#fff',
  },
});
