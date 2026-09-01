// Direct port of apps/web/src/utils/money.js - all money in this app is integer CENTS
// (server/utils/money.js), and this is the one place cents<->dollars conversion happens on
// mobile, matching web's own "one place" reasoning for the same helpers.

export function formatCents(cents: number | null | undefined): string {
	const dollars = (cents || 0) / 100;
	return `$${dollars.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

export function centsToDollars(cents: number | null | undefined): number {
	return (cents || 0) / 100;
}

/**
 * Guarded against NaN the same way web's version is - a cleared numeric input reports as an
 * empty string, and this clamps that (and anything else unparseable) to 0 rather than letting a
 * NaN cents value reach a mutation.
 */
export function dollarsToCents(dollars: string | number | null | undefined): number {
	const value = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
	if (value === null || value === undefined || Number.isNaN(value)) {
		return 0;
	}
	return Math.round(value * 100);
}
