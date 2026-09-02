import { avatarFolder, avatarInitials, previousAvatarUrl } from '@/utils/avatar';

describe('avatarFolder', () => {
  it('keys storage under the shop id when the artist has one', () => {
    expect(avatarFolder('artist-1', 'shop-1')).toBe('shop-1/artist-1/profile');
  });

  it("falls back to 'independent' with no shop id", () => {
    expect(avatarFolder('artist-1', undefined)).toBe('independent/artist-1/profile');
  });
});

describe('previousAvatarUrl', () => {
  it("returns the user's stored avatar url", () => {
    expect(previousAvatarUrl({ avatar: 'https://example.com/a.jpg' })).toBe(
      'https://example.com/a.jpg',
    );
  });

  it('returns null for a user with no avatar, rather than an empty string', () => {
    expect(previousAvatarUrl({ avatar: null })).toBeNull();
    expect(previousAvatarUrl({ avatar: undefined })).toBeNull();
    expect(previousAvatarUrl(null)).toBeNull();
  });
});

describe('avatarInitials', () => {
  it('uppercases the first letter of each name', () => {
    expect(avatarInitials('gordo', 'schreiber')).toBe('GS');
  });

  it('handles a missing last name', () => {
    expect(avatarInitials('Gordo', null)).toBe('G');
  });

  it("falls back to '?' when neither name is present", () => {
    expect(avatarInitials(null, undefined)).toBe('?');
    expect(avatarInitials('', '')).toBe('?');
  });
});
