#!/usr/bin/env node
// Does every GraphQL document in this repo still match the schema?
//
// WHY THIS EXISTS
//
// Changing a query's return type - `[BookingRequest]` to `BookingRequestPage!` - breaks every
// caller that selected fields off the old shape. Those callers are scattered across server tests
// and client components, they are strings rather than code, and nothing type-checks them. The
// import checker doesn't see inside a template literal and Node's parser is happy with any string.
//
// So the failure lands at RUN TIME as "Cannot query field \"id\" on type \"BookingRequestPage\"" -
// which is a clear message arriving at the worst possible moment, from a screen nobody was
// changing. That is exactly what happened: a paging change updated the resolver, the schema, the
// client and one test file, and missed an inline query in shopIsolation.test.js.
//
// Validating documents against the built schema turns that into a second of static checking. It is
// the same job the import checker does for module boundaries, one layer up.
//
// Usage: node scripts/check-graphql-documents.js
const fs = require('fs');
const path = require('path');
const { buildASTSchema, parse, validate } = require('graphql');

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

// typeDefs.js exports a gql-tagged DOCUMENT rather than a string, so this builds from the AST.
// buildSchema() would reject it with "Body must be a string", which reads like a corrupt schema
// rather than like the wrong function.
//
// It also declares `scalar Date` and `scalar DateTime` itself, so it builds standalone - the
// graphql-scalars typedefs index.js tries to merge in are not needed here.
const schema = buildASTSchema(require(path.join(serverRoot, 'graphql/typeDefs')));

