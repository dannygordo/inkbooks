// Nothing in the client may format a stored timestamp with moment.utc().
//
// WHAT WENT WRONG
//
// Every date this app stores is an INSTANT - `new Date(x).toISOString()`, a point on the world's
// timeline. `moment.utc(instant).format("h:mma")` prints the UTC clock face of that instant, which
// is the right time in London and nowhere else. The calendar did this and showed a 1pm session as
// 8pm; the appointments list used plain `moment(...)` and showed 1pm. Same row, two screens, seven
// hours apart.
//
// The mirror image is worse. A utc-mode moment handed to a date picker makes the picker interpret
// whatever the artist types as a UTC wall clock - pick 10:00 and 10:00Z gets stored, seven hours
// early. That is not a display bug, it is wrong data, and it survives every fix to the display.
//
// The two together are why this went unnoticed: an appointment created through the utc-seeded
// wizard and shown on the utc-formatting calendar reads back correctly, because the two errors
// cancel exactly. It only became visible when a list rendered the same record honestly.
//
// WHY A BLANKET BAN
//
// There is no legitimate use of moment.utc in this client. The viewer is a person in a chair in a
// tattoo shop; every date they see should be in their own zone, and every date they enter should
// be interpreted in it. The server is the place that reasons about other timezones, and it does so
// with Intl and an IANA zone name (see server/utils/digest.js), not with moment.utc.
//
// The nastiest property of this bug: it is INVISIBLE to anyone whose machine runs on UTC. A
// developer in London sees nothing wrong, ever.
//
// Usage: node scripts/check-no-utc-display.mjs
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

const failures = [];
for (const file of walk(SRC)) {
	const lines = readFileSync(file, "utf8").split("\n");
	lines.forEach((line, i) => {
		// Skip comments - this rule is explained in prose in several files, including this one's
		// own justification, and flagging the explanation would be absurd.
		const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
		if (/\bmoment\s*\.\s*utc\s*\(/.test(code)) {
			failures.push(`${file.replace(root + "/", "")}:${i + 1}: ${line.trim()}`);
		}
	});
}

if (failures.length > 0) {
	console.error(`\n${failures.length} use(s) of moment.utc() in the client:\n`);
	for (const f of failures) console.error(`  ${f}`);
	console.error(
		"\nStored dates are instants. Use moment(x) so they render in the viewer's own timezone, and\n" +
			"seed date pickers with moment(x) so what someone types is read in their zone too.\n" +
			"This is invisible on a machine set to UTC, which is why it is checked rather than reviewed.\n"
	);
	process.exit(1);
}
console.log("No moment.utc() in the client - dates render in the viewer's timezone.");
