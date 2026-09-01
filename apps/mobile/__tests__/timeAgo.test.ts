import { timeAgo } from '@/utils/timeAgo';

describe('timeAgo', () => {
  it('returns an empty string for a missing date', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(timeAgo('not-a-date')).toBe('');
  });

  it('reports "just now" for anything under a minute old', () => {
    expect(timeAgo(new Date(Date.now() - 5000).toISOString())).toBe('just now');
  });

  it('reports minutes for anything under an hour old', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 minutes ago');
  });

  it('singularizes a one-unit-ago value', () => {
    expect(timeAgo(new Date(Date.now() - 60 * 60 * 1000).toISOString())).toBe('1 hour ago');
  });

  it('reports days for anything under a week old', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())).toBe('3 days ago');
  });

  it('reports years for anything at least a year old', () => {
    expect(timeAgo(new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString())).toBe('1 year ago');
  });
});
