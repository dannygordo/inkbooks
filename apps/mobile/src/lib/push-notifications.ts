import type { ApolloClient } from '@apollo/client';
import {
  RegisterDeviceTokenDocument,
  UnregisterDeviceTokenDocument,
  type RegisterDeviceTokenMutation,
  type RegisterDeviceTokenMutationVariables,
  type UnregisterDeviceTokenMutation,
  type UnregisterDeviceTokenMutationVariables,
} from '@inkbooks/api';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { TokenStorageService } from '@/services/TokenStorageService';

// Push as the fourth notification channel (PRODUCTION_ROADMAP.md Phase 5 step 7,
// NOTIFICATIONS_DESIGN.md's push addendum) - the device side of registerDeviceToken /
// unregisterDeviceToken (server/graphql/resolvers/pushTokens.js). Called from context/auth.tsx:
// registerForPushNotifications on login and on a cold-start session restore,
// unregisterPushNotifications on logout.
//
// The ApolloClient is a PARAMETER rather than importing lib/apollo-client.ts's singleton, on
// purpose: auth.tsx already holds the provider's client via useApolloClient(), and taking it as an
// argument here (mirroring server/utils/push.js's injectable `expoClient` and utils/email.js's
// injectable `send`) means a test can pass a bare `{ mutate: jest.fn() }` instead of exercising a
// real client wired to a real API URL - see __tests__/push-notifications.test.ts.
//
// Every exported function here is best-effort and NEVER throws. A push token that fails to
// register is a worse notification experience, not a reason to fail login - the same reasoning
// server/utils/notifications.js gives for not awaiting sendPushForRecipients, and the same
// reasoning apps/web's Firebase sign-in already established for this app for other best-effort
// device setup.

// Where the last token this device successfully registered is kept, so logout can unregister the
// SAME token it registered rather than re-deriving one that might have changed (permission
// revoked, Expo rotated it) since login. Deliberately not the same key as auth's session cache -
// this survives independently of whether a session exists, since a push token is a property of
// the install, not the session (see models/PushToken.js).
const LAST_REGISTERED_TOKEN_KEY = 'pushToken';

type DevicePlatform = 'ios' | 'android';

function currentPlatform(): DevicePlatform | null {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  if (Platform.OS === 'android') {
    return 'android';
  }
  // web, or any future Platform.OS this app runs under by way of expo-router's universal
  // routing - push tokens are a native-only concept, so there is nothing to register there.
  return null;
}

async function getExpoPushToken(): Promise<string | null> {
  // Checked FIRST: the Simulator/emulator throws out of getExpoPushTokenAsync rather than
  // returning null, and there is no real APNs/FCM registration to make there regardless - see
  // expo-notifications' own docs on Device.isDevice being the guard for this.
  if (!Device.isDevice) {
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return null;
  }

  // Same projectId apps/mobile/app.json's extra.eas.projectId already carries (the one `eas init`
  // linked - see this session's EAS setup) - Constants.easConfig is the build-time fallback for a
  // production binary where expoConfig.extra might not be populated the same way.
  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    // Network hiccup reaching Expo's push service, or a device that reports isDevice true but
    // still can't produce a token - either way this is best-effort, not fatal.
    return null;
  }
}

/**
 * Requests notification permission (if not already decided) and, if granted, registers this
 * device's Expo push token with the server. No-ops silently on the Simulator, on web, when
 * permission is denied, or on any failure - never throws, and never blocks the caller.
 */
export async function registerForPushNotifications(
  apollo: Pick<ApolloClient<object>, 'mutate'>,
): Promise<void> {
  const platform = currentPlatform();
  if (!platform) {
    return;
  }

  const token = await getExpoPushToken();
  if (!token) {
    return;
  }

  try {
    await apollo.mutate<RegisterDeviceTokenMutation, RegisterDeviceTokenMutationVariables>({
      mutation: RegisterDeviceTokenDocument,
      variables: { token, platform },
    });
    await TokenStorageService.setItemAsync(LAST_REGISTERED_TOKEN_KEY, token);
  } catch {
    // Registration failed (offline, server error, auth not yet attached) - nothing to clean up,
    // since LAST_REGISTERED_TOKEN_KEY is only written on confirmed success.
  }
}

