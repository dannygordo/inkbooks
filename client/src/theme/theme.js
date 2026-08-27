import { createTheme } from "@mui/material/styles";
import { light, dark } from "./tokens.mjs";

// MUI's cssVariables mode, keyed to the SAME [data-theme] attribute tokens.css already reads -
// see that file's header comment for why one attribute has to drive both systems. This makes
// every MUI component (buttons, inputs, dialogs) consume --mui-palette-* custom properties
// instead of baking a fixed light palette into the JS bundle, which is the only way a runtime
// light/dark toggle can reach MUI's own components without a full remount.
//
// Values come from tokens.mjs, the same plain-value source tokens.css is generated from - no
// more hand-keeping two copies of the same hex values in sync (this file used to hardcode its
// own literals here; see git history if that duplication is ever useful to compare against).
const theme = createTheme({
	cssVariables: {
		colorSchemeSelector: "data-theme",
	},
	colorSchemes: {
		light: {
			palette: {
				primary: {
					main: light.primary,
					dark: light.primaryHover,
					light: light.primaryLight,
					contrastText: light.primaryContrast,
				},
				error: {
					main: light.error,
					dark: light.errorDark,
				},
				success: {
					main: light.success,
				},
				background: {
					default: light.surfacePage,
					paper: light.surfaceCard,
				},
				text: {
					primary: light.textPrimary,
					secondary: light.textSecondary,
				},
				divider: light.border,
			},
		},
		dark: {
			palette: {
				primary: {
					// Lighter than the light-mode copper - a dark-copper fill on a dark background
					// doesn't hold contrast against light text, the same reason tokens.mjs's dark
					// palette brightens `primary`. Pairs with a dark contrastText below instead of
					// white, for the same reason.
					main: dark.primary,
					dark: dark.primaryHover,
					light: dark.primaryLight,
					contrastText: dark.primaryContrast,
				},
				error: {
					main: dark.error,
					dark: dark.errorDark,
				},
				success: {
					main: dark.success,
				},
				background: {
					default: dark.surfacePage,
					paper: dark.surfaceCard,
				},
				text: {
					primary: dark.textPrimary,
					secondary: dark.textSecondary,
				},
				divider: dark.border,
			},
		},
	},
	shape: {
		borderRadius: 8,
	},
});

export default theme;
