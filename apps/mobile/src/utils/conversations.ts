import type { GetConversationsByMemberIdQuery } from '@inkbooks/api';

// Direct port of apps/web's Messenger.jsx otherMembers() - "everyone in this conversation except
// the viewer, who the thread is actually with" - generalized here into a display-name helper too,
// since the inbox row and the thread header both need it and neither should reimplement the
// join/fallback logic separately.

type ConversationsList = NonNullable<GetConversationsByMemberIdQuery['getConversationsByMemberId']>;
export type ConversationListItem = NonNullable<ConversationsList[number]>;
type ConversationMember = NonNullable<NonNullable<ConversationListItem['membersInfo']>[number]>;

export function otherMembers(
  conversation: Pick<ConversationListItem, 'membersInfo'>,
  myId: string | null | undefined,
): ConversationMember[] {
  return (conversation.membersInfo ?? []).filter(
    (member): member is ConversationMember => Boolean(member) && String(member!.id) !== String(myId),
  );
}

/** "Marta Nguyen" for a 1:1 thread - falls back to "Conversation" for the (currently unbuilt on
 * mobile - see DECISIONS.md X16) group/shop-conversation case where every other member somehow
 * resolves to none, so a malformed row never renders a blank row.
 */
export function conversationDisplayName(
  conversation: Pick<ConversationListItem, 'membersInfo'>,
  myId: string | null | undefined,
): string {
  const others = otherMembers(conversation, myId);
  if (others.length === 0) {
    return 'Conversation';
  }
  return others
    .map((member) => `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Unknown')
    .join(', ');
}


/**
 * Direct port of apps/web's Messenger.jsx search filter - "name match on either part, so 'sam'
 * finds Sam Rivera and 'rivera' does too." Filters what's RENDERED, over the conversations
 * already loaded, not a server-side search - same "search only filters what's already been paged
 * in" limitation utils/clients.ts's own matchesClientSearch carries for the same reason (see that
 * file's header comment and DECISIONS.md X17): neither getConversationsByMemberId nor getClients
 * takes a search argument server-side.
 */
export function matchesConversationSearch(
  conversation: Pick<ConversationListItem, 'membersInfo'>,
  myId: string | null | undefined,
  term: string,
): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return otherMembers(conversation, myId).some((member) =>
    `${member.firstName ?? ''} ${member.lastName ?? ''}`.toLowerCase().includes(normalized),
  );
}
