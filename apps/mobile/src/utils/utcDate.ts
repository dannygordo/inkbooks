// A pure calendar date - a native date-only input value, sent to the server as UTC midnight with
// no time-of-day meaning at all - reads wrong in the viewer's LOCAL timezone (rolls back a day for
// anyone west of UTC). Reading the UTC calendar fields directly (not `new Date(iso).getDate()`,
// which reads LOCAL fields) is what web's own `moment.utc(...)` achieves for the same class of
// field - see FormResponses.jsx's own "utc-ok: pure calendar date" comments, and
// RecurringExpensesPanel.jsx's identical reasoning for nextRunDate/endDate.
//
// Pulled out of utils/formAnswers.ts (where it started, forms-only) into its own module once
// RecurringExpensesPanel's mobile port needed the exact same formatting for nextRunDate/endDate -
// a second copy of the same UTC-vs-local bug fix was the wrong way to reuse it.
export function formatUtcCalendarDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	});
}
