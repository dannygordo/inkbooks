// Verbatim TypeScript port of apps/web/src/utils/sessionRate.js - see that file for the full
// reasoning behind rateSource/billingType. Used by the Session Detail screen (SessionDetail.jsx's
// mobile port) to compute the suggested subtotal from elapsed time, and to label which rate
// (shop's or the artist's own) a session bills against.

export type BillingType = 'hourly' | 'flat_rate';

export type EffectiveRate = {
	billingType: BillingType;
	hourlyRate: number;
	flatRate: number;
	source: 'artist' | 'shop';
};

type ArtistBillingInfo = {
	billingType?: string | null;
	hourlyRate?: number | null;
	flatRate?: number | null;
} | null | undefined;

type ShopBillingInfo = {
	id?: string | null;
	billingType?: string | null;
	hourlyRate?: number | null;
	flatRate?: number | null;
} | null | undefined;

type ArtistShopConnectionLike = {
	shopId: string;
	rateSource?: string | null;
};

/**
 * Which rate a session actually bills against: the shop's, or the artist's own. See
 * models/ArtistShopConnection.js's comment on rateSource for the full reasoning - an independent
 * artist (no shop) always bills their own rate; a shop-connected artist bills the shop's rate
 * UNLESS their connection's rateSource is 'own'.
 */
export function getEffectiveRate(
	artist: ArtistBillingInfo,
	shop: ShopBillingInfo,
	connections: ArtistShopConnectionLike[] = [],
): EffectiveRate {
	const artistRate: EffectiveRate = {
		billingType: (artist?.billingType as BillingType) || 'hourly',
		hourlyRate: artist?.hourlyRate || 0,
		flatRate: artist?.flatRate || 0,
		source: 'artist',
	};
	if (!shop || !shop.id) {
		return artistRate;
	}
	const connection = (connections || []).find((c) => String(c.shopId) === String(shop.id));
	const rateSource = connection?.rateSource || 'shop';
	if (rateSource === 'own') {
		return artistRate;
	}
	return {
		billingType: (shop.billingType as BillingType) || 'hourly',
		hourlyRate: shop.hourlyRate || 0,
		flatRate: shop.flatRate || 0,
		source: 'shop',
	};
}

/** The suggested subtotal from elapsed time and the effective rate - a starting point, never sent as-is without the artist confirming it via "Use Suggested". */
export function computeSessionSubtotalCents(
	elapsedSeconds: number,
	effectiveRate: EffectiveRate | null | undefined,
): number {
	if (!effectiveRate) {
		return 0;
	}
	if (effectiveRate.billingType === 'flat_rate') {
		return Math.round((effectiveRate.flatRate || 0) * 100);
	}
	const hours = Math.max(0, elapsedSeconds || 0) / 3600;
	return Math.round(hours * (effectiveRate.hourlyRate || 0) * 100);
}

type TimerLike = {
	accumulatedSeconds?: number | null;
	timerStatus?: string | null;
	timerStartedAt?: string | null;
};

/**
 * The live elapsed total, recomputed fresh on every call - never itself stored or trusted from a
 * mutation response. While the timer isn't running, this is just accumulatedSeconds; while
 * running, it's accumulatedSeconds plus however long it's been since timerStartedAt.
 */
export function getLiveElapsedSeconds(appointment: TimerLike | null | undefined, now: number = Date.now()): number {
	const accumulated = appointment?.accumulatedSeconds || 0;
	if (appointment?.timerStatus !== 'running' || !appointment?.timerStartedAt) {
		return accumulated;
	}
	const startedAt = new Date(appointment.timerStartedAt).getTime();
	const runningSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	return accumulated + runningSeconds;
}

/** "H:MM:SS" - hours unpadded, minutes/seconds zero-padded, matching web's formatElapsed exactly. */
export function formatElapsed(totalSeconds: number | null | undefined): string {
	const seconds = Math.max(0, Math.floor(totalSeconds || 0));
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${hrs}:${pad(mins)}:${pad(secs)}`;
}
