import { createTheme } from "@mui/material/styles";

// MUI's cssVariables mode, keyed to the SAME [data-theme] attribute tokens.css already reads -
// see that file's header comment for why one attribute has to drive both systems. This makes
// every MUI component (buttons, inputs, dialogs) consume --mui-palette-* custom properties
// instead of baking a fixed light palette into the JS bundle, which is the only way a runtime
// light/dark toggle can reach MUI's own components without a full remount.
//
// Values mirror client/src/theme/tokens.css exactly. They are duplicated rather than read from
// the CSS file at build time because MUI's palette needs real JS color objects (main/dark/
// contrastText) to compute hover/focus states correctly - keep the two in sync by hand if either
// changes, the way DECISIONS.md's own worked examples have to stay in sync with the code they
// describe.
const theme = createTheme({
	cssVariables: {
		colorSchemeSelector: "data-theme",
	},
	colorSchemes: {
		light: {
			palette: {
				primary: {
					main: "#9c5a30",
					dark: "#7e4726",
					light: "#c9986a",
					contrastText: "#ffffff",
				},
				error: {
					main: "#b3452e",
					dark: "#7a2e1c",
				},
				success: {
					main: "#4a7043",
				},
				background: {
					default: "#f5f1ec",
					paper: "#ffffff",
				},
				text: {
					primary: "#2a201a",
					secondary: "#6b5c4e",
				},
				divider: "#e0d5c8",
			},
		},
		dark: {
			palette: {
				primary: {
					// Lighter than the light-mode copper - a dark-copper fill on a dark background
					// doesn't hold contrast against light text, the same reason tokens.css's
					// --ib-primary brightens for dark mode. Pairs with a dark contrastText below
					// instead of white, for the same reason.
					main: "#d38a51",
					dark: "#e29e68",
					light: "#e0a874",
					contrastText: "#241c17",
				},
				error: {
					main: "#e2795a",
					dark: "#f2a58c",
				},
				success: {
					main: "#7fa86f",
				},
				background: {
					default: "#1a1512",
					paper: "#241c17",
				},
				text: {
					primary: "#f3ece4",
					secondary: "#c4b3a1",
				},
				divider: "#453a30",
			},
		},
	},
	shape: {
		borderRadius: 8,
	},
});

export default theme;