/**
 * Unregisters this device's last-registered push token, if any. Call before clearing the session
 * (unregisterDeviceToken requires auth - see server/graphql/resolvers/pushTokens.js's withAuth),
 * not after. No-ops silently when nothing was ever registered, and never throws.
 */
export async function unregisterPushNotifications(
  apollo: Pick<ApolloClient<object>, 'mutate'>,
): Promise<void> {
  const token = await TokenStorageService.getItemAsync(LAST_REGISTERED_TOKEN_KEY);
  if (!token) {
    return;
  }

  try {
    await apollo.mutate<UnregisterDeviceTokenMutation, UnregisterDeviceTokenMutationVariables>({
      mutation: UnregisterDeviceTokenDocument,
      variables: { token },
    });
  } catch {
    // Left in place server-side - the DeviceNotRegistered prune path (utils/push.js) or the next
    // registerForPushNotifications call on this device cleans up a stale row either way.
  } finally {
    await TokenStorageService.deleteItemAsync(LAST_REGISTERED_TOKEN_KEY);
  }
}

// --- Notification-tap deep-linking -------------------------------------------------------------
//
// server/utils/notifications.js's notify() now attaches `data: { type, subjectType, subjectId }`
// to every push it sends (the same subject identity every in-app Notification row already
// carries) - this is the mobile side that reads it back on a tap and decides where to go. See
// app/_layout.tsx's RootNavigator for the actual navigation call, which uses
// Notifications.useLastNotificationResponse() (covers both a cold start - the app launched BY the
// tap - and a live tap while the app is already running, in one hook - see that hook's own
// implementation for why a separate addNotificationResponseReceivedListener isn't needed too).
//
// resolveNotificationTarget is kept here, not in _layout.tsx, and returns a plain discriminated
// screen+id rather than an expo-router pathname string - app.json's typedRoutes: true means
// expo-router's `Href` type only accepts known literal route strings, and this table's whole job
// is picking one of several literals at runtime. Keeping the actual `router.push({ pathname:
// '/appointment/[id]', ... })` calls as a literal switch in _layout.tsx keeps every pathname a
// real typed-routes literal there; this function only ever returns which case to take.

export type PushNotificationTargetScreen = 'appointment' | 'bookingRequest' | 'conversation' | 'artist' | 'shop';

export type PushNotificationTarget = {
  screen: PushNotificationTargetScreen;
  id: string;
};

// Every subjectType utils/notifications.js's call sites actually use (server/graphql/mutations/*,
// server/utils/attention.js, server/utils/notification-jobs.js) that ALSO has a mobile screen to
// land on. 'boothRentCharge' is deliberately absent - Booth Rent has no mobile screen at all yet
// (DECISIONS.md X31 names BoothRentPanel as still-unported Settings work), so a boothRentCharge
// notification simply opens the app to Home, same as tapping the app icon - not a bug, a real gap
// named here rather than a dead navigation attempt.
const SUBJECT_TYPE_SCREENS: Record<string, PushNotificationTargetScreen> = {
  appointment: 'appointment',
  bookingRequest: 'bookingRequest',
  conversation: 'conversation',
  artist: 'artist',
  shop: 'shop',
};

/**
 * Reads a notification response's own `data` payload (an untrusted, loosely-typed object off the
 * wire - Expo's own types leave it as `Record<string, unknown>`) and decides which screen, if any,
 * a tap on it should open. Never throws - a malformed, missing, or unrecognized payload (an older
 * push sent before this data existed, say) is exactly the same "nothing to navigate to" case as no
 * payload at all.
 */
export function resolveNotificationTarget(data: unknown): PushNotificationTarget | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const subjectType = (data as Record<string, unknown>).subjectType;
  const subjectId = (data as Record<string, unknown>).subjectId;
  if (typeof subjectType !== 'string' || typeof subjectId !== 'string' || subjectId.length === 0) {
    return null;
  }
  const screen = SUBJECT_TYPE_SCREENS[subjectType];
  if (!screen) {
    return null;
  }
  return { screen, id: subjectId };
}
