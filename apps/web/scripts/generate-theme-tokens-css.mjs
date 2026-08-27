// Regenerates client/src/theme/tokens.css from client/src/theme/tokens.mjs, the single plain-value
// source of truth (see that file's own header for why it exists). Run with `npm run
// tokens:generate` from client/ after editing tokens.mjs - never hand-edit tokens.css directly,
// the next regeneration will silently overwrite it.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { light, dark } from "../src/theme/tokens.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../src/theme/tokens.css");

// --ib-* custom properties only - primaryLight exists solely for MUI's palette.primary.light
// (theme.js) and has no CSS-side equivalent, so it's deliberately excluded here.
const CSS_FIELD_ORDER = [
	"surfacePage",
	"surfaceCard",
	"surfaceSubtle",
	"surfaceHover",
	"border",
	"borderStrong",
	"textPrimary",
	"textSecondary",
	"textMuted",
	"textDisabled",
	"primary",
	"primaryHover",
	"primaryBg",
	"primaryBorder",
	"primaryContrast",
	"primaryDisabled",
	"error",
	"errorDark",
	"errorBg",
	"success",
	"successBg",
	"successBorder",
	"archivedBg",
	"archivedText",
	"shadowColor",
];

// A blank line groups fields the same way the hand-written original did - keyed on the field that
// STARTS a new group.
const GROUP_STARTS = new Set([
	"border",
	"textPrimary",
	"primary",
	"error",
	"success",
	"archivedBg",
	"shadowColor",
]);

// Per-field, per-mode explanatory comments, positioned exactly where the original hand-written
// file had them (asymmetric between light/dark on purpose - each explains the choice specific to
// that mode, not a generic restatement).
const COMMENTS = {
	light: {
		primaryDisabled:
			"A disabled primary button's own fill - deliberately not just text-disabled or a\n" +
			"  mid-gray, the way the pre-copper app used #9dc2f2 for a washed-out blue. Same hue,\n" +
			"  less saturation, so a disabled \"Pay\" button still visually reads as the primary\n" +
			"  action, just not an available one.",
		archivedBg:
			'"Archived" badge - a muted gold, deliberately NOT primary (an archived tag reading as\n' +
			"  clickable/actionable would be the wrong signal) and not gray (loses the \"this used to\n" +
			"  matter\" warmth an archive implies vs. a plain disabled state).",
	},
	dark: {
		primaryContrast:
			"Light copper needs dark text to hold contrast, not white - see theme.js's dark\n" +
			"  palette for the same call on MUI's own primary.contrastText.",
		shadowColor:
			"Dark mode's own drop shadows are heavier and slightly cooler than a straight\n" +
			"  light-mode black - this is the one deliberate exception noted above, kept as a\n" +
			"  variable rather than a literal so it stays discoverable from this file instead of\n" +
			"  hidden in whichever component needed it first.",
	},
};

function kebab(field) {
	return field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function renderBlock(tokens, mode) {
	const lines = [];
	for (const field of CSS_FIELD_ORDER) {
		if (GROUP_STARTS.has(field) && lines.length > 0) {
			lines.push("");
		}
		const comment = COMMENTS[mode] && COMMENTS[mode][field];
		if (comment) {
			const wrapped = comment.split("\n").map((line) => line.replace(/^\s{2}/, "     "));
			lines.push(`  /* ${wrapped.join("\n")} */`);
		}
		lines.push(`  --ib-${kebab(field)}: ${tokens[field]};`);
	}
	return lines.join("\n");
}

const header = `/* InkBooks design tokens - light and dark.
 *
 * GENERATED FILE. Source of truth is tokens.mjs in this same directory - edit there, then run
 * \`npm run tokens:generate\` from client/. Do not hand-edit this file; the next regeneration
 * overwrites it.
 *
 * Built around the register wizard's blue originally, then rebuilt around a dark copper primary
 * (#9c5a30) at the shop's direction, with every other color matched off that scheme rather than
 * left as whatever the previous 67-file, 475-hex-literal sprawl happened to land on. See
 * DECISIONS.md for the reasoning that isn't captured by a color value alone - this file only
 * carries the values.
 *
 * ONE ATTRIBUTE DRIVES BOTH SYSTEMS. \`[data-theme]\` on <html> is read here directly by every plain
 * .css file in this app, AND by MUI's own cssVariables config (theme.js's \`colorSchemeSelector:
 * "data-theme"\`) - so a single toggle in Settings flips the hand-rolled CSS and every MUI
 * component's palette together. Two separate theme systems that don't share a switch is how they
 * drift apart; this is the one place that switch lives. theme.js's own palette now imports
 * tokens.mjs directly rather than hardcoding a second copy, for the same reason.
 *
 * NAMING: --ib-* prefix throughout, so nothing here collides with MUI's own --mui-palette-* custom
 * properties once cssVariables is on - both live on :root/[data-theme] at once.
 *
 * MAPPING FOR THE CSS SWEEP (client/src's existing 67 files, ~475 hardcoded hex literals):
 *   #333 #444 #222                     -> var(--ib-text-primary)
 *   #555 #666 #6b6b6b #777             -> var(--ib-text-secondary)
 *   #888 #999                          -> var(--ib-text-muted)
 *   #bbb #ccc                          -> var(--ib-border-strong)
 *   #ddd                               -> var(--ib-border)
 *   #eee #f2f2f2 #eef0f3               -> var(--ib-surface-subtle)
 *   #f0f2f5 #f8f9fb                    -> var(--ib-surface-page)
 *   #fff (surface, not text)           -> var(--ib-surface-card)
 *   #1775ee                            -> var(--ib-primary)
 *   #1465cc                            -> var(--ib-primary-hover)
 *   #d32f2f                            -> var(--ib-error)
 *   #861d15                            -> var(--ib-error-dark)
 *   #fdeded                            -> var(--ib-error-bg)
 *   #1b8a3e                            -> var(--ib-success)
 *   #e6f6ea                            -> var(--ib-success-bg)
 *   #b6e6c3                            -> var(--ib-success-border)
 *   rgba(0,0,0,N) in box-shadow        -> LEAVE ALONE. Shadows stay neutral-black-tinted in both
 *                                          modes (dark mode uses a heavier alpha, not a color swap
 *                                          - see --ib-shadow-color below for the one exception).
 */
`;

const css = `${header}
:root {
${renderBlock(light, "light")}
}

[data-theme="dark"] {
${renderBlock(dark, "dark")}
}
`;

writeFileSync(outPath, css);
console.log(`Wrote ${outPath}`);
