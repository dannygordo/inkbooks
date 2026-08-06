// No React key may be derived from the clock or from randomness.
//
// WHAT THIS COSTS, CONCRETELY
//
// A key tells React which element from the previous render corresponds to which element now. A key
// that changes every render means "this is a different element", so React unmounts the old subtree
// and mounts a fresh one - discarding real DOM, and with it focus, selection, scroll position and
// any uncontrolled input state.
//
// The symptom people report is never "my keys are wrong". It is "the input loses focus after every
// character I type". IBCardWrapper had key={Date.now()} on its root div, so every card in the app
// was destroyed and rebuilt whenever anything above it re-rendered - and typing one character into
// the booking link updates parent state, which re-renders, which remounts the card, which destroys
// the input the cursor was in.
//
// WHY IT NEEDS A CHECK RATHER THAN A REVIEW
//
// It produces no error, no warning, and no test failure. React cannot tell an intentional remount
// from an accidental one. And it LOOKS diligent - "every element needs a key" is real advice, and
// Date.now() looks like a way to guarantee uniqueness. It had been written seven separate times in
// this codebase before anyone traced a symptom back to it.
//
// Two of those were on the root element of a component with no siblings, where a key is never read
// at all - pure cost, zero benefit, and no way to notice.
//
// Usage: node scripts/check-stable-keys.mjs
import { readFileSync, readdirSync, statSync } from "fs";
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

// A key whose expression mentions the clock or randomness. Deliberately narrow: this is about
// values that are new on every render, not about keys that are merely imperfect. An index key is a
// separate and much milder problem, and flagging it here would bury this one in noise.
const UNSTABLE_KEY = /\bkey\s*=\s*\{[^}]*\b(Date\s*\.\s*now|Math\s*\.\s*random|new\s+Date|performance\s*\.\s*now|crypto\s*\.\s*randomUUID)\b/;

const failures = [];
for (const file of walk(SRC)) {
	readFileSync(file, "utf8")
		.split("\n")
		.forEach((line, i) => {
			// Skip comments - several files now explain this rule in prose, including the ones that
			// were fixed, and flagging the explanation would be absurd.
			const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
			if (UNSTABLE_KEY.test(code)) {
				failures.push(`${file.replace(root + "/", "")}:${i + 1}: ${line.trim()}`);
			}
		});
}

if (failures.length > 0) {
	console.error(`\n${failures.length} React key(s) derived from the clock or randomness:\n`);
	for (const f of failures) console.error(`  ${f}`);
	console.error(
		"\nA key that changes every render remounts the subtree - destroying focus, selection and\n" +
			"scroll. Use something stable: the item's own id, or its index if the list never reorders.\n" +
			"On a component's single root element, drop the key entirely - it is never read there.\n",
	);
	process.exit(1);
}
console.log("No React keys derived from the clock or randomness.");
