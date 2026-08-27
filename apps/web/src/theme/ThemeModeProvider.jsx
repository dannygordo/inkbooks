import React, { useEffect } from "react";
import { ThemeProvider, useColorScheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "./theme";
import { useAuth } from "../context/auth";
import "./tokens.css";

const SYSTEM_QUERY = "(prefers-color-scheme: dark)";

/**
 * The one place InkBooks' theme preference gets turned into an actual mode.
 *
 * DELIBERATELY NOT MUI's OWN localStorage-BACKED MODE STATE. useColorScheme()'s setMode is still
 * what actually flips [data-theme] and every --mui-palette-* custom property - that machinery is
 * still MUI's - but WHAT mode gets passed to it comes from User.themePreference (a real, synced-
 * across-devices account setting saved from the Appearance panel in Settings), not a per-browser
 * localStorage value nobody else's device can see. "Should live in Settings" means an account
 * fact, not a device fact.
 *
 * Logged out (no user yet - the login/register/public booking pages) and "system" both resolve
 * the same way: whatever prefers-color-scheme says, live-updated if the OS preference changes
 * while the tab is open.
 */
function ModeSync() {
	const { user } = useAuth();
	const { setMode } = useColorScheme();

	useEffect(() => {
		const mql = window.matchMedia(SYSTEM_QUERY);
		const preference = user?.themePreference || "system";

		if (preference !== "system") {
			setMode(preference);
			return undefined;
		}

		const applySystemMode = () => setMode(mql.matches ? "dark" : "light");
		applySystemMode();
		mql.addEventListener("change", applySystemMode);
		return () => mql.removeEventListener("change", applySystemMode);
	}, [user?.themePreference, setMode]);

	return null;
}

/**
 * Wraps the whole app. Has to sit inside AuthProvider (ModeSync reads useAuth()) and outside
 * everything that renders an MUI component or reads --ib-* tokens, which in this app is
 * everything - so this belongs as close to the root as AuthProvider allows.
 */
const ThemeModeProvider = ({ children }) => (
	<ThemeProvider theme={theme} defaultMode="light" disableTransitionOnChange>
		<CssBaseline enableColorScheme />
		<ModeSync />
		{children}
	</ThemeProvider>
);

export default ThemeModeProvider;
