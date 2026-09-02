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
