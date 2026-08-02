import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This codebase originally wrote JSX inside plain .js files (not .jsx) throughout - a valid
// CRA/webpack pattern, but not one Vite's transform pipeline supports for arbitrary .js files
// (confirmed live: the dev server's "vite:oxc" pre-transform step rejected JSX in .js files with
// "Unexpected JSX expression... JSX syntax is disabled"). Rather than chase config flags for
// whichever internal parser (esbuild/oxc/etc.) a given Vite version happens to use by default,
// every .js file that actually contained JSX was renamed to .jsx (91 of 112 client/src/*.js
// files - the other 21 are pure logic: services, utils, constants, firebase helpers, and have
// no JSX at all) - the standard, version-proof fix, since every JS toolchain auto-detects JSX
// correctly by the .jsx extension with zero extra config. No import statement anywhere in this
// codebase referenced an explicit ".js" extension, so this rename required no import changes.
export default defineConfig({
	plugins: [react()],
	server: {
		port: 3000,
	},
	// Vitest reads its config from this same file (no separate vitest.config.js needed) - it just
	// looks for a top-level `test` key that plain `vite build`/`vite dev` ignore entirely, so this
	// has zero effect on the real app bundle.
	//
	// Note: `esbuild: { jsx: 'automatic' }` was tried here to fix "React is not defined" errors
	// when Login.jsx/Register.jsx render under Vitest, but had no effect - @vitejs/plugin-react
	// transforms JSX via its own Babel pipeline, not esbuild, so esbuild's jsx option never gets a
	// chance to apply to these files. Fixed instead with explicit `import React from "react"` in
	// Login.jsx/Register.jsx themselves (see those files) - the only two real app components
	// currently rendered under a test.
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.js"],
	},
});
