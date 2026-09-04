import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAccessToken, restApiUrl } from '@/utils/restApi';

type Props = {
  giftCardId: string;
  // Display only, from the create response's faceValueCents + feeOffsetCents - NOT sent, and not
  // what is charged. See routes/squarePayments.js's process-gift-card-payment: the amount charged
  // is read server-side off the stored pending GiftCard document, never off this prop.
  amountCents: number;
  note?: string;
  onSuccess: (paymentId: string) => void;
  onError: (message: string) => void;
};

type SquareConfig = { applicationId: string; locationId: string };

/**
 * RN port of apps/web's IBGiftCardPaymentForm.jsx - and, one level further back, a sibling of this
 * app's own SquarePaymentForm.tsx (see that file's own header comment for why a WebView hosts
 * Square's Web Payments SDK here instead of Square's native In-App Payments SDK). Deliberately a
 * SEPARATE component from SquarePaymentForm.tsx, not a generalization of it, for the exact reason
 * IBGiftCardPaymentForm.jsx gives on web: SquarePaymentForm is appointment-shaped (appointmentId,
 * chargeType, applyFeeOffset, tipCents) and already has two real, tested, money-moving callers
 * (BookSessionDatesForm.tsx, SessionDetailForm.tsx) - copying the WebView/tokenize/POST mechanic
 * here rather than reshaping that component's props keeps this new call from touching either of
 * them. Worth consolidating into one shared component if a third real caller ever needs the same
 * mechanic with a third body shape - not before.
 */
export function SquareGiftCardPaymentForm({ giftCardId, amountCents, note, onSuccess, onError }: Props) {
  const theme = useTheme();
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  // Generated once per mounted form, not per submit - same reasoning as SquarePaymentForm.tsx's
  // own idempotencyKeyRef: a retry after a timeout has to carry the SAME key.
  const idempotencyKeyRef = useRef(`ib-gc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(restApiUrl('square/config'));
        const data = (await response.json().catch(() => ({}))) as Partial<SquareConfig> & {
          error?: string;
        };
        if (!response.ok || !data.applicationId || !data.locationId) {
          throw new Error(data.error || 'Could not load Square configuration.');
        }
        if (!cancelled) {
          setConfig({ applicationId: data.applicationId, locationId: data.locationId });
        }
      } catch (err) {
        if (!cancelled) {
          const message = (err as Error).message;
          setConfigError(message);
          onError(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = async (event: WebViewMessageEvent) => {
    let payload: { type: string; token?: string; message?: string };
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (payload.type === 'ready') {
      setStatus('ready');
      return;
    }

    if (payload.type === 'error') {
      setErrorMessage(payload.message || 'Could not process this card.');
      setStatus('ready');
      onError(payload.message || 'Could not process this card.');
      return;
    }

    if (payload.type === 'token' && payload.token) {
      setStatus('submitting');
      setErrorMessage('');
      try {
        const accessToken = await getAccessToken();
        const response = await fetch(restApiUrl('square/process-gift-card-payment'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken ?? ''}`,
          },
          body: JSON.stringify({
            sourceId: payload.token,
            idempotencyKey: idempotencyKeyRef.current,
            note,
            giftCardId,
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error((data && data.error) || 'Payment failed.');
        }
        setStatus('ready');
        onSuccess(data.paymentId);
      } catch (err) {
        const message = (err as Error).message;
        setErrorMessage(message);
        setStatus('ready');
        onError(message);
      }
    }
  };

  if (configError) {
    return (
      <View style={styles.container}>
        <ThemedText type="small" style={styles.errorText} testID="square-gift-card-config-error">
          {configError}
        </ThemedText>
      </View>
    );
  }

  if (!config) {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={theme.text} testID="square-gift-card-config-loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        testID="square-gift-card-payment-webview"
        source={{ html: buildSquareCardHtml(config, amountCents) }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled
        originWhitelist={['*']}
      />
      {status === 'submitting' ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={theme.text} />
          <ThemedText type="small">Processing…</ThemedText>
        </View>
      ) : null}
      {errorMessage ? (
        <ThemedText type="small" style={styles.errorText} testID="square-gift-card-payment-error">
          {errorMessage}
        </ThemedText>
      ) : null}
    </View>
  );
}

// Identical to SquarePaymentForm.tsx's own buildSquareCardHtml - see that function's own comment.
// Duplicated rather than shared for the same reason the two components themselves aren't merged:
// this never ships as a file, only ever as an inline `source={{ html }}` string, so there's no
// real coupling cost to keeping the two copies independent.
function buildSquareCardHtml(config: SquareConfig, amountCents: number): string {
  const amountLabel = `$${(amountCents / 100).toFixed(2)}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { font-family: -apple-system, Roboto, sans-serif; padding: 12px; }
  #card-container { min-height: 90px; margin-bottom: 12px; }
  #pay-button {
    width: 100%; padding: 14px; background: #3c87f7; color: #fff; border: none;
    border-radius: 8px; font-size: 16px; font-weight: 600;
  }
  #pay-button:disabled { opacity: 0.5; }
  #error { color: #D33; font-size: 13px; margin-top: 8px; min-height: 16px; }
</style>
</head>
<body>
  <div id="card-container"></div>
  <button id="pay-button" disabled>Loading…</button>
  <div id="error"></div>
  <script src="https://sandbox.web.squarecdn.com/v1/square.js"></script>
  <script>
    (function () {
      function post(message) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(message));
        }
      }
      var payButton = document.getElementById('pay-button');
      var errorDiv = document.getElementById('error');
      var amountLabel = ${JSON.stringify(amountLabel)};
      var card = null;

      async function setup() {
        try {
          var payments = Square.payments(${JSON.stringify(config.applicationId)}, ${JSON.stringify(config.locationId)});
          card = await payments.card();
          await card.attach('#card-container');
          payButton.disabled = false;
          payButton.textContent = 'Pay ' + amountLabel;
          post({ type: 'ready' });
        } catch (err) {
          errorDiv.textContent = err.message;
          post({ type: 'error', message: err.message });
        }
      }

      payButton.addEventListener('click', async function () {
        if (!card) {
          return;
        }
        payButton.disabled = true;
        payButton.textContent = 'Processing…';
        errorDiv.textContent = '';
        try {
          var result = await card.tokenize();
          if (result.status !== 'OK') {
            var message =
              (result.errors && result.errors.map(function (e) { return e.message; }).join('; ')) ||
              'Could not process this card.';
            throw new Error(message);
          }
          post({ type: 'token', token: result.token });
          payButton.disabled = false;
          payButton.textContent = 'Pay ' + amountLabel;
        } catch (err) {
          errorDiv.textContent = err.message;
          payButton.disabled = false;
          payButton.textContent = 'Pay ' + amountLabel;
          post({ type: 'error', message: err.message });
        }
      });

      setup();
    })();
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  webview: {
    height: 220,
    backgroundColor: 'transparent',
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
