import { AUTH_SETTINGS_CONSTANTS } from '@/constants/auth';
import { apiUrl } from '@/lib/apollo-client';
import { getAccessToken, restApiUrl } from '@/utils/restApi';

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

describe('restApiUrl', () => {
  const base = apiUrl.replace(/\/+$/, '');

  it('joins a base with no trailing slash to a path with no leading slash', () => {
    expect(restApiUrl('square/config')).toBe(`${base}/square/config`);
  });

  it('normalizes a leading slash on the path to exactly one join slash', () => {
    expect(restApiUrl('/square/process-payment')).toBe(`${base}/square/process-payment`);
  });
});

describe('getAccessToken', () => {
  afterEach(() => {
    mockStore.clear();
  });

  it('returns null when nothing is stored', async () => {
    expect(await getAccessToken()).toBeNull();
  });

  it('returns the stored session\'s accessToken', async () => {
    mockStore.set(
      AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE,
      JSON.stringify({ accessToken: 'a-real-token' }),
    );
    expect(await getAccessToken()).toBe('a-real-token');
  });

  it('returns null for a corrupt cache entry instead of throwing', async () => {
    mockStore.set(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE, '{not-json');
    expect(await getAccessToken()).toBeNull();
  });
});
