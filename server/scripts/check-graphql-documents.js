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
const DOCUMENT_RE = /`(\s*(?:query|mutation|subscription)\s[\s\S]*?)`/g;

const failures = [];
let checked = 0;
let skipped = 0;

for (const dir of SEARCH_DIRS) {
  for (const file of walk(dir)) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = DOCUMENT_RE.exec(source))) {
      const document = match[1];
      if (!document.includes('{')) continue;

      // Documents that interpolate a shared fragment (`${_MONEY_FIELDS}`) cannot be validated as
      // extracted text - the interpolation is a JS value this script has no way to resolve.
      // Counted and reported rather than silently ignored, so "0 checked" can never masquerade as
      // "all fine".
      if (document.includes('${')) {
        skipped += 1;
        continue;
      }

      checked += 1;
      const relative = path.relative(repoRoot, file);
      try {
        const errors = validate(schema, parse(document));
        if (errors.length > 0) {
          failures.push(`${relative}: ${errors.map((e) => e.message).join(' | ')}`);
        }
      } catch (err) {
        failures.push(`${relative}: does not parse - ${err.message.split('\n')[0]}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} GraphQL document(s) do not match the schema:\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error('');
  process.exit(1);
}
console.log(
  `Every GraphQL document matches the schema (${checked} checked, ${skipped} skipped for interpolation).`
);