const SEARCH_DIRS = [
  path.join(serverRoot, 'test'),
  path.join(serverRoot, 'graphql'),
  path.join(repoRoot, 'client/src'),
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(jsx?|mjs)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// Any template literal opening with an operation keyword. Deliberately loose: it is better to pick
// up something that isn't a query (and skip it below) than to miss one that is.
//
// THE LEADING `${...}` GROUP IS LOad-BEARING. A document that spreads a shared fragment opens with
// the interpolation, not with the keyword - `gql\`${CURRENT_USER_FIELDS} mutation login...\`` - and
// without this the regex simply doesn't match, so the document isn't checked and nothing says so.
// That happened the first time this ran against the shared session fragment: three documents
// vanished from the count and the script still printed a clean pass. The unused-fragment check at
// the bottom exists to make that specific silence impossible to repeat.
const DOCUMENT_RE = /`((?:\s*\$\{[^}]*\})*\s*(?:query|mutation|subscription)\s[\s\S]*?)`/g;
// Standalone fragment definitions, which are shared BETWEEN documents (`CurrentUserFields` in
// client/src/services/UserService.js) and interpolated into them.
const FRAGMENT_RE = /`(\s*fragment\s+(\w+)\s+on\s+[\s\S]*?)`/g;
// `...SomeFragment` - but not the `... on Artist` inline-fragment form, which names a type rather
// than a fragment and needs no lookup.
const SPREAD_RE = /\.\.\.\s*(?!on\s)(\w+)/g;
// An UNTAGGED template literal assigned to a name: `const _SESSION_TIMER_FIELDS = \`id status\``.
// These are the other kind of sharing in this repo - a bare list of field names spliced into a
// selection set rather than a real GraphQL fragment. The `=\s*\`` with nothing between is what
// excludes gql-tagged ones.
const RAW_LITERAL_RE = /(?:const|let|var)\s+(\w+)\s*=\s*`([^`]*)`/g;

const failures = [];

const files = [];
for (const dir of SEARCH_DIRS) {
  for (const file of walk(dir)) files.push(file);
}

// PASS ONE: every shared fragment, by name.
//
// This pass is why interpolated documents can be checked at all. The script used to give up on any
// template literal containing `${`, counting it as skipped - which was defensible when the only
// interpolation in the repo was one money fragment, and stopped being defensible the moment the
// session shape (the thing a signup bug had just been found in) moved behind one. "Skipped" is not
// a passing grade, and the documents most worth validating are the ones sharing a definition.
const fragmentsByName = new Map();
const fragmentSources = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = FRAGMENT_RE.exec(source))) {
    const [, body, name] = match;
    if (body.includes('${')) continue; // A fragment built from other fragments - not a case here.
    if (fragmentsByName.has(name) && fragmentsByName.get(name) !== body) {
      failures.push(
        `two different fragments are both named ${name} (${fragmentSources.get(name)} and ${path.relative(repoRoot, file)})`
      );
    }
    fragmentsByName.set(name, body);
    fragmentSources.set(name, path.relative(repoRoot, file));
  }
}

const usedFragments = new Set();

/**
 * The document, plus every fragment it spreads, transitively.
 *
 * Returns null when a spread names a fragment this script never found - reported as a failure
 * rather than skipped, because an unresolvable spread is either a typo or a fragment that moved,
 * and both break at run time.
 */
function withFragments(document) {
  const needed = [];
  const seen = new Set();
  const queue = [document];
  while (queue.length > 0) {
    const text = queue.shift();
    let match;
    SPREAD_RE.lastIndex = 0;
    while ((match = SPREAD_RE.exec(text))) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      const body = fragmentsByName.get(name);
      if (!body) return { text: null, missing: name };
      usedFragments.add(name);
      needed.push(body);
      queue.push(body);
    }
  }
  return { text: [document, ...needed].join('\n'), missing: null };
}

let checked = 0;
let resolved = 0;

// PASS TWO: validate the operations.
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(repoRoot, file);

  // The file's own bare field lists, spliced in below. These are file-local by construction (they
  // are `const` inside a module IIFE and nothing exports them), so a per-file map is the accurate
  // scope - a repo-wide one would happily resolve a name that JS itself could not see.
  const rawByName = new Map();
  let raw;
  RAW_LITERAL_RE.lastIndex = 0;
  while ((raw = RAW_LITERAL_RE.exec(source))) {
    rawByName.set(raw[1], raw[2]);
  }

  let match;
  DOCUMENT_RE.lastIndex = 0;
  while ((match = DOCUMENT_RE.exec(source))) {
    // TWO KINDS OF INTERPOLATION, handled differently.
    //
    // A bare field list (`${_SESSION_TIMER_FIELDS}`) is spliced in, because its text IS part of
    // the document - dropping it leaves `{ }`, which either fails to parse or, worse, still parses
    // as a smaller document and gets validated instead of the real one. That silent
    // under-checking is what this used to do to AnalyticsService.
    //
    // A gql fragment (`${CURRENT_USER_FIELDS}`) is dropped here and re-attached by NAME from the
    // `...CurrentUserFields` spread instead, which is how it survives being imported from another
    // file: the JS identifier and the fragment name need not match, and only the spread is
    // authoritative about which fragment is actually used.
    const document = match[1]
      .replace(/\$\{(\w+)\}/g, (whole, name) => (rawByName.has(name) ? rawByName.get(name) : ''))
      .replace(/\$\{[^}]*\}/g, '');
    if (!document.includes('{')) continue;

    const { text, missing } = withFragments(document);
    if (!text) {
      failures.push(`${relative}: spreads ...${missing}, which is not a fragment this repo defines`);
      continue;
    }
    if (text !== document) resolved += 1;

    checked += 1;
    try {
      const errors = validate(schema, parse(text));
      if (errors.length > 0) {
        failures.push(`${relative}: ${errors.map((e) => e.message).join(' | ')}`);
      }
    } catch (err) {
      failures.push(`${relative}: does not parse - ${err.message.split('\n')[0]}`);
    }
  }
}

// A fragment nobody spreads is the tell that a document went unchecked.
//
// This is not a tidiness rule about dead code. A shared fragment exists to be spliced into
// operations; if this script found the definition but never saw a document use it, the overwhelming
// likelihood is that the documents using it were not matched at all - which is exactly what
// happened when the leading-interpolation case was missing from DOCUMENT_RE, and the script
// reported a clean pass over a set that had quietly shrunk by three. A checker that can silently
// check less than it did yesterday is worse than no checker, because the green line still gets
// believed.
for (const [name, source] of fragmentSources) {
  if (!usedFragments.has(name)) {
    failures.push(
      `${source}: fragment ${name} is defined but no checked document spreads it - either it is dead, or the documents that use it are not being matched`
    );
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} GraphQL document(s) do not match the schema:\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error('');
  process.exit(1);
}
console.log(
  `Every GraphQL document matches the schema (${checked} checked, ${resolved} with shared fragments resolved from ${fragmentsByName.size} definitions).`
);
