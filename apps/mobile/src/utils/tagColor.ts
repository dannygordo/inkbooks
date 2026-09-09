// Direct port of apps/web's utils/tagColor.js - resolveTagColor's own guard against a literal
// white tagColor exists for the same reason there: every calendar label on web is white text on
// the user's tagColor, so an unset-and-defaulted-to-white value doesn't look broken, it looks
// absent. Nothing on mobile renders white-on-tagColor text today, but this is the one place the
// server's own User.tagColor resolver's guarantee gets a client-side backstop, and porting it
// once here means the next screen that needs it (a calendar, if mobile ever gets a real one -
// see PRODUCTION_ROADMAP.md) doesn't have to rediscover the same bug.
//
// Distinct from utils/tagColors.ts (plural) - that file is the Settings swatch PICKER
// (TAG_COLORS palette + showAvailableColorTags); this one is about DISPLAYING an already-assigned
// color on a row, the same split web keeps between constants/app.js's TAG_COLORS and this file.

const UNSET_TAG_COLORS = new Set(['', '#fff', '#ffffff', '#FFF', '#FFFFFF']);

export const FALLBACK_TAG_COLOR = '#5f6368';

export function resolveTagColor(tagColor: string | null | undefined): string {
	if (!tagColor || UNSET_TAG_COLORS.has(tagColor)) {
		return FALLBACK_TAG_COLOR;
	}
	return tagColor;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const value = hex.trim().replace(/^#/, '');
	const full = value.length === 3
		? value.split('').map((c) => c + c).join('')
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

// Same low alpha as web's own TINT_ALPHA - see that file's own comment on why a low-alpha tint
// over the row background (rather than a solid fill) is what lets one fifteen-color palette stay
// legible without flipping text color per row.
const TINT_ALPHA = 0.14;

/**
 * RN style object for a list row belonging to a given artist: a tinted background plus a solid
 * left-edge bar in the full color. No `hovered` parameter - web's own second alpha tier
 * (TINT_ALPHA_HOVER) exists for mouse hover, which mobile has no equivalent of.
 *
 * @returns a style object with backgroundColor/borderLeftWidth/borderLeftColor; empty when the
 * color can't be parsed (mirrors web's own empty-object fallback).
 */
export function tagColorRowStyle(tagColor: string | null | undefined): {
	backgroundColor?: string;
	borderLeftWidth?: number;
	borderLeftColor?: string;
} {
	const rgb = hexToRgb(resolveTagColor(tagColor));
	if (!rgb) {
		return {};
	}
	return {
		backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${TINT_ALPHA})`,
		borderLeftWidth: 4,
		borderLeftColor: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
	};
}
