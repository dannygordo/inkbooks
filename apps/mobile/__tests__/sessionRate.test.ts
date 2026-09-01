import {
	computeSessionSubtotalCents,
	formatElapsed,
	getEffectiveRate,
	getLiveElapsedSeconds,
} from '@/utils/sessionRate';

describe('getEffectiveRate', () => {
	const artist = { billingType: 'hourly', hourlyRate: 100, flatRate: 0 };
	const shop = { id: 'shop-1', billingType: 'hourly', hourlyRate: 150, flatRate: 0 };

	it('bills the artist their own rate when they have no shop', () => {
		expect(getEffectiveRate(artist, null)).toEqual({
			billingType: 'hourly',
			hourlyRate: 100,
			flatRate: 0,
			source: 'artist',
		});
	});

	it('bills the shop rate by default for a shop-connected artist', () => {
		expect(getEffectiveRate(artist, shop, [{ shopId: 'shop-1', rateSource: 'shop' }])).toEqual({
			billingType: 'hourly',
			hourlyRate: 150,
			flatRate: 0,
			source: 'shop',
		});
	});

	it("bills the artist's own rate when the connection's rateSource is 'own'", () => {
		expect(getEffectiveRate(artist, shop, [{ shopId: 'shop-1', rateSource: 'own' }])).toEqual({
			billingType: 'hourly',
			hourlyRate: 100,
			flatRate: 0,
			source: 'artist',
		});
	});

	it('defaults to the shop rate when no matching connection is found', () => {
		expect(getEffectiveRate(artist, shop, [])).toEqual({
			billingType: 'hourly',
			hourlyRate: 150,
			flatRate: 0,
			source: 'shop',
		});
	});
});

describe('computeSessionSubtotalCents', () => {
	it('computes hourly pay from elapsed seconds', () => {
		const rate = { billingType: 'hourly' as const, hourlyRate: 100, flatRate: 0, source: 'artist' as const };
		expect(computeSessionSubtotalCents(3600, rate)).toBe(10000);
	});

	it('ignores elapsed time entirely for a flat-rate artist', () => {
		const rate = { billingType: 'flat_rate' as const, hourlyRate: 100, flatRate: 250, source: 'artist' as const };
		expect(computeSessionSubtotalCents(60, rate)).toBe(25000);
	});

	it('returns zero with no effective rate', () => {
		expect(computeSessionSubtotalCents(3600, null)).toBe(0);
	});
});

describe('getLiveElapsedSeconds', () => {
	it('returns accumulatedSeconds when the timer is not running', () => {
		expect(getLiveElapsedSeconds({ accumulatedSeconds: 120, timerStatus: 'stopped' })).toBe(120);
	});

	it('adds time since timerStartedAt while running, never storing the running total itself', () => {
		const now = Date.parse('2026-08-30T12:05:00.000Z');
		const startedAt = '2026-08-30T12:00:00.000Z';
		expect(
			getLiveElapsedSeconds({ accumulatedSeconds: 60, timerStatus: 'running', timerStartedAt: startedAt }, now),
		).toBe(360);
	});
});

describe('formatElapsed', () => {
	it('formats hours unpadded and minutes/seconds zero-padded', () => {
		expect(formatElapsed(3661)).toBe('1:01:01');
	});

	it('formats zero seconds', () => {
		expect(formatElapsed(0)).toBe('0:00:00');
	});

	it('never goes negative', () => {
		expect(formatElapsed(-5)).toBe('0:00:00');
	});
});
