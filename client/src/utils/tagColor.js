// Last-resort display fallback for a user's calendar tag color.
//
// The real guarantee lives on the server: the User.tagColor field resolver (server/graphql/
// resolvers/index.js) assigns and persists a shop-unique color for anyone still missing one, and
// scripts/backfill-tag-colors.js does the same in bulk. By the time a color reaches this client it
// should already be real.
//
// This exists anyway because the failure mode is uniquely bad and uniquely silent. Every calendar
// label is white text on the user's tagColor, so the one value that must never appear here is
// white - and white is exactly what the old default was. When that happened the label didn't look
// broken, it looked absent: the appointment was in the DOM, took up space, and responded to hover
// (its MUI tooltip still rendered), but showed nothing at all. An artist reported it as
// "appointments missing from the calendar", not as a color bug. A component reading tagColor
// straight into a style has no way to distinguish "not set" from "set to white", so the check
// belongs in one shared place rather than as an ad-hoc `|| '#999'` repeated per component (which
// is what ViewEventDialog.jsx had, and which doesn't catch a literal white at all).
//
// The fallback is a mid-tone grey rather than a palette color on purpose: it should read as
// "this artist has no color assigned" to anyone looking at it, not quietly impersonate a real
// assignment and hide that the data still needs fixing.

const UNSET_TAG_COLORS = new Set(['', '#fff', '#ffffff', '#FFF', '#FFFFFF']);

export const FALLBACK_TAG_COLOR = '#5f6368';

/**
 * @param {string|null|undefined} tagColor - the raw User.tagColor off a GraphQL result
 * @returns {string} a hex color that is guaranteed to be legible under white text
 */
export function resolveTagColor(tagColor) {
	if (!tagColor || UNSET_TAG_COLORS.has(tagColor)) {
		return FALLBACK_TAG_COLOR;
	}
	return tagColor;
}
