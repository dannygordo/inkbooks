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
});
