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

// Parses #rgb or #rrggbb into {r,g,b}. Returns null for anything it doesn't recognise, so callers
// can fall back rather than rendering "rgba(NaN, NaN, NaN, 0.14)" - which browsers drop silently,
// leaving a row with no tint and no clue why.
function hexToRgb(hex) {
	if (typeof hex !== "string") {
		return null;
	}
	const value = hex.trim().replace(/^#/, "");
	const full =
		value.length === 3
			? value
					.split("")
					.map((c) => c + c)
					.join("")
			: value;
	if (!/^[0-9a-fA-F]{6}$/.test(full)) {
		return null;
	}
	return {
		r: parseInt(full.slice(0, 2), 16),
		g: parseInt(full.slice(2, 4), 16),
		b: parseInt(full.slice(4, 6), 16),
	};
}

// How strongly a row is tinted at rest and on hover. Low on purpose.
//
// The palette runs from #122152 (near-black navy) to #e2d355 (pale banana), a luminance spread
// wide enough that no single text colour is readable on all fifteen at full saturation. Painting
// rows solid would force the text colour to flip per row based on luminance - legible, but a list
// then reads as a stack of paint chips with the type colour changing line to line.
//
// A low-alpha tint over white sidesteps that entirely: the resulting background stays light for
// every palette entry, so the text colour never has to change, and the artist is still identified
// at a glance. The full-strength colour goes on a solid left bar instead, where saturation reads
// as a marker rather than competing with the text sitting on top of it.
const TINT_ALPHA = 0.14;
const TINT_ALPHA_HOVER = 0.24;

/**
 * Inline style for a list row belonging to a given artist: a tinted background plus a solid
 * left-edge bar in the full colour.
 *
 * Returned as an inline style rather than a CSS class because the value is per-artist data, not
 * one of a fixed set of states - there's no stylesheet rule that can know an arbitrary hex ahead
 * of time. Everything that ISN'T colour (padding, radius, layout, transition) stays in the
 * stylesheet where it belongs.
 *
 * @param {string|null|undefined} tagColor - raw User.tagColor
 * @param {boolean} hovered
 * @returns {object} a React style object; empty when the colour can't be parsed
 */
export function tagColorRowStyle(tagColor, hovered = false) {
	const rgb = hexToRgb(resolveTagColor(tagColor));
	if (!rgb) {
		return {};
	}
	const alpha = hovered ? TINT_ALPHA_HOVER : TINT_ALPHA;
	return {
		backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`,
		borderLeft: `4px solid rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
	};
}
