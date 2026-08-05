/**
 * Money is stored in integer cents everywhere in this codebase. Nothing stores dollars.
 *
 * Why: the previous representation was whole dollars in a GraphQL `Int`, which quietly ruled out
 * ever representing $89.50 - and the moment tax and processing fees enter the picture, fractional
 * dollars stop being avoidable. Switching to a float would trade that for the usual binary
 * rounding drift, which is worst precisely where it matters here: a percentage-based shop cut is
 * a multiply followed by a comparison against what was actually collected, and 0.1 + 0.2 problems
 * turn into "the ledger says the artist owes $89.99999999". Integer cents has neither problem,
 * and it's the unit Square's API already speaks (`amount_money.amount`), so the payment boundary
 * stops needing a conversion at all.
 *
 * Every persisted money field carries a `Cents` suffix. That's deliberate and worth keeping:
 * the failure mode of a units migration is a call site that still treats the value as dollars and
 * is off by 100x, silently, in a financial record. A rename makes every such site a hard
 * reference error rather than a wrong number.
 */

// Converts a user-entered dollar amount (a string from an <input type="number">, or a number) to
// integer cents. Rounds rather than truncates so 19.999 -> 2000, not 1999.
function dollarsToCents(dollars) {
  const value = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100);
}

// Cents -> a Number of dollars. For DISPLAY and for feeding a dollar-denominated input only -
// never store the result. Anything that round-trips through this loses the exactness the cents
// representation exists to provide.
function centsToDollars(cents) {
  return (cents || 0) / 100;
}

// Applies a percentage to a cents amount and returns cents, rounding to the nearest cent. Kept
// here rather than inline at the call site so every percentage split in the app rounds the same
// way - a shop cut computed one way in the ledger and another way on a dashboard is the kind of
// discrepancy that costs someone an argument with their shop.
function percentOfCents(cents, percent) {
  if (!cents || !percent) {
    return 0;
  }
  return Math.round((cents * percent) / 100);
}

/**
 * For display - notification titles, email subjects.
 *
 * Lives here rather than being written inline wherever it's needed, because
 * `$${(cents / 100).toFixed(2)}` appearing in six places is six chances for one of them to divide
 * by the wrong number or forget the decimals. utils/email.js already had its own copy; that is one
 * copy too many for a formatting rule that is this easy to get subtly wrong.
 */
function formatCents(cents) {
  return `$${((cents || 0) / 100).toFixed(2)}`;
}

module.exports = { dollarsToCents, centsToDollars, percentOfCents, formatCents };
