import { formatUtcCalendarDate, formatUtcMonthDay, formatUtcMonthYear } from '@/utils/utcDate';

describe('formatUtcCalendarDate', () => {
	it('reads the UTC calendar date, not the local one', () => {
		// Local-time reads risk rolling this back to Dec 31 west of UTC - the whole reason this
		// function exists (see its own header comment).
		expect(formatUtcCalendarDate('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026');
	});

	it('formats a mid-year date', () => {
		expect(formatUtcCalendarDate('2026-07-04T00:00:00.000Z')).toBe('Jul 4, 2026');
	});
});

describe('formatUtcMonthYear', () => {
	it('reads the UTC calendar month, not the local one', () => {
		// Same west-of-UTC rollback risk as formatUtcCalendarDate - a booth-rent periodMonth of
		// 2026-01-01T00:00:00.000Z must never read back as December 2025.
		expect(formatUtcMonthYear('2026-01-01T00:00:00.000Z')).toBe('January 2026');
	});

	it('spells out the full month name, no day number', () => {
		expect(formatUtcMonthYear('2026-07-01T00:00:00.000Z')).toBe('July 2026');
	});
});

describe('formatUtcMonthDay', () => {
	it('reads the UTC calendar day, not the local one', () => {
		expect(formatUtcMonthDay('2026-01-01T00:00:00.000Z')).toBe('Jan 1');
	});

	it('formats a mid-year date with no year', () => {
		expect(formatUtcMonthDay('2026-07-04T00:00:00.000Z')).toBe('Jul 4');
	});
});
