// theme.js tests. Unlike ThemeModeProvider.jsx, this file has no React component and no conditional
// construction logic of its own - it's a single call to MUI's createTheme() with a light and a dark
// colorScheme config baked in, built once at module load and exported as a plain object. So there's
// no hook/component to render here: this just asserts the resulting theme object actually carries
// the design tokens theme.js configured, for both color schemes, plus the cssVariables wiring
// ThemeModeProvider.jsx and tokens.css both depend on (colorSchemeSelector: "data-theme" is what
// lets setMode's mode changes show up as the [data-theme] attribute tokens.css reads - see that
// file's own header comment).
//
// A plain .js file, no JSX anywhere - matches ThemeModeProvider.test.jsx's sibling theme.js, which
// (like the Service files) is pure logic with nothing to render.
import { describe, it, expect } from "vitest";
import theme from "./theme";

describe("theme", () => {
	it("builds a theme object", () => {
		expect(theme).toBeTruthy();
		expect(typeof theme).toBe("object");
	});

	it("sets a global borderRadius of 8", () => {
		expect(theme.shape.borderRadius).toBe(8);
	});

	it("wires cssVariables to the data-theme attribute tokens.css reads", () => {
		// getColorSchemeSelector is MUI's own documented way of turning a color scheme name into the
		// CSS selector cssVariables mode will actually apply it under - it must reflect the
		// colorSchemeSelector: "data-theme" config theme.js passes to createTheme, since
		// ThemeModeProvider.jsx's whole point is driving that same [data-theme] attribute via
		// useColorScheme().setMode.
		const darkSelector = theme.getColorSchemeSelector("dark");
		expect(darkSelector).toContain("data-theme");
		expect(darkSelector).toContain("dark");
	});
});

describe("theme colorSchemes.light", () => {
	const { palette } = theme.colorSchemes.light;

	it("sets the copper primary palette", () => {
		expect(palette.primary).toMatchObject({
			main: "#9c5a30",
			dark: "#7e4726",
			light: "#c9986a",
			contrastText: "#ffffff",
		});
	});

	it("sets error and success colors", () => {
		expect(palette.error).toMatchObject({ main: "#b3452e", dark: "#7a2e1c" });
		expect(palette.success).toMatchObject({ main: "#4a7043" });
	});

	it("sets a light background and dark-on-light text", () => {
		expect(palette.background).toMatchObject({ default: "#f5f1ec", paper: "#ffffff" });
		expect(palette.text).toMatchObject({ primary: "#2a201a", secondary: "#6b5c4e" });
	});

	it("sets the divider color", () => {
		expect(palette.divider).toBe("#e0d5c8");
	});
});

describe("theme colorSchemes.dark", () => {
	const { palette } = theme.colorSchemes.dark;

	it("lightens the copper primary so it holds contrast on a dark background", () => {
		expect(palette.primary).toMatchObject({
			main: "#d38a51",
			dark: "#e29e68",
			light: "#e0a874",
			// Dark contrastText, not white - a dark-copper fill on a dark background needs the
			// inverse pairing from the light scheme's white contrastText, per theme.js's own comment.
			contrastText: "#241c17",
		});
	});

	it("lightens error and success colors to hold contrast on dark backgrounds", () => {
		expect(palette.error).toMatchObject({ main: "#e2795a", dark: "#f2a58c" });
		expect(palette.success).toMatchObject({ main: "#7fa86f" });
	});

	it("sets a dark background and light-on-dark text", () => {
		expect(palette.background).toMatchObject({ default: "#1a1512", paper: "#241c17" });
		expect(palette.text).toMatchObject({ primary: "#f3ece4", secondary: "#c4b3a1" });
	});

	it("sets the divider color", () => {
		expect(palette.divider).toBe("#453a30");
	});
});

describe("theme light vs dark", () => {
	it("gives every configured token a genuinely different value between the two schemes", () => {
		const light = theme.colorSchemes.light.palette;
		const dark = theme.colorSchemes.dark.palette;

		expect(light.primary.main).not.toBe(dark.primary.main);
		expect(light.primary.contrastText).not.toBe(dark.primary.contrastText);
		expect(light.error.main).not.toBe(dark.error.main);
		expect(light.success.main).not.toBe(dark.success.main);
		expect(light.background.default).not.toBe(dark.background.default);
		expect(light.background.paper).not.toBe(dark.background.paper);
		expect(light.text.primary).not.toBe(dark.text.primary);
		expect(light.text.secondary).not.toBe(dark.text.secondary);
		expect(light.divider).not.toBe(dark.divider);
	});

	// The two schemes are independently-configured objects, not one mutated into the other - a
	// naive shared-reference bug (e.g. spreading light into dark without overriding every key)
	// would otherwise still pass individual-field assertions by accident.
	it("keeps the two color schemes as distinct objects", () => {
		expect(theme.colorSchemes.light).not.toBe(theme.colorSchemes.dark);
		expect(theme.colorSchemes.light.palette).not.toBe(theme.colorSchemes.dark.palette);
	});
});
