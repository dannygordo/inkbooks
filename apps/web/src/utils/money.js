// Client-side counterpart to server/utils/money.js. Every money value crossing the GraphQL
// boundary is integer CENTS - see that file for why cents rather than dollars or floats.
//
// The rule this module exists to enforce: cents are for storing and arithmetic, dollars are for
// display and for the value inside a dollar-denominated <input>. A dollar amount should never be
// held in a variable long enough to be summed, compared, or sent anywhere.

/**
 * Formats cents for display. Shows exact cents rather than rounding to whole dollars.
 *
 * The previous formatter was `$${Math.round(amount).toLocaleString()}` over whole-dollar values,
 * which was fine while nothing could be fractional. It isn't any more: tax and processing fees
 * make $89.50 an ordinary amount, and rounding it to "$90" on a payout screen is the kind of
 * small, constant discrepancy that makes people stop trusting the numbers.
 *
 * @param {number} cents
 * @returns {string} e.g. "$1,234.50"
 */
export function formatCents(cents) {
	const dollars = (cents || 0) / 100;
	return `$${dollars.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

/**
 * Cents -> a plain Number of dollars, for prefilling a dollar-denominated input. Never store or
 * transmit the result.
 */
export function centsToDollars(cents) {
	return (cents || 0) / 100;
}

/**
 * Dollars (typically a string straight off an <input type="number">) -> integer cents.
 * Rounds rather than truncates, so 19.999 becomes 2000 and not 1999.
 */
export function dollarsToCents(dollars) {
	const value = typeof dollars === "string" ? parseFloat(dollars) : dollars;
	if (value === null || value === undefined || Number.isNaN(value)) {
		return 0;
	}
	return Math.round(value * 100);
}
