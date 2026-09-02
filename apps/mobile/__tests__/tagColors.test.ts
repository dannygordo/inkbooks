import { showAvailableColorTags, TAG_COLORS } from '@/utils/tagColors';

describe('showAvailableColorTags', () => {
  it('lists every color as available when nobody has taken any', () => {
    const result = showAvailableColorTags([], null);
    expect(result).toHaveLength(TAG_COLORS.length);
  });

  it("puts the caller's own current color first, never filtered out as taken", () => {
    const mine = TAG_COLORS[3].value;
    const result = showAvailableColorTags([{ tagColor: mine }], mine);
    expect(result[0].value).toBe(mine);
    expect(result).toHaveLength(TAG_COLORS.length);
  });

  it('hides colors a shop-mate already has, but not the ones nobody has taken', () => {
    const taken = TAG_COLORS[0].value;
    const result = showAvailableColorTags([{ tagColor: taken }], null);
    expect(result.some((tag) => tag.value === taken)).toBe(false);
    expect(result).toHaveLength(TAG_COLORS.length - 1);
  });

  it('treats a shop-less caller (no used tags at all) as everything available', () => {
    expect(showAvailableColorTags([], undefined)).toHaveLength(TAG_COLORS.length);
  });
});
