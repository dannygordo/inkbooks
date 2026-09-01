// Direct port of apps/web/src/components/appointments/DurationPicker.jsx's pure logic - split out
// here (not left inline in components/DurationPicker.tsx) matching this codebase's own rule for
// mobile: core logic lives in utils/, UI in components/ (see components/DurationPicker.tsx, and
// architectural comments elsewhere in this app to the same effect).
//
// MINUTES ARE THE STORAGE UNIT, HOURS AND MINUTES ARE THE INTERFACE - see web's own header
// comment for the full reasoning (a duration survives the start moving, an end time doesn't; the
// model stores minutes for the same reason - server/models/Appointment.js).

// Quarter hours. A tattoo booking is not accurate to the minute - the hours field has no upper
// bound beyond the server's own 24-hour ceiling (utils/validation.js), so any total is reachable.
export const MINUTE_STEPS = [0, 15, 30, 45] as const;

// Mirrors server/models/Appointment.js's DEFAULT_DURATION_MINUTES. Duplicated across the boundary
// rather than fetched, same reasoning as web's copy: a form needs a value before it can talk to
// anything, but the server is the authority - omitting durationMinutes entirely still gets the
// right default server-side.
export const CONSULT_DEFAULT_MINUTES = 45;
export const SESSION_DEFAULT_MINUTES = 180;

/** A human label for a stored minute count - "4 hr 30", "45 min". */
export function describeDuration(minutes: number | null | undefined): string {
	if (!minutes) {
		return '';
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (!hours) {
		return `${rest} min`;
	}
	return rest ? `${hours} hr ${rest}` : `${hours} hr`;
}

/**
 * Combines an hours field and a minutes field into a total, guarding against NaN the same way
 * web's emit() does - a blanked-out numeric input reports as an empty string upstream, and this
 * clamps that (and anything else non-finite) to 0 rather than letting a NaN total reach a mutation.
 */
export function combineDuration(hours: number, minutes: number): number {
	const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
	const m = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
	return h * 60 + m;
}

/**
 * The minute-select options to offer for a given current value - the quarter-hour steps, plus the
 * current value itself if it's off that grid (a seeded/legacy duration), so a picker never has to
 * render a value it can't represent as one of its own options.
 */
export function minuteOptionsFor(minutes: number): number[] {
	const steps: number[] = [...MINUTE_STEPS];
	if (!steps.includes(minutes)) {
		steps.push(minutes);
	}
	return steps.sort((a, b) => a - b);
}
