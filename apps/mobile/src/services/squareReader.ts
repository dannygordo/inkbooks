import {
  authorize as sdkAuthorize,
  deauthorize as sdkDeauthorize,
  getAuthorizationState,
  getReaders,
  pairReader as sdkPairReader,
  setReaderChangedCallback,
  startPayment,
  cancelPayment,
  AdditionalPaymentMethodType,
  PromptMode,
  ProcessingMode,
  CurrencyCode,
} from 'mobile-payments-sdk-react-native';
import type { Payment, ReaderChangedEvent, ReaderInfo } from 'mobile-payments-sdk-react-native';

import { apolloClient } from '@/lib/apollo-client';
import { GetMySquareMobileCredentialsDocument } from '@inkbooks/api';

/**
 * Thin wrapper around Square's Mobile Payments SDK (mobile-payments-sdk-react-native), scoping
 * this app's use of it to exactly what SquareReaderPaymentForm.tsx needs: authorize with THIS
 * artist's own credentials, pair a reader, charge a fixed amount, deauthorize when done.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS TALKS TO SQUARE DIRECTLY FROM THE DEVICE, UNLIKE EVERYTHING ELSE IN THIS APP. Every
 * other Square call in this codebase (routes/squarePayments.js) happens on the server, using
 * credentials that never leave it. A physical card reader can't work that way - it is paired over
 * Bluetooth to THIS PHONE, and the SDK that talks to it has to run where the phone is. Square's
 * own design for this (authorize(accessToken, locationId) - see auth.ts in the installed package,
 * and developer.squareup.com/docs/mobile-payments-sdk/ios/configure-authorize) takes the seller's
 * real OAuth access token directly - there is no separate short-lived "mobile authorization code"
 * the way the now-retired Reader SDK required.
 *
 * That means this is the one place in the mobile app that ever holds a real, live Square access
 * token. Two rules keep that from being a bigger exposure than it needs to be:
 *   1. It is fetched fresh from getMySquareMobileCredentials right before authorize() is called,
 *      never cached, and never written to AsyncStorage/SecureStore.
 *   2. deauthorizeReader() is called when the payment screen unmounts, so the token has no reason
 *      to still be authorized-with on the device once the artist has moved on.
 * The server-side resolver this calls is gated behind the same SQUARE_PAYMENTS_ENABLED kill
 * switch every other real Square call in this app respects (see resolvers/shops.js) - if real
 * payments are turned off, this app cannot obtain a token to authorize a reader with at all.
 * ---------------------------------------------------------------------------------------------
 */

export class SquareReaderUnavailableError extends Error {}

/**
 * Fetches this artist's own live Square credentials and authorizes the SDK with them. Safe to
 * call every time a payment screen mounts - authorize() is idempotent against an
 * already-authorized SDK on Square's side, and a fresh token means this never fails on a stale
 * credential the way a cached one could.
 */
export async function authorizeReader(): Promise<void> {
  let accessToken: string;
  let locationId: string;
  try {
    const { data } = await apolloClient.query({
      query: GetMySquareMobileCredentialsDocument,
      fetchPolicy: 'network-only',
    });
    accessToken = data.getMySquareMobileCredentials.accessToken;
    locationId = data.getMySquareMobileCredentials.locationId;
  } catch (err) {
    throw new SquareReaderUnavailableError((err as Error).message);
  }
  await sdkAuthorize(accessToken, locationId);
}

/** Called when leaving a reader-payment screen - see the header comment on why this matters. */
export async function deauthorizeReader(): Promise<void> {
  const state = await getAuthorizationState().catch(() => null);
  if (state === 'AUTHORIZED' || state === 'AUTHORIZING') {
    await sdkDeauthorize();
  }
}

/**
 * Starts Square's own native reader-pairing UI (Bluetooth scan, connect, done) - the SDK owns
 * this screen entirely; this app just triggers it and waits for the result.
 */
export async function pairReader(): Promise<boolean> {
  return sdkPairReader();
}

export async function listConnectedReaders(): Promise<ReaderInfo[]> {
  return getReaders();
}

export function onReaderChanged(callback: (event: ReaderChangedEvent) => void): () => void {
  return setReaderChangedCallback(callback);
}

type ChargeWithReaderArgs = {
  amountCents: number;
  referenceId: string;
  note?: string;
  // KEYED lets the SAME native prompt fall back to manual card entry when no reader is paired
  // (e.g. a chip/tap failure, or no reader on hand) - offered alongside CASH so the SDK's own UI
  // covers the same ground SquarePaymentForm.tsx's WebView does, without a second component.
  allowKeyedFallback?: boolean;
};

/**
 * Charges a fixed, already-quoted amount via whatever reader is currently connected (or Square's
 * own native prompt UI, if none is and allowKeyedFallback is set). Returns the COMPLETED Payment
 * Square's SDK reports - amount, id, status - which the caller then sends to
 * routes/squarePayments.js's /square/process-reader-payment to be verified against a fresh server
 * quote and recorded. This function does not talk to InkBooks' own backend at all; by the time it
 * resolves, the charge has already happened on Square's side.
 *
 * amountCents MUST come from a FRESH getChargeQuote call (chargeType-aware, see
 * chargeQuote.graphql), made immediately before this - unlike the WebView/nonce flow, there is no
 * server-side veto once this call has started. See squarePayments.js's own header comment on
 * getPaymentForAccount for the verify-after-the-fact model this implies downstream.
 */
export async function chargeWithReader({
  amountCents,
  referenceId,
  note,
  allowKeyedFallback = true,
}: ChargeWithReaderArgs): Promise<Payment> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Nothing to charge.');
  }
  return startPayment(
    {
      amountMoney: { amount: amountCents, currencyCode: CurrencyCode.USD },
      processingMode: ProcessingMode.ONLINE_ONLY,
      // false: InkBooks computes and bills its own Square_Fee_Offset server-side (M5) as part of
      // the quoted amount already handed to this call - Square's own built-in surcharge feature
      // would double-charge it on top.
      allowCardSurcharge: false,
      referenceId,
      note,
      autocomplete: true,
      idempotencyKey: referenceId,
    },
    {
      mode: PromptMode.DEFAULT,
      additionalMethods: allowKeyedFallback
        ? [AdditionalPaymentMethodType.KEYED, AdditionalPaymentMethodType.CASH]
        : [],
    },
  );
}

export async function cancelReaderPayment(): Promise<void> {
  await cancelPayment();
}
