// Direct port of apps/web/src/constants/app.js's APP_SETTINGS_CONSTANTS.PROJECT_STATUS, keyed by
// value for a plain lookup.
//
// NOT a port of UtilsService._prettyConstantsListValue, which is how Projects.jsx and Search.jsx
// actually render this column on web today - that helper checks `item.VALUE`/`item.LABEL`
// (uppercase), but every entry in PROJECT_STATUS (and everywhere else in constants/app.js) uses
// lowercase `value`/`label`. The comparison never matches, so both web pages' status columns have
// rendered as an empty string for every project, unconditionally, since that helper was written -
// not ported here. This is a real web bug, out of scope for this mobile-port slice (see
// DECISIONS.md X20's own note) - flagged here rather than fixed on web without being asked.
const PROJECT_STATUS_LABELS: Record<string, string> = {
	open: 'Open',
	in_progress: 'In Progress',
	waitlist: 'Waitlist',
	cancelled: 'Cancelled',
	completed: 'Completed',
};

export function projectStatusLabel(status: string | null | undefined): string {
	if (!status) {
		return '';
	}
	return PROJECT_STATUS_LABELS[status] ?? status;
}
