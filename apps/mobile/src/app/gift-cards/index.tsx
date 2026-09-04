import {
  useConfirmGiftCardShopCutPaidMutation,
  useCreateArtistGiftCardMutation,
  useCreateGiftCardShopCutInvoiceMutation,
  useCreateShopGiftCardMutation,
  useGetGiftCardLiabilityReportQuery,
  useGetGiftCardsByShopQuery,
  useGetMyGiftCardLiabilityReportQuery,
  useGetMyGiftCardsQuery,
  useMarkGiftCardShopCutPaidManuallyMutation,
  type GetGiftCardsByShopQuery,
  type GetMyGiftCardsQuery,
} from '@inkbooks/api';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { SquareGiftCardPaymentForm } from '@/components/SquareGiftCardPaymentForm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useTheme } from '@/hooks/use-theme';
import { isShopAdminOrBetter } from '@/utils/permissions';
import { dollarsToCents, formatCents } from '@/utils/money';
import { getUserShopId } from '@/utils/user';

type MyCard = NonNullable<GetMyGiftCardsQuery['getMyGiftCards']>[number];
type ShopCard = NonNullable<GetGiftCardsByShopQuery['getGiftCardsByShop']>[number];
type PaymentMethod = 'cash' | 'square';

const SHOP_CUT_STATUS_LABEL: Record<string, string> = {
  none: 'None',
  unpaid: 'Unpaid',
  invoice_sent: 'Invoice sent',
  pending_confirmation: 'Pending confirmation',
  paid: 'Paid',
  received: 'Received',
};

/**
 * Mobile port of apps/web's pages/giftCards/GiftCards.jsx - the last item on HANDOFF.md's
 * 2026-09-04 parity accounting (gap 5), closed on web first per Danny's own "web first, then
 * mobile" call. Same scope as web, field-for-field: every artist can sell their own
 * artist-issued card, a shop admin can additionally sell the shop's own product and settle a
 * shop-issued card's cut (invoice / mark paid cash / confirm received - the exact three actions
 * shop-cut-confirmations/index.tsx already has for Appointments, against a GiftCard instead,
 * since the field shape is identical by design - DECISIONS.md M6). Redeeming a card is NOT here,
 * same as web - see SessionDetailForm.tsx's own gift-card section for why that lives at the
 * session instead of on this management screen.
 *
 * `canManageBusinessLedger`-shaped visibility (isArtist OR isShopAdminOrBetter), but NOT that
 * exact function - it's imported by web's Sidebar gate too but named for Income/Expenses there;
 * this screen's own gate is spelled out inline since the two halves (artist section, admin
 * section) need to be checked separately anyway to decide what to render.
 *
 * Deliberately `.map()` over a plain ScrollView rather than FlashList for the two card lists -
 * matching income/expenses' own precedent for a "form plus small-to-medium list on one screen"
 * shape (see expenses/index.tsx's own header comment), not shop-cut-confirmations' FlashList
 * (a single flat list filling the whole screen, a different layout problem). A shop's or an
 * artist's own gift card count is inherently small and unpaginated server-side (getMyGiftCards/
 * getGiftCardsByShop have no page argument at all), the same reasoning that lets
 * shop-cut-confirmations skip pagination too.
 */
