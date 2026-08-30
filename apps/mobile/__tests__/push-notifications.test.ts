// lib/push-notifications.ts in isolation. expo-device/expo-notifications/expo-constants are
// mocked directly (none of the three ship a jest-expo preset mock the way
// react-native-safe-area-context / @react-native-community/netinfo do - see jest.setup.js's own
// comment on that), and the ApolloClient is a bare `{ mutate: jest.fn() }` rather than a real
// client - see push-notifications.ts's own header comment on why the client is a parameter rather
// than an import specifically so tests can do this.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '@/lib/push-notifications';

// expo-secure-store isn't mocked by jest-expo's preset - same in-memory stand-in
// __tests__/auth.test.tsx uses, since TokenStorageService is a three-line re-export of it (see
// services/TokenStorageService.ts).
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

// `__esModule: true` matters here, not just style: without it, Babel's CJS interop wraps this
// mock in a FRESH copy on every `import * as Device from 'expo-device'` call site, so mutating
// `mockedDevice.isDevice` below (from this test file's own import) would silently never be seen
// by push-notifications.ts's separately-wrapped import of the same mock. With it, interop returns
// this exact object both places, so the mutation is a live one.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
  easConfig: null,
}));

const mockedDevice = Device as jest.Mocked<typeof Device>;
const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;

function grantedPermission() {
  mockedNotifications.getPermissionsAsync.mockResolvedValue({
    status: 'granted',
  } as Notifications.NotificationPermissionsStatus);
}

describe('registerForPushNotifications', () => {
  afterEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    (mockedDevice as { isDevice: boolean }).isDevice = true;
  });

  it('registers the token and remembers it once permission is already granted', async () => {
    grantedPermission();
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[abc]',
    });
    const apollo = { mutate: jest.fn().mockResolvedValue({ data: { registerDeviceToken: true } }) };

    await registerForPushNotifications(apollo);

    expect(apollo.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { token: 'ExponentPushToken[abc]', platform: expect.any(String) },
      }),
    );
    expect(mockStore.get('pushToken')).toBe('ExponentPushToken[abc]');
  });

  it('requests permission when not yet determined, and registers once granted', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
    } as Notifications.NotificationPermissionsStatus);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'granted',
    } as Notifications.NotificationPermissionsStatus);
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[xyz]',
    });
    const apollo = { mutate: jest.fn().mockResolvedValue({ data: { registerDeviceToken: true } }) };

    await registerForPushNotifications(apollo);

    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(apollo.mutate).toHaveBeenCalled();
  });

  it('never calls the mutation when permission is denied', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as Notifications.NotificationPermissionsStatus);
    mockedNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
    } as Notifications.NotificationPermissionsStatus);
    const apollo = { mutate: jest.fn() };

    await registerForPushNotifications(apollo);

    expect(apollo.mutate).not.toHaveBeenCalled();
    expect(mockStore.has('pushToken')).toBe(false);
  });

  it('never calls Expo or the mutation on the Simulator', async () => {
    (mockedDevice as { isDevice: boolean }).isDevice = false;
    const apollo = { mutate: jest.fn() };

    await registerForPushNotifications(apollo);

    expect(mockedNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(apollo.mutate).not.toHaveBeenCalled();
  });

  it('does not store a token, and does not throw, when the mutation itself fails', async () => {
    grantedPermission();
    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[fails]',
    });
    const apollo = { mutate: jest.fn().mockRejectedValue(new Error('network down')) };

    await expect(registerForPushNotifications(apollo)).resolves.toBeUndefined();

    expect(mockStore.has('pushToken')).toBe(false);
  });

  it('never throws when Expo itself rejects (e.g. Simulator without push capability)', async () => {
    grantedPermission();
    mockedNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error('no push support'));
    const apollo = { mutate: jest.fn() };

    await expect(registerForPushNotifications(apollo)).resolves.toBeUndefined();

    expect(apollo.mutate).not.toHaveBeenCalled();
  });

  it('does nothing when no EAS projectId is configured', async () => {
    (Constants as { expoConfig: unknown; easConfig: unknown }).expoConfig = { extra: {} };
    (Constants as { expoConfig: unknown; easConfig: unknown }).easConfig = null;
    grantedPermission();
    const apollo = { mutate: jest.fn() };

    await registerForPushNotifications(apollo);

    expect(mockedNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(apollo.mutate).not.toHaveBeenCalled();

    (Constants as { expoConfig: unknown; easConfig: unknown }).expoConfig = {
      extra: { eas: { projectId: 'test-project-id' } },
    };
  });
});

describe('unregisterPushNotifications', () => {
  afterEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('unregisters and forgets the last-registered token', async () => {
    mockStore.set('pushToken', 'ExponentPushToken[abc]');
    const apollo = { mutate: jest.fn().mockResolvedValue({ data: { unregisterDeviceToken: true } }) };

    await unregisterPushNotifications(apollo);

    expect(apollo.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { token: 'ExponentPushToken[abc]' } }),
    );
    expect(mockStore.has('pushToken')).toBe(false);
  });

  it('does nothing when this device never registered a token', async () => {
    const apollo = { mutate: jest.fn() };

    await unregisterPushNotifications(apollo);

    expect(apollo.mutate).not.toHaveBeenCalled();
  });

  it('still forgets the stored token even when the unregister mutation fails', async () => {
    mockStore.set('pushToken', 'ExponentPushToken[abc]');
    const apollo = { mutate: jest.fn().mockRejectedValue(new Error('unauthenticated')) };

    await expect(unregisterPushNotifications(apollo)).resolves.toBeUndefined();

    expect(mockStore.has('pushToken')).toBe(false);
  });
});
