import type { GetClientsQuery } from '@inkbooks/api';

export type ClientListItem = GetClientsQuery['getClients']['items'][number];

// The list's own name/email filter - same "filters what's RENDERED without touching which page
// has loaded" shape as apps/web's Messenger.jsx otherMembers-based search, extended to match on
// email too since this is a contact directory, not a conversation list. Extracted as its own pure
// function (rather than inlined in the screen's .filter() call) purely so it has a test - see
// DECISIONS.md X17 on why this only ever searches what's already been paged in, not the caller's
// whole roster.
export function matchesClientSearch(
  client: Pick<ClientListItem, 'firstName' | 'lastName' | 'email'>,
  term: string,
): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = `${client.firstName ?? ''} ${client.lastName ?? ''} ${client.email ?? ''}`.toLowerCase();
  return haystack.includes(normalized);
}
