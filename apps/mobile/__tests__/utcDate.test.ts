import { formatUtcCalendarDate } from '@/utils/utcDate';

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
