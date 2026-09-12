import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apolloClient } from '@/lib/apollo-client';
import { getAccessToken, restApiUrl } from '@/utils/restApi';
import { GetChargeQuoteDocument } from '@inkbooks/api';
import {
  authorizeReader,
  deauthorizeReader,
  pairReader,
  listConnectedReaders,
  onReaderChanged,
  chargeWithReader,
  cancelReaderPayment,
  SquareReaderUnavailableError,
} from '@/services/squareReader';

type Props = {
  appointmentId: string;
  chargeType?: 'deposit';
  applyFeeOffset?: boolean;
  tipCents?: number;
  note?: string;
  onSuccess: (paymentId: string) => void;
  onError: (message: string) => void;
};

type Status =
  | 'authorizing'
  | 'no-reader'
  | 'pairing'
  | 'ready'
  | 'charging'
  | 'verifying'
  | 'unavailable';

/**
 * Card-present sibling of SquarePaymentForm.tsx (that one hosts Square's Web Payments SDK in a
 * WebView for a keyed/manual card - this one drives a physical Square reader over Bluetooth via
 * the Mobile Payments SDK). Same onSuccess/onError contract, so BookSessionDatesForm.tsx and
 * SessionDetailForm.tsx can offer both side by side with a plain toggle rather than two different
 * integration shapes.
 *
 * THE AMOUNT IS NEVER TAKEN FROM PROPS. Unlike the WebView flow (where the server decides the
 * final charge after tokenization, regardless of what the screen displayed), a reader charges
 * exactly the amount this component hands to Square's SDK, in real time, with no server veto
 * possible afterward. So this always fetches its own fresh getChargeQuote immediately before
 * calling chargeWithReader, the same "quote and charge must be the same call chain" principle
 * utils/charge-quote.js documents for the server side - a prop that happened to be stale would
 * otherwise become a real, uncorrectable charge.
 */
