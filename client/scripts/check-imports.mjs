// Does every import in src/ actually resolve?
//
// Vite only transforms a module when something asks for it, so a bad import in a component nobody
// has navigated to yet stays invisible until someone opens that screen - and the tests don't catch
// it either unless some test happens to render that component. Three separate mistakes in one
// session were exactly this shape: a plausible-looking name that does not exist. The one that
// broke the dev server was `@mui/icons-material/CheckCircleOutline`, which reads perfectly and
// isn't a thing in v9 (the outline variants are spelled `Outlined`).
//
// Checks both halves, because they fail differently:
//   - the module path resolves at all (wrong deep path, moved file, typo'd relative import)
//   - each NAMED import actually exists on that module (wrong export name off a real package)
//
// Usage: node scripts/check-imports.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { createRequire } from "module";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(join(root, "package.json"));
const SRC = join(root, "src");

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.(jsx?|mjs)$/.test(name) ? [full] : [];
	});
}

// Extensions Vite will try for an extensionless relative import.
const TRY = ["", ".js", ".jsx", ".mjs", ".json", "/index.js", "/index.jsx"];

// Loading a package to inspect its exports is the expensive part, and for one package it is
// absurdly expensive: `require("@mui/icons-material")` pulls in a barrel of 43,000 files and takes
// ~23 SECONDS. A check nobody runs because it takes half a minute is a check that doesn't exist.
//
// So named exports are resolved the cheap way first: for `import { X } from "pkg"`, try to resolve
// the subpath `pkg/X`. Barrel packages (both MUI ones) are generated 1:1 from files, so this
// answers the question in ~3ms and distinguishes `CheckCircleOutlined` (resolves) from
// `CheckCircleOutline` (does not) exactly. Only when the subpath doesn't resolve - `react/useState`
// and the like - does it fall back to actually loading the module, which for those packages is
// cheap.
const moduleCache = new Map();
function loadModule(spec) {
	if (!moduleCache.has(spec)) {
		try {
			moduleCache.set(spec, { ok: true, mod: require(spec) });
		} catch (err) {
			moduleCache.set(spec, { ok: false, err });
		}
	}
	return moduleCache.get(spec);
}

const failures = [];

for (const file of walk(SRC)) {
	const rel = file.replace(root + "/", "");
	const src = readFileSync(file, "utf8");
	// Import statements only - not dynamic import() and not require().
	for (const m of src.matchAll(/^import\s+([^'"]*?)\s*from\s*["']([^"']+)["']/gm)) {
		const [, clause, spec] = m;

		if (spec.startsWith(".")) {
			const base = resolve(dirname(file), spec);
			if (!TRY.some((ext) => existsSync(base + ext))) {
				failures.push(`${rel}: cannot resolve "${spec}"`);
			}
			continue;
		}
		// CSS and asset imports have no exports worth checking.
		if (/\.(css|scss|png|jpe?g|svg|gif|webp)$/.test(spec)) continue;

		// Does the specifier itself resolve? This alone catches the bad-deep-path case, without
		// executing anything.
		try {
			require.resolve(spec);
		} catch (err) {
			// ERR_PACKAGE_PATH_NOT_EXPORTED means the package exists but doesn't expose this path,
			// which for our purposes is the same failure as not existing.
			failures.push(`${rel}: cannot resolve "${spec}"`);
			continue;
		}

		const named = clause.match(/\{([^}]*)\}/);
		if (!named) continue;

		for (const part of named[1].split(",")) {
			const name = part.trim().split(/\s+as\s+/)[0].trim();
			if (!name || name === "default") continue;

			// Cheap path: barrel packages expose each export as its own subpath.
			try {
				require.resolve(`${spec}/${name}`);
				continue;
			} catch {
				/* not a barrel export - fall through to loading the module */
			}

			const loaded = loadModule(spec);
			if (!loaded.ok) continue; // ESM-only package we can't require(); not a real failure
			const mod = loaded.mod;
			const target =
				mod && mod.__esModule && mod.default && !(name in mod) ? mod.default : mod;
			if (target && typeof target === "object" && !(name in target)) {
				failures.push(`${rel}: "${spec}" has no export "${name}"`);
			}
		}
	}
}

if (failures.length) {
	console.error(`\n${failures.length} unresolved import(s):\n`);
	for (const f of failures) console.error(`  ${f}`);
	console.error("");
	process.exit(1);
}
console.log("Every import in src/ resolves.");
