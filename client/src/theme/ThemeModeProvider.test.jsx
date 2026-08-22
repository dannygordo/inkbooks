// ThemeModeProvider tests. Unlike the Service files, this is a real React context provider
// component (not an IIFE of hook factories), so it's tested the ordinary React Testing Library
// way: render it, and assert on the mode it actually applies via MUI's own useColorScheme() hook
// and the [data-theme] attribute it drives on <html> (colorSchemeSelector: "data-theme" in
// theme.js - see that file). "../context/auth" is mocked so each test can control
// user.themePreference directly, the same vi.mock-a-dependency approach auth.test.jsx itself uses
// for firebase/auth.
//
// window.matchMedia: src/test/setup.js already stubs a permanent window.matchMedia that always
// reports matches:false and does nothing on addEventListener/removeEventListener (needed so MUI's
// useMediaQuery doesn't crash elsewhere in the app under jsdom). That stub can't be used to prove
// ModeSync's "system" branch reacts live to an OS preference change, since its
// addEventListener/removeEventListener never actually track a listener - so the tests below install
// their own richer mock (matches is settable, addEventListener really stores the callback) and
// restore the original stub afterwards.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useColorScheme } from "@mui/material/styles";
import ThemeModeProvider from "./ThemeModeProvider";
import { useAuth } from "../context/auth";

vi.mock("../context/auth", () => ({ useAuth: vi.fn() }));

const SYSTEM_QUERY = "(prefers-color-scheme: dark)";

/**
 * A controllable stand-in for window.matchMedia("(prefers-color-scheme: dark)"): `matches` can be
 * flipped after the fact, and addEventListener really records its callback so a test can simulate
 * the OS preference changing while the tab is open by calling `fireChange`.
 */
function installControllableMatchMedia(initialMatches) {
	const listeners = new Set();
	const mql = {
		matches: initialMatches,
		media: SYSTEM_QUERY,
		addEventListener: (_event, cb) => listeners.add(cb),
		removeEventListener: (_event, cb) => listeners.delete(cb),
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	};
	window.matchMedia = vi.fn(() => mql);
	return {
		fireChange(nextMatches) {
			mql.matches = nextMatches;
			listeners.forEach((cb) => cb({ matches: nextMatches }));
		},
		listenerCount: () => listeners.size,
	};
}

// Renders the resolved mode as text, via the same useColorScheme() hook ModeSync itself calls
// setMode through - this is the real context value ThemeModeProvider hands the rest of the app,
// not a re-implementation of it.
function ModeDisplay() {
	const { mode } = useColorScheme();
	return React.createElement("div", { "data-testid": "mode" }, mode ?? "undefined");
}

let originalMatchMedia;

beforeEach(() => {
	originalMatchMedia = window.matchMedia;
});

afterEach(() => {
	window.matchMedia = originalMatchMedia;
	document.documentElement.removeAttribute("data-theme");
});

describe("ThemeModeProvider", () => {
	it("renders its children", () => {
		useAuth.mockReturnValue({ user: null });
		installControllableMatchMedia(false);

		render(
			React.createElement(
				ThemeModeProvider,
				null,
				React.createElement("div", { "data-testid": "child" }, "hello"),
			),
		);

		expect(screen.getByTestId("child")).toHaveTextContent("hello");
	});

	it("resolves to light when logged out and the OS prefers light (system default)", async () => {
		useAuth.mockReturnValue({ user: null });
		installControllableMatchMedia(false);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});
		expect(document.documentElement.getAttribute("data-theme")).toBe("light");
	});

	it("resolves to dark when logged out and the OS prefers dark (system default)", async () => {
		useAuth.mockReturnValue({ user: null });
		installControllableMatchMedia(true);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
	});

	it('treats a signed-in user with themePreference "system" the same as logged out', async () => {
		useAuth.mockReturnValue({ user: { themePreference: "system" } });
		installControllableMatchMedia(true);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});
	});

	it('forces light when the user has an explicit themePreference of "light", ignoring the OS', async () => {
		useAuth.mockReturnValue({ user: { themePreference: "light" } });
		// OS says dark - the explicit account preference must win regardless.
		installControllableMatchMedia(true);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});
	});

	it('forces dark when the user has an explicit themePreference of "dark", ignoring the OS', async () => {
		useAuth.mockReturnValue({ user: { themePreference: "dark" } });
		// OS says light - the explicit account preference must win regardless.
		installControllableMatchMedia(false);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});
	});

	it("live-updates when the OS preference changes while on system mode", async () => {
		useAuth.mockReturnValue({ user: null });
		const { fireChange } = installControllableMatchMedia(false);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});

		fireChange(true);

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});
	});

	it("does not react to OS changes once the user has an explicit (non-system) preference", async () => {
		useAuth.mockReturnValue({ user: { themePreference: "light" } });
		// preference !== "system" returns early in ModeSync's effect, before its own
		// mql.addEventListener call - so if mode ever DID flip here, it could only be some other,
		// unrelated piece of MUI's own machinery reacting, not ModeSync. Asserting on the visible
		// mode (rather than counting listeners on the shared mock mql, which MUI's own internal
		// system-mode tracking may also legitimately subscribe to) keeps this test about ModeSync's
		// actual contract: an explicit preference is not overridden by the OS.
		const { fireChange } = installControllableMatchMedia(false);

		render(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});

		fireChange(true);
		expect(screen.getByTestId("mode")).toHaveTextContent("light");
	});

	it("stops following the OS once the user's preference changes away from system", async () => {
		useAuth.mockReturnValue({ user: { themePreference: "system" } });
		const { fireChange } = installControllableMatchMedia(false);

		const { rerender } = render(
			React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)),
		);

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});

		// While still on "system", a live OS change does reach setMode - confirms the fixture itself
		// is wired correctly before testing the cleanup path below.
		fireChange(true);
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});
		fireChange(false);
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});

		useAuth.mockReturnValue({ user: { themePreference: "dark" } });
		rerender(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});

		// The effect's cleanup ran before re-running with the new preference, so ModeSync's own
		// system listener is gone - a later OS change can no longer reach setMode through it. Mode
		// stays "dark" (the explicit preference), not falling back to whatever the OS reports.
		fireChange(true);
		expect(screen.getByTestId("mode")).toHaveTextContent("dark");
	});

	it("re-resolves when the signed-in user's themePreference itself changes (e.g. from Settings)", async () => {
		useAuth.mockReturnValue({ user: { themePreference: "light" } });
		installControllableMatchMedia(false);

		const { rerender } = render(
			React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)),
		);

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light");
		});

		useAuth.mockReturnValue({ user: { themePreference: "dark" } });
		rerender(React.createElement(ThemeModeProvider, null, React.createElement(ModeDisplay)));

		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark");
		});
	});
});
