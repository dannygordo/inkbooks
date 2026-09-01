import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAccessToken, restApiUrl } from '@/utils/restApi';

type Props = {
  amountCents: number;
  appointmentId: string;
  chargeType?: 'deposit';
  // Optional, defaulting to false - web's own BookSessionDatesForm.jsx deposit-charge call site
  // never passes this at all (the fee-offset choice is only ever offered on a session charge, not
  // a deposit), so this mirrors that by making it optional here too rather than forcing every
  // caller to pass an explicit false.
  applyFeeOffset?: boolean;
  tipCents?: number;
  note?: string;
  onSuccess: (paymentId: string) => void;
  onError: (message: string) => void;
};

type SquareConfig = { applicationId: string; locationId: string };

/**
 * RN port of apps/web's IBSquarePaymentForm.jsx. Square's Web Payments SDK (Square.payments()/
 * card()/tokenize()) is a browser-only API - it mounts an iframe-backed card field into a real DOM
 * node, which RN has no equivalent of - so this hosts the exact same SDK inside a WebView instead
 * of reimplementing card entry natively. Square's own React Native "In-App Payments SDK" plugin
 * exists but requires linking native iOS/Android modules via a full EAS/Xcode/Gradle build - a
 * different order of operation than everything else this app has been verified with so far (npm
 * install + tsc + jest, no native rebuild step) and not something achievable end-to-end from this
 * environment. The WebView approach needs only a JS dependency and is a well-documented working
 * pattern (see DECISIONS.md's X13 entry) - the only real caveat is a WebView engine old enough to
 * lack ES2020 (Android <80/Safari <13.4), which is not a concern on any device Expo SDK 57 itself
 * still supports.
 *
 * The auth token (this app's own bearer token, NOT Square's) never enters the WebView - only the
 * PUBLIC applicationId/locationId do (see squareConfig comment on why those are safe to ship). The
 * WebView's only job is to mount the card field and hand back a one-time tokenize() result; the
 * actual authenticated POST to square/process-payment happens here, in RN, exactly mirroring
 * IBSquarePaymentForm.jsx's own handlePay - same idempotency-key-per-mount, same request body.
 */
export function SquarePaymentForm({
  amountCents,
  appointmentId,
  chargeType,
  applyFeeOffset = false,
  tipCents,
  note,
  onSuccess,
  onError,
}: Props) {
  const theme = useTheme();
  const [config, setConfig] = useState<SquareConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  // Generated once per mounted form, not per submit - direct port of web's idempotencyKeyRef: if
  // the first POST times out and the artist taps Pay again inside the WebView, the retry carries
  // the SAME key and Square treats it as the same payment rather than a second one.
  const idempotencyKeyRef = useRef(`ib-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);

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
        const response = await fetch(restApiUrl('square/process-payment'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken ?? ''}`,
          },
          body: JSON.stringify({
            sourceId: payload.token,
            idempotencyKey: idempotencyKeyRef.current,
            note,
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
        <ThemedText type="small" style={styles.errorText} testID="square-config-error">
          {configError}
        </ThemedText>
      </View>
    );
  }

  if (!config) {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={theme.text} testID="square-config-loading" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        testID="square-payment-webview"
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
        <ThemedText type="small" style={styles.errorText} testID="square-payment-error">
          {errorMessage}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * The WebView's entire content: Square's sandbox Web Payments SDK script, a card field, and a Pay
 * button - all vanilla JS/HTML, no bundler, since this never ships as a file, only ever as an
 * inline `source={{ html }}` string. Sandbox host only, matching the sandbox-only server route this
 * feature posts to (routes/squarePayments.js) and web's own loadSquareSdk.js - a Sandbox
 * access token/nonce only ever works against Square's sandbox host anyway.
 */
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
