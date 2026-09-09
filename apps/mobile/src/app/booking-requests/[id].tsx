import {
  useConvertBookingRequestMutation,
  useCreateMessageMutation,
  useGetBookingRequestQuery,
  useGetMessagesByConversationIdQuery,
  useMarkConversationReadMutation,
} from '@inkbooks/api';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { BookSessionDatesForm } from '@/components/BookSessionDatesForm';
import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { MessageBubble } from '@/components/MessageBubble';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { bookingRequestStatusLabel } from '@/utils/bookingRequests';
import { prettyMessageTime } from '@/utils/messageTime';
import { formatPhone } from '@/utils/phone';

type ThreadMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  message?: string | null;
  imageUrls: string[];
  createdAt?: string | null;
  user?: { firstName?: string | null; lastName?: string | null; avatar?: string | null } | null;
};

// pending -> consult_booked | session_booked | declined; consult_booked -> session_booked |
// not_booked - server/graphql/mutations/bookingRequests.js's own VALID_OUTCOMES_BY_STATUS,
// mirrored here so the screen only ever offers a transition the server would actually accept.
function actionsForStatus(status: string): { consult: boolean; session: boolean; decline: boolean; notBooked: boolean } {
  if (status === 'pending') {
    return { consult: true, session: true, decline: true, notBooked: false };
  }
  if (status === 'consult_booked') {
    return { consult: false, session: true, decline: false, notBooked: true };
  }
  return { consult: false, session: false, decline: false, notBooked: false };
}

/**
 * Booking request detail - client intake info, the guest conversation, and whatever status
 * transition is currently valid (see actionsForStatus above). Detail half of the list+detail
 * split (see index.tsx's own header comment); reuses MessageBubble/CreateMessage/
 * MarkConversationRead from Messages verbatim (a booking request's conversation is a real
 * Conversation, same shape) and BookSessionDatesForm verbatim too, now that it supports being
 * called with no consult (DECISIONS.md X19). Full reasoning: DECISIONS.md X19.
 *
 * No reference-image lightbox - inline thumbnails only, same scope cut MessageBubble.tsx already
 * made for received images. No "Forward to..." reassignment - see index.tsx's own comment.
 */