export function SquareReaderPaymentForm({
  appointmentId,
  chargeType,
  applyFeeOffset = false,
  tipCents,
  note,
  onSuccess,
  onError,
}: Props) {
  const theme = useTheme();
  const [status, setStatus] = useState<Status>('authorizing');
  const [errorMessage, setErrorMessage] = useState('');
  const [readerName, setReaderName] = useState<string | null>(null);
  // One id per mount, echoed to both Square (as the payment's referenceId/idempotencyKey) and to
  // this app's own verify-and-record route - a retry after a dropped connection reuses the same
  // id rather than risking two real charges for one tap of "Charge with reader".
  const referenceIdRef = useRef(`ib-reader-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        await authorizeReader();
        const readers = await listConnectedReaders();
        const connected = readers.find((r) => r.status?.status === 'READY');
        if (!mountedRef.current) {
          return;
        }
        if (connected) {
          setReaderName(String(connected.name || 'Square reader'));
          setStatus('ready');
        } else {
          setStatus('no-reader');
        }
        unsubscribe = onReaderChanged((event) => {
          if (!mountedRef.current) {
            return;
          }
          const isReady = event.reader?.status?.status === 'READY';
          setReaderName(isReady ? String(event.reader.name || 'Square reader') : null);
          setStatus((current) => (current === 'charging' || current === 'verifying' ? current : isReady ? 'ready' : 'no-reader'));
        });
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }
        const message =
          err instanceof SquareReaderUnavailableError
            ? err.message
            : 'Could not connect to Square. Check your connection and try again.';
        setErrorMessage(message);
        setStatus('unavailable');
        onError(message);
      }
    })();

    return () => {
      mountedRef.current = false;
      if (unsubscribe) {
        unsubscribe();
      }
      deauthorizeReader().catch(() => {
        // Best-effort cleanup - nothing the user can act on if this fails, and staying
        // authorized a little past screen-close is not itself a security incident, just not
        // the ideal we aim for. See squareReader.ts's own header comment.
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePairReader = useCallback(async () => {
    setStatus('pairing');
    setErrorMessage('');
    try {
      const paired = await pairReader();
      if (!mountedRef.current) {
        return;
      }
      if (!paired) {
        setStatus('no-reader');
        return;
      }
      const readers = await listConnectedReaders();
      const connected = readers.find((r) => r.status?.status === 'READY');
      setReaderName(connected ? String(connected.name || 'Square reader') : null);
      setStatus(connected ? 'ready' : 'no-reader');
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      const message = (err as Error).message || 'Could not pair a reader.';
      setErrorMessage(message);
      setStatus('no-reader');
      onError(message);
    }
  }, [onError]);

  const handleCharge = useCallback(async () => {
    setStatus('charging');
    setErrorMessage('');
    try {
      // A FRESH quote, fetched right now - see this component's own header comment on why a
      // prop-supplied amount is never trusted for the actual charge.
      const { data: quoteData } = await apolloClient.query({
        query: GetChargeQuoteDocument,
        variables: {
          appointmentId,
          applyFeeOffset,
          tipCents: tipCents ?? 0,
          chargeType: chargeType === 'deposit' ? 'deposit' : undefined,
        },
        fetchPolicy: 'network-only',
      });
      const quote = quoteData?.getChargeQuote;
      if (!quote) {
        throw new Error('Could not load the amount to charge.');
      }
      if (!quote.canCharge) {
        throw new Error('Connect Square in Settings before taking a card payment.');
      }
      const amountDueCents = quote.amountDueCents;
      if (!amountDueCents || amountDueCents <= 0) {
        throw new Error(
          chargeType === 'deposit'
            ? 'This deposit has no amount to collect.'
            : 'There is nothing left to collect on this session.',
        );
      }

      const payment = await chargeWithReader({
        amountCents: amountDueCents,
        referenceId: referenceIdRef.current,
        note,
      });

      setStatus('verifying');
      const accessToken = await getAccessToken();
      const response = await fetch(restApiUrl('square/process-reader-payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken ?? ''}`,
        },
        body: JSON.stringify({
          paymentId: payment.id,
          appointmentId,
          chargeType,
          applyFeeOffset,
          tipCents,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((data && data.error) || 'Payment failed.');
      }
      if (!mountedRef.current) {
        return;
      }
      setStatus('ready');
      onSuccess(data.paymentId);
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      await cancelReaderPayment().catch(() => {});
      const message = (err as Error).message || 'Could not process this payment.';
      setErrorMessage(message);
      setStatus('ready');
      onError(message);
    }
  }, [appointmentId, applyFeeOffset, chargeType, note, onError, onSuccess, tipCents]);

  if (status === 'authorizing') {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={theme.text} testID="square-reader-authorizing" />
      </View>
    );
  }

  if (status === 'unavailable') {
    return (
      <View style={styles.container}>
        <ThemedText type="small" style={styles.errorText} testID="square-reader-unavailable">
          {errorMessage}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {status === 'no-reader' || status === 'pairing' ? (
        <>
          <ThemedText type="small">No card reader connected.</ThemedText>
          <Button
            label={status === 'pairing' ? 'Looking for a reader…' : 'Connect a reader'}
            onPress={handlePairReader}
            disabled={status === 'pairing'}
            testID="square-reader-pair"
          />
        </>
      ) : (
        <>
          <ThemedText type="small" testID="square-reader-connected">
            Reader connected{readerName ? `: ${readerName}` : ''}.
          </ThemedText>
          <Button
            label={
              status === 'charging'
                ? 'Waiting for card…'
                : status === 'verifying'
                  ? 'Confirming…'
                  : 'Charge with reader'
            }
            onPress={handleCharge}
            disabled={status === 'charging' || status === 'verifying'}
            testID="square-reader-charge"
          />
        </>
      )}
      {(status === 'charging' || status === 'verifying') ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={theme.text} />
          <ThemedText type="small">
            {status === 'charging' ? 'Tap, insert or swipe the card…' : 'Confirming…'}
          </ThemedText>
        </View>
      ) : null}
      {errorMessage ? (
        <ThemedText type="small" style={styles.errorText} testID="square-reader-error">
          {errorMessage}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  loadingBox: {
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  errorText: {
    color: '#D33',
  },
});
