// Pure logic for the in-project session view (see pages/projects/ProjectSessions.jsx and
// SessionDetail.jsx) - which hourly/flat rate actually applies to a given session, and what a
// session's timer total comes out to once that rate is known.
//
// Kept as a standalone, dependency-free module (no React, no Apollo) so it can be unit-tested and
// reasoned about without mounting a component - the two things it decides (whose rate applies,
// and what that rate computes to in dollars) are exactly the kind of small pure logic this app's
// test setup already favors testing directly (see PRODUCTION_ROADMAP.md's testing section).

/**
 * Decides whether the shop's rate or the artist's own rate applies to a session, per
 * ArtistShopConnection.rateSource (see models/ArtistShopConnection.js). Independent artists (no
 * shop on the project at all) always use their own rate - there's no connection to check.
 *
 * @param {{hourlyRate?: number, flatRate?: number, billingType?: string}} artist
 * @param {{id?: string, hourlyRate?: number, flatRate?: number, billingType?: string}|null|undefined} shop
 * @param {Array<{shopId: string, rateSource: string}>} connections - this artist's
 *   ArtistShopConnection records (from ArtistShopConnectionService.fetchArtistShopConnections)
 * @returns {{billingType: string, hourlyRate: number, flatRate: number, source: 'artist'|'shop'}}
 */
export function getEffectiveRate(artist, shop, connections = []) {
	const artistRate = {
		billingType: artist?.billingType || 'hourly',
		hourlyRate: artist?.hourlyRate || 0,
		flatRate: artist?.flatRate || 0,
		source: 'artist',
	};
	if (!shop || !shop.id) {
		return artistRate;
	}
	const connection = (connections || []).find(
		(c) => String(c.shopId) === String(shop.id)
	);
	// Default to 'shop' when no connection record is found (or rateSource is unset) - matches
	// ArtistShopConnection.rateSource's own schema default, see models/ArtistShopConnection.js.
	const rateSource = connection?.rateSource || 'shop';
	if (rateSource === 'own') {
		return artistRate;
	}
	return {
		billingType: shop.billingType || 'hourly',
		hourlyRate: shop.hourlyRate || 0,
		flatRate: shop.flatRate || 0,
		source: 'shop',
	};
}

/**
 * Computes a session's dollar total from elapsed time and an effective rate. Whole-dollar
 * rounding matches how Appointment.total is stored (Int, not Float/cents - see
 * ArtistPerformancePanel's formatCurrency usage, which treats `total` as whole dollars already).
 *
 * @param {number} elapsedSeconds
 * @param {{billingType: string, hourlyRate: number, flatRate: number}} effectiveRate
 * @returns {number}
 */
export function computeSessionTotal(elapsedSeconds, effectiveRate) {
	if (!effectiveRate) {
		return 0;
	}
	if (effectiveRate.billingType === 'flat_rate') {
		return Math.round(effectiveRate.flatRate || 0);
	}
	const hours = Math.max(0, elapsedSeconds || 0) / 3600;
	return Math.round(hours * (effectiveRate.hourlyRate || 0));
}

/**
 * Live elapsed seconds for a session's timer - accumulatedSeconds (banked from prior start/stop
 * cycles) plus whatever's elapsed in the current running interval, if any. Never stored while
 * running (see models/Appointment.js's comment) - only ever computed on read, here and on the
 * server's stopSessionTimer resolver (server/graphql/mutations/appointments.js).
 *
 * @param {{timerStatus: string, timerStartedAt: string|Date|null, accumulatedSeconds: number}} appointment
 * @param {number} [now] - defaults to Date.now(), overridable for tests
 * @returns {number}
 */
export function getLiveElapsedSeconds(appointment, now = Date.now()) {
	const accumulated = appointment?.accumulatedSeconds || 0;
	if (appointment?.timerStatus !== 'running' || !appointment?.timerStartedAt) {
		return accumulated;
	}
	const startedAt = new Date(appointment.timerStartedAt).getTime();
	const runningSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	return accumulated + runningSeconds;
}

/**
 * Formats a seconds count as H:MM:SS for the timer display.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatElapsed(totalSeconds) {
	const seconds = Math.max(0, Math.floor(totalSeconds || 0));
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const pad = (n) => String(n).padStart(2, '0');
	return `${hrs}:${pad(mins)}:${pad(secs)}`;
}
