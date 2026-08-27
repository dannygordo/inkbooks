/**
 * InkBooks design tokens - the single, plain-value source of truth for theming.
 *
 * WHY THIS EXISTS, AND WHY IT'S A PLAIN JS MODULE, NOT JUST CSS. tokens.css (this same directory)
 * is now GENERATED from this file - see scripts/generate-theme-tokens-css.mjs and package.json's
 * "tokens:generate" - and theme.js's MUI palette now imports these values directly too, instead of
 * each hand-maintaining its own copy of the same hex values (theme.js's own prior comment said as
 * much: "duplicated rather than read from... keep the two in sync by hand"). That was the drift
 * risk DECISIONS.md's X3 calls out, closed now rather than left for mobile theming (Tamagui/React
 * Native Paper, Phase 5) to rediscover from scratch - CSS custom properties don't exist in React
 * Native, so a plain-JS source was always going to be needed there. This is that source, staged
 * ahead of the monorepo split (moves into packages/shared verbatim once that exists).
 *
 * Do not hand-edit tokens.css. Edit here, then run `npm run tokens:generate` from client/.
 *
 * primaryLight exists only for MUI's palette.primary.light (theme.js) - there's no equivalent
 * --ib-* custom property in tokens.css, so the CSS generator below leaves it out of that output.
 */

export const light = {
	surfacePage: "#f5f1ec",
	surfaceCard: "#ffffff",
	surfaceSubtle: "#efe7de",
	surfaceHover: "#f0e6d8",

	border: "#e0d5c8",
	borderStrong: "#c9b8a4",

	textPrimary: "#2a201a",
	textSecondary: "#6b5c4e",
	textMuted: "#9c8b7a",
	textDisabled: "#c2b6a8",

	primary: "#9c5a30",
	primaryHover: "#7e4726",
	primaryLight: "#c9986a",
	primaryBg: "#f7ece3",
	primaryBorder: "#e0c4a8",
	primaryContrast: "#ffffff",
	// A disabled primary button's own fill - deliberately not just textDisabled or a mid-gray, the
	// way the pre-copper app used #9dc2f2 for a washed-out blue. Same hue, less saturation, so a
	// disabled "Pay" button still visually reads as the primary action, just not an available one.
	primaryDisabled: "#d9b89a",

	error: "#b3452e",
	errorDark: "#7a2e1c",
	errorBg: "#fbeae5",

	success: "#4a7043",
	successBg: "#eaf0e2",
	successBorder: "#c3d6b0",

	// "Archived" badge - a muted gold, deliberately NOT primary (an archived tag reading as
	// clickable/actionable would be the wrong signal) and not gray (loses the "this used to
	// matter" warmth an archive implies vs. a plain disabled state).
	archivedBg: "#f0e0c0",
	archivedText: "#7a5a12",

	shadowColor: "0, 0, 0",
};

export const dark = {
	surfacePage: "#1a1512",
	surfaceCard: "#241c17",
	surfaceSubtle: "#2e2620",
	surfaceHover: "#362c24",

	border: "#453a30",
	borderStrong: "#5c4d3f",

	textPrimary: "#f3ece4",
	textSecondary: "#c4b3a1",
	textMuted: "#8f7c6a",
	textDisabled: "#5c4d3f",

	primary: "#d38a51",
	primaryHover: "#e29e68",
	primaryLight: "#e0a874",
	primaryBg: "#3a2a1c",
	primaryBorder: "#5c4530",
	// Light copper needs dark text to hold contrast, not white - see theme.js's own prior comment
	// on why primary.contrastText follows the same rule for MUI's components.
	primaryContrast: "#241c17",
	primaryDisabled: "#5c4530",

	error: "#e2795a",
	errorDark: "#f2a58c",
	errorBg: "#3d2018",

	success: "#7fa86f",
	successBg: "#24301e",
	successBorder: "#3f5233",

	archivedBg: "#4a3a1a",
	archivedText: "#e0c072",

	// Dark mode's own drop shadows are heavier and slightly cooler than a straight light-mode
	// black - kept as a variable rather than a literal so it stays discoverable here instead of
	// hidden in whichever component needed it first.
	shadowColor: "0, 0, 0",
};
