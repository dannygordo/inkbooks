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

// Same UTC-fields-not-local-fields technique as formatUtcCalendarDate, different display shape -
// BoothRentPanel's periodMonth is a whole-month value (always the 1st) where showing a day number
// at all would be misleading, matching web's own `moment(periodMonth).utc().format("MMMM YYYY")`.
// See settings/rates.tsx's booth rent section (DECISIONS.md X45).
export function formatUtcMonthYear(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

// Same technique again, no year - BoothRentPanel's due-date column ("due Jul 1"), matching web's
// own `moment(dueDate).utc().format("MMM D")`. Not formatUtcCalendarDate: that always includes a
// year, which web's own due-date column deliberately omits (the period column right next to it
// already carries the year).
export function formatUtcMonthDay(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	});
}
