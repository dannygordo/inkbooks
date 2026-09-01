import { apiUrl } from '@/lib/apollo-client';
import { AUTH_SETTINGS_CONSTANTS } from '@/constants/auth';
import { TokenStorageService } from '@/services/TokenStorageService';

/**
 * A path joined onto the API base, with exactly one slash between them - direct port of apps/web's
 * utils/apiUrl.js. apollo-client.ts's `apiUrl` is already the bare host GraphQL is POSTed to at
 * root (mirroring apps/web's own apiBaseUrl(), which the Apollo httpLink there is built from
 * directly - see that file's own comment), so the same value is reusable as the REST base for the
 * plain Express routes this app also has to call (square/config, square/process-payment) - they
 * live on the same host, not under any /graphql prefix.
 */
export function restApiUrl(path: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

/**
 * The same bearer token apollo-client.ts's authLink attaches to every GraphQL request, read the
 * same way (TokenStorageService, not a React hook) since this is called from plain fetch() calls
 * outside any component's render, not from a query/mutation hook.
 */
export async function getAccessToken(): Promise<string | null> {
  const raw = await TokenStorageService.getItemAsync(AUTH_SETTINGS_CONSTANTS.CURRENT_USER_CACHE);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}
