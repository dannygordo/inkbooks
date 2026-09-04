import { conversationDisplayName, matchesConversationSearch, otherMembers } from '@/utils/conversations';

function conversation(membersInfo: unknown) {
  return { membersInfo } as Parameters<typeof otherMembers>[0];
}

describe('otherMembers', () => {
  it('excludes the caller and keeps everyone else', () => {
    const result = otherMembers(
      conversation([
        { id: 'me', firstName: 'A', lastName: 'B', avatar: null },
        { id: 'them', firstName: 'C', lastName: 'D', avatar: null },
      ]),
      'me',
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('them');
  });

  it('filters out null entries', () => {
    const result = otherMembers(
      conversation([null, { id: 'them', firstName: 'C', lastName: 'D', avatar: null }]),
      'me',
    );
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when membersInfo is missing', () => {
    expect(otherMembers(conversation(null), 'me')).toEqual([]);
  });
});

describe('conversationDisplayName', () => {
  it('joins first and last name for a 1:1 thread', () => {
    expect(
      conversationDisplayName(
        conversation([
          { id: 'me', firstName: 'Me', lastName: 'Self', avatar: null },
          { id: 'them', firstName: 'Marta', lastName: 'Nguyen', avatar: null },
        ]),
        'me',
      ),
    ).toBe('Marta Nguyen');
  });

  it('falls back to "Unknown" for a member with no name', () => {
    expect(
      conversationDisplayName(
        conversation([{ id: 'them', firstName: null, lastName: null, avatar: null }]),
        'me',
      ),
    ).toBe('Unknown');
  });

  it('falls back to "Conversation" when there is no other member', () => {
    expect(
      conversationDisplayName(conversation([{ id: 'me', firstName: 'Me', lastName: 'Self', avatar: null }]), 'me'),
    ).toBe('Conversation');
  });
});


describe('matchesConversationSearch', () => {
  const thread = conversation([
    { id: 'me', firstName: 'Me', lastName: 'Self', avatar: null },
    { id: 'them', firstName: 'Sam', lastName: 'Rivera', avatar: null },
  ]);

  it('matches on first name', () => {
    expect(matchesConversationSearch(thread, 'me', 'sam')).toBe(true);
  });

  it('matches on last name, case-insensitively', () => {
    expect(matchesConversationSearch(thread, 'me', 'RIVERA')).toBe(true);
  });

  it('does not match an unrelated term', () => {
    expect(matchesConversationSearch(thread, 'me', 'nguyen')).toBe(false);
  });

  it('matches everything for a blank or whitespace-only term', () => {
    expect(matchesConversationSearch(thread, 'me', '')).toBe(true);
    expect(matchesConversationSearch(thread, 'me', '   ')).toBe(true);
  });

  it('never matches the caller\'s own name', () => {
    expect(matchesConversationSearch(thread, 'me', 'self')).toBe(false);
  });
});
