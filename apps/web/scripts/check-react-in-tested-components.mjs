// Does every component reachable from a test import React?
//
// WHY THIS IS A REAL CONSTRAINT HERE
//
// @vitejs/plugin-react transforms JSX with its own Babel pipeline, and under Vitest that pipeline
// uses the CLASSIC runtime - so JSX compiles to `React.createElement(...)` and the file needs React
// in scope. The real app bundle uses the automatic runtime and needs no such import. See the note
// in vite.config.js: `esbuild: { jsx: 'automatic' }` was tried and has no effect, because esbuild
// never gets a chance to touch these files.
//
// The result is a rule that is invisible until it isn't: a component without `import React` works
// perfectly in the browser, in dev, in a build - and throws "React is not defined" the moment
// anything renders it under a test. Worse, the failure lands in SOMEONE ELSE'S test file. Adding
// AppointmentSlotPicker to UpdateEventDialog broke all ten UpdateEventDialog tests, and the stack
// pointed at a file that test had never heard of.
//
// So the condition isn't "every component imports React" - most don't need to and shouldn't be
// nagged - it's "every component REACHABLE FROM A TEST does". That's what this walks.
//
// Usage: node scripts/check-react-in-tested-components.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SRC = join(root, "src");

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.(jsx?|mjs)$/.test(name) ? [full] : [];
	});
}

const TRY = ["", ".js", ".jsx", ".mjs", "/index.js", "/index.jsx"];

function resolveRelative(fromFile, spec) {
	const base = resolve(dirname(fromFile), spec);
	for (const ext of TRY) {
		if (existsSync(base + ext) && statSync(base + ext).isFile()) {
			return base + ext;
		}
	}
	return null;
}

/** Every local module a file imports, resolved to a path. */
function localImports(file) {
	const src = readFileSync(file, "utf8");
	const specs = [];
	for (const m of src.matchAll(/^import\s+(?:[^'"]*?\s*from\s*)?["'](\.[^"']+)["']/gm)) {
		specs.push(m[1]);
	}
	return specs.map((s) => resolveRelative(file, s)).filter(Boolean);
}

// React in scope, in any of the forms this codebase actually uses. `import { useState }` does NOT
// count - a named import does not bind `React`, which is exactly the trap: the file looks like it
// imports from react and still fails.
function importsReact(source) {
	return (
		/^import\s+React\b/m.test(source) ||
		/^import\s+\*\s+as\s+React\b/m.test(source)
	);
}

function hasJsx(source) {
	// Crude but sufficient: a JSX element or fragment opening. False positives cost nothing here,
	// because a file with no JSX that imports React is not an error either way.
	return /<[A-Za-z][\w.]*[\s/>]/.test(source) || /<>\s/.test(source);
}

const testFiles = walk(SRC).filter((f) => /\.test\.(jsx?|mjs)$/.test(f));

// Everything a test can reach, transitively.
const reachable = new Set();
const queue = [...testFiles];
while (queue.length > 0) {
	const file = queue.pop();
	for (const dep of localImports(file)) {
		if (!reachable.has(dep)) {
			reachable.add(dep);
			queue.push(dep);
		}
	}
}

const failures = [];
for (const file of reachable) {
	if (!/\.jsx$/.test(file)) continue;
	const source = readFileSync(file, "utf8");
	if (hasJsx(source) && !importsReact(source)) {
		failures.push(file.replace(root + "/", ""));
	}
}

if (failures.length > 0) {
	console.error(
		`\n${failures.length} component(s) reachable from a test render JSX without importing React:\n`
	);
	for (const f of failures) console.error(`  ${f}`);
	console.error(
		'\nAdd `import React from "react";`. Under Vitest, @vitejs/plugin-react compiles JSX with the\n' +
			'classic runtime, so these throw "React is not defined" - in whichever test file happens to\n' +
			"render them, not in their own.\n"
	);
	process.exit(1);
}
console.log(
	`Every component reachable from a test imports React (${reachable.size} modules reached from ${testFiles.length} test files).`
);
