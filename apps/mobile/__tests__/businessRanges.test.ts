import { buildPresetRanges, getDefaultRange } from '@/utils/businessRanges';

// 2026-03-17 - mid-quarter, mid-year, so every preset's boundary lands somewhere non-trivial.
const NOW = new Date(2026, 2, 17);

describe('buildPresetRanges', () => {
	it('builds this_month as the calendar month containing now, half-open', () => {
		const range = buildPresetRanges(NOW).find((r) => r.key === 'this_month')!;
		expect(range.start).toEqual(new Date(2026, 2, 1));
		expect(range.end).toEqual(new Date(2026, 3, 1));
	});

	it('builds last_month as the full prior calendar month', () => {
		const range = buildPresetRanges(NOW).find((r) => r.key === 'last_month')!;
		expect(range.start).toEqual(new Date(2026, 1, 1));
		expect(range.end).toEqual(new Date(2026, 2, 1));
	});

	it('builds this_quarter starting at the quarter boundary, not the month', () => {
		const range = buildPresetRanges(NOW).find((r) => r.key === 'this_quarter')!;
		expect(range.start).toEqual(new Date(2026, 0, 1));
		expect(range.end).toEqual(new Date(2026, 3, 1));
	});

	it('builds year_to_date from January 1st through the start of next year', () => {
		const range = buildPresetRanges(NOW).find((r) => r.key === 'year_to_date')!;
		expect(range.start).toEqual(new Date(2026, 0, 1));
		expect(range.end).toEqual(new Date(2027, 0, 1));
	});

	it('builds last_12_months as twelve whole months, not twelve months and a fraction', () => {
		const range = buildPresetRanges(NOW).find((r) => r.key === 'last_12_months')!;
		expect(range.start).toEqual(new Date(2025, 3, 1));
		expect(range.end).toEqual(new Date(2026, 3, 1));
	});
});

describe('getDefaultRange', () => {
	it('defaults to this_month, matching web exactly', () => {
		expect(getDefaultRange(NOW).key).toBe('this_month');
	});
});
