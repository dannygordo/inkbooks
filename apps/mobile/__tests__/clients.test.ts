import { matchesClientSearch } from '@/utils/clients';

function client(overrides: Record<string, unknown> = {}) {
  return { firstName: 'Marta', lastName: 'Nguyen', email: 'marta@example.com', ...overrides };
}

describe('matchesClientSearch', () => {
  it('matches on an empty term', () => {
    expect(matchesClientSearch(client(), '')).toBe(true);
    expect(matchesClientSearch(client(), '   ')).toBe(true);
  });

  it('matches on first name, last name, or email, case-insensitively', () => {
    expect(matchesClientSearch(client(), 'marta')).toBe(true);
    expect(matchesClientSearch(client(), 'NGUYEN')).toBe(true);
    expect(matchesClientSearch(client(), 'example.com')).toBe(true);
  });

  it('does not match an unrelated term', () => {
    expect(matchesClientSearch(client(), 'sam rivera')).toBe(false);
  });

  it('treats a missing first/last name as an empty string rather than crashing', () => {
    const noName = client({ firstName: null, lastName: null, email: 'unnamed@example.com' });
    expect(matchesClientSearch(noName, 'marta')).toBe(false);
    expect(matchesClientSearch(noName, '')).toBe(true);
    expect(matchesClientSearch(noName, 'unnamed')).toBe(true);
  });
});
