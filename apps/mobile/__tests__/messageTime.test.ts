import { fullMessageTime, prettyMessageTime } from '@/utils/messageTime';

function daysAgo(n: number, hour = 15, minute = 30): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

const TIME_OPTS = { hour: 'numeric', minute: '2-digit' } as const;

describe('prettyMessageTime', () => {
  it('returns an empty string for a missing or unparseable date', () => {
    expect(prettyMessageTime(null)).toBe('');
    expect(prettyMessageTime(undefined)).toBe('');
    expect(prettyMessageTime('not-a-date')).toBe('');
  });

  it('shows just the time of day for a message from today', () => {
    const today = daysAgo(0);
    expect(prettyMessageTime(today)).toBe(today.toLocaleTimeString(undefined, TIME_OPTS));
  });

  it('prefixes "Yesterday" for a message from the day before', () => {
    const yesterday = daysAgo(1);
    expect(prettyMessageTime(yesterday)).toBe(
      `Yesterday ${yesterday.toLocaleTimeString(undefined, TIME_OPTS)}`,
    );
  });

  it('shows a weekday, not "Yesterday" or a bare time, for a message within the last week', () => {
    const threeDaysAgo = daysAgo(3);
    const result = prettyMessageTime(threeDaysAgo);
    expect(result).toBe(
      `${threeDaysAgo.toLocaleDateString(undefined, { weekday: 'short' })} ${threeDaysAgo.toLocaleTimeString(undefined, TIME_OPTS)}`,
    );
    expect(result).not.toContain('Yesterday');
  });

  it('shows a month/day (no year) for an older message still in the current year', () => {
    const monthAgo = daysAgo(40);
    // Guarded: 40 days before "now" only lands in the current year outside early January, and
    // this suite doesn't run against a frozen clock.
    if (monthAgo.getFullYear() === new Date().getFullYear()) {
      expect(prettyMessageTime(monthAgo)).toBe(
        `${monthAgo.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${monthAgo.toLocaleTimeString(undefined, TIME_OPTS)}`,
      );
    }
  });

  it('includes the year for a message from a previous year', () => {
    const lastYear = daysAgo(400);
    expect(prettyMessageTime(lastYear)).toBe(
      `${lastYear.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${lastYear.toLocaleTimeString(undefined, TIME_OPTS)}`,
    );
  });
});

describe('fullMessageTime', () => {
  it('returns an empty string for a missing or unparseable date', () => {
    expect(fullMessageTime(null)).toBe('');
    expect(fullMessageTime('not-a-date')).toBe('');
  });

  it('spells out the full weekday/month/date/year and time', () => {
    const date = daysAgo(10);
    expect(fullMessageTime(date)).toBe(
      `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString(undefined, TIME_OPTS)}`,
    );
  });
});
