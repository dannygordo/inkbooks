import { combineDuration, describeDuration, minuteOptionsFor } from '@/utils/duration';

describe('describeDuration', () => {
	it('describes a whole-hour duration', () => {
		expect(describeDuration(240)).toBe('4 hr');
	});

	it('describes hours and minutes', () => {
		expect(describeDuration(270)).toBe('4 hr 30');
	});

	it('describes a sub-hour duration', () => {
		expect(describeDuration(45)).toBe('45 min');
	});

	it('describes falsy input as empty', () => {
		expect(describeDuration(0)).toBe('');
		expect(describeDuration(null)).toBe('');
		expect(describeDuration(undefined)).toBe('');
	});
});

describe('combineDuration', () => {
	it('combines hours and minutes into a total', () => {
		expect(combineDuration(2, 30)).toBe(150);
	});

	it('treats a NaN hours field as zero rather than sailing a NaN total through', () => {
		expect(combineDuration(NaN, 30)).toBe(30);
	});

	it('clamps a negative value to zero', () => {
		expect(combineDuration(-1, 30)).toBe(30);
	});
});

describe('minuteOptionsFor', () => {
	it('returns the quarter-hour steps for an on-grid value', () => {
		expect(minuteOptionsFor(30)).toEqual([0, 15, 30, 45]);
	});

	it('adds an off-grid legacy value rather than hiding it', () => {
		expect(minuteOptionsFor(20)).toEqual([0, 15, 20, 30, 45]);
	});
});