export default function GiftCardsScreen() {
  const { user } = useAuth();
  const theme = useTheme();

  if (!user) {
    return null;
  }

  const isArtist = user.userType === 'artist';
  const isAdmin = isShopAdminOrBetter(user);
  const shopId = getUserShopId(user);

  const {
    data: myCardsData,
    loading: myCardsLoading,
    refetch: refetchMyCards,
  } = useGetMyGiftCardsQuery({ skip: !isArtist, fetchPolicy: 'cache-and-network' });
  const {
    data: shopCardsData,
    loading: shopCardsLoading,
    refetch: refetchShopCards,
  } = useGetGiftCardsByShopQuery({
    variables: { shopId: shopId ?? '' },
    skip: !isAdmin || !shopId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: myLiabilityData, refetch: refetchMyLiability } = useGetMyGiftCardLiabilityReportQuery({
    skip: !isArtist,
    fetchPolicy: 'cache-and-network',
  });
  const { data: shopLiabilityData, refetch: refetchShopLiability } = useGetGiftCardLiabilityReportQuery({
    variables: { shopId: shopId ?? '' },
    skip: !isAdmin || !shopId,
    fetchPolicy: 'cache-and-network',
  });

  const myCards = (myCardsData?.getMyGiftCards ?? []).filter((c): c is MyCard => Boolean(c));
  const shopCards = (shopCardsData?.getGiftCardsByShop ?? []).filter((c): c is ShopCard => Boolean(c));
  const myLiability = myLiabilityData?.getMyGiftCardLiabilityReport;
  const shopLiability = shopLiabilityData?.getGiftCardLiabilityReport;

  const refetchEverything = async () => {
    await Promise.all([
      isArtist ? refetchMyCards() : null,
      isArtist ? refetchMyLiability() : null,
      isAdmin && shopId ? refetchShopCards() : null,
      isAdmin && shopId ? refetchShopLiability() : null,
    ]);
  };

  // --- Sell an artist-issued card ---------------------------------------------------------
  const [artistFaceDollars, setArtistFaceDollars] = useState('');
  const [artistApplyOffset, setArtistApplyOffset] = useState(false);
  const [artistPaymentMethod, setArtistPaymentMethod] = useState<PaymentMethod | null>(null);
  const [pendingArtistSale, setPendingArtistSale] = useState<{ giftCardId: string; amountCents: number; code: string } | null>(
    null,
  );
  const [artistError, setArtistError] = useState<string | null>(null);
  const [createArtistGiftCard, { loading: artistSubmitting }] = useCreateArtistGiftCardMutation();

  const handleSellArtistCard = () => {
    setArtistError(null);
    const faceValueCents = dollarsToCents(artistFaceDollars);
    if (faceValueCents <= 0 || !artistPaymentMethod) {
      return;
    }
    createArtistGiftCard({
      variables: {
        input: {
          faceValueCents,
          applyFeeOffset: artistApplyOffset,
          paymentMethod: artistPaymentMethod,
          pending: artistPaymentMethod === 'square' ? true : undefined,
        },
      },
    })
      .then(({ data }) => {
        const card = data?.createArtistGiftCard;
        if (!card) {
          return;
        }
        if (artistPaymentMethod === 'square') {
          setPendingArtistSale({
            giftCardId: card.id,
            amountCents: card.faceValueCents + card.feeOffsetCents,
            code: card.code,
          });
        } else {
          setArtistFaceDollars('');
          setArtistApplyOffset(false);
          setArtistPaymentMethod(null);
        }
        return refetchEverything();
      })
      .catch((err) => setArtistError((err as Error).message));
  };

  const handleArtistCardPaid = () => {
    setPendingArtistSale(null);
    setArtistFaceDollars('');
    setArtistApplyOffset(false);
    setArtistPaymentMethod(null);
    refetchEverything();
  };

  // --- Sell a shop-issued card (admin only) -----------------------------------------------
  const [shopFaceDollars, setShopFaceDollars] = useState('');
  const [shopApplyOffset, setShopApplyOffset] = useState(false);
  const [shopPaymentMethod, setShopPaymentMethod] = useState<PaymentMethod | null>(null);
  const [pendingShopSale, setPendingShopSale] = useState<{ giftCardId: string; amountCents: number; code: string } | null>(
    null,
  );
  const [shopError, setShopError] = useState<string | null>(null);
  const [createShopGiftCard, { loading: shopSubmitting }] = useCreateShopGiftCardMutation();

  const handleSellShopCard = () => {
    setShopError(null);
    const faceValueCents = dollarsToCents(shopFaceDollars);
    if (faceValueCents <= 0 || !shopPaymentMethod || !shopId) {
      return;
    }
    createShopGiftCard({
      variables: {
        input: {
          shopId,
          faceValueCents,
          applyFeeOffset: shopApplyOffset,
          paymentMethod: shopPaymentMethod,
          pending: shopPaymentMethod === 'square' ? true : undefined,
        },
      },
    })
      .then(({ data }) => {
        const card = data?.createShopGiftCard;
        if (!card) {
          return;
        }
        if (shopPaymentMethod === 'square') {
          setPendingShopSale({
            giftCardId: card.id,
            amountCents: card.faceValueCents + card.feeOffsetCents,
            code: card.code,
          });
        } else {
          setShopFaceDollars('');
          setShopApplyOffset(false);
          setShopPaymentMethod(null);
        }
        return refetchEverything();
      })
      .catch((err) => setShopError((err as Error).message));
  };

  const handleShopCardPaid = () => {
    setPendingShopSale(null);
    setShopFaceDollars('');
    setShopApplyOffset(false);
    setShopPaymentMethod(null);
    refetchEverything();
  };

  // --- Shop-cut settlement -----------------------------------------------------------------
  const [cutActionId, setCutActionId] = useState<string | null>(null);
  const [cutError, setCutError] = useState<string | null>(null);
  const [createGiftCardShopCutInvoice] = useCreateGiftCardShopCutInvoiceMutation();
  const [markGiftCardShopCutPaidManually] = useMarkGiftCardShopCutPaidManuallyMutation();
  const [confirmGiftCardShopCutPaid] = useConfirmGiftCardShopCutPaidMutation();

  const handleInvoiceCut = (giftCardId: string) => {
    setCutError(null);
    setCutActionId(giftCardId);
    createGiftCardShopCutInvoice({ variables: { giftCardId, paymentMethod: 'card' } })
      .then(({ data }) => {
        const url = data?.createGiftCardShopCutInvoice.invoiceUrl;
        if (url) {
          Alert.alert('Invoice sent', url);
        }
        return refetchEverything();
      })
      .catch((err) => setCutError((err as Error).message))
      .finally(() => setCutActionId(null));
  };

  const handleMarkCutPaidCash = (giftCardId: string) => {
    setCutError(null);
    setCutActionId(giftCardId);
    markGiftCardShopCutPaidManually({ variables: { giftCardId } })
      .then(() => refetchEverything())
      .catch((err) => setCutError((err as Error).message))
      .finally(() => setCutActionId(null));
  };

  const handleConfirmCutPaid = (giftCardId: string) => {
    setCutError(null);
    setCutActionId(giftCardId);
    confirmGiftCardShopCutPaid({ variables: { giftCardId } })
      .then(() => refetchEverything())
      .catch((err) => setCutError((err as Error).message))
      .finally(() => setCutActionId(null));
  };

  if (!isArtist && !isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.centered}>
            <ThemedText type="default" themeColor="textSecondary" testID="gift-cards-nothing">
              Nothing to manage here.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const renderCardRow = (card: MyCard | ShopCard, viewerId: string, isShopWide: boolean) => {
    const isPending = card.saleStatus === 'pending';
    const isSoldByViewer = String(card.soldByUserId) === String(viewerId);
    const cutUnsettled = card.issuerType === 'SHOP' && Boolean(card.shopCutCents) && card.shopCutCents! > 0 && !isPending;
    const busy = cutActionId === card.id;
    return (
      <View key={card.id} style={[styles.row, { borderColor: theme.backgroundSelected }]} testID={`gift-card-row-${card.id}`}>
        <ThemedText type="default" style={styles.code}>
          {card.code}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {card.issuerType === 'ARTIST' ? 'Artist-issued' : 'Shop-issued'} ·{' '}
          {formatCents(card.balanceCents)} of {formatCents(card.faceValueCents)} left ·{' '}
          {isPending ? `Payment pending (${card.paymentMethod})` : `Sold via ${card.paymentMethod}`}
        </ThemedText>
        {card.issuerType === 'SHOP' ? (
          <ThemedText type="small" themeColor="textSecondary">
            Shop cut: {SHOP_CUT_STATUS_LABEL[card.shopCutStatus] ?? card.shopCutStatus}
            {card.shopCutCents ? ` (${formatCents(card.shopCutCents)})` : ''}
          </ThemedText>
        ) : null}
        {cutUnsettled && card.shopCutStatus === 'unpaid' && isSoldByViewer ? (
          <View style={styles.rowActions}>
            <Button
              label="Paid (Cash)"
              variant="secondary"
              disabled={busy}
              onPress={() => handleMarkCutPaidCash(card.id)}
              testID={`gift-card-mark-paid-${card.id}`}
            />
            <Button
              label="Charge (Card)"
              variant="secondary"
              disabled={busy}
              onPress={() => handleInvoiceCut(card.id)}
              testID={`gift-card-invoice-${card.id}`}
            />
          </View>
        ) : null}
        {cutUnsettled && card.shopCutStatus === 'pending_confirmation' && !isSoldByViewer ? (
          <Button
            label="Confirm Received"
            disabled={busy}
            onPress={() => handleConfirmCutPaid(card.id)}
            testID={`gift-card-confirm-${card.id}`}
          />
        ) : null}
        {isShopWide && cutUnsettled && card.shopCutStatus === 'unpaid' && !isSoldByViewer ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.readOnly}>
            Owed by the person who sold it
          </ThemedText>
        ) : null}
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            A card sold for cash is spendable right away. A card sold by Square is only spendable
            once the charge actually goes through - see the note on each pending card below.
          </ThemedText>

          {cutError ? (
            <ThemedText type="small" style={styles.error}>
              {cutError}
            </ThemedText>
          ) : null}

          {isArtist ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">Sell your own gift card</ThemedText>
              {pendingArtistSale ? (
                <View style={styles.pendingSale}>
                  <ThemedText type="small">
                    Card {pendingArtistSale.code} recorded - take the {formatCents(pendingArtistSale.amountCents)}{' '}
                    charge to finish.
                  </ThemedText>
                  <SquareGiftCardPaymentForm
                    giftCardId={pendingArtistSale.giftCardId}
                    amountCents={pendingArtistSale.amountCents}
                    note={`InkBooks gift card ${pendingArtistSale.code}`}
                    onSuccess={handleArtistCardPaid}
                    onError={(message) => setArtistError(message)}
                  />
                </View>
              ) : (
                <>
                  <FormField
                    label="Face value $"
                    placeholder="0"
                    value={artistFaceDollars}
                    onChangeText={setArtistFaceDollars}
                    keyboardType="decimal-pad"
                    testID="gift-cards-artist-face"
                  />
                  <View style={styles.offsetRow}>
                    <Switch value={artistApplyOffset} onValueChange={setArtistApplyOffset} testID="gift-cards-artist-offset" />
                    <ThemedText type="small" style={styles.offsetLabel}>
                      Add the Square processing-fee offset (never loads onto the card's balance)
                    </ThemedText>
                  </View>
                  <PaymentMethodPicker value={artistPaymentMethod} onChange={setArtistPaymentMethod} testIDPrefix="gift-cards-artist-method" />
                  {artistError ? (
                    <ThemedText type="small" style={styles.error}>
                      {artistError}
                    </ThemedText>
                  ) : null}
                  <Button
                    label={artistSubmitting ? 'Selling…' : 'Sell gift card'}
                    onPress={handleSellArtistCard}
                    loading={artistSubmitting}
                    disabled={artistSubmitting || dollarsToCents(artistFaceDollars) <= 0 || !artistPaymentMethod}
                    testID="gift-cards-artist-sell"
                  />
                </>
              )}
            </View>
          ) : null}

          {isAdmin && shopId ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">Sell a shop gift card</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Sold as a shop product, at 100% owed to the shop - not your own artist rate.
                Redeemable against any artist's session at this shop.
              </ThemedText>
              {pendingShopSale ? (
                <View style={styles.pendingSale}>
                  <ThemedText type="small">
                    Card {pendingShopSale.code} recorded - take the {formatCents(pendingShopSale.amountCents)} charge
                    to finish.
                  </ThemedText>
                  <SquareGiftCardPaymentForm
                    giftCardId={pendingShopSale.giftCardId}
                    amountCents={pendingShopSale.amountCents}
                    note={`InkBooks shop gift card ${pendingShopSale.code}`}
                    onSuccess={handleShopCardPaid}
                    onError={(message) => setShopError(message)}
                  />
                </View>
              ) : (
                <>
                  <FormField
                    label="Face value $"
                    placeholder="0"
                    value={shopFaceDollars}
                    onChangeText={setShopFaceDollars}
                    keyboardType="decimal-pad"
                    testID="gift-cards-shop-face"
                  />
                  <View style={styles.offsetRow}>
                    <Switch value={shopApplyOffset} onValueChange={setShopApplyOffset} testID="gift-cards-shop-offset" />
                    <ThemedText type="small" style={styles.offsetLabel}>
                      Add the Square processing-fee offset (never loads onto the card's balance)
                    </ThemedText>
                  </View>
                  <PaymentMethodPicker value={shopPaymentMethod} onChange={setShopPaymentMethod} testIDPrefix="gift-cards-shop-method" />
                  {shopError ? (
                    <ThemedText type="small" style={styles.error}>
                      {shopError}
                    </ThemedText>
                  ) : null}
                  <Button
                    label={shopSubmitting ? 'Selling…' : 'Sell gift card'}
                    onPress={handleSellShopCard}
                    loading={shopSubmitting}
                    disabled={shopSubmitting || dollarsToCents(shopFaceDollars) <= 0 || !shopPaymentMethod}
                    testID="gift-cards-shop-sell"
                  />
                </>
              )}
            </View>
          ) : null}

          {isArtist ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">Your gift cards</ThemedText>
              {myLiability && myLiability.cardCount > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {formatCents(myLiability.outstandingBalanceCents)} outstanding across {myLiability.cardCount} card
                  {myLiability.cardCount === 1 ? '' : 's'}
                  {myLiability.oldestIssuedAt ? ` - oldest issued ${new Date(myLiability.oldestIssuedAt).toLocaleDateString()}` : ''}.
                </ThemedText>
              ) : null}
              {myCardsLoading && myCards.length === 0 ? (
                <ActivityIndicator color={theme.text} testID="gift-cards-my-loading" />
              ) : myCards.length === 0 ? (
                <ThemedText type="default" themeColor="textSecondary" testID="gift-cards-my-empty">
                  No gift cards sold yet.
                </ThemedText>
              ) : (
                myCards.map((card) => renderCardRow(card, user.id, false))
              )}
            </View>
          ) : null}

          {isAdmin && shopId ? (
            <View style={styles.section}>
              <ThemedText type="smallBold">Shop gift cards</ThemedText>
              {shopLiability && shopLiability.cardCount > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {formatCents(shopLiability.outstandingBalanceCents)} outstanding across {shopLiability.cardCount} card
                  {shopLiability.cardCount === 1 ? '' : 's'}
                  {shopLiability.oldestIssuedAt ? ` - oldest issued ${new Date(shopLiability.oldestIssuedAt).toLocaleDateString()}` : ''}.
                </ThemedText>
              ) : null}
              {shopCardsLoading && shopCards.length === 0 ? (
                <ActivityIndicator color={theme.text} testID="gift-cards-shop-loading" />
              ) : shopCards.length === 0 ? (
                <ThemedText type="default" themeColor="textSecondary" testID="gift-cards-shop-empty">
                  No gift cards sold at this shop yet.
                </ThemedText>
              ) : (
                shopCards.map((card) => renderCardRow(card, user.id, true))
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Same shape as BookSessionDatesForm.tsx's own inline cash/square pill pair (see that file's own
 * comment on why: no default selected, so the artist has to make an explicit choice) - extracted
 * here since this screen needs it twice (artist card, shop card).
 */
function PaymentMethodPicker({
  value,
  onChange,
  testIDPrefix,
}: {
  value: PaymentMethod | null;
  onChange: (value: PaymentMethod) => void;
  testIDPrefix: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.methodBlock}>
      <ThemedText type="small" themeColor="textSecondary">
        How is it being paid for?
      </ThemedText>
      <View style={styles.methodRow}>
        {(['cash', 'square'] as const).map((method) => {
          const selected = value === method;
          return (
            <Pressable
              key={method}
              onPress={() => onChange(method)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`${testIDPrefix}-${method}`}
              style={[
                styles.pill,
                {
                  backgroundColor: selected ? theme.text : theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
                {method === 'cash' ? 'Cash' : 'Card (Square)'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  offsetLabel: {
    flex: 1,
  },
  methodBlock: {
    gap: Spacing.one,
  },
  methodRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pendingSale: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  readOnly: {
    fontStyle: 'italic',
  },
  error: {
    color: '#D33',
  },
});
