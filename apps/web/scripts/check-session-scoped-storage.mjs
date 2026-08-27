#!/usr/bin/env node
// Is there anywhere a previous user's data can survive a logout?
//
// WHY THIS EXISTS
//
// Log in as an artist, log out, log in as a shop admin, log out, log back in as the artist - and
// the shop admin's clients rendered inside the artist's account, for an artist not connected to
// that shop. One InMemoryCache, built at module load, living as long as the browser tab; logout()
// cleared localStorage and Firebase and never touched it. Apollo's default fetchPolicy is
// cache-first, so those queries were answered from memory and never sent, which means the server's
// shop-scoping - which is correct, and tested - was never even consulted.
//
// context/auth.jsx now discards the cache on every authentication event. This check is about the
// SHAPE of that bug rather than that one instance, because the shape is what will come back: a
// place that holds one user's data across a session boundary, added by someone who had no reason to
// think about logout at all.
//
// Two rules, both about stores that outlive a session:
//
//   1. ONE ApolloClient. A second client is a second cache, and nothing clears it. The wipe lives
//      in AuthProvider and reaches the client it can see.
//   2. localStorage/sessionStorage only inside CacheService. Not because that module is special,
//      but because it is the ONE store logout() empties. `localStorage.setItem("draftInvoice", ..)`
//      in a component is the same bug in a new place, and it would read perfectly in review.
//
// Neither rule is a style preference. Both mark the boundary where one person's data can become
// another person's.
//
// Usage: node scripts/check-session-scoped-storage.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(clientRoot, "src");

// The single entry point, where the app's one client is constructed and handed to ApolloProvider.
const APOLLO_CLIENT_OWNER = "src/index.jsx";
// The single module allowed to touch browser storage - the one logout() clears.
const STORAGE_OWNER = "src/services/CacheService.js";

function walk(dir, out = []) {
	for (const name of fs.readdirSync(dir)) {
		if (name === "node_modules") continue;
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) walk(full, out);
		else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
	}
	return out;
}

// Tests legitimately construct their own client and clear storage between cases - that is how the
// leak is asserted on at all (see context/auth.test.jsx).
const isTest = (relative) => /\.test\.(jsx?|mjs)$/.test(relative);

const failures = [];

for (const file of walk(srcRoot)) {
	const relative = path.relative(clientRoot, file).split(path.sep).join("/");
	if (isTest(relative)) continue;
	const source = fs.readFileSync(file, "utf8");
	const lines = source.split("\n");

	lines.forEach((line, index) => {
		const at = `${relative}:${index + 1}`;
		// Comments describing the rule are not violations of it.
		const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");

		if (/new\s+ApolloClient\s*\(/.test(code) && relative !== APOLLO_CLIENT_OWNER) {
			failures.push(
				`${at}: a second ApolloClient. Its cache is not the one AuthProvider discards on ` +
					`logout, so whatever it holds outlives the session. The app's client is built in ` +
					`${APOLLO_CLIENT_OWNER}; reach it with useApolloClient().`,
			);
		}

		if (/\b(localStorage|sessionStorage)\b/.test(code) && relative !== STORAGE_OWNER) {
			failures.push(
				`${at}: browser storage outside ${STORAGE_OWNER}. That module holds the session and ` +
					`is the only one logout() empties - anything written elsewhere survives a logout ` +
					`and is readable by whoever signs in next.`,
			);
		}
	});
}

if (failures.length > 0) {
	console.error(`\n${failures.length} place(s) where data can outlive a session:\n`);
	for (const failure of failures) console.error(`  ${failure}`);
	console.error("");
	process.exit(1);
}
console.log("Nothing in the client holds data across a session boundary.");