export default function BookingRequestDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const listRef = useRef<FlashListRef<ThreadMessage>>(null);
  const [text, setText] = useState('');
  const [pendingOutcome, setPendingOutcome] = useState<'consult' | 'session' | null>(null);
  const [consultDate, setConsultDate] = useState(new Date());
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useGetBookingRequestQuery({
    variables: { bookingRequestId: id ?? '' },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const request = data?.getBookingRequest;
  const conversationId = request?.conversation?.id;

  const { data: threadData, loading: threadLoading } = useGetMessagesByConversationIdQuery({
    variables: { conversationId: conversationId ?? '' },
    skip: !conversationId,
    fetchPolicy: 'network-only',
    pollInterval: 4000,
  });
  const messages = (threadData?.getMessagesByConversationId ?? []) as ThreadMessage[];

  // Only the Messages badge is told, not the Booking Requests one - reading a reply doesn't
  // answer the request, only a decision does (see actionsForStatus's own convertBookingRequest
  // counterpart below). Direct port of ArtistBookingRequests.jsx's own comment on this exact
  // distinction.
  const [markConversationRead] = useMarkConversationReadMutation({
    refetchQueries: ['GetUnreadMessageCount'],
  });
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    markConversationRead({ variables: { conversationId } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const [createMessage, { loading: sending }] = useCreateMessageMutation({
    refetchQueries: ['GetMessagesByConversationId'],
    awaitRefetchQueries: true,
  });

  // Same badge refetch as BookSessionDatesForm's own call - this is the OTHER mutation that can
  // move a request out of pending (decline, consult_booked, not_booked; session_booked goes
  // through BookSessionDatesForm below instead).
  const [convertBookingRequest, { loading: converting }] = useConvertBookingRequestMutation({
    refetchQueries: ['GetPendingBookingRequestCount', 'GetUnreadMessageCount'],
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId || !user?.id || sending) {
      return;
    }
    setText('');
    createMessage({ variables: { conversationId, senderId: user.id, message: trimmed } }).catch(() => {
      setText(trimmed);
    });
  };

  const handleDecline = () => {
    if (!request) return;
    setActionError(null);
    convertBookingRequest({ variables: { bookingRequestId: request.id, outcome: 'declined' } })
      .then(() => refetch())
      .catch((err) => setActionError((err as Error).message));
  };

  const handleMarkNotBooked = () => {
    if (!request) return;
    setActionError(null);
    convertBookingRequest({ variables: { bookingRequestId: request.id, outcome: 'not_booked' } })
      .then(() => refetch())
      .catch((err) => setActionError((err as Error).message));
  };

  const handleConfirmConsult = () => {
    if (!request) return;
    setActionError(null);
    convertBookingRequest({
      variables: {
        bookingRequestId: request.id,
        outcome: 'consult_booked',
        appointmentInput: {
          appointmentDate: consultDate.toISOString(),
          shopCutStatus: 'unpaid',
          appointmentStatus: 'scheduled',
        },
      },
    })
      .then(() => {
        setPendingOutcome(null);
        refetch();
      })
      .catch((err) => setActionError((err as Error).message));
  };

  const handleSessionBooked = (projectId?: string | null) => {
    setPendingOutcome(null);
    refetch();
    if (projectId) {
      router.push({ pathname: '/project/[id]', params: { id: projectId } });
    }
  };

  if (!id || (loading && !request)) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ActivityIndicator color={theme.text} testID="booking-request-loading" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!request || error) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="booking-request-error">
              Couldn&apos;t load this request.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const actions = actionsForStatus(request.status);
  const name = [request.client?.firstName, request.client?.lastName].filter(Boolean).join(' ') || 'Unknown';
  const referenceImages = (request.referenceImages ?? []).filter((url): url is string => Boolean(url));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailHeader}>
              <ThemedText type="subtitle">{name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {bookingRequestStatusLabel(request.status)} · {prettyMessageTime(request.createdAt)}
              </ThemedText>
            </View>

            <ThemedText type="default">{request.description}</ThemedText>

            <View style={styles.detailFields}>
              {request.placement ? <DetailField label="Placement" value={request.placement} /> : null}
              {request.size ? <DetailField label="Size" value={request.size} /> : null}
              {request.budget ? <DetailField label="Budget" value={request.budget} /> : null}
              {request.availability ? <DetailField label="Availability" value={request.availability} /> : null}
              {request.isCoverUp ? <DetailField label="Cover-up / touch-up" value="Yes" /> : null}
              {request.howHeard ? <DetailField label="How they heard about you" value={request.howHeard} /> : null}
              {request.client?.email ? <DetailField label="Email" value={request.client.email} /> : null}
              {request.client?.phone ? <DetailField label="Phone" value={formatPhone(request.client.phone)} /> : null}
            </View>

            {referenceImages.length > 0 ? (
              <View style={styles.imagesRow}>
                {referenceImages.map((url) => (
                  <Image key={url} source={{ uri: url }} style={styles.imageThumb} />
                ))}
              </View>
            ) : null}

            {actions.consult || actions.session || actions.decline || actions.notBooked ? (
              <View style={styles.actionsCard}>
                {pendingOutcome === 'consult' ? (
                  <View style={styles.actionForm}>
                    <DateTimeField label="Consult date & time" value={consultDate} onChange={setConsultDate} testID="booking-request-consult-date" />
                    <View style={styles.actionFormButtons}>
                      <Button label="Confirm" onPress={handleConfirmConsult} loading={converting} testID="booking-request-confirm-consult" />
                      <Button label="Cancel" variant="secondary" onPress={() => setPendingOutcome(null)} disabled={converting} />
                    </View>
                  </View>
                ) : pendingOutcome === 'session' ? (
                  <BookSessionDatesForm
                    bookingRequestId={request.id}
                    onSuccess={handleSessionBooked}
                    onCancel={() => setPendingOutcome(null)}
                  />
                ) : (
                  <View style={styles.actionButtons}>
                    {actions.consult ? (
                      <Button label="Confirm Consult" onPress={() => setPendingOutcome('consult')} testID="booking-request-confirm-consult-open" />
                    ) : null}
                    {actions.session ? (
                      <Button label="Book Session" onPress={() => setPendingOutcome('session')} testID="booking-request-book-session-open" />
                    ) : null}
                    {actions.decline ? (
                      <Button label="Decline" variant="danger" onPress={handleDecline} disabled={converting} testID="booking-request-decline" />
                    ) : null}
                    {actions.notBooked ? (
                      <Button label="Mark Not Booked" variant="danger" onPress={handleMarkNotBooked} disabled={converting} testID="booking-request-mark-not-booked" />
                    ) : null}
                  </View>
                )}
                {actionError ? (
                  <ThemedText type="small" style={styles.error}>
                    {actionError}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            <View style={styles.conversation}>
              <ThemedText type="smallBold">Conversation</ThemedText>
              {threadLoading && messages.length === 0 ? (
                <ActivityIndicator color={theme.text} testID="booking-request-thread-loading" />
              ) : messages.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No messages yet.
                </ThemedText>
              ) : (
                <FlashList
                  ref={listRef}
                  data={messages}
                  keyExtractor={(message) => message.id}
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
            </View>
          </ScrollView>

          {conversationId ? (
            <View style={[styles.composeRow, { borderTopColor: theme.backgroundSelected }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Reply"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
                multiline
                testID="booking-request-compose-input"
              />
              <Pressable
                onPress={handleSend}
                disabled={!text.trim() || sending}
                style={[styles.sendButton, { opacity: !text.trim() || sending ? 0.5 : 1 }]}
                testID="booking-request-send-button"
              >
                <ThemedText type="linkPrimary">Send</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailField}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
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
  detailContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  detailHeader: {
    gap: Spacing.half,
  },
  detailFields: {
    gap: Spacing.two,
  },
  detailField: {
    gap: Spacing.half,
  },
  imagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  imageThumb: {
    width: 96,
    height: 96,
    borderRadius: Spacing.one,
  },
  actionsCard: {
    gap: Spacing.two,
  },
  actionButtons: {
    gap: Spacing.two,
  },
  actionForm: {
    gap: Spacing.three,
  },
  actionFormButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  error: {
    color: '#D33',
  },
  conversation: {
    gap: Spacing.two,
    minHeight: 120,
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
