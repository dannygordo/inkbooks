import {
  useGetAutoResponsesQuery,
  useGetShopDetailQuery,
  useSendAutoResponseNowMutation,
} from '@inkbooks/api';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { getUserShopId } from '@/utils/user';

/**
 * Mobile port of apps/web's SendAutoResponseButton.jsx - "Send a message", the manual half of
 * Auto-Responses (settings/auto-responses.tsx, X39). Opens a picker of every Auto-Response this
 * viewer may send by hand - their own personal set, plus, when they administer a connected shop,
 * that shop's set too - grouped "Yours" / "From [shop]" exactly like web's MUI Menu, just using
 * this app's own RN `Modal` (matching AutoResponsesScreen's own dual-scope query shape, and
 * FormFillOutModal.tsx/SessionDetailForm.tsx's established Modal-as-picker pattern) in place of a
 * popover menu, which RN has no cross-platform equivalent for.
 *
 * AUTHORIZATION MIRRORS WHO CAN MANAGE THE RESPONSE, not just who's looking at this client - see
 * web's own header comment: the server's sendAutoResponseNow re-checks
 * assertCanManageBusinessRecord against the response's own owner, the same floor as editing it in
 * Settings. Not gated by `enabled` - that flag only controls automatic firing, a response turned
 * off for auto-fire is still a legitimate thing to send once by hand.
 *
 * Renders nothing when there's nothing to send (no clientId, or neither scope has any
 * Auto-Response at all) rather than a "Send a message" button that always does nothing.
 *
 * Props:
 * - clientId: the Client document's own _id (NOT the client's User._id - see client/[id].tsx's
 *   own note on this distinction).
 * - appointmentId: optional - omitted here, since client/[id].tsx mounts this from a client's own
 *   dashboard, not from an appointment/session screen (see web's own prop comment on when this is
 *   omitted vs. supplied).
 */
export function SendAutoResponseButton({ clientId, appointmentId }: { clientId: string; appointmentId?: string }) {
  const theme = useTheme();
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const isArtist = user?.userInfo?.__typename === 'Artist';
  const shopId = getUserShopId(user);
  const canSendShopResponses = Boolean(user) && isShopAdminOrBetter(user) && Boolean(shopId);

  const { data: mineData } = useGetAutoResponsesQuery({
    variables: { artistUserId: user?.id ?? '', includeInactive: false },
    skip: !isArtist,
  });
  const { data: shopData } = useGetAutoResponsesQuery({
    variables: { shopId: shopId ?? '', includeInactive: false },
    skip: !canSendShopResponses,
  });
  const { data: shopDetailData } = useGetShopDetailQuery({
    variables: { shopId: shopId ?? '' },
    skip: !canSendShopResponses,
  });
  const [sendAutoResponseNow] = useSendAutoResponseNowMutation();

  const mine = mineData?.getAutoResponses ?? [];
  const fromShop = shopData?.getAutoResponses ?? [];

  if (!clientId || (mine.length === 0 && fromShop.length === 0)) {
    return null;
  }

  const handleSend = (autoResponse: { id: string; name: string }) => {
    setPickerOpen(false);
    setSending(true);
    sendAutoResponseNow({
      variables: { autoResponseId: autoResponse.id, clientId, appointmentId: appointmentId || null },
    })
      .then(() => {
        Alert.alert('Sent', `"${autoResponse.name}" sent.`);
      })
      .catch((err) => {
        Alert.alert('Error', err?.graphQLErrors?.[0]?.message || err?.message || 'Could not send that message.');
      })
      .finally(() => setSending(false));
  };

  return (
    <View>
      <Button
        label="Send a message"
        variant="secondary"
        disabled={sending}
        onPress={() => setPickerOpen(true)}
        testID="send-auto-response-open"
      />
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold">Send a message</ThemedText>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {mine.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Yours
                </ThemedText>
              ) : null}
              {mine.map((response) => (
                <Pressable
                  key={response.id}
                  onPress={() => handleSend(response)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                  testID={`send-auto-response-${response.id}`}
                >
                  <ThemedText type="default">{response.name}</ThemedText>
                </Pressable>
              ))}
              {fromShop.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.groupSpacing}>
                  From {shopDetailData?.getShop?.name || 'your shop'}
                </ThemedText>
              ) : null}
              {fromShop.map((response) => (
                <Pressable
                  key={response.id}
                  onPress={() => handleSend(response)}
                  style={[styles.row, { borderColor: theme.backgroundSelected }]}
                  testID={`send-auto-response-${response.id}`}
                >
                  <ThemedText type="default">{response.name}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            <Button label="Cancel" variant="secondary" onPress={() => setPickerOpen(false)} testID="send-auto-response-cancel" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '70%',
    padding: Spacing.three,
    gap: Spacing.two,
    borderTopLeftRadius: Spacing.two,
    borderTopRightRadius: Spacing.two,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  groupSpacing: {
    marginTop: Spacing.two,
  },
  row: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
