import { formatImagePathForFirebaseStorage } from '@/utils/imagePath';

describe('formatImagePathForFirebaseStorage', () => {
  it('replaces whitespace runs with a single underscore', () => {
    expect(formatImagePathForFirebaseStorage('shop-1/artist-1/project-1/Finished Tattoo')).toBe(
      'shop-1/artist-1/project-1/Finished_Tattoo',
    );
  });

  it('trims leading and trailing whitespace before replacing', () => {
    expect(formatImagePathForFirebaseStorage('  References  ')).toBe('References');
  });

  it('collapses multiple consecutive spaces into one underscore', () => {
    expect(formatImagePathForFirebaseStorage('a   b')).toBe('a_b');
  });

  it('leaves a path with no whitespace unchanged', () => {
    expect(formatImagePathForFirebaseStorage('independent/artist-1/project-1/Design')).toBe(
      'independent/artist-1/project-1/Design',
    );
  });
});
