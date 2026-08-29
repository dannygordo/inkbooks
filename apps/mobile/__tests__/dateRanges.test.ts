import { getThisWeekFilter } from '@/utils/dateRanges';

describe('getThisWeekFilter', () => {
  it('returns the Monday-start, half-open bounds of the week containing the given date', () => {
    // A Thursday (2026-08-27) - the week is Mon 2026-08-24 through (exclusive) Mon 2026-08-31.
    const filter = getThisWeekFilter(new Date('2026-08-27T15:30:00.000Z'));
    expect(new Date(filter.from).getDay()).toBe(1); // Monday
    expect(new Date(filter.from).getHours()).toBe(0);
    expect(new Date(filter.to).getTime() - new Date(filter.from).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('treats a Sunday as the last day of the week it belongs to, not the first of the next', () => {
    // 2026-08-30 is a Sunday - same ISO week as the Thursday above, so it must produce the same
    // Monday start. Getting this wrong (treating Sunday as day 0 of a NEW week) was the actual
    // off-by-one risk in the getDay()-based calculation this ports from moment's isoWeek.
    const filter = getThisWeekFilter(new Date('2026-08-30T12:00:00.000Z'));
    expect(new Date(filter.from).getDate()).toBe(24);
    expect(new Date(filter.from).getDay()).toBe(1);
  });

  it('starts a Monday on itself', () => {
    const filter = getThisWeekFilter(new Date('2026-08-24T08:00:00.000Z'));
    expect(new Date(filter.from).getDate()).toBe(24);
  });
});
